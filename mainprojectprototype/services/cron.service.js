import 'dotenv/config';
import cron from 'node-cron';
import { fetchUserAssignments, loginVOLP } from './volp.service.js';
import { sendAssignmentReminderTelegram } from './telegram.service.js';
import { usersCollection, coursesCollection, assignmentsCollection } from './db.service.js';
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
        users = await usersCollection.find({}, { projection: { _id: 0, email: 1, token: 1, encrypted_password: 1 } }).toArray();
      } catch (e) {
        console.log('⚠ Could not fetch users from DB:', e.message);
        return;
      }

      if (users.length === 0) {
        console.log('ℹ No registered users found for email notifications.');
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
          await sendAssignmentReminderTelegram(user.email, assignments, user.telegram_chat_id);
        } catch (err) {
          console.log(`⚠ Failed to process user ${user.email}:`, err.message);
        }
      }
    } finally {
      isCronRunning = false;
    }
  }, { timezone: process.env.CRON_TIMEZONE || 'Asia/Kolkata' });
};

// Manually triggers the reminder email process for a specified user.
export const triggerCronNow = async (userEmail, token) => {
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
  return sendAssignmentReminderTelegram(userEmail, assignments);
};

