import 'dotenv/config';
import cron from 'node-cron';
import { fetchUserAssignments, loginVOLP } from './volp.service.js';
import { sendAssignmentReminderTelegram } from './telegram.service.js';
import { usersCollection, coursesCollection, assignmentsCollection, reminderLogsCollection } from './db.service.js';
import { decrypt } from './encryption.service.js';

let isCronRunning = false;

// Schedules and initiates the recurring cron job for daily assignment reminder emails.
export const startCronJob = () => {
  const schedule = process.env.CRON_SCHEDULE;
  if (!schedule) {
    console.log('⚠ CRON_SCHEDULE is not defined in environment variables. Cron not started.');
    return;
  }
  console.log(`⏰ Scheduling VOLP Assignment Reminder Cron Job ("${schedule}")...`);

  cron.schedule(schedule, async () => {
    if (isCronRunning) {
      console.log('⚠ Previous reminder run is still active. Skipping overlapping execution.');
      return;
    }

    isCronRunning = true;
    console.log('\n====================================================');
    console.log('🔔 RUNNING VOLP REMINDER CRON JOB...');
    console.log('====================================================');

    try {
      let users = [];
      try {
        users = await usersCollection.find({}, { projection: { _id: 0, email: 1, token: 1, telegram_chat_id: 1, encrypted_password: 1 } }).toArray();
      } catch (e) {
        console.log('⚠ Could not fetch users from DB:', e.message);
        return;
      }

      if (users.length === 0) {
        console.log('ℹ No registered users found for assignment notifications.');
        return;
      }

      for (const user of users) {
        console.log(`\n➤ Processing user: ${user.email}`);
        try {
          const blockedRows = await coursesCollection
            .find({ user_email: user.email, is_blocked: true }, { projection: { colid: 1 } })
            .toArray();
          const blockedColids = new Set(blockedRows.map(r => r.colid));

          const blockedAssRows = await assignmentsCollection
            .find(
              { user_email: user.email, is_blocked: true },
              { projection: { assignment_id: 1, assignment_type: 1 } }
            )
            .toArray();
          const blockedAssSet = new Set(blockedAssRows.map(r => `${r.assignment_id}:${r.assignment_type}`));

          let userToken = user.token;
          let allAssignments;

          try {
            if (!userToken) {
              throw new Error('No active session token found.');
            }
            allAssignments = await fetchUserAssignments(userToken, user.email, blockedColids);
          } catch (tokenErr) {
            // Attempt to re-authenticate with VOLP if encrypted password is available
            if (user.encrypted_password) {
              console.log(`   🔄 Token expired or invalid for ${user.email}. Re-authenticating with VOLP...`);
              try {
                const rawPassword = decrypt(user.encrypted_password);
                userToken = await loginVOLP(user.email, rawPassword);
                await usersCollection.updateOne(
                  { email: user.email },
                  { $set: { token: userToken, updated_at: new Date() } }
                );
                console.log(`   ✓ Successfully regenerated VOLP token for ${user.email}`);
                allAssignments = await fetchUserAssignments(userToken, user.email, blockedColids);
              } catch (reauthErr) {
                console.log(`   ⚠ Failed to re-authenticate ${user.email}:`, reauthErr.message);
                throw reauthErr;
              }
            } else {
              throw tokenErr;
            }
          }

          const assignments = allAssignments.filter(
            a => !blockedAssSet.has(`${a.assignment_id}:${a.assignment_type}`)
          );

          console.log(`   📋 ${allAssignments.length} total → ${assignments.length} after assignment blocks`);
          const sendResult = await sendAssignmentReminderTelegram(user.email, assignments, user.telegram_chat_id);
          if (reminderLogsCollection?.insertOne) {
            try {
              const pendingCount = assignments.filter(a => !a.is_submitted && !a.is_blocked).length;
              await reminderLogsCollection.insertOne({
                user_email: user.email,
                trigger_type: 'CRON',
                status: sendResult?.success ? 'DELIVERED' : (sendResult?.reason === 'NO_CHAT_ID' ? 'AWAITING_TELEGRAM' : 'FAILED'),
                pending_count: pendingCount,
                recipient: sendResult?.recipient || user.telegram_chat_id || (sendResult?.reason === 'NO_CHAT_ID' ? 'NOT CONNECTED' : 'N/A'),
                message: sendResult?.message || (sendResult?.success ? `Automated 8:00 PM Telegram alert dispatched with ${pendingCount} pending assignment(s).` : `Automated 8:00 PM dispatch note: ${sendResult?.reason || 'Notification pending'}`),
                created_at: new Date()
              });
            } catch (logErr) {
              console.warn('Could not record cron log:', logErr.message);
            }
          }
        } catch (err) {
          console.log(`⚠ Failed to process user ${user.email}:`, err.message);
          if (reminderLogsCollection?.insertOne) {
            try {
              await reminderLogsCollection.insertOne({
                user_email: user.email,
                trigger_type: 'CRON',
                status: 'FAILED',
                pending_count: 0,
                recipient: user.telegram_chat_id || 'N/A',
                message: `Automated 8:00 PM cron failed: ${err.message}`,
                created_at: new Date()
              });
            } catch (_) {}
          }
        }
      }
    } finally {
      isCronRunning = false;
    }
  }, { timezone: process.env.CRON_TIMEZONE || 'Asia/Kolkata' });
};

// Manually triggers the reminder email process for a specified user.
export const triggerCronNow = async (userEmail, token, explicitChatId = null) => {
  console.log(`⚡ Manually triggering 8:00 PM reminder check for ${userEmail}...`);

  const blockedRows = await coursesCollection
    .find({ user_email: userEmail, is_blocked: true }, { projection: { colid: 1 } })
    .toArray();
  const blockedColids = new Set(blockedRows.map(r => r.colid));

  const blockedAssRows = await assignmentsCollection
    .find(
      { user_email: userEmail, is_blocked: true },
      { projection: { assignment_id: 1, assignment_type: 1 } }
    )
    .toArray();
  const blockedAssSet = new Set(blockedAssRows.map(r => `${r.assignment_id}:${r.assignment_type}`));

  let activeToken = token;
  let allAssignments;

  try {
    if (!activeToken) {
      throw new Error('No session token provided.');
    }
    allAssignments = await fetchUserAssignments(activeToken, userEmail, blockedColids);
  } catch (tokenErr) {
    let userDoc;
    try {
      userDoc = await usersCollection.findOne(
        { email: userEmail },
        { projection: { encrypted_password: 1 } }
      );
    } catch (_) {}

    if (userDoc?.encrypted_password) {
      console.log(`   🔄 Re-authenticating ${userEmail} using encrypted password...`);
      const rawPassword = decrypt(userDoc.encrypted_password);
      activeToken = await loginVOLP(userEmail, rawPassword);
      await usersCollection.updateOne(
        { email: userEmail },
        { $set: { token: activeToken, updated_at: new Date() } }
      );
      allAssignments = await fetchUserAssignments(activeToken, userEmail, blockedColids);
    } else {
      throw tokenErr;
    }
  }

  const assignments = allAssignments.filter(
    a => !blockedAssSet.has(`${a.assignment_id}:${a.assignment_type}`)
  );

  console.log(`   📋 ${allAssignments.length} total → ${assignments.length} after assignment blocks`);
  // Forward explicitChatId if provided to optimize Telegram dispatch and prevent redundant DB lookups
  const sendResult = explicitChatId
    ? await sendAssignmentReminderTelegram(userEmail, assignments, explicitChatId)
    : await sendAssignmentReminderTelegram(userEmail, assignments);

  if (reminderLogsCollection?.insertOne) {
    try {
      const pendingCount = assignments.filter(a => !a.is_submitted && !a.is_blocked).length;
      await reminderLogsCollection.insertOne({
        user_email: userEmail,
        trigger_type: 'MANUAL',
        status: sendResult?.success ? 'DELIVERED' : (sendResult?.reason === 'NO_CHAT_ID' ? 'AWAITING_TELEGRAM' : 'FAILED'),
        pending_count: pendingCount,
        recipient: sendResult?.recipient || explicitChatId || (sendResult?.reason === 'NO_CHAT_ID' ? 'NOT CONNECTED' : 'N/A'),
        message: sendResult?.message || (sendResult?.success ? `Manual 8 PM Telegram alert dispatched with ${pendingCount} pending assignment(s).` : `Manual 8 PM dispatch note: ${sendResult?.reason || 'Notification pending'}`),
        created_at: new Date()
      });
    } catch (logErr) {
      console.warn('Could not record manual reminder log:', logErr.message);
    }
  }

  return sendResult;
};

// Schedules and initiates the recurring background cron job for Devpost & Unstop hackathons ingestion.
export const startHackathonCron = () => {
  const schedule = process.env.HACKATHON_CRON_SCHEDULE || '0 6,18 * * *';
  console.log(`⏰ Scheduling Hackathon Ingestion Pipeline Cron ("${schedule}")...`);

  cron.schedule(schedule, async () => {
    console.log('\n🔔 [CRON] Starting scheduled Hackathons Ingestion Pipeline (Devpost + Unstop)...');
    try {
      const { runHackathonsPipeline } = await import('./hackathon_pipeline.service.js');
      const stats = await runHackathonsPipeline({
        devpostPages: 5,
        unstopPages: 3,
        unstopPerPage: 50,
      });
      console.log(`✓ [CRON] Hackathons pipeline completed: ${stats.totalUpserted} events updated (Total in DB: ${stats.totalInDatabase}).`);
    } catch (err) {
      console.error('❌ [CRON] Scheduled hackathons pipeline error:', err.message);
    }
  }, {
    timezone: process.env.CRON_TIMEZONE || 'Asia/Kolkata',
  });
};

