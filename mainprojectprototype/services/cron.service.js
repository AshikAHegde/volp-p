import 'dotenv/config';
import cron from 'node-cron';
import { fetchUserAssignments } from './volp.service.js';
import { sendAssignmentReminderEmail } from './mail.service.js';
import { usersCollection, coursesCollection, assignmentsCollection } from './db.service.js';

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
        users = await usersCollection.find({}, { projection: { _id: 0, email: 1, token: 1 } }).toArray();
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

          const allAssignments = await fetchUserAssignments(user.token, user.email, blockedColids);

          const assignments = allAssignments.filter(
            a => !blockedAssSet.has(`${a.assignment_id}:${a.assignment_type}`)
          );

          console.log(`   📋 ${allAssignments.length} total → ${assignments.length} after assignment blocks`);
          await sendAssignmentReminderEmail(user.email, assignments);
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

  const allAssignments = await fetchUserAssignments(token, userEmail, blockedColids);

  const assignments = allAssignments.filter(
    a => !blockedAssSet.has(`${a.assignment_id}:${a.assignment_type}`)
  );

  console.log(`   📋 ${allAssignments.length} total → ${assignments.length} after assignment blocks`);
  return sendAssignmentReminderEmail(userEmail, assignments);
};
