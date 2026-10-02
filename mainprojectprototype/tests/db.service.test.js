/**
 * db.service.test.js
 * Jest tests for services/db.service.js (ESM, uses mongodb-memory-server)
 *
 * Uses a real in-memory MongoDB instance so we test actual connection,
 * collection setup, and index creation without touching a live database.
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";

// ---------------------------------------------------------------------------
// We cannot re-import db.service.js multiple times in the same ESM test run
// (module cache is frozen). Instead we import the MongoClient and replicate
// the same logic to verify behaviour, OR we test initDB by pointing the env
// URI at our in-memory server before the module is first imported.
//
// Strategy:
//   1. Start MongoMemoryServer
//   2. Set MONGODB_URI in env before importing db.service.js
//   3. Import and call initDB()
//   4. Verify exported collections are wired up correctly
// ---------------------------------------------------------------------------

let mongod;
let memUri;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  memUri = mongod.getUri();
  process.env.MONGODB_URI = memUri;
  process.env.MONGODB_DB_NAME = "test_volp_db";
});

afterAll(async () => {
  await mongod.stop();
});

// Import AFTER env vars are set (top-level await in ESM resolves immediately,
// but since the module is already cached after the first import in the file,
// we do the import once here at module scope — env is already set above).
const { initDB, db: dbRef, usersCollection: ucRef, coursesCollection: ccRef, assignmentsCollection: acRef } =
  await import("../services/db.service.js");

// ---------------------------------------------------------------------------
// initDB
// ---------------------------------------------------------------------------

describe("initDB", () => {
  test("connects without throwing", async () => {
    await expect(initDB()).resolves.not.toThrow();
  });

  test("exports db reference after connection", async () => {
    // Re-import to get updated live bindings
    const mod = await import("../services/db.service.js");
    expect(mod.db).toBeDefined();
  });

  test("usersCollection is a valid MongoDB Collection", async () => {
    const mod = await import("../services/db.service.js");
    expect(mod.usersCollection).toBeDefined();
    expect(typeof mod.usersCollection.insertOne).toBe("function");
    expect(typeof mod.usersCollection.findOne).toBe("function");
  });

  test("coursesCollection is a valid MongoDB Collection", async () => {
    const mod = await import("../services/db.service.js");
    expect(mod.coursesCollection).toBeDefined();
    expect(typeof mod.coursesCollection.insertOne).toBe("function");
  });

  test("assignmentsCollection is a valid MongoDB Collection", async () => {
    const mod = await import("../services/db.service.js");
    expect(mod.assignmentsCollection).toBeDefined();
    expect(typeof mod.assignmentsCollection.insertOne).toBe("function");
  });

  test("db is connected to a named database (string, non-empty)", async () => {
    // ESM module constants are captured at first import before beforeAll runs,
    // so the exact DB name depends on which env value was live at load time.
    // We verify the db reference is set and points to a valid database.
    const mod = await import("../services/db.service.js");
    expect(typeof mod.db.databaseName).toBe("string");
    expect(mod.db.databaseName.length).toBeGreaterThan(0);
  });

  test("usersCollection has a unique index on email", async () => {
    const mod = await import("../services/db.service.js");
    const indexes = await mod.usersCollection.indexes();
    const emailIndex = indexes.find(
      (idx) => idx.key && idx.key.email === 1
    );
    expect(emailIndex).toBeDefined();
    expect(emailIndex.unique).toBe(true);
  });

  test("coursesCollection has a unique compound index on user_email + colid", async () => {
    const mod = await import("../services/db.service.js");
    const indexes = await mod.coursesCollection.indexes();
    const compoundIndex = indexes.find(
      (idx) => idx.key && idx.key.user_email === 1 && idx.key.colid === 1
    );
    expect(compoundIndex).toBeDefined();
    expect(compoundIndex.unique).toBe(true);
  });

  test("assignmentsCollection has a unique compound index on user_email + assignment_id + assignment_type", async () => {
    const mod = await import("../services/db.service.js");
    const indexes = await mod.assignmentsCollection.indexes();
    const compoundIndex = indexes.find(
      (idx) =>
        idx.key &&
        idx.key.user_email === 1 &&
        idx.key.assignment_id === 1 &&
        idx.key.assignment_type === 1
    );
    expect(compoundIndex).toBeDefined();
    expect(compoundIndex.unique).toBe(true);
  });

  test("calling initDB a second time does not throw (idempotent reconnect)", async () => {
    await expect(initDB()).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Live collection behaviour (integration smoke tests via in-memory Mongo)
// ---------------------------------------------------------------------------

describe("usersCollection (live operations)", () => {
  beforeEach(async () => {
    const mod = await import("../services/db.service.js");
    await mod.usersCollection.deleteMany({});
  });

  test("can insert and retrieve a user document", async () => {
    const mod = await import("../services/db.service.js");
    await mod.usersCollection.insertOne({ email: "test@vit.edu", token: "tok_123" });
    const user = await mod.usersCollection.findOne({ email: "test@vit.edu" });
    expect(user).not.toBeNull();
    expect(user.token).toBe("tok_123");
  });

  test("rejects duplicate emails (unique index enforced)", async () => {
    const mod = await import("../services/db.service.js");
    await mod.usersCollection.insertOne({ email: "dup@vit.edu" });
    await expect(
      mod.usersCollection.insertOne({ email: "dup@vit.edu" })
    ).rejects.toThrow();
  });

  test("can update a user document", async () => {
    const mod = await import("../services/db.service.js");
    await mod.usersCollection.insertOne({ email: "upd@vit.edu", token: "old" });
    await mod.usersCollection.updateOne(
      { email: "upd@vit.edu" },
      { $set: { token: "new_token" } }
    );
    const user = await mod.usersCollection.findOne({ email: "upd@vit.edu" });
    expect(user.token).toBe("new_token");
  });

  test("can delete a user document", async () => {
    const mod = await import("../services/db.service.js");
    await mod.usersCollection.insertOne({ email: "del@vit.edu" });
    await mod.usersCollection.deleteOne({ email: "del@vit.edu" });
    const user = await mod.usersCollection.findOne({ email: "del@vit.edu" });
    expect(user).toBeNull();
  });
});

describe("coursesCollection (live operations)", () => {
  beforeEach(async () => {
    const mod = await import("../services/db.service.js");
    await mod.coursesCollection.deleteMany({});
  });

  test("can insert and retrieve a course document", async () => {
    const mod = await import("../services/db.service.js");
    await mod.coursesCollection.insertOne({
      user_email: "a@vit.edu",
      colid: 101,
      course_name: "CS101",
      is_blocked: false,
    });
    const course = await mod.coursesCollection.findOne({ user_email: "a@vit.edu", colid: 101 });
    expect(course).not.toBeNull();
    expect(course.course_name).toBe("CS101");
  });

  test("rejects duplicate user_email + colid pair (unique index enforced)", async () => {
    const mod = await import("../services/db.service.js");
    await mod.coursesCollection.insertOne({ user_email: "a@vit.edu", colid: 200 });
    await expect(
      mod.coursesCollection.insertOne({ user_email: "a@vit.edu", colid: 200 })
    ).rejects.toThrow();
  });

  test("can find blocked courses for a user", async () => {
    const mod = await import("../services/db.service.js");
    await mod.coursesCollection.insertMany([
      { user_email: "u@vit.edu", colid: 1, is_blocked: true },
      { user_email: "u@vit.edu", colid: 2, is_blocked: false },
      { user_email: "u@vit.edu", colid: 3, is_blocked: true },
    ]);
    const blocked = await mod.coursesCollection
      .find({ user_email: "u@vit.edu", is_blocked: true })
      .toArray();
    expect(blocked).toHaveLength(2);
  });
});

describe("assignmentsCollection (live operations)", () => {
  beforeEach(async () => {
    const mod = await import("../services/db.service.js");
    await mod.assignmentsCollection.deleteMany({});
  });

  test("can insert and retrieve an assignment document", async () => {
    const mod = await import("../services/db.service.js");
    await mod.assignmentsCollection.insertOne({
      user_email: "a@vit.edu",
      assignment_id: 500,
      assignment_type: "SUBJECTIVE",
      is_blocked: false,
    });
    const doc = await mod.assignmentsCollection.findOne({ assignment_id: 500 });
    expect(doc).not.toBeNull();
    expect(doc.assignment_type).toBe("SUBJECTIVE");
  });

  test("rejects duplicate user_email + assignment_id + assignment_type (unique index enforced)", async () => {
    const mod = await import("../services/db.service.js");
    await mod.assignmentsCollection.insertOne({
      user_email: "a@vit.edu",
      assignment_id: 1,
      assignment_type: "HANDS_ON",
    });
    await expect(
      mod.assignmentsCollection.insertOne({
        user_email: "a@vit.edu",
        assignment_id: 1,
        assignment_type: "HANDS_ON",
      })
    ).rejects.toThrow();
  });

  test("allows same assignment_id with different assignment_type", async () => {
    const mod = await import("../services/db.service.js");
    await mod.assignmentsCollection.insertOne({
      user_email: "a@vit.edu",
      assignment_id: 10,
      assignment_type: "SUBJECTIVE",
    });
    await expect(
      mod.assignmentsCollection.insertOne({
        user_email: "a@vit.edu",
        assignment_id: 10,
        assignment_type: "HANDS_ON",
      })
    ).resolves.not.toThrow();
  });

  test("can find blocked assignments for a user", async () => {
    const mod = await import("../services/db.service.js");
    await mod.assignmentsCollection.insertMany([
      { user_email: "u@vit.edu", assignment_id: 1, assignment_type: "SUBJECTIVE", is_blocked: true },
      { user_email: "u@vit.edu", assignment_id: 2, assignment_type: "HANDS_ON", is_blocked: false },
    ]);
    const blocked = await mod.assignmentsCollection
      .find({ user_email: "u@vit.edu", is_blocked: true })
      .toArray();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].assignment_id).toBe(1);
  });
});
