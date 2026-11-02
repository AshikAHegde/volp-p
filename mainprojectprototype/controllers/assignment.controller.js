import { fetchUserAssignments, fetchUserCourses } from '../services/volp.service.js';
import { triggerCronNow } from '../services/cron.service.js';
import { coursesCollection, assignmentsCollection, usersCollection, reminderLogsCollection } from '../services/db.service.js';

// Retrieves cached courses for the user from the database or triggers a live sync if refresh is requested or cache is empty.
export const getMyCourses = async (request, response) => {
  const { token } = request.user;
  const email = (request.user?.email || '').trim().toLowerCase();
  const refresh = Boolean(request.body?.refresh || request.query?.refresh);

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

// Fetches live courses from the VOLP portal and updates the database cache.
export const syncMyCourses = async (request, response) => {
  const { token } = request.user;
  const email = (request.user?.email || '').trim().toLowerCase();

  try {
    const cachedCoursesFromDb = await coursesCollection
      .find({ user_email: email })
      .toArray();

    const blockedStatusMap = new Map();
    cachedCoursesFromDb.forEach(c => {
      blockedStatusMap.set(Number(c.colid), Boolean(c.is_blocked));
      blockedStatusMap.set(String(c.colid), Boolean(c.is_blocked));
    });

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

// Retrieves cached non-blocked assignments for the authenticated user from the database.
export const getMyAssignments = async (request, response) => {
  const { email } = request.user;
  const refresh = Boolean(request.body?.refresh || request.query?.refresh);

  if (refresh) {
    return syncMyAssignments(request, response);
  }

  try {
    const blockedCourseRows = await coursesCollection
      .find({ user_email: email, is_blocked: true }, { projection: { colid: 1 } })
      .toArray();
    const blockedCourseColids = new Set(blockedCourseRows.map(courseRow => Number(courseRow.colid)));

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

// Fetches live assignments from the VOLP portal and updates the database cache.
export const syncMyAssignments = async (request, response) => {
  const { email, token } = request.user;

  try {
    const blockedCourseRows = await coursesCollection
      .find({ user_email: email, is_blocked: true }, { projection: { colid: 1 } })
      .toArray();
    const blockedCourseColids = new Set(blockedCourseRows.map(courseRow => Number(courseRow.colid)));

    const cachedAssignmentsFromDb = await assignmentsCollection
      .find(
        { user_email: email },
        { projection: { assignment_id: 1, assignment_type: 1, is_blocked: 1 } }
      )
      .toArray();

    const blockedAssignmentsMap = new Map(
      cachedAssignmentsFromDb.map(a => [`${a.assignment_id}:${a.assignment_type}`, Boolean(a.is_blocked)])
    );

    const liveAssignments = await fetchUserAssignments(token, email, blockedCourseColids);

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

// Manually triggers an immediate run of the 8 PM reminder digest simulation for a user.
export const triggerReminderSimulation = async (request, response) => {
  const { email, token } = request.user;

  try {
    // Look up telegram_chat_id to pass down to triggerCronNow and avoid duplicate DB queries
    const user = await usersCollection.findOne({ email }, { projection: { telegram_chat_id: 1 } });
    const result = await triggerCronNow(email, token, user?.telegram_chat_id);
    response.json({
      success: true,
      message: result?.message || `8 PM Telegram Reminder dispatch executed for ${email}.`,
      result
    });
  } catch (cronError) {
    response.status(500).json({ error: 'Cron trigger failed: ' + cronError.message });
  }
};

// Retrieves recent 8 PM reminder dispatch logs for the authenticated user.
export const getReminderLogs = async (request, response) => {
  const { email } = request.user;
  try {
    if (!reminderLogsCollection) {
      return response.json({ success: true, logs: [] });
    }
    const logs = await reminderLogsCollection
      .find({ user_email: email })
      .sort({ created_at: -1 })
      .limit(30)
      .toArray();

    response.json({
      success: true,
      logs
    });
  } catch (err) {
    response.status(500).json({ error: 'Failed to fetch reminder logs: ' + err.message });
  }
};
