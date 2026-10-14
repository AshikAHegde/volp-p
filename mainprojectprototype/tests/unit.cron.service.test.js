/**
 * unit.cron.service.test.js
 *
 * Pure unit tests for services/cron.service.js.
 * ALL dependencies are mocked via jest.unstable_mockModule before import.
 *
 * Coverage map:
 *   startCronJob
 *     ✓ does nothing when CRON_SCHEDULE env is missing
 *     ✓ calls cron.schedule with the env expression
 *     ✓ passes timezone from CRON_TIMEZONE env
 *     ✓ defaults timezone to Asia/Kolkata when CRON_TIMEZONE is unset
 *     ✓ does not call cron.schedule more than once per call
 *     ─── Scheduled callback ───────────────────────────────────────────────────
 *     ✓ does nothing when usersCollection.find throws
 *     ✓ does nothing when no users in DB
 *     ✓ fetches assignments for every registered user
 *     ✓ sends a reminder email for every user
 *     ✓ reads blocked course colids from DB and passes them as Set to fetchUserAssignments
 *     ✓ reads blocked assignment rows from DB and filters them before calling sendEmail
 *     ✓ continues to next user even when one user's fetch throws
 *     ✓ continues to next user even when one user's email send throws
 *     ✓ overlap guard: second concurrent callback exits without processing
 *     ✓ resets isCronRunning flag after a normal run
 *     ✓ resets isCronRunning flag even when processing throws
 *     ✓ passes the correct token and email to fetchUserAssignments
 *     ✓ does not send email when all assignments are blocked for a user
 *     ✓ sends email with only unblocked assignments
 *
 *   triggerCronNow
 *     ✓ queries blocked courses for the given email
 *     ✓ queries blocked assignments for the given email
 *     ✓ passes blockedColids Set to fetchUserAssignments
 *     ✓ passes correct token and email to fetchUserAssignments
 *     ✓ filters out blocked assignments before calling sendEmail
 *     ✓ sends email with correct email and filtered assignments
 *     ✓ returns the result of sendAssignmentReminderEmail
 *     ✓ sends empty array when all assignments are individually blocked
 *     ✓ throws (does not swallow) errors from fetchUserAssignments
 */

import { jest } from "@jest/globals";

// ─────────────────────────────────────────────────────────────────────────────
// Mock all dependencies BEFORE importing the module under test
// ─────────────────────────────────────────────────────────────────────────────

// node-cron
const mockCronSchedule = jest.fn();
await jest.unstable_mockModule("node-cron", () => ({
  default: { schedule: mockCronSchedule },
}));

// volp.service.js
const mockFetchUserAssignments = jest.fn();
const mockLoginVOLP = jest.fn();
await jest.unstable_mockModule("../services/volp.service.js", () => ({
  fetchUserAssignments: mockFetchUserAssignments,
  loginVOLP: mockLoginVOLP,
}));

// encryption.service.js
const mockDecrypt = jest.fn((str) => `decrypted_${str}`);
const mockEncrypt = jest.fn((str) => `encrypted_${str}`);
await jest.unstable_mockModule("../services/encryption.service.js", () => ({
  decrypt: mockDecrypt,
  encrypt: mockEncrypt,
}));

// mail.service.js
const mockSendEmail = jest.fn();
await jest.unstable_mockModule("../services/mail.service.js", () => ({
  sendAssignmentReminderEmail: mockSendEmail,
}));

// db.service.js — provide collection stubs with jest-mocked methods
const makeCol = () => ({
  find: jest.fn().mockReturnValue({
    toArray: jest.fn().mockResolvedValue([]),
  }),
  findOne: jest.fn().mockResolvedValue(null),
  updateOne: jest.fn().mockResolvedValue({}),
});

const mockUsersCol = makeCol();
const mockCoursesCol = makeCol();
const mockAssignmentsCol = makeCol();

await jest.unstable_mockModule("../services/db.service.js", () => ({
  usersCollection: mockUsersCol,
  coursesCollection: mockCoursesCol,
  assignmentsCollection: mockAssignmentsCol,
}));


// ─────────────────────────────────────────────────────────────────────────────
// Import after mocks are registered
// ─────────────────────────────────────────────────────────────────────────────
const { startCronJob, triggerCronNow } = await import(
  "../services/cron.service.js"
);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Resets every mock and restores default empty-array collection behaviour. */
function reset() {
  jest.clearAllMocks();

  for (const col of [mockUsersCol, mockCoursesCol, mockAssignmentsCol]) {
    col.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) });
    if (col.findOne) col.findOne.mockResolvedValue(null);
    if (col.updateOne) col.updateOne.mockResolvedValue({});
  }

  mockFetchUserAssignments.mockResolvedValue([]);
  mockLoginVOLP.mockResolvedValue("new_fresh_token");
  mockDecrypt.mockImplementation((str) => `decrypted_${str}`);
  mockSendEmail.mockResolvedValue(true);
}


/** Convenience: makes a user object. */
const mkUser = (email = "a@vit.ac.in", token = "tok_a") => ({ email, token });

/** Convenience: makes a blocked-course row. */
const mkBlockedCourse = (colid) => ({ colid });

/** Convenience: makes a blocked-assignment row. */
const mkBlockedAss = (id, type) => ({ assignment_id: id, assignment_type: type });

/** Convenience: makes an assignment returned by the API. */
const mkAss = (id, type = "SUBJECTIVE") => ({
  assignment_id: id,
  assignment_type: type,
  course_name: "CS101",
});

/** Runs startCronJob and returns the scheduled callback function. */
function scheduleAndGetCallback(schedule = "0 20 * * *") {
  process.env.CRON_SCHEDULE = schedule;
  startCronJob();
  return mockCronSchedule.mock.calls[0][1];
}

// ─────────────────────────────────────────────────────────────────────────────
// startCronJob
// ─────────────────────────────────────────────────────────────────────────────
describe("startCronJob", () => {
  beforeEach(() => {
    reset();
    process.env.CRON_SCHEDULE = "0 20 * * *";
    process.env.CRON_TIMEZONE = "Asia/Kolkata";
  });

  afterEach(() => {
    delete process.env.CRON_SCHEDULE;
    delete process.env.CRON_TIMEZONE;
  });

  // ── Scheduling ─────────────────────────────────────────────────────────────

  test("does nothing when CRON_SCHEDULE is not set", () => {
    delete process.env.CRON_SCHEDULE;
    startCronJob();
    expect(mockCronSchedule).not.toHaveBeenCalled();
  });

  test("calls cron.schedule exactly once", () => {
    startCronJob();
    expect(mockCronSchedule).toHaveBeenCalledTimes(1);
  });

  test("passes the CRON_SCHEDULE expression to cron.schedule", () => {
    process.env.CRON_SCHEDULE = "30 8 * * 1";
    startCronJob();
    const [expr] = mockCronSchedule.mock.calls[0];
    expect(expr).toBe("30 8 * * 1");
  });

  test("passes CRON_TIMEZONE in the options object", () => {
    process.env.CRON_TIMEZONE = "UTC";
    startCronJob();
    const [, , opts] = mockCronSchedule.mock.calls[0];
    expect(opts.timezone).toBe("UTC");
  });

  test("defaults timezone to Asia/Kolkata when CRON_TIMEZONE is unset", () => {
    delete process.env.CRON_TIMEZONE;
    startCronJob();
    const [, , opts] = mockCronSchedule.mock.calls[0];
    expect(opts.timezone).toBe("Asia/Kolkata");
  });

  test("second argument to cron.schedule is a function (the callback)", () => {
    startCronJob();
    const [, cb] = mockCronSchedule.mock.calls[0];
    expect(typeof cb).toBe("function");
  });

  // ── Callback: no users ─────────────────────────────────────────────────────

  test("callback: does nothing when no users are in DB", async () => {
    mockUsersCol.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) });
    const cb = scheduleAndGetCallback();
    await cb();
    expect(mockFetchUserAssignments).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test("callback: does not throw when usersCollection.find.toArray throws", async () => {
    mockUsersCol.find.mockReturnValue({
      toArray: jest.fn().mockRejectedValue(new Error("DB down")),
    });
    const cb = scheduleAndGetCallback();
    await expect(cb()).resolves.not.toThrow();
  });

  // ── Callback: per-user processing ─────────────────────────────────────────

  test("callback: calls fetchUserAssignments once per user", async () => {
    mockUsersCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkUser("a@vit.ac.in"), mkUser("b@vit.ac.in", "tok_b")]),
    });
    const cb = scheduleAndGetCallback();
    await cb();
    expect(mockFetchUserAssignments).toHaveBeenCalledTimes(2);
  });

  test("callback: passes correct token and email to fetchUserAssignments", async () => {
    mockUsersCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkUser("student@vit.ac.in", "my_token")]),
    });
    const cb = scheduleAndGetCallback();
    await cb();
    expect(mockFetchUserAssignments).toHaveBeenCalledWith(
      "my_token",
      "student@vit.ac.in",
      expect.any(Set)
    );
  });

  test("callback: calls sendEmail once per user", async () => {
    mockUsersCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkUser("a@vit.ac.in"), mkUser("b@vit.ac.in")]),
    });
    const cb = scheduleAndGetCallback();
    await cb();
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  // ── Callback: course blocking ──────────────────────────────────────────────

  test("callback: reads blocked courses and passes their colids as a Set", async () => {
    mockUsersCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkUser()]),
    });
    mockCoursesCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkBlockedCourse(42), mkBlockedCourse(99)]),
    });

    const cb = scheduleAndGetCallback();
    await cb();

    const [, , blockedColids] = mockFetchUserAssignments.mock.calls[0];
    expect(blockedColids).toBeInstanceOf(Set);
    expect(blockedColids.has(42)).toBe(true);
    expect(blockedColids.has(99)).toBe(true);
  });

  test("callback: passes empty Set when no courses are blocked", async () => {
    mockUsersCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkUser()]),
    });
    // coursesCol returns [] by default (reset())

    const cb = scheduleAndGetCallback();
    await cb();

    const [, , blockedColids] = mockFetchUserAssignments.mock.calls[0];
    expect(blockedColids.size).toBe(0);
  });

  test("callback: coursesCollection.find is called with correct filter (is_blocked: true)", async () => {
    mockUsersCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkUser("u@vit.ac.in")]),
    });
    const cb = scheduleAndGetCallback();
    await cb();
    expect(mockCoursesCol.find).toHaveBeenCalledWith(
      { user_email: "u@vit.ac.in", is_blocked: true },
      expect.anything()
    );
  });

  // ── Callback: assignment blocking ──────────────────────────────────────────

  test("callback: filters out blocked assignments before calling sendEmail", async () => {
    mockUsersCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkUser()]),
    });
    mockAssignmentsCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkBlockedAss(7, "HANDS_ON")]),
    });
    mockFetchUserAssignments.mockResolvedValue([
      mkAss(7, "HANDS_ON"),
      mkAss(8, "SUBJECTIVE"),
    ]);

    const cb = scheduleAndGetCallback();
    await cb();

    const [, sentAssignments] = mockSendEmail.mock.calls[0];
    expect(sentAssignments).toHaveLength(1);
    expect(sentAssignments[0].assignment_id).toBe(8);
  });

  test("callback: sends empty array when every assignment is blocked", async () => {
    mockUsersCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkUser()]),
    });
    mockAssignmentsCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkBlockedAss(1, "SUBJECTIVE")]),
    });
    mockFetchUserAssignments.mockResolvedValue([mkAss(1, "SUBJECTIVE")]);

    const cb = scheduleAndGetCallback();
    await cb();

    const [, sentAssignments] = mockSendEmail.mock.calls[0];
    expect(sentAssignments).toEqual([]);
  });

  test("callback: all unblocked assignments are forwarded to sendEmail", async () => {
    mockUsersCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkUser()]),
    });
    mockFetchUserAssignments.mockResolvedValue([mkAss(1), mkAss(2), mkAss(3)]);

    const cb = scheduleAndGetCallback();
    await cb();

    const [, sentAssignments] = mockSendEmail.mock.calls[0];
    expect(sentAssignments).toHaveLength(3);
  });

  test("callback: assignmentsCollection.find is called with correct filter", async () => {
    mockUsersCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkUser("u@vit.ac.in")]),
    });
    const cb = scheduleAndGetCallback();
    await cb();
    expect(mockAssignmentsCol.find).toHaveBeenCalledWith(
      { user_email: "u@vit.ac.in", is_blocked: true },
      expect.anything()
    );
  });

  // ── Callback: error resilience ─────────────────────────────────────────────

  test("callback: continues to next user when fetchUserAssignments throws for one user", async () => {
    mockUsersCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkUser("fail@vit.ac.in"), mkUser("ok@vit.ac.in", "tok_ok")]),
    });
    mockFetchUserAssignments
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce([]);

    const cb = scheduleAndGetCallback();
    await cb(); // must not throw

    expect(mockFetchUserAssignments).toHaveBeenCalledTimes(2);
  });

  test("callback: continues to next user when sendEmail throws for one user", async () => {
    mockUsersCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkUser("fail@vit.ac.in"), mkUser("ok@vit.ac.in")]),
    });
    mockSendEmail
      .mockRejectedValueOnce(new Error("SMTP down"))
      .mockResolvedValueOnce(true);

    const cb = scheduleAndGetCallback();
    await cb();

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  test("callback: re-authenticates via loginVOLP and decrypt when fetch throws for user with encrypted_password", async () => {
    mockUsersCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([
        { email: "user@vit.ac.in", token: "expired_token", encrypted_password: "enc_password_123" }
      ]),
    });
    mockFetchUserAssignments
      .mockRejectedValueOnce(new Error("VOLP session expired"))
      .mockResolvedValueOnce([mkAss(10)]);
    mockLoginVOLP.mockResolvedValueOnce("fresh_new_token");

    const cb = scheduleAndGetCallback();
    await cb();

    expect(mockDecrypt).toHaveBeenCalledWith("enc_password_123");
    expect(mockLoginVOLP).toHaveBeenCalledWith("user@vit.ac.in", "decrypted_enc_password_123");
    expect(mockUsersCol.updateOne).toHaveBeenCalledWith(
      { email: "user@vit.ac.in" },
      { $set: { token: "fresh_new_token", updated_at: expect.any(Date) } }
    );
    expect(mockFetchUserAssignments).toHaveBeenCalledWith("fresh_new_token", "user@vit.ac.in", expect.any(Set));
    expect(mockSendEmail).toHaveBeenCalled();
  });


  // ── Callback: overlap guard ────────────────────────────────────────────────

  test("callback: second concurrent invocation is skipped (overlap guard)", async () => {
    mockUsersCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkUser()]),
    });

    // Make first fetchUserAssignments hang so isCronRunning stays true
    let resolveFirst;
    mockFetchUserAssignments.mockReturnValueOnce(
      new Promise((r) => { resolveFirst = r; })
    );

    const cb = scheduleAndGetCallback();

    const first = cb();   // starts, hangs in fetchUserAssignments
    const second = cb();  // should return early

    resolveFirst([]); // unblock first
    await Promise.all([first, second]);

    // fetchUserAssignments called only once — second callback was a no-op
    expect(mockFetchUserAssignments).toHaveBeenCalledTimes(1);
  });

  test("callback: isCronRunning resets to false after a successful run", async () => {
    mockUsersCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkUser()]),
    });

    const cb = scheduleAndGetCallback();

    await cb();         // first run
    await cb();         // should run again (flag was reset)

    expect(mockFetchUserAssignments).toHaveBeenCalledTimes(2);
  });

  test("callback: isCronRunning resets to false even when processing throws", async () => {
    mockUsersCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkUser()]),
    });
    mockFetchUserAssignments
      .mockRejectedValueOnce(new Error("first run error"))
      .mockResolvedValueOnce([]);

    const cb = scheduleAndGetCallback();

    await cb(); // throws internally but callback itself shouldn't propagate
    await cb(); // second run — flag must have been reset

    expect(mockFetchUserAssignments).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// triggerCronNow
// ─────────────────────────────────────────────────────────────────────────────
describe("triggerCronNow", () => {
  beforeEach(() => reset());

  // ── DB queries ─────────────────────────────────────────────────────────────

  test("queries coursesCollection with correct filter", async () => {
    await triggerCronNow("student@vit.ac.in", "tok_123");
    expect(mockCoursesCol.find).toHaveBeenCalledWith(
      { user_email: "student@vit.ac.in", is_blocked: true },
      expect.anything()
    );
  });

  test("queries assignmentsCollection with correct filter", async () => {
    await triggerCronNow("student@vit.ac.in", "tok_123");
    expect(mockAssignmentsCol.find).toHaveBeenCalledWith(
      { user_email: "student@vit.ac.in", is_blocked: true },
      expect.anything()
    );
  });

  // ── fetchUserAssignments call ──────────────────────────────────────────────

  test("passes correct token and email to fetchUserAssignments", async () => {
    await triggerCronNow("ashik@vit.ac.in", "my_token");
    expect(mockFetchUserAssignments).toHaveBeenCalledWith(
      "my_token",
      "ashik@vit.ac.in",
      expect.any(Set)
    );
  });

  test("passes blockedColids as a Set built from DB rows", async () => {
    mockCoursesCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkBlockedCourse(5), mkBlockedCourse(10)]),
    });

    await triggerCronNow("u@vit.ac.in", "tok");

    const [, , blockedColids] = mockFetchUserAssignments.mock.calls[0];
    expect(blockedColids.has(5)).toBe(true);
    expect(blockedColids.has(10)).toBe(true);
  });

  test("passes empty Set when no courses are blocked", async () => {
    await triggerCronNow("u@vit.ac.in", "tok");
    const [, , blockedColids] = mockFetchUserAssignments.mock.calls[0];
    expect(blockedColids.size).toBe(0);
  });

  // ── Assignment filtering ───────────────────────────────────────────────────

  test("filters out individually blocked assignments before sendEmail", async () => {
    mockAssignmentsCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkBlockedAss(10, "SUBJECTIVE")]),
    });
    mockFetchUserAssignments.mockResolvedValue([
      mkAss(10, "SUBJECTIVE"),
      mkAss(11, "HANDS_ON"),
    ]);

    await triggerCronNow("u@vit.ac.in", "tok");

    const [, sentAssignments] = mockSendEmail.mock.calls[0];
    expect(sentAssignments).toHaveLength(1);
    expect(sentAssignments[0].assignment_id).toBe(11);
  });

  test("sends empty array when all assignments are blocked", async () => {
    mockAssignmentsCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkBlockedAss(99, "SUBJECTIVE")]),
    });
    mockFetchUserAssignments.mockResolvedValue([mkAss(99, "SUBJECTIVE")]);

    await triggerCronNow("u@vit.ac.in", "tok");

    const [, sentAssignments] = mockSendEmail.mock.calls[0];
    expect(sentAssignments).toEqual([]);
  });

  test("does not filter assignments of different type even if id matches", async () => {
    mockAssignmentsCol.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([mkBlockedAss(5, "SUBJECTIVE")]),
    });
    mockFetchUserAssignments.mockResolvedValue([
      mkAss(5, "SUBJECTIVE"),
      mkAss(5, "HANDS_ON"), // same id, different type → NOT blocked
    ]);

    await triggerCronNow("u@vit.ac.in", "tok");

    const [, sentAssignments] = mockSendEmail.mock.calls[0];
    expect(sentAssignments).toHaveLength(1);
    expect(sentAssignments[0].assignment_type).toBe("HANDS_ON");
  });

  // ── sendEmail call ─────────────────────────────────────────────────────────

  test("calls sendEmail with correct email address", async () => {
    await triggerCronNow("exactly@vit.ac.in", "tok");
    expect(mockSendEmail).toHaveBeenCalledWith("exactly@vit.ac.in", expect.any(Array));
  });

  test("calls sendEmail with filtered assignment list", async () => {
    mockFetchUserAssignments.mockResolvedValue([mkAss(1), mkAss(2)]);
    await triggerCronNow("u@vit.ac.in", "tok");
    const [, sentAssignments] = mockSendEmail.mock.calls[0];
    expect(sentAssignments).toHaveLength(2);
  });

  // ── Return value ───────────────────────────────────────────────────────────

  test("returns the result of sendAssignmentReminderEmail", async () => {
    mockSendEmail.mockResolvedValue({ sent: true, messageId: "abc" });
    const result = await triggerCronNow("u@vit.ac.in", "tok");
    expect(result).toEqual({ sent: true, messageId: "abc" });
  });

  test("returns true (default mock) when sendEmail resolves with true", async () => {
    const result = await triggerCronNow("u@vit.ac.in", "tok");
    expect(result).toBe(true);
  });

  test("re-authenticates via decrypt and loginVOLP when initial fetch fails and user has encrypted_password in DB", async () => {
    mockUsersCol.findOne.mockResolvedValueOnce({
      encrypted_password: "enc_password_abc",
    });
    mockFetchUserAssignments
      .mockRejectedValueOnce(new Error("Session expired"))
      .mockResolvedValueOnce([mkAss(5)]);
    mockLoginVOLP.mockResolvedValueOnce("refreshed_trigger_token");

    await triggerCronNow("user@vit.ac.in", "expired_trigger_token");

    expect(mockDecrypt).toHaveBeenCalledWith("enc_password_abc");
    expect(mockLoginVOLP).toHaveBeenCalledWith("user@vit.ac.in", "decrypted_enc_password_abc");
    expect(mockUsersCol.updateOne).toHaveBeenCalledWith(
      { email: "user@vit.ac.in" },
      { $set: { token: "refreshed_trigger_token", updated_at: expect.any(Date) } }
    );
    expect(mockSendEmail).toHaveBeenCalled();
  });

  // ── Error propagation ──────────────────────────────────────────────────────

  test("propagates error thrown by fetchUserAssignments", async () => {
    mockFetchUserAssignments.mockRejectedValue(new Error("VOLP API down"));
    await expect(triggerCronNow("u@vit.ac.in", "tok")).rejects.toThrow("VOLP API down");
  });

  test("propagates error thrown by sendEmail", async () => {
    mockSendEmail.mockRejectedValue(new Error("SMTP failed"));
    await expect(triggerCronNow("u@vit.ac.in", "tok")).rejects.toThrow("SMTP failed");
  });
});


