/**
 * assignment.routes.js - Assignment & Cron Test Routes (Modern ES Module)
 */
import express from 'express';
import { fetchUserAssignments, fetchUserCourses } from '../services/volp.service.js';
import { triggerCronNow } from '../services/cron.service.js';
import { pool } from '../services/db.service.js';

const router = express.Router();

// Fetch all enrolled courses with active/blocked status (cached in MySQL courses table)
router.post('/my-courses', async (request, response) => {
  const { email, token, refresh = false } = request.body;

  if (!email || !token) {
    return response.status(400).json({ error: 'Email and token are required.' });
  }

  try {
    // Check if courses exist in database
    const [cachedCoursesFromDb] = await pool.query(
      'SELECT colid, crsid, course_name, semester, academic_year, is_blocked, updated_at FROM courses WHERE user_email = ? ORDER BY colid ASC',
      [email]
    );

    let coursesList = cachedCoursesFromDb;

    // If refresh requested OR no cached courses in DB, fetch from live VOLP and update DB
    if (refresh || cachedCoursesFromDb.length === 0) {
      const liveCourses = await fetchUserCourses(token, email);

      if (liveCourses.length > 0) {
        for (const currentCourse of liveCourses) {
          await pool.query(
            `INSERT INTO courses (user_email, colid, crsid, course_name, semester, academic_year)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               crsid = VALUES(crsid),
               course_name = VALUES(course_name),
               semester = VALUES(semester),
               academic_year = VALUES(academic_year),
               updated_at = CURRENT_TIMESTAMP`,
            [
              email,
              currentCourse.colid,
              currentCourse.crsid || null,
              currentCourse.course_name,
              currentCourse.semester || null,
              currentCourse.academic_year || null
            ]
          );
        }

        // Re-read fresh courses with their current is_blocked status from DB
        const [freshCoursesFromDb] = await pool.query(
          'SELECT colid, crsid, course_name, semester, academic_year, is_blocked, updated_at FROM courses WHERE user_email = ? ORDER BY colid ASC',
          [email]
        );
        coursesList = freshCoursesFromDb;
      }
    }

    const coursesWithStatus = coursesList.map(courseItem => ({
      colid: courseItem.colid,
      crsid: courseItem.crsid,
      course_name: courseItem.course_name,
      semester: courseItem.semester,
      academic_year: courseItem.academic_year,
      updated_at: courseItem.updated_at,
      is_blocked: Boolean(courseItem.is_blocked)
    }));

    response.json({
      success: true,
      email,
      source: (refresh || cachedCoursesFromDb.length === 0) ? 'VOLP_LIVE_SYNCED' : 'MYSQL_DATABASE',
      courses: coursesWithStatus
    });
  } catch (coursesError) {
    response.status(500).json({ error: 'Failed to fetch courses: ' + coursesError.message });
  }
});

// Fetch user assignments (cached in MySQL assignments table)
router.post('/my-assignments', async (request, response) => {  
  const { email, token, refresh = false } = request.body;

  if (!email || !token) {
    return response.status(400).json({ error: 'Email and token are required.' });
  }

  try {
    // 1. Load this user's blocked courses from unified courses table
    const [blockedCourseRows] = await pool.query(
      'SELECT colid FROM courses WHERE user_email = ? AND is_blocked = TRUE',
      [email]
    );
    const blockedCourseColids = new Set(blockedCourseRows.map(courseRow => courseRow.colid));

    // 2. Check if assignments exist in MySQL assignments table
    const [cachedAssignmentsFromDb] = await pool.query(
      `SELECT assignment_id, assignment_type, colid, course_name, unit_name, title_html, due_date_raw, is_submitted, is_blocked, updated_at
       FROM assignments
      WHERE user_email = ?
       ORDER BY id ASC`,
      [email]
    );

    let currentAssignments = cachedAssignmentsFromDb;

    // 3. If refresh requested OR no cached assignments in DB, fetch live from VOLP and update DB
    if (refresh || cachedAssignmentsFromDb.length === 0) {
      const liveAssignments = await fetchUserAssignments(token, email, blockedCourseColids);

      // Cache/sync discovered assignments into assignments table
      for (const assignmentItem of liveAssignments) {
        await pool.query(
          `INSERT INTO assignments
            (user_email, assignment_id, assignment_type, colid, course_name, unit_name, title_html, due_date_raw, is_submitted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             colid = VALUES(colid),
             course_name = VALUES(course_name),
             unit_name = VALUES(unit_name),
             title_html = VALUES(title_html),
             due_date_raw = VALUES(due_date_raw),
             is_submitted = VALUES(is_submitted),
             updated_at = CURRENT_TIMESTAMP`,
          [
            email,
            assignmentItem.assignment_id,
            assignmentItem.assignment_type,
            assignmentItem.colid ?? null,
            assignmentItem.course_name,
            assignmentItem.unit_name ?? null,
            assignmentItem.title_html,
            assignmentItem.due_date_raw ?? null,
            Boolean(assignmentItem.is_submitted)
          ]
        );
      }

      // Re-read fresh non-blocked assignments from DB
      const [freshAssignmentsFromDb] = await pool.query(
        `SELECT assignment_id, assignment_type, colid, course_name, unit_name, title_html, due_date_raw, is_submitted, is_blocked, updated_at
         FROM assignments
         WHERE user_email = ?
         ORDER BY id ASC`,
        [email]
      );
      currentAssignments = freshAssignmentsFromDb;
    }

    // Filter out assignments belonging to blocked courses
    const nonBlockedAssignments = currentAssignments.filter(
      assignment => !blockedCourseColids.has(assignment.colid)
    );

    response.json({
      success: true,
      email,
      source: (refresh || cachedAssignmentsFromDb.length === 0) ? 'VOLP_LIVE_SYNCED' : 'MYSQL_DATABASE',
      count: nonBlockedAssignments.length,
      assignments: nonBlockedAssignments
    });
  } catch (assignmentsError) {
    response.status(500).json({ error: 'Failed to fetch assignments: ' + assignmentsError.message });
  }
});

// Trigger 8 PM Cron Notification test manually
router.post('/trigger-8pm-reminder', async (request, response) => {
  const { email, token } = request.body;

  try {
    await triggerCronNow(email, token);
    response.json({
      success: true,
      message: `8 PM Email Reminder simulation executed for ${email}.`
    });
  } catch (cronError) {
    response.status(500).json({ error: 'Cron trigger failed: ' + cronError.message });
  }
});

export default router;
