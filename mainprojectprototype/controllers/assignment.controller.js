/**
 * assignment.controller.js - Assignment & Course Management Controller (Modern ES Module)
 * 
 * Separates fast DB-only queries (for smooth, unthrottled UI display)
 * from live VOLP sync calls (strictly rate-limited to protect external college servers).
 */
import { fetchUserAssignments, fetchUserCourses } from '../services/volp.service.js';
import { triggerCronNow } from '../services/cron.service.js';
import { coursesCollection, assignmentsCollection } from '../services/db.service.js';

// ==========================================
// 1. COURSES: DB-ONLY (Fast, Relaxed Rate Limit)
// ==========================================

export const getMyCourses = async (request, response) => {
  const { email } = request.user;
  const refresh = Boolean(request.body?.refresh || request.query?.refresh);

  // If client passed refresh: true, delegate to live sync handler
  if (refresh) {
    return syncMyCourses(request, response);
  }

  try {
    const cachedCoursesFromDb = await coursesCollection
      .find({ user_email: email })
      .sort({ colid: 1 })
      .toArray();

    const coursesWithStatus = cachedCoursesFromDb.map(courseItem => ({
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
      source: 'MONGODB_DATABASE',
      courses: coursesWithStatus
    });
  } catch (coursesError) {
    response.status(500).json({ error: 'Failed to fetch courses: ' + coursesError.message });
  }
};

// ==========================================
// 2. COURSES: LIVE VOLP SYNC (Strict Rate Limit)
// ==========================================

export const syncMyCourses = async (request, response) => {
  const { email, token } = request.user;

  try {
    // 1. Get existing cached courses from DB to preserve user's is_blocked preferences
    const cachedCoursesFromDb = await coursesCollection
      .find({ user_email: email })
      .toArray();

    const blockedStatusMap = new Map(
      cachedCoursesFromDb.map(c => [Number(c.colid), Boolean(c.is_blocked)])
    );

    // 2. Connect to VOLP portal and fetch fresh courses
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
    }

    // 3. Return fresh courses directly in memory (zero redundant second DB query)
    const coursesWithStatus = liveCourses.map(course => ({
      colid: course.colid,
      crsid: course.crsid,
      course_name: course.course_name,
      semester: course.semester,
      academic_year: course.academic_year,
      updated_at: new Date(),
      is_blocked: blockedStatusMap.get(Number(course.colid)) || false
    }));

    response.json({
      success: true,
      email,
      source: 'VOLP_LIVE_SYNCED',
      courses: coursesWithStatus
    });
  } catch (coursesError) {
    response.status(500).json({ error: 'Failed to sync courses from VOLP: ' + coursesError.message });
  }
};

// ==========================================
// 3. ASSIGNMENTS: DB-ONLY (Fast, Relaxed Rate Limit)
// ==========================================

export const getMyAssignments = async (request, response) => {
  const { email } = request.user;
  const refresh = Boolean(request.body?.refresh || request.query?.refresh);

  // If a legacy client passed refresh: true to this endpoint, delegate to sync handler
  if (refresh) {
    return syncMyAssignments(request, response);
  }

  try {
    // 1. Load this user's blocked courses from unified courses table
    const blockedCourseRows = await coursesCollection
      .find({ user_email: email, is_blocked: true }, { projection: { colid: 1 } })
      .toArray();
    const blockedCourseColids = new Set(blockedCourseRows.map(courseRow => Number(courseRow.colid)));

    // 2. Read cached assignments from MongoDB
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

    // 3. Filter out assignments belonging to blocked courses
    const nonBlockedAssignments = cachedAssignmentsFromDb.filter(
      assignment => !blockedCourseColids.has(Number(assignment.colid))
    );

    response.json({
      success: true,
      email,
      source: 'MONGODB_DATABASE',
      count: nonBlockedAssignments.length,
      assignments: nonBlockedAssignments
    });
  } catch (assignmentsError) {
    response.status(500).json({ error: 'Failed to fetch assignments: ' + assignmentsError.message });
  }
};

// ==========================================
// 4. ASSIGNMENTS: LIVE VOLP SYNC (Strict Rate Limit)
// ==========================================

export const syncMyAssignments = async (request, response) => {
  const { email, token } = request.user;

  try {
    // 1. Load this user's blocked courses
    const blockedCourseRows = await coursesCollection
      .find({ user_email: email, is_blocked: true }, { projection: { colid: 1 } })
      .toArray();
    const blockedCourseColids = new Set(blockedCourseRows.map(courseRow => Number(courseRow.colid)));

    // 2. Read existing cached assignments to preserve is_blocked flags
    const cachedAssignmentsFromDb = await assignmentsCollection
      .find(
        { user_email: email },
        { projection: { assignment_id: 1, assignment_type: 1, is_blocked: 1 } }
      )
      .toArray();

    const blockedAssignmentsMap = new Map(
      cachedAssignmentsFromDb.map(a => [`${a.assignment_id}:${a.assignment_type}`, Boolean(a.is_blocked)])
    );

    // 3. Live discovery from VOLP external portal
    const liveAssignments = await fetchUserAssignments(token, email, blockedCourseColids);

    // 4. Upsert discovered assignments into database
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

    // 5. Construct fresh list in memory (zero redundant second DB query)
    const freshAssignments = liveAssignments.map(item => ({
      assignment_id: Number(item.assignment_id),
      assignment_type: item.assignment_type,
      colid: item.colid ?? null,
      course_name: item.course_name,
      unit_name: item.unit_name ?? null,
      title_html: item.title_html,
      due_date_raw: item.due_date_raw ?? null,
      is_submitted: Boolean(item.is_submitted),
      is_blocked: blockedAssignmentsMap.get(`${item.assignment_id}:${item.assignment_type}`) || false,
      updated_at: new Date()
    }));

    const nonBlockedAssignments = freshAssignments.filter(
      assignment => !blockedCourseColids.has(Number(assignment.colid))
    );

    response.json({
      success: true,
      email,
      source: 'VOLP_LIVE_SYNCED',
      count: nonBlockedAssignments.length,
      assignments: nonBlockedAssignments
    });
  } catch (assignmentsError) {
    response.status(500).json({ error: 'Failed to sync assignments from VOLP: ' + assignmentsError.message });
  }
};

// ==========================================
// 5. MANUAL REMINDER SIMULATION
// ==========================================

export const triggerReminderSimulation = async (request, response) => {
  const { email, token } = request.user;

  try {
    await triggerCronNow(email, token);
    response.json({
      success: true,
      message: `8 PM Email Reminder simulation executed for ${email}.`
    });
  } catch (cronError) {
    response.status(500).json({ error: 'Cron trigger failed: ' + cronError.message });
  }
};

