/**
 * volp.service.js - VOLP API Integration & Discovery Service (Modern ES Module)
 * Supports all 6 Assignment Discovery Archetypes across Course, Unit, and Topic levels.
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

  const assignmentsMap = new Map(); // Key: `${assignment_id}:${assignment_type}`

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
    return [];
  }

  // 2. Loop through courses
  for (const course of courses) {
    const colid = Number(course.colid ?? course.learnercoffid);
    let crsid = Number(course.crsid || 0);
    const courseTitle = course.code || course.course_name || `Course ${colid}`;

    // Skip if this course is blocked by the user
    if (blockedColids.has(colid)) {
      console.log(`🚫 Skipping blocked course colid=${colid} (${courseTitle}) for ${email}`);
      continue;
    }

    // Fetch Syllabus & Course Content Data
    let contentData = null;
    let unitLevel = [];
    let course_id = crsid;

    try {
      const cntRes = await fetch(`${LEARNER_URL}/learnerCourseContent/courseContentData`, {
        method: "POST",
        headers: getHeaders(token, email, "/learner-course-content"),
        body: JSON.stringify({ colid })
      });
      if (cntRes.ok) {
        contentData = await cntRes.json();
        unitLevel = contentData?.unit_level ?? [];
        if (contentData?.course_id) {
          course_id = Number(contentData.course_id);
          if (!crsid) crsid = course_id;
        }
      }
    } catch (e) {
      console.log(`⚠ Could not fetch content for colid=${colid}: ${e.message}`);
    }

    const courseLevelAssigns = contentData?.course_level?.assigns || {};

    // =========================================================================
    // WAY 1: Course-Level Subjective (Archetype 1)
    // =========================================================================
    if (crsid) {
      try {
        const subRes = await fetch(`${LEARNER_URL}/SubjectiveAssignment/getSubjectiveAssignment_new`, {
          method: "POST",
          headers: getHeaders(token, email, "/learner-subjective-assignment"),
          body: JSON.stringify({ course_offering_learner_id: colid, type: "content", courseId: crsid })
        });
        if (subRes.ok) {
          const subData = await subRes.json();
          (subData?.question_list ?? []).forEach(q => {
            const key = `${q.ass_id}:SUBJECTIVE`;
            if (!assignmentsMap.has(key)) {
              assignmentsMap.set(key, {
                assignment_id: Number(q.ass_id),
                assignment_type: "SUBJECTIVE",
                colid,
                course_name: courseTitle,
                unit_name: null,
                title_html: q.question,
                due_date_raw: q.due_date || null,
                is_submitted: Boolean(q.issubmitted || (q.isalreadysubmitted === "true") || q.submitted_answer_file_name)
              });
            }
          });
        }
      } catch (e) {
        console.log(`⚠ Course subjective failed for colid=${colid}: ${e.message}`);
      }
    }

    // =========================================================================
    // WAY 2: Course-Level Hands-On (Archetype 2: 3.js & 5.js Case 1)
    // Triggered when course_level.assigns.hands has items, or if unit_level is empty
    // =========================================================================
    const courseHands = courseLevelAssigns.hands || [];
    if (courseHands.length > 0 || (unitLevel.length === 0 && course_id)) {
      try {
        const hoRes = await fetch(`${LEARNER_URL}/HandOnAssignment/getHandsOnDetails`, {
          method: "POST",
          headers: getHeaders(token, email, "/learner-handson-assignment"),
          body: JSON.stringify({
            course_offering_learner_id: colid,
            courseId: course_id || crsid,
            type: "content"
          })
        });
        if (hoRes.ok) {
          const hoData = await hoRes.json();
          (hoData?.ass_list ?? []).forEach(a => {
            const key = `${a.ass_id}:HANDS_ON`;
            if (!assignmentsMap.has(key)) {
              assignmentsMap.set(key, {
                assignment_id: Number(a.ass_id),
                assignment_type: "HANDS_ON",
                colid,
                course_name: courseTitle,
                unit_name: a.outline || a.topic || null,
                title_html: a.assignment_text,
                due_date_raw: a.duedate || null,
                is_submitted: Boolean(a.filename && a.filename.trim() !== "")
              });
            }
          });
        }
      } catch (e) {
        console.log(`⚠ Course hands-on failed for colid=${colid}: ${e.message}`);
      }
    }

    // Process Units and Topics if unit_level is present
    if (unitLevel.length > 0) {
      for (const unit of unitLevel) {
        const uAssigns = unit.assigns || {};
        const unitProj = uAssigns.proj || [];
        const unitSwa = uAssigns.swa || [];
        const unitCie = uAssigns.cie || [];
        const unitHands = uAssigns.hands || [];
        const topics = Array.isArray(unit.topic_level) ? unit.topic_level : [];

        // =========================================================================
        // WAY 3: Unit-Level (Outline) Subjective (Discovered in 5.js - Archetype 5)
        // Triggered when unit.assigns.proj or swa or cie has items, or topics empty
        // =========================================================================
        if (unitProj.length > 0 || unitSwa.length > 0 || unitCie.length > 0 || (topics.length === 0 && unit.unit_id)) {
          try {
            const unitSubRes = await fetch(`${LEARNER_URL}/SubjectiveAssignment/getSubjectiveAssignment_new`, {
              method: "POST",
              headers: getHeaders(token, email, "/learner-subjective-assignment"),
              body: JSON.stringify({
                course_offering_learner_id: colid,
                outline: unit.unit_id,
                type: "content"
              })
            });
            if (unitSubRes.ok) {
              const unitSubData = await unitSubRes.json();
              (unitSubData?.question_list ?? []).forEach(q => {
                const key = `${q.ass_id}:SUBJECTIVE`;
                if (!assignmentsMap.has(key)) {
                  assignmentsMap.set(key, {
                    assignment_id: Number(q.ass_id),
                    assignment_type: "SUBJECTIVE",
                    colid,
                    course_name: courseTitle,
                    unit_name: unit.unit_name || q.outline_name || null,
                    title_html: q.question,
                    due_date_raw: q.due_date || null,
                    is_submitted: Boolean(q.issubmitted || (q.isalreadysubmitted === "true") || q.submitted_answer_file_name)
                  });
                }
              });
            }
          } catch (e) {
            console.log(`⚠ Unit subjective failed for colid=${colid}, unit=${unit.unit_id}: ${e.message}`);
          }
        }

        // =========================================================================
        // WAY 4: Unit-Level (Outline) Hands-On (Archetype 3: 1.js & 2.js)
        // =========================================================================
        if (unitHands.length > 0 || topics.length === 0) {
          try {
            const hoRes = await fetch(`${LEARNER_URL}/HandOnAssignment/getHandsOnDetails`, {
              method: "POST",
              headers: getHeaders(token, email, "/learner-handson-assignment"),
              body: JSON.stringify({
                course_offering_learner_id: colid,
                outline: unit.unit_id,
                type: "content"
              })
            });
            if (hoRes.ok) {
              const hoData = await hoRes.json();
              (hoData?.ass_list ?? []).forEach(a => {
                const key = `${a.ass_id}:HANDS_ON`;
                if (!assignmentsMap.has(key)) {
                  assignmentsMap.set(key, {
                    assignment_id: Number(a.ass_id),
                    assignment_type: "HANDS_ON",
                    colid,
                    course_name: courseTitle,
                    unit_name: unit.unit_name ?? a.outline ?? null,
                    title_html: a.assignment_text,
                    due_date_raw: a.duedate || null,
                    is_submitted: Boolean(a.filename && a.filename.trim() !== "")
                  });
                }
              });
            }
          } catch (e) {
            console.log(`⚠ Unit hands-on failed for colid=${colid}, unit=${unit.unit_id}: ${e.message}`);
          }
        }

        // =========================================================================
        // WAYS 5 & 6: Topic-Level Subjective & Hands-On (Archetype 4: 2.js & 4.js)
        // =========================================================================
        for (const topic of topics) {
          const tAssigns = topic.assigns || {};
          const tProj = tAssigns.proj || [];
          const tSwa = tAssigns.swa || [];
          const tHands = tAssigns.hands || [];

          // Way 5: Topic-Level Subjective
          if (tProj.length > 0 || tSwa.length > 0 || (!tAssigns.hands || tHands.length === 0)) {
            try {
              const topSubRes = await fetch(`${LEARNER_URL}/SubjectiveAssignment/getSubjectiveAssignment_new`, {
                method: "POST",
                headers: getHeaders(token, email, "/learner-subjective-assignment"),
                body: JSON.stringify({
                  course_offering_learner_id: colid,
                  topic_new: topic.topic_id,
                  type: "content"
                })
              });
              if (topSubRes.ok) {
                const topSubData = await topSubRes.json();
                (topSubData?.question_list ?? []).forEach(q => {
                  const key = `${q.ass_id}:SUBJECTIVE`;
                  if (!assignmentsMap.has(key)) {
                    const uLabel = unit.unit_name ? unit.unit_name.trim() : "";
                    const tLabel = (q.topic_name || topic.topic_name || "").trim();
                    const combined = uLabel && tLabel ? `${uLabel} > ${tLabel}` : (tLabel || uLabel || null);

                    assignmentsMap.set(key, {
                      assignment_id: Number(q.ass_id),
                      assignment_type: "SUBJECTIVE",
                      colid,
                      course_name: courseTitle,
                      unit_name: combined,
                      title_html: q.question,
                      due_date_raw: q.due_date || null,
                      is_submitted: Boolean(q.issubmitted || (q.isalreadysubmitted === "true") || q.submitted_answer_file_name)
                    });
                  }
                });
              }
            } catch (e) {
              console.log(`⚠ Topic subjective failed for colid=${colid}, topic=${topic.topic_id}: ${e.message}`);
            }
          }

          // Way 6: Topic-Level Hands-On (Key is `topic: topic.topic_id`)
          if (tHands.length > 0) {
            try {
              const topHoRes = await fetch(`${LEARNER_URL}/HandOnAssignment/getHandsOnDetails`, {
                method: "POST",
                headers: getHeaders(token, email, "/learner-handson-assignment"),
                body: JSON.stringify({
                  course_offering_learner_id: colid,
                  topic: topic.topic_id,
                  type: "content"
                })
              });
              if (topHoRes.ok) {
                const topHoData = await topHoRes.json();
                (topHoData?.ass_list ?? []).forEach(a => {
                  const key = `${a.ass_id}:HANDS_ON`;
                  if (!assignmentsMap.has(key)) {
                    const uLabel = unit.unit_name ? unit.unit_name.trim() : "";
                    const tLabel = (topic.topic_name || "").trim();
                    const combined = uLabel && tLabel ? `${uLabel} > ${tLabel}` : (tLabel || uLabel || null);

                    assignmentsMap.set(key, {
                      assignment_id: Number(a.ass_id),
                      assignment_type: "HANDS_ON",
                      colid,
                      course_name: courseTitle,
                      unit_name: combined,
                      title_html: a.assignment_text,
                      due_date_raw: a.duedate || null,
                      is_submitted: Boolean(a.filename && a.filename.trim() !== "")
                    });
                  }
                });
              }
            } catch (e) {
              console.log(`⚠ Topic hands-on failed for colid=${colid}, topic=${topic.topic_id}: ${e.message}`);
            }
          }
        }
      }
    }
  }

  return Array.from(assignmentsMap.values());
};
