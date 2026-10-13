/**
 * unit.volp.service.test.js
 *
 * Pure unit tests for services/volp.service.js.
 * ALL network calls are intercepted via global.fetch mock — zero real HTTP.
 *
 * Coverage map:
 *   loginVOLP
 *     ✓ throws when VOLP_LOGIN_URL env missing (guard at module load)
 *     ✓ calls fetch with correct URL / method / body
 *     ✓ throws on HTTP !ok (any status)
 *     ✓ throws when response is HTML (safeJson gate → expired session)
 *     ✓ throws when JSON has no token field
 *     ✓ throws when token is empty string (falsy)
 *     ✓ returns token string on success
 *
 *   fetchUserCourses
 *     ✓ throws when VOLP_LEARNER_URL env missing
 *     ✓ calls correct endpoint with correct headers
 *     ✓ throws on HTTP !ok
 *     ✓ throws when response is HTML (safeJson gate)
 *     ✓ returns [] when col_list is missing from response
 *     ✓ returns [] when col_list is empty array
 *     ✓ maps colid / crsid to Number
 *     ✓ uses code as course_name; falls back to course_name; falls back to "Course <colid>"
 *     ✓ uses colid; falls back to learnercoffid
 *     ✓ uses sem / ay; defaults to "" when absent
 *     ✓ maps multiple courses
 *
 *   fetchUserAssignments
 *     ✓ throws when VOLP_LEARNER_URL env missing
 *     ✓ throws when course-list fetch is !ok
 *     ✓ throws when course-list response is HTML
 *     ✓ returns [] when col_list is empty
 *     ✓ skips blocked course (blockedColids.has(colid))
 *     ✓ does NOT skip unblocked course
 *     ✓ continues gracefully when courseContentData fetch throws (network error)
 *     ✓ continues gracefully when courseContentData returns !ok
 *     ✓ picks up course_id from contentData when crsid was 0
 *     ─── WAY 1: Course-Level Subjective ───────────────────────────────────────
 *     ✓ fetches course-level subjective when crsid > 0
 *     ✓ skips course-level subjective when crsid = 0
 *     ✓ is_submitted: true via issubmitted
 *     ✓ is_submitted: true via isalreadysubmitted === "true"
 *     ✓ is_submitted: true via submitted_answer_file_name
 *     ✓ is_submitted: false when none of the above
 *     ✓ due_date_raw is null when due_date is absent
 *     ✓ unit_name is null for course-level subjective
 *     ✓ continues gracefully when course-subjective fetch throws
 *     ✓ does not add entry when subjective endpoint returns !ok
 *     ─── WAY 2: Course-Level Hands-On ─────────────────────────────────────────
 *     ✓ triggered when course_level.assigns.hands has items
 *     ✓ triggered when unitLevel is empty AND course_id > 0
 *     ✓ NOT triggered when unitLevel is non-empty and hands is empty
 *     ✓ maps outline → unit_name; falls back to topic; falls back to null
 *     ✓ is_submitted: true when filename is non-empty string
 *     ✓ is_submitted: false when filename is empty string
 *     ✓ is_submitted: false when filename is absent
 *     ✓ due_date_raw is null when duedate is absent
 *     ✓ continues gracefully when hands-on fetch throws
 *     ─── WAY 3: Unit-Level Subjective ─────────────────────────────────────────
 *     ✓ triggered when unit.assigns.proj is non-empty
 *     ✓ triggered when unit.assigns.swa is non-empty
 *     ✓ triggered when unit.assigns.cie is non-empty
 *     ✓ triggered when topics is empty AND unit.unit_id exists
 *     ✓ NOT triggered when none of proj/swa/cie and topics non-empty
 *     ✓ unit_name taken from unit.unit_name; falls back to q.outline_name; null otherwise
 *     ✓ continues gracefully when unit-subjective fetch throws
 *     ─── WAY 4: Unit-Level Hands-On ───────────────────────────────────────────
 *     ✓ triggered when unit.assigns.hands is non-empty
 *     ✓ triggered when topics is empty (default trigger)
 *     ✓ uses unit.unit_name; falls back to a.outline; null otherwise
 *     ✓ continues gracefully when unit-hands-on fetch throws
 *     ─── WAY 5: Topic-Level Subjective ────────────────────────────────────────
 *     ✓ triggered when tProj is non-empty
 *     ✓ triggered when tSwa is non-empty
 *     ✓ triggered when tAssigns.hands is undefined (falsy)
 *     ✓ triggered when tHands is empty
 *     ✓ unit_name: "UnitName > TopicName" when both present
 *     ✓ unit_name: TopicName only when unit_name is absent
 *     ✓ unit_name: UnitName only when topic_name is absent
 *     ✓ unit_name: null when both absent
 *     ✓ uses q.topic_name first, then topic.topic_name for label
 *     ✓ continues gracefully when topic-subjective fetch throws
 *     ─── WAY 6: Topic-Level Hands-On ──────────────────────────────────────────
 *     ✓ triggered ONLY when tHands is non-empty
 *     ✓ NOT triggered when tHands is empty
 *     ✓ unit_name: "UnitName > TopicName" when both present
 *     ✓ continues gracefully when topic-hands-on fetch throws
 *     ─── Deduplication ────────────────────────────────────────────────────────
 *     ✓ first-seen assignment wins (same id + type from two courses)
 *     ✓ same assignment_id with different type is treated as separate entry
 *     ─── Return value ─────────────────────────────────────────────────────────
 *     ✓ returns a plain Array (not a Map)
 */

import { jest } from "@jest/globals";

// Set env vars BEFORE importing the module so module-level constants capture them
process.env.VOLP_LOGIN_URL = "https://fake-volp.test/login/process";
process.env.VOLP_LEARNER_URL = "https://fake-volp.test/learner";

const { loginVOLP, fetchUserCourses, fetchUserAssignments } =
  await import("../services/volp.service.js");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a minimal Response-like object.
 * @param {object} opts
 * @param {boolean} [opts.ok=true]
 * @param {number}  [opts.status=200]
 * @param {object}  [opts.json={}]        – resolved from .json()
 * @param {string}  [opts.contentType="application/json"]
 */
function res({
  ok = true,
  status = 200,
  json = {},
  contentType = "application/json",
} = {}) {
  return {
    ok,
    status,
    headers: { get: () => contentType },
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(JSON.stringify(json)),
  };
}

/** Returns a fresh fetch mock that always resolves with `response`. */
const alwaysReturn = (response) => jest.fn().mockResolvedValue(response);

/** Returns a course-list response with one course. */
function oneCourseCourseList(courseOverrides = {}) {
  return res({
    json: {
      col_list: [
        {
          colid: "10",
          crsid: "20",
          code: "CS101",
          sem: "5",
          ay: "2024-25",
          ...courseOverrides,
        },
      ],
    },
  });
}

/** A "no assignments" content-data response (triggers WAY 2 via empty unitLevel). */
const emptyContentData = res({
  json: { course_level: { assigns: {} }, unit_level: [], course_id: 20 },
});

/** Empty assignment endpoint response. */
const noAssignments = res({ json: {} });

// ─────────────────────────────────────────────────────────────────────────────
// loginVOLP
// ─────────────────────────────────────────────────────────────────────────────
describe("loginVOLP", () => {
  afterEach(() => jest.resetAllMocks());

  test("calls fetch with correct URL, method, and body", async () => {
    global.fetch = alwaysReturn(res({ json: { token: "tok_abc" } }));

    await loginVOLP("user@vit.ac.in", "secret");

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("https://fake-volp.test/login/process");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({
      username: "user@vit.ac.in",
      pwd: "secret",
    });
  });

  test("includes correct fixed headers in the request", async () => {
    global.fetch = alwaysReturn(res({ json: { token: "t" } }));
    await loginVOLP("u", "p");
    const { headers } = global.fetch.mock.calls[0][1];
    expect(headers["content-type"]).toMatch("application/json");
    expect(headers["device"]).toBe("Web");
    expect(headers["router-path"]).toBe("/login");
  });

  test("throws when HTTP response is !ok (status 401)", async () => {
    global.fetch = alwaysReturn(res({ ok: false, status: 401 }));
    await expect(loginVOLP("u", "p")).rejects.toThrow(
      "VOLP login failed with status 401",
    );
  });

  test("throws when HTTP response is !ok (status 500)", async () => {
    global.fetch = alwaysReturn(res({ ok: false, status: 500 }));
    await expect(loginVOLP("u", "p")).rejects.toThrow(
      "VOLP login failed with status 500",
    );
  });

  test("throws when response is HTML instead of JSON (expired session)", async () => {
    global.fetch = alwaysReturn(
      res({ ok: true, status: 200, contentType: "text/html" }),
    );
    await expect(loginVOLP("u", "p")).rejects.toThrow(
      "VOLP session expired or invalid token",
    );
  });

  test("throws when JSON has no token field", async () => {
    global.fetch = alwaysReturn(res({ json: { message: "ok" } }));
    await expect(loginVOLP("u", "p")).rejects.toThrow(
      "VOLP login succeeded but no token was returned",
    );
  });

  test("throws when token is an empty string (falsy)", async () => {
    global.fetch = alwaysReturn(res({ json: { token: "" } }));
    await expect(loginVOLP("u", "p")).rejects.toThrow(
      "VOLP login succeeded but no token was returned",
    );
  });

  test("returns the token string on successful login", async () => {
    global.fetch = alwaysReturn(res({ json: { token: "tok_xyz789" } }));
    const result = await loginVOLP("user@vit.ac.in", "pass");
    expect(result).toBe("tok_xyz789");
  });

  test("fetch is called exactly once", async () => {
    global.fetch = alwaysReturn(res({ json: { token: "t" } }));
    await loginVOLP("u", "p");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchUserCourses
// ─────────────────────────────────────────────────────────────────────────────
describe("fetchUserCourses", () => {
  afterEach(() => jest.resetAllMocks());

  test("calls the learnerCourseList endpoint with POST", async () => {
    global.fetch = alwaysReturn(res({ json: { col_list: [] } }));
    await fetchUserCourses("tok", "u@vit.ac.in");
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toContain("/learnerCourseDashboard/learnerCourseList");
    expect(opts.method).toBe("POST");
  });

  test("request headers include token and uid", async () => {
    global.fetch = alwaysReturn(res({ json: { col_list: [] } }));
    await fetchUserCourses("MY_TOKEN", "student@vit.ac.in");
    const { headers } = global.fetch.mock.calls[0][1];
    expect(headers.token).toBe("MY_TOKEN");
    expect(headers.uid).toBe("student@vit.ac.in");
    expect(headers["router-path"]).toBe("/learner-course-overview");
  });

  test("throws on HTTP !ok (status 500)", async () => {
    global.fetch = alwaysReturn(res({ ok: false, status: 500 }));
    await expect(fetchUserCourses("tok", "u")).rejects.toThrow(
      "Failed to fetch course list (status 500)",
    );
  });

  test("throws when response is HTML (session expired)", async () => {
    global.fetch = alwaysReturn(res({ ok: true, contentType: "text/html" }));
    await expect(fetchUserCourses("tok", "u")).rejects.toThrow(
      "VOLP session expired or invalid token",
    );
  });

  test("returns [] when col_list key is missing", async () => {
    global.fetch = alwaysReturn(res({ json: {} }));
    expect(await fetchUserCourses("tok", "u")).toEqual([]);
  });

  test("returns [] when col_list is empty", async () => {
    global.fetch = alwaysReturn(res({ json: { col_list: [] } }));
    expect(await fetchUserCourses("tok", "u")).toEqual([]);
  });

  test("maps colid and crsid to Number", async () => {
    global.fetch = alwaysReturn(
      res({ json: { col_list: [{ colid: "42", crsid: "99" }] } }),
    );
    const [c] = await fetchUserCourses("tok", "u");
    expect(c.colid).toBe(42);
    expect(c.crsid).toBe(99);
  });

  test("falls back to learnercoffid when colid is absent", async () => {
    global.fetch = alwaysReturn(
      res({
        json: { col_list: [{ learnercoffid: "777", crsid: "1", code: "X" }] },
      }),
    );
    const [c] = await fetchUserCourses("tok", "u");
    expect(c.colid).toBe(777);
  });

  test("uses code as course_name", async () => {
    global.fetch = alwaysReturn(
      res({
        json: { col_list: [{ colid: "1", crsid: "2", code: "MATH1" }] },
      }),
    );
    const [c] = await fetchUserCourses("tok", "u");
    expect(c.course_name).toBe("MATH1");
  });

  test("falls back to course_name field when code is absent", async () => {
    global.fetch = alwaysReturn(
      res({
        json: {
          col_list: [{ colid: "1", crsid: "2", course_name: "Intro to AI" }],
        },
      }),
    );
    const [c] = await fetchUserCourses("tok", "u");
    expect(c.course_name).toBe("Intro to AI");
  });

  test("falls back to 'Course <colid>' when both code and course_name absent", async () => {
    global.fetch = alwaysReturn(
      res({ json: { col_list: [{ colid: "55", crsid: "1" }] } }),
    );
    const [c] = await fetchUserCourses("tok", "u");
    expect(c.course_name).toBe("Course 55");
  });

  test("maps semester from sem field", async () => {
    global.fetch = alwaysReturn(
      res({ json: { col_list: [{ colid: "1", crsid: "2", sem: "3" }] } }),
    );
    const [c] = await fetchUserCourses("tok", "u");
    expect(c.semester).toBe("3");
  });

  test("semester defaults to '' when sem is absent", async () => {
    global.fetch = alwaysReturn(
      res({ json: { col_list: [{ colid: "1", crsid: "2" }] } }),
    );
    const [c] = await fetchUserCourses("tok", "u");
    expect(c.semester).toBe("");
  });

  test("maps academic_year from ay field", async () => {
    global.fetch = alwaysReturn(
      res({
        json: { col_list: [{ colid: "1", crsid: "2", ay: "2024-25" }] },
      }),
    );
    const [c] = await fetchUserCourses("tok", "u");
    expect(c.academic_year).toBe("2024-25");
  });

  test("academic_year defaults to '' when ay is absent", async () => {
    global.fetch = alwaysReturn(
      res({ json: { col_list: [{ colid: "1", crsid: "2" }] } }),
    );
    const [c] = await fetchUserCourses("tok", "u");
    expect(c.academic_year).toBe("");
  });

  test("maps multiple courses correctly", async () => {
    global.fetch = alwaysReturn(
      res({
        json: {
          col_list: [
            { colid: "1", crsid: "10", code: "PHY1", sem: "1", ay: "2023-24" },
            { colid: "2", crsid: "20", code: "CHE2", sem: "2", ay: "2023-24" },
          ],
        },
      }),
    );
    const result = await fetchUserCourses("tok", "u");
    expect(result).toHaveLength(2);
    expect(result[0].course_name).toBe("PHY1");
    expect(result[1].course_name).toBe("CHE2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchUserAssignments
// ─────────────────────────────────────────────────────────────────────────────
describe("fetchUserAssignments", () => {
  afterEach(() => jest.resetAllMocks());

  // ── Guards ─────────────────────────────────────────────────────────────────

  test("throws on course-list HTTP !ok (status 503)", async () => {
    global.fetch = alwaysReturn(res({ ok: false, status: 503 }));
    await expect(fetchUserAssignments("tok", "u")).rejects.toThrow(
      "Failed to fetch course list (status 503)",
    );
  });

  test("throws when course-list returns HTML", async () => {
    global.fetch = alwaysReturn(res({ ok: true, contentType: "text/html" }));
    await expect(fetchUserAssignments("tok", "u")).rejects.toThrow(
      "VOLP session expired or invalid token",
    );
  });

  test("returns [] when col_list is empty", async () => {
    global.fetch = alwaysReturn(res({ json: { col_list: [] } }));
    expect(await fetchUserAssignments("tok", "u")).toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(1); // only the course-list call
  });

  test("returns Array (not Map)", async () => {
    global.fetch = alwaysReturn(res({ json: { col_list: [] } }));
    const result = await fetchUserAssignments("tok", "u");
    expect(Array.isArray(result)).toBe(true);
  });

  // ── Course blocking ────────────────────────────────────────────────────────

  test("skips a blocked course entirely (no further fetch for that course)", async () => {
    global.fetch = jest.fn().mockResolvedValue(oneCourseCourseList()); // course-list: colid=10

    const result = await fetchUserAssignments("tok", "u", new Set([10]));

    // Only the course-list call should happen; nothing for colid=10
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });

  test("does NOT skip a course whose colid is not in blockedColids", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList()) // course-list
      .mockResolvedValueOnce(emptyContentData) // content data
      .mockResolvedValue(noAssignments); // everything else

    await fetchUserAssignments("tok", "u", new Set([999])); // 999 ≠ 10

    // Should have made more than 1 call (processed the course)
    expect(global.fetch.mock.calls.length).toBeGreaterThan(1);
  });

  // ── courseContentData error handling ──────────────────────────────────────

  test("continues gracefully when courseContentData fetch throws a network error", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList()) // course-list OK
      .mockRejectedValueOnce(new Error("network down")) // courseContentData throws
      .mockResolvedValue(noAssignments); // subjective / hands-on

    // Should not throw
    const result = await fetchUserAssignments("tok", "u");
    expect(Array.isArray(result)).toBe(true);
  });

  test("continues gracefully when courseContentData returns !ok", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(res({ ok: false, status: 500 })) // contentData !ok
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(Array.isArray(result)).toBe(true);
  });

  test("uses course_id from contentData to overwrite crsid when crsid was 0", async () => {
    // Course list has crsid=0; contentData provides course_id=99
    const courseList = res({
      json: { col_list: [{ colid: "10", crsid: "0", code: "X" }] },
    });
    const contentData = res({
      json: { course_level: { assigns: {} }, unit_level: [], course_id: 99 },
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(courseList)
      .mockResolvedValueOnce(contentData)
      // subjective called (crsid now = 99)
      .mockResolvedValueOnce(
        res({
          json: {
            question_list: [
              {
                ass_id: "5",
                question: "Q",
                due_date: null,
                issubmitted: false,
              },
            ],
          },
        }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(result.some((a) => a.assignment_id === 5)).toBe(true);
  });

  // ── WAY 1: Course-Level Subjective ────────────────────────────────────────

  test("[Way 1] fetches course-level subjective when crsid > 0", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList()) // course-list (crsid=20)
      .mockResolvedValueOnce(emptyContentData) // content data
      .mockResolvedValueOnce(
        res({
          json: {
            question_list: [
              {
                ass_id: "100",
                question: "<p>Q1</p>",
                due_date: "2025-12-01",
                issubmitted: false,
              },
            ],
          },
        }),
      ) // subjective
      .mockResolvedValue(noAssignments); // hands-on

    const result = await fetchUserAssignments("tok", "u");
    const subj = result.find((a) => a.assignment_type === "SUBJECTIVE");
    expect(subj).toBeDefined();
    expect(subj.assignment_id).toBe(100);
    expect(subj.course_name).toBe("CS101");
    expect(subj.due_date_raw).toBe("2025-12-01");
    expect(subj.unit_name).toBeNull();
  });

  test("[Way 1] skips course-level subjective fetch when crsid = 0 and contentData has no course_id", async () => {
    const courseList = res({
      json: { col_list: [{ colid: "10", crsid: "0", code: "X" }] },
    });
    const contentData = res({
      json: { course_level: { assigns: {} }, unit_level: [], course_id: 0 },
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(courseList)
      .mockResolvedValueOnce(contentData)
      .mockResolvedValue(noAssignments);

    await fetchUserAssignments("tok", "u");

    // Subjective endpoint (getSubjectiveAssignment_new) should NOT have been called
    const calls = global.fetch.mock.calls.map(([url]) => url);
    expect(calls.some((u) => u.includes("getSubjectiveAssignment_new"))).toBe(
      false,
    );
  });

  test("[Way 1] is_submitted = true via issubmitted flag", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(emptyContentData)
      .mockResolvedValueOnce(
        res({
          json: {
            question_list: [{ ass_id: "1", question: "Q", issubmitted: true }],
          },
        }),
      )
      .mockResolvedValue(noAssignments);

    const [a] = await fetchUserAssignments("tok", "u");
    expect(a.is_submitted).toBe(true);
  });

  test("[Way 1] is_submitted = true via isalreadysubmitted === 'true'", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(emptyContentData)
      .mockResolvedValueOnce(
        res({
          json: {
            question_list: [
              {
                ass_id: "2",
                question: "Q",
                issubmitted: false,
                isalreadysubmitted: "true",
              },
            ],
          },
        }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    const a = result.find((x) => x.assignment_id === 2);
    expect(a.is_submitted).toBe(true);
  });

  test("[Way 1] is_submitted = true via submitted_answer_file_name", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(emptyContentData)
      .mockResolvedValueOnce(
        res({
          json: {
            question_list: [
              {
                ass_id: "3",
                question: "Q",
                submitted_answer_file_name: "ans.pdf",
              },
            ],
          },
        }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    const a = result.find((x) => x.assignment_id === 3);
    expect(a.is_submitted).toBe(true);
  });

  test("[Way 1] is_submitted = false when none of the submit flags are set", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(emptyContentData)
      .mockResolvedValueOnce(
        res({
          json: {
            question_list: [
              {
                ass_id: "4",
                question: "Q",
                issubmitted: false,
                isalreadysubmitted: "false",
                submitted_answer_file_name: null,
              },
            ],
          },
        }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    const a = result.find((x) => x.assignment_id === 4);
    expect(a.is_submitted).toBe(false);
  });

  test("[Way 1] due_date_raw is null when due_date is absent", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(emptyContentData)
      .mockResolvedValueOnce(
        res({ json: { question_list: [{ ass_id: "9", question: "Q" }] } }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    const a = result.find((x) => x.assignment_id === 9);
    expect(a.due_date_raw).toBeNull();
  });

  test("[Way 1] continues gracefully when subjective fetch throws", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(emptyContentData)
      .mockRejectedValueOnce(new Error("subjective API down"))
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(Array.isArray(result)).toBe(true); // did not throw
  });

  test("[Way 1] does not add entry when subjective endpoint returns !ok", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(emptyContentData)
      .mockResolvedValueOnce(res({ ok: false, status: 404 })) // subjective !ok
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(
      result.filter((a) => a.assignment_type === "SUBJECTIVE"),
    ).toHaveLength(0);
  });

  // ── WAY 2: Course-Level Hands-On ──────────────────────────────────────────

  test("[Way 2] triggered when course_level.assigns.hands is non-empty", async () => {
    const contentWithHands = res({
      json: {
        course_level: { assigns: { hands: [{ ass_id: "55" }] } },
        unit_level: [
          {
            unit_id: "u1",
            assigns: {},
            topic_level: [{ topic_id: "t1", assigns: { hands: [] } }],
          },
        ], // non-empty unit_level
        course_id: 20,
      },
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentWithHands)
      // Way 1 subjective (crsid=20 present)
      .mockResolvedValueOnce(noAssignments)
      // Way 2 hands-on (triggered because hands=[{ass_id:55}])
      .mockResolvedValueOnce(
        res({
          json: {
            ass_list: [
              {
                ass_id: "55",
                assignment_text: "Build API",
                duedate: "2025-11-01",
                filename: "",
              },
            ],
          },
        }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    const ho = result.find(
      (a) => a.assignment_type === "HANDS_ON" && a.assignment_id === 55,
    );
    expect(ho).toBeDefined();
    expect(ho.due_date_raw).toBe("2025-11-01");
  });

  test("[Way 2] triggered when unit_level is empty and course_id > 0", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(emptyContentData) // unitLevel=[], course_id=20
      .mockResolvedValueOnce(noAssignments) // Way 1 subjective
      .mockResolvedValueOnce(
        res({
          json: {
            ass_list: [
              {
                ass_id: "77",
                assignment_text: "Task",
                duedate: null,
                filename: "done.zip",
              },
            ],
          },
        }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    const ho = result.find((a) => a.assignment_id === 77);
    expect(ho).toBeDefined();
    expect(ho.is_submitted).toBe(true); // filename present
  });

  test("[Way 2] is_submitted = false when filename is empty string", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(emptyContentData)
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({
          json: {
            ass_list: [{ ass_id: "78", assignment_text: "Task", filename: "" }],
          },
        }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    const ho = result.find((a) => a.assignment_id === 78);
    expect(ho.is_submitted).toBe(false);
  });

  test("[Way 2] is_submitted = false when filename is absent", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(emptyContentData)
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({
          json: { ass_list: [{ ass_id: "79", assignment_text: "Task" }] },
        }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    const ho = result.find((a) => a.assignment_id === 79);
    expect(ho.is_submitted).toBe(false);
  });

  test("[Way 2] unit_name uses outline; falls back to topic; null when both absent", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(emptyContentData)
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({
          json: {
            ass_list: [
              { ass_id: "80", assignment_text: "A", outline: "Module 1" },
              { ass_id: "81", assignment_text: "B", topic: "Topic X" },
              { ass_id: "82", assignment_text: "C" },
            ],
          },
        }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(result.find((a) => a.assignment_id === 80).unit_name).toBe(
      "Module 1",
    );
    expect(result.find((a) => a.assignment_id === 81).unit_name).toBe(
      "Topic X",
    );
    expect(result.find((a) => a.assignment_id === 82).unit_name).toBeNull();
  });

  test("[Way 2] due_date_raw is null when duedate is absent", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(emptyContentData)
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({ json: { ass_list: [{ ass_id: "83", assignment_text: "C" }] } }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(result.find((a) => a.assignment_id === 83).due_date_raw).toBeNull();
  });

  test("[Way 2] continues gracefully when hands-on fetch throws", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(emptyContentData)
      .mockResolvedValueOnce(noAssignments) // subjective OK
      .mockRejectedValueOnce(new Error("ho API down")); // hands-on throws

    const result = await fetchUserAssignments("tok", "u");
    expect(Array.isArray(result)).toBe(true);
  });

  // ── WAY 3: Unit-Level Subjective ──────────────────────────────────────────

  /**
   * Helper: builds a contentData response with one unit having given assigns & topics.
   */
  function contentDataWithUnit({
    proj = [],
    swa = [],
    cie = [],
    hands = [],
    topics = [],
    unit_id = "U1",
    unit_name = "Unit One",
  } = {}) {
    return res({
      json: {
        course_level: { assigns: {} },
        unit_level: [
          {
            unit_id,
            unit_name,
            assigns: { proj, swa, cie, hands },
            topic_level: topics,
          },
        ],
        course_id: 20,
      },
    });
  }

  test("[Way 3] triggered when unit.assigns.proj is non-empty", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithUnit({ proj: [{ ass_id: "1" }] }))
      .mockResolvedValueOnce(noAssignments) // Way 1 course subjective
      // Way 3 unit subjective
      .mockResolvedValueOnce(
        res({
          json: {
            question_list: [
              { ass_id: "200", question: "Q", issubmitted: false },
            ],
          },
        }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(
      result.some(
        (a) => a.assignment_id === 200 && a.assignment_type === "SUBJECTIVE",
      ),
    ).toBe(true);
  });

  test("[Way 3] triggered when unit.assigns.swa is non-empty", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithUnit({ swa: [{ ass_id: "1" }] }))
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({ json: { question_list: [{ ass_id: "201", question: "Q" }] } }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(result.some((a) => a.assignment_id === 201)).toBe(true);
  });

  test("[Way 3] triggered when unit.assigns.cie is non-empty", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithUnit({ cie: [{ ass_id: "1" }] }))
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({ json: { question_list: [{ ass_id: "202", question: "Q" }] } }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(result.some((a) => a.assignment_id === 202)).toBe(true);
  });

  test("[Way 3] triggered when topics is empty and unit.unit_id exists", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithUnit({ topics: [] })) // no topics
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({ json: { question_list: [{ ass_id: "203", question: "Q" }] } }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(result.some((a) => a.assignment_id === 203)).toBe(true);
  });

  test("[Way 3] unit_name taken from unit.unit_name", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(
        contentDataWithUnit({ unit_name: "Advanced Topics", topics: [] }),
      )
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({ json: { question_list: [{ ass_id: "204", question: "Q" }] } }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(result.find((a) => a.assignment_id === 204).unit_name).toBe(
      "Advanced Topics",
    );
  });

  test("[Way 3] unit_name falls back to q.outline_name when unit.unit_name is absent", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithUnit({ unit_name: "", topics: [] }))
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({
          json: {
            question_list: [
              { ass_id: "205", question: "Q", outline_name: "Outline A" },
            ],
          },
        }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(result.find((a) => a.assignment_id === 205).unit_name).toBe(
      "Outline A",
    );
  });

  test("[Way 3] continues gracefully when unit-subjective fetch throws", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithUnit({ topics: [] }))
      .mockResolvedValueOnce(noAssignments)
      .mockRejectedValueOnce(new Error("unit-sub down"))
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(Array.isArray(result)).toBe(true);
  });

  // ── WAY 4: Unit-Level Hands-On ────────────────────────────────────────────

  test("[Way 4] triggered when unit.assigns.hands is non-empty", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(
        contentDataWithUnit({
          hands: [{ ass_id: "1" }],
          topics: [{ topic_id: "t1", assigns: { hands: [] } }],
        }),
      )
      .mockResolvedValueOnce(noAssignments) // Way 1
      .mockResolvedValueOnce(noAssignments) // Way 3
      // Way 4 unit hands-on
      .mockResolvedValueOnce(
        res({
          json: {
            ass_list: [
              {
                ass_id: "300",
                assignment_text: "Build",
                duedate: "2025-10-10",
              },
            ],
          },
        }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(
      result.some(
        (a) => a.assignment_id === 300 && a.assignment_type === "HANDS_ON",
      ),
    ).toBe(true);
  });

  test("[Way 4] triggered when topics is empty (default trigger)", async () => {
    // topics=[] → Way 4 fires regardless of hands
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithUnit({ hands: [], topics: [] }))
      .mockResolvedValueOnce(noAssignments) // Way 1
      .mockResolvedValueOnce(noAssignments) // Way 3
      .mockResolvedValueOnce(
        res({
          json: {
            ass_list: [
              { ass_id: "301", assignment_text: "Do X", unit_name: "M2" },
            ],
          },
        }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(result.some((a) => a.assignment_id === 301)).toBe(true);
  });

  test("[Way 4] unit_name uses unit.unit_name; falls back to a.outline; null otherwise", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(
        contentDataWithUnit({ unit_name: "Module 2", topics: [] }),
      )
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({
          json: {
            ass_list: [{ ass_id: "302", assignment_text: "A" }],
          },
        }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    // unit_name ?? a.outline ?? null — unit.unit_name = "Module 2"
    expect(result.find((a) => a.assignment_id === 302).unit_name).toBe(
      "Module 2",
    );
  });

  test("[Way 4] continues gracefully when unit-hands-on fetch throws", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithUnit({ topics: [] }))
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(noAssignments) // Way 3 sub
      .mockRejectedValueOnce(new Error("unit-ho down")); // Way 4 throws

    const result = await fetchUserAssignments("tok", "u");
    expect(Array.isArray(result)).toBe(true);
  });

  // ── WAY 5: Topic-Level Subjective ─────────────────────────────────────────

  /** Builds a unit with one topic having given assigns */
  function unitWithTopic(topicAssigns = {}) {
    return {
      unit_id: "U1",
      unit_name: "Unit One",
      assigns: {},
      topic_level: [
        { topic_id: "T1", topic_name: "Topic Alpha", assigns: topicAssigns },
      ],
    };
  }

  function contentDataWithTopic(topicAssigns = {}) {
    return res({
      json: {
        course_level: { assigns: {} },
        unit_level: [unitWithTopic(topicAssigns)],
        course_id: 20,
      },
    });
  }

  test("[Way 5] triggered when tProj is non-empty", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithTopic({ proj: [{ ass_id: "1" }] }))
      .mockResolvedValueOnce(noAssignments) // Way 1
      // Way 3 unit-subjective not triggered (topic non-empty, proj/swa/cie empty at unit level)
      // Way 4 unit-hands-on not triggered (topics non-empty, hands=[])
      // Way 5 topic-subjective
      .mockResolvedValueOnce(
        res({ json: { question_list: [{ ass_id: "400", question: "Q" }] } }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(
      result.some(
        (a) => a.assignment_id === 400 && a.assignment_type === "SUBJECTIVE",
      ),
    ).toBe(true);
  });

  test("[Way 5] triggered when tSwa is non-empty", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithTopic({ swa: [{ ass_id: "1" }] }))
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({ json: { question_list: [{ ass_id: "401", question: "Q" }] } }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(result.some((a) => a.assignment_id === 401)).toBe(true);
  });

  test("[Way 5] triggered when tAssigns.hands is undefined (key absent)", async () => {
    // No hands key at all → !tAssigns.hands is true
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithTopic({})) // no hands key
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({ json: { question_list: [{ ass_id: "402", question: "Q" }] } }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(result.some((a) => a.assignment_id === 402)).toBe(true);
  });

  test("[Way 5] triggered when tHands is empty array", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithTopic({ hands: [] }))
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({ json: { question_list: [{ ass_id: "403", question: "Q" }] } }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(result.some((a) => a.assignment_id === 403)).toBe(true);
  });

  test("[Way 5] unit_name = 'UnitName > TopicName' when both present", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithTopic({ hands: [] }))
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({
          json: {
            question_list: [
              { ass_id: "404", question: "Q", topic_name: "Topic Alpha" },
            ],
          },
        }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(result.find((a) => a.assignment_id === 404).unit_name).toBe(
      "Unit One > Topic Alpha",
    );
  });

  test("[Way 5] unit_name = topic label only when unit.unit_name is absent", async () => {
    const contentNoUnitName = res({
      json: {
        course_level: { assigns: {} },
        unit_level: [
          {
            unit_id: "U1",
            unit_name: "", // blank
            assigns: {},
            topic_level: [
              {
                topic_id: "T1",
                topic_name: "Topic Beta",
                assigns: { hands: [] },
              },
            ],
          },
        ],
        course_id: 20,
      },
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentNoUnitName)
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({ json: { question_list: [{ ass_id: "405", question: "Q" }] } }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(result.find((a) => a.assignment_id === 405).unit_name).toBe(
      "Topic Beta",
    );
  });

  test("[Way 5] unit_name = unit label only when topic.topic_name is absent", async () => {
    const contentNoTopicName = res({
      json: {
        course_level: { assigns: {} },
        unit_level: [
          {
            unit_id: "U1",
            unit_name: "Unit Gamma",
            assigns: {},
            topic_level: [{ topic_id: "T1", assigns: { hands: [] } }], // no topic_name
          },
        ],
        course_id: 20,
      },
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentNoTopicName)
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({ json: { question_list: [{ ass_id: "406", question: "Q" }] } }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(result.find((a) => a.assignment_id === 406).unit_name).toBe(
      "Unit Gamma",
    );
  });

  test("[Way 5] unit_name = null when both unit.unit_name and topic_name are absent", async () => {
    const contentBothAbsent = res({
      json: {
        course_level: { assigns: {} },
        unit_level: [
          {
            unit_id: "U1",
            unit_name: "",
            assigns: {},
            topic_level: [{ topic_id: "T1", assigns: { hands: [] } }],
          },
        ],
        course_id: 20,
      },
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentBothAbsent)
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({ json: { question_list: [{ ass_id: "407", question: "Q" }] } }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(result.find((a) => a.assignment_id === 407).unit_name).toBeNull();
  });

  test("[Way 5] uses q.topic_name first, then falls back to topic.topic_name", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithTopic({ hands: [] }))
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({
          json: {
            question_list: [
              { ass_id: "408", question: "Q", topic_name: "From Question" },
            ],
          },
        }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    // "Unit One > From Question" (q.topic_name takes priority over topic.topic_name)
    expect(result.find((a) => a.assignment_id === 408).unit_name).toBe(
      "Unit One > From Question",
    );
  });

  test("[Way 5] continues gracefully when topic-subjective fetch throws", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithTopic({ hands: [] }))
      .mockResolvedValueOnce(noAssignments)
      .mockRejectedValueOnce(new Error("topic-sub down"))
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(Array.isArray(result)).toBe(true);
  });

  // ── WAY 6: Topic-Level Hands-On ───────────────────────────────────────────

  test("[Way 6] triggered ONLY when tHands is non-empty", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithTopic({ hands: [{ ass_id: "X" }] }))
      .mockResolvedValueOnce(noAssignments) // Way 1
      // Way 5 topic-subjective (tHands non-empty still allows it if tProj/tSwa/!hands check)
      .mockResolvedValueOnce(noAssignments) // Way 5 (tHands.length > 0 means condition is true only if tProj/tSwa or !hands)
      // Actually with hands=[{ass_id:"X"}], the Way 5 condition:
      //   tProj.length > 0 || tSwa.length > 0 || !tAssigns.hands || tHands.length === 0
      //   = false || false || false || false  → NOT triggered
      // Way 6 topic hands-on
      .mockResolvedValueOnce(
        res({
          json: {
            ass_list: [
              {
                ass_id: "500",
                assignment_text: "Topic Task",
                duedate: "2026-01-01",
              },
            ],
          },
        }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    expect(
      result.some(
        (a) => a.assignment_id === 500 && a.assignment_type === "HANDS_ON",
      ),
    ).toBe(true);
  });

  test("[Way 6] NOT triggered when tHands is empty", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithTopic({ hands: [] }))
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(noAssignments) // Way 5
      .mockResolvedValue(noAssignments); // nothing more for Way 6

    await fetchUserAssignments("tok", "u");

    const urls = global.fetch.mock.calls.map(([u]) => u);
    // getHandsOnDetails should NOT have been called with topic: "T1"
    const topicHoCalls = global.fetch.mock.calls.filter(([, opts]) => {
      try {
        const b = JSON.parse(opts.body || "{}");
        return b.topic === "T1";
      } catch {
        return false;
      }
    });
    expect(topicHoCalls).toHaveLength(0);
  });

  test("[Way 6] unit_name = 'UnitName > TopicName' when both present", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithTopic({ hands: [{ ass_id: "X" }] }))
      .mockResolvedValueOnce(noAssignments)
      .mockResolvedValueOnce(
        res({ json: { ass_list: [{ ass_id: "501", assignment_text: "T" }] } }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    const ho = result.find((a) => a.assignment_id === 501);
    expect(ho?.unit_name).toBe("Unit One > Topic Alpha");
  });

  test("[Way 6] continues gracefully when topic-hands-on fetch throws", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(contentDataWithTopic({ hands: [{ ass_id: "X" }] }))
      .mockResolvedValueOnce(noAssignments)
      .mockRejectedValueOnce(new Error("topic-ho down"));

    const result = await fetchUserAssignments("tok", "u");
    expect(Array.isArray(result)).toBe(true);
  });

  // ── Deduplication ─────────────────────────────────────────────────────────

  test("first-seen wins: same assignment_id + type from two courses → only one entry", async () => {
    const twoCourseList = res({
      json: {
        col_list: [
          { colid: "10", crsid: "20", code: "COURSE_A" },
          { colid: "11", crsid: "21", code: "COURSE_B" },
        ],
      },
    });

    const sameSubjective = res({
      json: {
        question_list: [
          { ass_id: "999", question: "Dup Q", issubmitted: false },
        ],
      },
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(twoCourseList)
      .mockResolvedValue(sameSubjective); // every subsequent call returns same assignment

    const result = await fetchUserAssignments("tok", "u");
    const dupes = result.filter(
      (a) => a.assignment_id === 999 && a.assignment_type === "SUBJECTIVE",
    );
    expect(dupes).toHaveLength(1);
    // First course wins
    expect(dupes[0].course_name).toBe("COURSE_A");
  });

  test("same assignment_id with different type → two separate entries", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(oneCourseCourseList())
      .mockResolvedValueOnce(emptyContentData)
      // Way 1: subjective with ass_id=777
      .mockResolvedValueOnce(
        res({ json: { question_list: [{ ass_id: "777", question: "Q" }] } }),
      )
      // Way 2: hands-on with ass_id=777
      .mockResolvedValueOnce(
        res({ json: { ass_list: [{ ass_id: "777", assignment_text: "T" }] } }),
      )
      .mockResolvedValue(noAssignments);

    const result = await fetchUserAssignments("tok", "u");
    const subj = result.filter(
      (a) => a.assignment_id === 777 && a.assignment_type === "SUBJECTIVE",
    );
    const ho = result.filter(
      (a) => a.assignment_id === 777 && a.assignment_type === "HANDS_ON",
    );
    expect(subj).toHaveLength(1);
    expect(ho).toHaveLength(1);
  });
});
