/**
 * cron.service.test.js
 * Jest tests for services/cron.service.js (ESM, all external deps mocked)
 */
import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mock all heavy dependencies before importing the module under test
// ---------------------------------------------------------------------------

// Mock node-cron
const mockCronSchedule = jest.fn();
await jest.unstable_mockModule("node-cron", () => ({
  default: { schedule: mockCronSchedule },
}));

// Mock volp.service.js
const mockFetchUserAssignments = jest.fn();
await jest.unstable_mockModule("../services/volp.service.js", () => ({
  fetchUserAssignments: mockFetchUserAssignments,
}));

// Mock mail.service.js
const mockSendAssignmentReminderEmail = jest.fn();
await jest.unstable_mockModule("../services/mail.service.js", () => ({
  sendAssignmentReminderEmail: mockSendAssignmentReminderEmail,
}));

// Mock db.service.js — provide collection objects with jest-mocked methods
const makeCollection = () => ({
  find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
});

const mockUsersCollection = makeCollection();
const mockCoursesCollection = makeCollection();
const mockAssignmentsCollection = makeCollection();

await jest.unstable_mockModule("../services/db.service.js", () => ({
  usersCollection: mockUsersCollection,
  coursesCollection: mockCoursesCollection,
  assignmentsCollection: mockAssignmentsCollection,
}));

// Import module under test AFTER all mocks are registered
const { startCronJob, triggerCronNow } = await import("../services/cron.service.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resets every mock and restores default collection behaviour (empty arrays) */
function resetAll() {
  jest.clearAllMocks();

  mockUsersCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) });
  mockCoursesCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) });
  mockAssignmentsCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) });

  mockFetchUserAssignments.mockResolvedValue([]);
  mockSendAssignmentReminderEmail.mockResolvedValue(undefined);
}

// ---------------------------------------------------------------------------
// startCronJob
// ---------------------------------------------------------------------------

describe("startCronJob", () => {
  beforeEach(() => {
    resetAll();
    process.env.CRON_SCHEDULE = "0 20 * * *";
    process.env.CRON_TIMEZONE = "Asia/Kolkata";
  });

  afterEach(() => {
    delete process.env.CRON_SCHEDULE;
  });

  test("does not call cron.schedule when CRON_SCHEDULE is missing", () => {
    delete process.env.CRON_SCHEDULE;
    startCronJob();
    expect(mockCronSchedule).not.toHaveBeenCalled();
  });

  test("calls cron.schedule with the env schedule and timezone", () => {
    startCronJob();
    expect(mockCronSchedule).toHaveBeenCalledTimes(1);
    expect(mockCronSchedule).toHaveBeenCalledWith(
      "0 20 * * *",
      expect.any(Function),
      { timezone: "Asia/Kolkata" }
    );
  });

  test("defaults timezone to Asia/Kolkata when CRON_TIMEZONE is not set", () => {
    delete process.env.CRON_TIMEZONE;
    startCronJob();
    const [, , opts] = mockCronSchedule.mock.calls[0];
    expect(opts.timezone).toBe("Asia/Kolkata");
  });

  test("uses CRON_TIMEZONE env value when set", () => {
    process.env.CRON_TIMEZONE = "UTC";
    startCronJob();
    const [, , opts] = mockCronSchedule.mock.calls[0];
    expect(opts.timezone).toBe("UTC");
    delete process.env.CRON_TIMEZONE;
  });

  // ---- Tests that invoke the scheduled callback directly ----

  test("skips execution when no users are in DB", async () => {
    mockUsersCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) });

    startCronJob();
    const callback = mockCronSchedule.mock.calls[0][1];
    await callback();

    expect(mockFetchUserAssignments).not.toHaveBeenCalled();
    expect(mockSendAssignmentReminderEmail).not.toHaveBeenCalled();
  });

  test("fetches assignments and sends email for each user", async () => {
    const fakeUsers = [
      { email: "a@vit.edu", token: "tok_a" },
      { email: "b@vit.edu", token: "tok_b" },
    ];
    mockUsersCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue(fakeUsers) });

    const fakeAssignments = [
      { assignment_id: 1, assignment_type: "SUBJECTIVE", course_name: "CS101" },
    ];
    mockFetchUserAssignments.mockResolvedValue(fakeAssignments);

    startCronJob();
    const callback = mockCronSchedule.mock.calls[0][1];
    await callback();

    expect(mockFetchUserAssignments).toHaveBeenCalledTimes(2);
    expect(mockSendAssignmentReminderEmail).toHaveBeenCalledTimes(2);
  });

  test("filters out blocked course colids before fetching assignments", async () => {
    const fakeUsers = [{ email: "a@vit.edu", token: "tok_a" }];
    mockUsersCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue(fakeUsers) });

    const blockedCourses = [{ colid: 42 }, { colid: 99 }];
    mockCoursesCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue(blockedCourses) });

    mockFetchUserAssignments.mockResolvedValue([]);

    startCronJob();
    const callback = mockCronSchedule.mock.calls[0][1];
    await callback();

    const [, , blockedColids] = mockFetchUserAssignments.mock.calls[0];
    expect(blockedColids).toBeInstanceOf(Set);
    expect(blockedColids.has(42)).toBe(true);
    expect(blockedColids.has(99)).toBe(true);
  });

  test("filters out blocked assignments before sending email", async () => {
    const fakeUsers = [{ email: "a@vit.edu", token: "tok_a" }];
    mockUsersCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue(fakeUsers) });

    const blockedAssRows = [{ assignment_id: 7, assignment_type: "HANDS_ON" }];
    mockAssignmentsCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue(blockedAssRows) });

    const allAssignments = [
      { assignment_id: 7, assignment_type: "HANDS_ON" },
      { assignment_id: 8, assignment_type: "SUBJECTIVE" },
    ];
    mockFetchUserAssignments.mockResolvedValue(allAssignments);

    startCronJob();
    const callback = mockCronSchedule.mock.calls[0][1];
    await callback();

    const sentAssignments = mockSendAssignmentReminderEmail.mock.calls[0][1];
    expect(sentAssignments).toHaveLength(1);
    expect(sentAssignments[0].assignment_id).toBe(8);
  });

  test("continues to next user even if one user's processing throws", async () => {
    const fakeUsers = [
      { email: "fail@vit.edu", token: "tok_fail" },
      { email: "ok@vit.edu", token: "tok_ok" },
    ];
    mockUsersCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue(fakeUsers) });

    mockFetchUserAssignments
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce([]);

    startCronJob();
    const callback = mockCronSchedule.mock.calls[0][1];
    await callback(); // should not throw

    // Second user should still be processed
    expect(mockFetchUserAssignments).toHaveBeenCalledTimes(2);
  });

  test("does not run overlapping cron executions", async () => {
    const fakeUsers = [{ email: "a@vit.edu", token: "tok_a" }];
    mockUsersCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue(fakeUsers) });

    // Make first call hang so isCronRunning stays true
    let resolveFirst;
    mockFetchUserAssignments.mockReturnValueOnce(
      new Promise((res) => { resolveFirst = res; })
    );

    startCronJob();
    const callback = mockCronSchedule.mock.calls[0][1];

    const first = callback(); // starts, hangs
    const second = callback(); // should exit early (overlap guard)

    resolveFirst([]); // unblock first
    await Promise.all([first, second]);

    // fetchUserAssignments called only once — second callback skipped
    expect(mockFetchUserAssignments).toHaveBeenCalledTimes(1);
  });

  test("resets isCronRunning to false after run completes", async () => {
    const fakeUsers = [{ email: "a@vit.edu", token: "tok_a" }];
    mockUsersCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue(fakeUsers) });
    mockFetchUserAssignments.mockResolvedValue([]);

    startCronJob();
    const callback = mockCronSchedule.mock.calls[0][1];

    await callback();
    await callback(); // should run again (flag was reset)

    expect(mockFetchUserAssignments).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// triggerCronNow
// ---------------------------------------------------------------------------

describe("triggerCronNow", () => {
  beforeEach(() => {
    resetAll();
  });

  test("fetches blocked courses from DB for the given user", async () => {
    const blockedCourses = [{ colid: 5 }];
    mockCoursesCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue(blockedCourses) });

    await triggerCronNow("user@vit.edu", "tok_123");

    expect(mockCoursesCollection.find).toHaveBeenCalledWith(
      { user_email: "user@vit.edu", is_blocked: true },
      expect.anything()
    );

    const [, , blockedColids] = mockFetchUserAssignments.mock.calls[0];
    expect(blockedColids.has(5)).toBe(true);
  });

  test("fetches blocked assignments from DB for the given user", async () => {
    const blockedAss = [{ assignment_id: 10, assignment_type: "SUBJECTIVE" }];
    mockAssignmentsCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue(blockedAss) });

    const all = [
      { assignment_id: 10, assignment_type: "SUBJECTIVE" },
      { assignment_id: 11, assignment_type: "HANDS_ON" },
    ];
    mockFetchUserAssignments.mockResolvedValue(all);

    await triggerCronNow("user@vit.edu", "tok_123");

    const sentAssignments = mockSendAssignmentReminderEmail.mock.calls[0][1];
    expect(sentAssignments).toHaveLength(1);
    expect(sentAssignments[0].assignment_id).toBe(11);
  });

  test("calls fetchUserAssignments with correct token and email", async () => {
    await triggerCronNow("ashik@vit.edu", "my_token");

    expect(mockFetchUserAssignments).toHaveBeenCalledWith(
      "my_token",
      "ashik@vit.edu",
      expect.any(Set)
    );
  });

  test("calls sendAssignmentReminderEmail with user email and filtered assignments", async () => {
    const assignments = [
      { assignment_id: 1, assignment_type: "SUBJECTIVE" },
      { assignment_id: 2, assignment_type: "HANDS_ON" },
    ];
    mockFetchUserAssignments.mockResolvedValue(assignments);

    await triggerCronNow("user@vit.edu", "tok");

    expect(mockSendAssignmentReminderEmail).toHaveBeenCalledWith(
      "user@vit.edu",
      assignments
    );
  });

  test("returns the result of sendAssignmentReminderEmail", async () => {
    mockSendAssignmentReminderEmail.mockResolvedValue({ sent: true });
    const result = await triggerCronNow("user@vit.edu", "tok");
    expect(result).toEqual({ sent: true });
  });

  test("sends empty array when all assignments are blocked", async () => {
    const blockedAss = [{ assignment_id: 99, assignment_type: "SUBJECTIVE" }];
    mockAssignmentsCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue(blockedAss) });

    mockFetchUserAssignments.mockResolvedValue([
      { assignment_id: 99, assignment_type: "SUBJECTIVE" },
    ]);

    await triggerCronNow("user@vit.edu", "tok");

    const sentAssignments = mockSendAssignmentReminderEmail.mock.calls[0][1];
    expect(sentAssignments).toEqual([]);
  });
});
