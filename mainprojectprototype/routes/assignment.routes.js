/**
 * assignment.routes.js - Assignment & Cron Test Routes (Modern ES Module)
 */
import express from 'express';
import { fetchUserAssignments, fetchUserCourses } from '../services/volp.service.js';
import { triggerCronNow } from '../services/cron.service.js';
import { coursesCollection, assignmentsCollection } from '../services/db.service.js';
import { requireUser } from '../middleware/auth.middleware.js';

const router = express.Router();

// Fetch all enrolled courses with active/blocked status (cached in MongoDB courses collection)
router.post('/my-courses', requireUser, async (request, response) => {
  const { email, token, refresh = false } = request.body;

  if (!email || !token) {
    return response.status(400).json({ error: 'Email and token are required.' });
  }

  try {
    // Check if courses exist in database
    const cachedCoursesFromDb = await coursesCollection
      .find({ user_email: email })
      .sort({ colid: 1 })
      .toArray();

    let coursesList = cachedCoursesFromDb;

    // Initial dashboard loads are database-only; live fetching is explicit via Sync.
    if (refresh) {
      const liveCourses = await fetchUserCourses(token, email);

      if (liveCourses.length > 0) {
        for (const currentCourse of liveCourses) {
          await coursesCollection.updateOne(
            { user_email: email, colid: Number(currentCourse.colid) },
            {
              $set: {
                crsid: currentCourse.crsid || null,
                course_name: currentCourse.course_name,
                semester: currentCourse.semester || null,
                academic_year: currentCourse.academic_year || null,
                updated_at: new Date()
              },
              $setOnInsert: {
                user_email: email,
                colid: Number(currentCourse.colid),
                is_blocked: false,
                blocked_at: null
              }
            },
            { upsert: true }
          );
        }

        // Re-read fresh courses with their current is_blocked status from DB
        const freshCoursesFromDb = await coursesCollection
          .find({ user_email: email })
          .sort({ colid: 1 })
          .toArray();
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
      source: refresh ? 'VOLP_LIVE_SYNCED' : 'MONGODB_DATABASE',
      courses: coursesWithStatus
    });
  } catch (coursesError) {
    response.status(500).json({ error: 'Failed to fetch courses: ' + coursesError.message });
  }
});

// Fetch user assignments (cached in MongoDB assignments collection)
router.post('/my-assignments', requireUser, async (request, response) => {
  const { email, token, refresh = false } = request.body;

  if (!email || !token) {
    return response.status(400).json({ error: 'Email and token are required.' });
  }

  try {
    // 1. Load this user's blocked courses from unified courses table
    const blockedCourseRows = await coursesCollection
      .find({ user_email: email, is_blocked: true }, { projection: { colid: 1 } })
      .toArray();
    const blockedCourseColids = new Set(blockedCourseRows.map(courseRow => Number(courseRow.colid)));

    // 2. Read assignments from MongoDB; live discovery is explicit via Sync.
    const cachedAssignmentsFromDb = await assignmentsCollection
      .find(
        { user_email: email },
        {
          projection: {
            _id: 0,
            assignment_id: 1,
            assignment_type: 1,
            colid: 1,
            course_name: 1,
            unit_name: 1,
            title_html: 1,
            due_date_raw: 1,
            is_submitted: 1,
            is_blocked: 1,
            updated_at: 1
          }
        }
      )
      .sort({ created_at: 1 })
      .toArray();

    let currentAssignments = cachedAssignmentsFromDb;

    // Live discovery is reserved for an explicit refresh/sync request.
    if (refresh) {
      const liveAssignments = await fetchUserAssignments(token, email, blockedCourseColids);

      // Cache/sync discovered assignments into assignments table
      for (const assignmentItem of liveAssignments) {
        await assignmentsCollection.updateOne(
          {
            user_email: email,
            assignment_id: Number(assignmentItem.assignment_id),
            assignment_type: assignmentItem.assignment_type
          },
          {
            $set: {
              colid: assignmentItem.colid ?? null,
              course_name: assignmentItem.course_name,
              unit_name: assignmentItem.unit_name ?? null,
              title_html: assignmentItem.title_html,
              due_date_raw: assignmentItem.due_date_raw ?? null,
              is_submitted: Boolean(assignmentItem.is_submitted),
              updated_at: new Date()
            },
            $setOnInsert: {
              user_email: email,
              assignment_id: Number(assignmentItem.assignment_id),
              assignment_type: assignmentItem.assignment_type,
              is_blocked: false,
              blocked_at: null,
              created_at: new Date()
            }
          },
          { upsert: true }
        );
      }

      // Re-read fresh non-blocked assignments from DB
      const freshAssignmentsFromDb = await assignmentsCollection
        .find(
          { user_email: email },
          {
            projection: {
              _id: 0,
              assignment_id: 1,
              assignment_type: 1,
              colid: 1,
              course_name: 1,
              unit_name: 1,
              title_html: 1,
              due_date_raw: 1,
              is_submitted: 1,
              is_blocked: 1,
              updated_at: 1
            }
          }
        )
        .sort({ created_at: 1 })
        .toArray();
      currentAssignments = freshAssignmentsFromDb;
    }

    // Filter out assignments belonging to blocked courses
    const nonBlockedAssignments = currentAssignments.filter(
      assignment => !blockedCourseColids.has(Number(assignment.colid))
    );

    response.json({
      success: true,
      email,
      source: refresh ? 'VOLP_LIVE_SYNCED' : 'MONGODB_DATABASE',
      count: nonBlockedAssignments.length,
      assignments: nonBlockedAssignments
    });
  } catch (assignmentsError) {
    response.status(500).json({ error: 'Failed to fetch assignments: ' + assignmentsError.message });
  }
});

// Trigger 8 PM Cron Notification test manually
router.post('/trigger-8pm-reminder', requireUser, async (request, response) => {
  const { email, token } = request.body;

  if (!email || !token) {
    return response.status(400).json({ error: 'Email and token are required.' });
  }

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
