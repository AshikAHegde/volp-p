/**
 * cron.service.js - Daily 8:00 PM Assignment Reminder Cron Job (Modern ES Module with Dotenv)
 */
import 'dotenv/config';
import cron from 'node-cron';
import { fetchUserAssignments } from './volp.service.js';
import { sendAssignmentReminderEmail } from './mail.service.js';
import { pool } from './db.service.js';

export const startCronJob = () => {
  const schedule = process.env.CRON_SCHEDULE;
  if (!schedule) {
    console.log('⚠ CRON_SCHEDULE is not defined in environment variables. Cron not started.');
    return;
  }
  console.log(`⏰ Scheduling VOLP Assignment Reminder Cron Job ("${schedule}")...`);

  cron.schedule(schedule, async () => {
    console.log('\n====================================================');
    console.log('🔔 RUNNING VOLP REMINDER CRON JOB...');
    console.log('====================================================');

    // 1. Fetch all registered users from MySQL database
    let users = [];
    try {
      const [rows] = await pool.query('SELECT email, token FROM users');
      users = rows;
    } catch (e) {
      console.log('⚠ Could not fetch users from DB:', e.message);
      return;
    }

    if (users.length === 0) {
      console.log('ℹ No registered users found for email notifications.');
      return;
    }

    // 2. Process assignments for each user
    for (const user of users) {
      console.log(`\n➤ Processing user: ${user.email}`);
      try {
        // Load this user's blocked courses from unified courses table
        const [blockedRows] = await pool.query(
          'SELECT colid FROM courses WHERE user_email = ? AND is_blocked = TRUE',
          [user.email]
        );
        const blockedColids = new Set(blockedRows.map(r => r.colid));

        // Load this user's blocked assignments from unified assignments table
        const [blockedAssRows] = await pool.query(
          'SELECT assignment_id, assignment_type FROM assignments WHERE user_email = ? AND is_blocked = TRUE',
          [user.email]
        );
        const blockedAssSet = new Set(blockedAssRows.map(r => `${r.assignment_id}:${r.assignment_type}`));

        const allAssignments = await fetchUserAssignments(user.token, user.email, blockedColids);

        // Filter out individually blocked assignments
        const assignments = allAssignments.filter(
          a => !blockedAssSet.has(`${a.assignment_id}:${a.assignment_type}`)
        );

        console.log(`   📋 ${allAssignments.length} total → ${assignments.length} after assignment blocks`);
        await sendAssignmentReminderEmail(user.email, assignments);
      } catch (err) {
        console.log(`⚠ Failed to process user ${user.email}:`, err.message);
      }
    }
  });
};

// Helper to manually trigger cron execution
export const triggerCronNow = async (userEmail, token) => {
  console.log(`⚡ Manually triggering 8:00 PM reminder check for ${userEmail}...`);

  // Load blocked courses from unified courses table
  const [blockedRows] = await pool.query(
    'SELECT colid FROM courses WHERE user_email = ? AND is_blocked = TRUE',
    [userEmail]
  );
  const blockedColids = new Set(blockedRows.map(r => r.colid));

  // Load blocked assignments from unified assignments table
  const [blockedAssRows] = await pool.query(
    'SELECT assignment_id, assignment_type FROM assignments WHERE user_email = ? AND is_blocked = TRUE',
    [userEmail]
  );
  const blockedAssSet = new Set(blockedAssRows.map(r => `${r.assignment_id}:${r.assignment_type}`));

  const allAssignments = await fetchUserAssignments(token, userEmail, blockedColids);

  // Filter out individually blocked assignments
  const assignments = allAssignments.filter(
    a => !blockedAssSet.has(`${a.assignment_id}:${a.assignment_type}`)
  );

  console.log(`   📋 ${allAssignments.length} total → ${assignments.length} after assignment blocks`);
  return sendAssignmentReminderEmail(userEmail, assignments);
};
