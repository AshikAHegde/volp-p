/**
 * volp.service.js - VOLP API Integration & Discovery Service (Modern ES Module)
 */
import 'dotenv/config';

const LOGIN_URL = process.env.VOLP_LOGIN_URL;
const LEARNER_URL = process.env.VOLP_LEARNER_URL;

const getHeaders = (token, email, routerPath) => ({
  "accept": "application/json, text/plain, */*",
  "content-type": "application/json;charset=UTF-8",
  "device": "Web",
  "router-path": routerPath,
  token,
  "uid": email,
  "ut": "Learner"
});

// Safe JSON parser — throws a clean error if VOLP returns HTML (e.g. expired token / auth failure)
const safeJson = async (res, label) => {
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    throw new Error(`VOLP session expired or invalid token. Please log out and log in again. (${label} returned ${res.status} ${ct})`);
  }
  return res.json();
};

export const loginVOLP = async (username, pwd) => {
  if (!LOGIN_URL) {
    throw new Error('VOLP_LOGIN_URL is not set in environment variables.');
  }

  const res = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json;charset=UTF-8",
      "device": "Web",
      "router-path": "/login"
    },
    body: JSON.stringify({ username, pwd })
  });

  if (!res.ok) {
    throw new Error(`VOLP login failed with status ${res.status}`);
  }

  const data = await safeJson(res, 'login');
  const token = data?.token;

  if (!token) {
    throw new Error('VOLP login succeeded but no token was returned.');
  }

  return token;
};

export const fetchUserCourses = async (token, email) => {
  if (!LEARNER_URL) {
    throw new Error('VOLP_LEARNER_URL is not set in environment variables.');
  }

  const cRes = await fetch(`${LEARNER_URL}/learnerCourseDashboard/learnerCourseList`, {
    method: "POST",
    headers: getHeaders(token, email, "/learner-course-overview"),
    body: null
  });

  if (!cRes.ok) {
    throw new Error(`Failed to fetch course list (status ${cRes.status})`);
  }

  const cData = await safeJson(cRes, 'learnerCourseList');
  const rawCourses = cData?.col_list ?? [];

  return rawCourses.map(course => ({
    colid: Number(course.colid ?? course.learnercoffid),
    crsid: Number(course.crsid),
    course_name: course.code ?? course.course_name ?? `Course ${course.colid}`,
    semester: course.sem ?? '',
    academic_year: course.ay ?? ''
  }));
};

export const fetchUserAssignments = async (token, email, blockedColids = new Set()) => {
  if (!LEARNER_URL) {
    throw new Error('VOLP_LEARNER_URL is not set in environment variables.');
  }

  const assignments = [];

  // 1. Get Course List
  const cRes = await fetch(`${LEARNER_URL}/learnerCourseDashboard/learnerCourseList`, {
    method: "POST",
    headers: getHeaders(token, email, "/learner-course-overview"),
    body: null
  });

  if (!cRes.ok) {
    throw new Error(`Failed to fetch course list (status ${cRes.status})`);
  }

  const cData = await safeJson(cRes, 'learnerCourseList');
  const courses = cData?.col_list ?? [];

  if (courses.length === 0) {
    console.log(`ℹ No courses found for ${email}.`);
    return assignments;
  }

  // 2. Loop through courses
  for (const course of courses) {
    const colid = Number(course.colid ?? course.learnercoffid);
    const crsid = course.crsid;

    // Skip if this course is blocked by the user
    if (blockedColids.has(colid)) {
      console.log(`🚫 Skipping blocked course colid=${colid} (${course.code}) for ${email}`);
      continue;
    }

    // Get content to check unit_level[]
    let unitLevel = [];
    try {
      const cntRes = await fetch(`${LEARNER_URL}/learnerCourseContent/courseContentData`, {
        method: "POST",
        headers: getHeaders(token, email, "/learner-course-content"),
        body: JSON.stringify({ colid })
      });
      if (cntRes.ok) {
        const cntData = await cntRes.json();
        unitLevel = cntData?.unit_level ?? [];
      }
    } catch (e) {
      console.log(`⚠ Could not fetch content for colid=${colid}: ${e.message}`);
    }

    // Branch 1: ALWAYS call Subjective API
    try {
      const subRes = await fetch(`${LEARNER_URL}/SubjectiveAssignment/getSubjectiveAssignment_new`, {
        method: "POST",
        headers: getHeaders(token, email, "/learner-subjective-assignment"),
        body: JSON.stringify({ course_offering_learner_id: colid, type: "content", courseId: crsid })
      });
      if (subRes.ok) {
        const subData = await subRes.json();
        (subData?.question_list ?? []).forEach(q => {
          assignments.push({
            assignment_id: q.ass_id,
            assignment_type: "SUBJECTIVE",
            colid,
            course_name: course.code,
            unit_name: null,
            title_html: q.question,
            due_date_raw: q.due_date,
            is_submitted: Boolean(q.issubmitted)
          });
        });
      }
    } catch (e) {
      console.log(`⚠ Could not fetch subjective assignments for colid=${colid}: ${e.message}`);
    }

    // Branch 2: CONDITIONAL call Hands-On API ONLY IF unit_level is NON-EMPTY
    if (unitLevel.length > 0) {
      for (const unit of unitLevel) {
        try {
          const hoRes = await fetch(`${LEARNER_URL}/HandOnAssignment/getHandsOnDetails`, {
            method: "POST",
            headers: getHeaders(token, email, "/learner-handson-assignment"),
            body: JSON.stringify({ course_offering_learner_id: colid, outline: unit.unit_id, type: "content" })
          });
          if (hoRes.ok) {
            const hoData = await hoRes.json();
            (hoData?.ass_list ?? []).forEach(a => {
              assignments.push({
                assignment_id: a.ass_id,
                assignment_type: "HANDS_ON",
                colid,
                course_name: course.code,
                unit_name: unit.unit_name ?? a.outline,
                title_html: a.assignment_text,
                due_date_raw: a.duedate,
                is_submitted: Boolean(a.filename)
              });
            });
          }
        } catch (e) {
          console.log(`⚠ Could not fetch hands-on assignments for colid=${colid}, unit=${unit.unit_id}: ${e.message}`);
        }
      }
    }
  }

  return assignments;
};
