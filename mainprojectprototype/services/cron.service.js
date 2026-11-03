import 'dotenv/config';
import cron from 'node-cron';
import { fetchUserAssignments, loginVOLP } from './volp.service.js';
import { sendAssignmentReminderTelegram } from './telegram.service.js';
import { usersCollection, coursesCollection, assignmentsCollection, reminderLogsCollection } from './db.service.js';
import { decrypt } from './encryption.service.js';

let isCronRunning = false;

/**
 * Persists raw fetched assignments into MongoDB assignmentsCollection before filtering.
 * Preserves existing block status (`is_blocked`, `blocked_at`) via $setOnInsert.
 */
export const syncAssignmentsToDb = async (userEmail, assignments = []) => {
  if (!assignmentsCollection?.updateOne || !Array.isArray(assignments) || assignments.length === 0) {
    return;
  }

  for (const item of assignments) {
    await assignmentsCollection.updateOne(
      {
        user_email: userEmail,
        assignment_id: Number(item.assignment_id),
        assignment_type: item.assignment_type
      },
      {
        $set: {
          colid: item.colid ?? null,
          course_name: item.course_name,
          unit_name: item.unit_name ?? null,
          title_html: item.title_html,
          due_date_raw: item.due_date_raw ?? null,
          is_submitted: Boolean(item.is_submitted),
          updated_at: new Date()
        },
        $setOnInsert: {
          user_email: userEmail,
          assignment_id: Number(item.assignment_id),
          assignment_type: item.assignment_type,
          is_blocked: false,
          blocked_at: null,
          created_at: new Date()
        }
      },
      { upsert: true }
    );
  }
};

/**
 * Persists newly discovered courses from fetched assignments into MongoDB coursesCollection.
 * Preserves existing block status (`is_blocked`, `blocked_at`) via $setOnInsert.
 */
export const syncCoursesToDb = async (userEmail, assignments = []) => {
  if (!coursesCollection?.updateOne || !Array.isArray(assignments) || assignments.length === 0) {
    return;
  }

  const seenColids = new Set();
  for (const item of assignments) {
    const colid = Number(item.colid);
    if (!colid || seenColids.has(colid)) continue;
    seenColids.add(colid);

    await coursesCollection.updateOne(
      { user_email: userEmail, colid },
      {
        $set: {
          crsid: item.crsid ? Number(item.crsid) : null,
          course_name: item.course_name || `Course ${colid}`,
          updated_at: new Date()
        },
        $setOnInsert: {
          user_email: userEmail,
          colid,
          is_blocked: false,
          blocked_at: null,
          created_at: new Date()
        }
      },
      { upsert: true }
    );
  }
};

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
          let userToken = user.token;

          // Layer 1: Proactively re-authenticate with VOLP official to find new token and store in DB
          if (user.encrypted_password) {
            console.log(`   🔄 Logging into VOLP (official) to refresh token for ${user.email}...`);
            try {
              const rawPassword = decrypt(user.encrypted_password);
              userToken = await loginVOLP(user.email, rawPassword);
              await usersCollection.updateOne(
                { email: user.email },
                {
                  $set: { token: userToken, updated_at: new Date() },
                  $addToSet: { active_tokens: userToken }
                }
              );
              console.log(`   ✓ Fresh VOLP token stored in DB for ${user.email}`);
            } catch (authErr) {
              console.warn(`   ⚠ Failed to refresh VOLP token for ${user.email}:`, authErr.message);
              if (!userToken) {
                throw authErr;
              }
              console.log(`   ℹ Falling back to existing session token for ${user.email}`);
            }
          }

          if (!userToken) {
            throw new Error('No active session token found.');
          }

          const rawEmail = String(user.email || '').trim();
          const normEmail = rawEmail.toLowerCase();

          // Layer 2: Find blocked courses and blocked assignments
          let blockedRows = await coursesCollection
            .find({ user_email: user.email, is_blocked: true }, { projection: { colid: 1, crsid: 1, course_name: 1 } })
            .toArray();
          const dateBlockedCourses = await coursesCollection
            .find({ user_email: user.email, blocked_at: { $ne: null, $exists: true } }, { projection: { colid: 1, crsid: 1, course_name: 1 } })
            .toArray();
          blockedRows = [...blockedRows, ...dateBlockedCourses];
          if (normEmail && normEmail !== user.email) {
            const normBlocked = await coursesCollection
              .find({ user_email: normEmail, is_blocked: true }, { projection: { colid: 1, crsid: 1, course_name: 1 } })
              .toArray();
            const normDateBlocked = await coursesCollection
              .find({ user_email: normEmail, blocked_at: { $ne: null, $exists: true } }, { projection: { colid: 1, crsid: 1, course_name: 1 } })
              .toArray();
            blockedRows = [...blockedRows, ...normBlocked, ...normDateBlocked];
          }

          const blockedColids = new Set();
          const blockedCourseNames = new Set();
          blockedRows.forEach(r => {
            if (r.colid !== undefined && r.colid !== null) {
              blockedColids.add(r.colid);
              blockedColids.add(Number(r.colid));
              blockedColids.add(String(r.colid));
            }
            if (r.crsid !== undefined && r.crsid !== null) {
              blockedColids.add(r.crsid);
              blockedColids.add(Number(r.crsid));
              blockedColids.add(String(r.crsid));
            }
            if (r.course_name) {
              blockedCourseNames.add(r.course_name.trim().toLowerCase());
            }
          });

          let blockedAssRows = await assignmentsCollection
            .find(
              { user_email: user.email, is_blocked: true },
              { projection: { assignment_id: 1, assignment_type: 1, title_html: 1, title_hint: 1 } }
            )
            .toArray();
          const dateBlockedAss = await assignmentsCollection
            .find(
              { user_email: user.email, blocked_at: { $ne: null, $exists: true } },
              { projection: { assignment_id: 1, assignment_type: 1, title_html: 1, title_hint: 1 } }
            )
            .toArray();
          blockedAssRows = [...blockedAssRows, ...dateBlockedAss];
          if (normEmail && normEmail !== user.email) {
            const normBlockedAss = await assignmentsCollection
              .find(
                { user_email: normEmail, is_blocked: true },
                { projection: { assignment_id: 1, assignment_type: 1, title_html: 1, title_hint: 1 } }
              )
              .toArray();
            const normDateBlockedAss = await assignmentsCollection
              .find(
                { user_email: normEmail, blocked_at: { $ne: null, $exists: true } },
                { projection: { assignment_id: 1, assignment_type: 1, title_html: 1, title_hint: 1 } }
              )
              .toArray();
            blockedAssRows = [...blockedAssRows, ...normBlockedAss, ...normDateBlockedAss];
          }

          const blockedAssSet = new Set();
          const blockedAssIdsWithoutType = new Set();
          const blockedAssTitles = new Set();

          blockedAssRows.forEach(r => {
            const id = r.assignment_id;
            const type = r.assignment_type;
            if (id !== undefined && id !== null) {
              if (type) {
                const typeClean = String(type).toUpperCase().replace(/[^A-Z]/g, '');
                blockedAssSet.add(`${id}:${type}`);
                blockedAssSet.add(`${Number(id)}:${type}`);
                blockedAssSet.add(`${String(id)}:${type}`);
                blockedAssSet.add(`${id}:${type.toUpperCase()}`);
                blockedAssSet.add(`${Number(id)}:${type.toUpperCase()}`);
                blockedAssSet.add(`${String(id)}:${type.toUpperCase()}`);
                blockedAssSet.add(`${id}:${typeClean}`);
                blockedAssSet.add(`${Number(id)}:${typeClean}`);
                blockedAssSet.add(`${String(id)}:${typeClean}`);
              } else {
                blockedAssIdsWithoutType.add(id);
                blockedAssIdsWithoutType.add(Number(id));
                blockedAssIdsWithoutType.add(String(id));
              }
            }
            const rawTitle = r.title_html || r.title_hint || '';
            if (rawTitle) {
              const clean = rawTitle.replace(/<[^>]+>/g, '').trim().toLowerCase();
              if (clean) blockedAssTitles.add(clean);
            }
          });

          // Layer 3: Fetch assignments using the new token and continue
          let allAssignments;
          try {
            allAssignments = await fetchUserAssignments(userToken, user.email, blockedColids);
          } catch (tokenErr) {
            // Fallback retry if existing token was used and failed
            if (user.encrypted_password && userToken === user.token) {
              console.log(`   🔄 Token expired or invalid for ${user.email}. Re-authenticating with VOLP...`);
              try {
                const rawPassword = decrypt(user.encrypted_password);
                userToken = await loginVOLP(user.email, rawPassword);
                await usersCollection.updateOne(
                  { email: user.email },
                  {
                    $set: { token: userToken, updated_at: new Date() },
                    $addToSet: { active_tokens: userToken }
                  }
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

          // Persist raw fetched assignments and newly discovered courses into DB for this user before filtering
          await Promise.all([
            syncAssignmentsToDb(user.email, allAssignments),
            syncCoursesToDb(user.email, allAssignments)
          ]);

          // Strict double-layer filtering: remove assignments from blocked courses AND individually blocked assignments
          const assignments = allAssignments.filter(a => {
            // 1. Omit if the assignment's course is blocked (by colid, crsid, or course_name)
            if (
              a.colid !== undefined &&
              a.colid !== null &&
              (blockedColids.has(a.colid) ||
                blockedColids.has(Number(a.colid)) ||
                blockedColids.has(String(a.colid)))
            ) {
              return false;
            }

            if (
              a.crsid !== undefined &&
              a.crsid !== null &&
              (blockedColids.has(a.crsid) ||
                blockedColids.has(Number(a.crsid)) ||
                blockedColids.has(String(a.crsid)))
            ) {
              return false;
            }

            if (
              a.course_name &&
              blockedCourseNames.has(a.course_name.trim().toLowerCase())
            ) {
              return false;
            }

            // 2. Omit if the specific assignment is blocked
            const aId = a.assignment_id;
            const aType = a.assignment_type;
            const aTypeClean = aType ? String(aType).toUpperCase().replace(/[^A-Z]/g, '') : '';
            const aTitleClean = a.title_html ? a.title_html.replace(/<[^>]+>/g, '').trim().toLowerCase() : '';

            if (
              (aId !== undefined && (
                blockedAssIdsWithoutType.has(aId) ||
                blockedAssIdsWithoutType.has(Number(aId)) ||
                blockedAssIdsWithoutType.has(String(aId))
              )) ||
              blockedAssSet.has(`${aId}:${aType}`) ||
              blockedAssSet.has(`${Number(aId)}:${aType}`) ||
              blockedAssSet.has(`${String(aId)}:${aType}`) ||
              (aType && (
                blockedAssSet.has(`${aId}:${aType.toUpperCase()}`) ||
                blockedAssSet.has(`${Number(aId)}:${aType.toUpperCase()}`) ||
                blockedAssSet.has(`${String(aId)}:${aType.toUpperCase()}`) ||
                blockedAssSet.has(`${aId}:${aTypeClean}`) ||
                blockedAssSet.has(`${Number(aId)}:${aTypeClean}`) ||
                blockedAssSet.has(`${String(aId)}:${aTypeClean}`)
              )) ||
              (aTitleClean && blockedAssTitles.has(aTitleClean)) ||
              (a.blocked_at != null && a.blocked_at !== '') ||
              a.is_blocked === true ||
              a.is_blocked === 'true' ||
              a.is_blocked === 1
            ) {
              return false;
            }

            return true;
          });

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

  const rawEmail = String(userEmail || '').trim();
  const normEmail = rawEmail.toLowerCase();

  let blockedRows = await coursesCollection
    .find({ user_email: userEmail, is_blocked: true }, { projection: { colid: 1, crsid: 1, course_name: 1 } })
    .toArray();
  const dateBlockedCourses = await coursesCollection
    .find({ user_email: userEmail, blocked_at: { $ne: null, $exists: true } }, { projection: { colid: 1, crsid: 1, course_name: 1 } })
    .toArray();
  blockedRows = [...blockedRows, ...dateBlockedCourses];
  if (normEmail && normEmail !== userEmail) {
    const normBlocked = await coursesCollection
      .find({ user_email: normEmail, is_blocked: true }, { projection: { colid: 1, crsid: 1, course_name: 1 } })
      .toArray();
    const normDateBlocked = await coursesCollection
      .find({ user_email: normEmail, blocked_at: { $ne: null, $exists: true } }, { projection: { colid: 1, crsid: 1, course_name: 1 } })
      .toArray();
    blockedRows = [...blockedRows, ...normBlocked, ...normDateBlocked];
  }

  const blockedColids = new Set();
  const blockedCourseNames = new Set();
  blockedRows.forEach(r => {
    if (r.colid !== undefined && r.colid !== null) {
      blockedColids.add(r.colid);
      blockedColids.add(Number(r.colid));
      blockedColids.add(String(r.colid));
    }
    if (r.crsid !== undefined && r.crsid !== null) {
      blockedColids.add(r.crsid);
      blockedColids.add(Number(r.crsid));
      blockedColids.add(String(r.crsid));
    }
    if (r.course_name) {
      blockedCourseNames.add(r.course_name.trim().toLowerCase());
    }
  });

  let blockedAssRows = await assignmentsCollection
    .find(
      { user_email: userEmail, is_blocked: true },
      { projection: { assignment_id: 1, assignment_type: 1, title_html: 1, title_hint: 1 } }
    )
    .toArray();
  const dateBlockedAss = await assignmentsCollection
    .find(
      { user_email: userEmail, blocked_at: { $ne: null, $exists: true } },
      { projection: { assignment_id: 1, assignment_type: 1, title_html: 1, title_hint: 1 } }
    )
    .toArray();
  blockedAssRows = [...blockedAssRows, ...dateBlockedAss];
  if (normEmail && normEmail !== userEmail) {
    const normBlockedAss = await assignmentsCollection
      .find(
        { user_email: normEmail, is_blocked: true },
        { projection: { assignment_id: 1, assignment_type: 1, title_html: 1, title_hint: 1 } }
      )
      .toArray();
    const normDateBlockedAss = await assignmentsCollection
      .find(
        { user_email: normEmail, blocked_at: { $ne: null, $exists: true } },
        { projection: { assignment_id: 1, assignment_type: 1, title_html: 1, title_hint: 1 } }
      )
      .toArray();
    blockedAssRows = [...blockedAssRows, ...normBlockedAss, ...normDateBlockedAss];
  }

  const blockedAssSet = new Set();
  const blockedAssIdsWithoutType = new Set();
  const blockedAssTitles = new Set();

  blockedAssRows.forEach(r => {
    const id = r.assignment_id;
    const type = r.assignment_type;
    if (id !== undefined && id !== null) {
      if (type) {
        const typeClean = String(type).toUpperCase().replace(/[^A-Z]/g, '');
        blockedAssSet.add(`${id}:${type}`);
        blockedAssSet.add(`${Number(id)}:${type}`);
        blockedAssSet.add(`${String(id)}:${type}`);
        blockedAssSet.add(`${id}:${type.toUpperCase()}`);
        blockedAssSet.add(`${Number(id)}:${type.toUpperCase()}`);
        blockedAssSet.add(`${String(id)}:${type.toUpperCase()}`);
        blockedAssSet.add(`${id}:${typeClean}`);
        blockedAssSet.add(`${Number(id)}:${typeClean}`);
        blockedAssSet.add(`${String(id)}:${typeClean}`);
      } else {
        blockedAssIdsWithoutType.add(id);
        blockedAssIdsWithoutType.add(Number(id));
        blockedAssIdsWithoutType.add(String(id));
      }
    }
    const rawTitle = r.title_html || r.title_hint || '';
    if (rawTitle) {
      const clean = rawTitle.replace(/<[^>]+>/g, '').trim().toLowerCase();
      if (clean) blockedAssTitles.add(clean);
    }
  });

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

  // Persist raw fetched assignments and newly discovered courses into DB for this user before filtering
  await Promise.all([
    syncAssignmentsToDb(userEmail, allAssignments),
    syncCoursesToDb(userEmail, allAssignments)
  ]);

  // Strict double-layer filtering: remove assignments from blocked courses AND individually blocked assignments
  const assignments = allAssignments.filter(a => {
    // 1. Omit if the assignment's course is blocked (by colid, crsid, or course_name)
    if (
      a.colid !== undefined &&
      a.colid !== null &&
      (blockedColids.has(a.colid) ||
        blockedColids.has(Number(a.colid)) ||
        blockedColids.has(String(a.colid)))
    ) {
      return false;
    }

    if (
      a.crsid !== undefined &&
      a.crsid !== null &&
      (blockedColids.has(a.crsid) ||
        blockedColids.has(Number(a.crsid)) ||
        blockedColids.has(String(a.crsid)))
    ) {
      return false;
    }

    if (
      a.course_name &&
      blockedCourseNames.has(a.course_name.trim().toLowerCase())
    ) {
      return false;
    }

    // 2. Omit if the specific assignment is blocked
    const aId = a.assignment_id;
    const aType = a.assignment_type;
    const aTypeClean = aType ? String(aType).toUpperCase().replace(/[^A-Z]/g, '') : '';
    const aTitleClean = a.title_html ? a.title_html.replace(/<[^>]+>/g, '').trim().toLowerCase() : '';

    if (
      (aId !== undefined && (
        blockedAssIdsWithoutType.has(aId) ||
        blockedAssIdsWithoutType.has(Number(aId)) ||
        blockedAssIdsWithoutType.has(String(aId))
      )) ||
      blockedAssSet.has(`${aId}:${aType}`) ||
      blockedAssSet.has(`${Number(aId)}:${aType}`) ||
      blockedAssSet.has(`${String(aId)}:${aType}`) ||
      (aType && (
        blockedAssSet.has(`${aId}:${aType.toUpperCase()}`) ||
        blockedAssSet.has(`${Number(aId)}:${aType.toUpperCase()}`) ||
        blockedAssSet.has(`${String(aId)}:${aType.toUpperCase()}`) ||
        blockedAssSet.has(`${aId}:${aTypeClean}`) ||
        blockedAssSet.has(`${Number(aId)}:${aTypeClean}`) ||
        blockedAssSet.has(`${String(aId)}:${aTypeClean}`)
      )) ||
      (aTitleClean && blockedAssTitles.has(aTitleClean)) ||
      (a.blocked_at != null && a.blocked_at !== '') ||
      a.is_blocked === true ||
      a.is_blocked === 'true' ||
      a.is_blocked === 1
    ) {
      return false;
    }

    return true;
  });

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

