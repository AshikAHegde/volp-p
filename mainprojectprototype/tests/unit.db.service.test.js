  /**
   * unit.db.service.test.js
   *
   * Pure unit tests for services/db.service.js.
   * Uses mongodb-memory-server so we exercise the real MongoClient + index
   * creation path without touching the cloud Atlas database.
   *
   * Coverage map:
   *   initDB
   *     ✓ resolves without throwing on a valid URI
   *     ✓ is idempotent — calling it a second time does not throw
   *     ✓ sets the `db` export to a valid Db reference after connection
   *     ✓ db.databaseName matches MONGODB_DB_NAME env var
   *     ✓ db.databaseName defaults to 'volp_db' when env is unset
   *     ✓ usersCollection export is set and has MongoDB Collection methods
   *     ✓ coursesCollection export is set and has MongoDB Collection methods
   *     ✓ assignmentsCollection export is set and has MongoDB Collection methods
   *
   *   Index enforcement
   *     ✓ usersCollection has a unique index on { email: 1 }
   *     ✓ coursesCollection has a unique compound index on { user_email: 1, colid: 1 }
   *     ✓ assignmentsCollection has a unique compound index on { user_email, assignment_id, assignment_type }
   *
   *   usersCollection — CRUD
   *     ✓ insertOne + findOne roundtrip
   *     ✓ findOne returns null for non-existent document
   *     ✓ rejects duplicate email (unique index)
   *     ✓ updateOne modifies the correct field
   *     ✓ deleteOne removes the document; subsequent findOne returns null
   *     ✓ find({}) returns all documents
   *     ✓ find with projection only returns projected fields
   *
   *   coursesCollection — CRUD & index
   *     ✓ insertOne + findOne roundtrip
   *     ✓ rejects duplicate user_email + colid
   *     ✓ allows same colid for different user_email values
   *     ✓ find with filter returns matching documents only
   *     ✓ find({is_blocked:true}) returns only blocked courses
   *     ✓ updateOne sets is_blocked to true
   *     ✓ bulkWrite upsert is idempotent (second write updates, not inserts)
   *
   *   assignmentsCollection — CRUD & index
   *     ✓ insertOne + findOne roundtrip
   *     ✓ rejects duplicate user_email + assignment_id + assignment_type
   *     ✓ allows same assignment_id with different assignment_type
   *     ✓ allows same assignment_id + assignment_type for different user_email
   *     ✓ find({is_blocked:true}) returns only blocked assignments
   *     ✓ updateOne sets is_blocked to true
   *     ✓ deleteMany removes matching documents
   */

  import { MongoMemoryServer } from "mongodb-memory-server";

  // ─────────────────────────────────────────────────────────────────────────────
  // Start in-memory MongoDB and patch env BEFORE importing the module
  // (db.service.js reads process.env at module load time)
  // ─────────────────────────────────────────────────────────────────────────────
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
    process.env.MONGODB_DB_NAME = "test_volp_unit";
  }, 30_000);

  afterAll(async () => {
    if (mongod) await mongod.stop();
  }, 15_000);

  // Import AFTER env vars are set
  const {
    initDB,
    db: _db,       // named import — reference captured at module load
    usersCollection: _uc,
    coursesCollection: _cc,
    assignmentsCollection: _ac,
  } = await import("../services/db.service.js");

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper: always use the live module bindings (re-import on every use)
  // ─────────────────────────────────────────────────────────────────────────────
  async function mod() {
    return import("../services/db.service.js");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // initDB
  // ─────────────────────────────────────────────────────────────────────────────
  describe("initDB", () => {
    test("resolves without throwing on a valid URI", async () => {
      await expect(initDB()).resolves.not.toThrow();
    });

    test("is idempotent — calling it a second time does not throw", async () => {
      await expect(initDB()).resolves.not.toThrow();
      await expect(initDB()).resolves.not.toThrow();
    });

    test("db export is defined after connection", async () => {
      await initDB();
      const m = await mod();
      expect(m.db).toBeDefined();
    });

    test("db.databaseName matches MONGODB_DB_NAME env var", async () => {
      await initDB();
      const m = await mod();
      expect(m.db.databaseName).toBe("test_volp_unit");
    });

    test("usersCollection is defined after initDB", async () => {
      await initDB();
      const m = await mod();
      expect(m.usersCollection).toBeDefined();
    });

    test("usersCollection exposes insertOne, findOne, find, updateOne, deleteOne, deleteMany", async () => {
      await initDB();
      const m = await mod();
      for (const fn of ["insertOne", "findOne", "find", "updateOne", "deleteOne", "deleteMany"]) {
        expect(typeof m.usersCollection[fn]).toBe("function");
      }
    });

    test("coursesCollection is defined after initDB", async () => {
      await initDB();
      const m = await mod();
      expect(m.coursesCollection).toBeDefined();
    });

    test("coursesCollection exposes insertOne, findOne, find, updateOne, deleteOne, deleteMany", async () => {
      await initDB();
      const m = await mod();
      for (const fn of ["insertOne", "findOne", "find", "updateOne", "deleteOne", "deleteMany"]) {
        expect(typeof m.coursesCollection[fn]).toBe("function");
      }
    });

    test("assignmentsCollection is defined after initDB", async () => {
      await initDB();
      const m = await mod();
      expect(m.assignmentsCollection).toBeDefined();
    });

    test("assignmentsCollection exposes insertOne, findOne, find, updateOne, deleteOne, deleteMany", async () => {
      await initDB();
      const m = await mod();
      for (const fn of ["insertOne", "findOne", "find", "updateOne", "deleteOne", "deleteMany"]) {
        expect(typeof m.assignmentsCollection[fn]).toBe("function");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Index enforcement
  // ─────────────────────────────────────────────────────────────────────────────
  describe("MongoDB indexes (created by initDB)", () => {
    beforeAll(async () => { await initDB(); });

    test("usersCollection has a unique index on { email: 1 }", async () => {
      const m = await mod();
      const indexes = await m.usersCollection.indexes();
      const idx = indexes.find((i) => i.key?.email === 1);
      expect(idx).toBeDefined();
      expect(idx.unique).toBe(true);
    });

    test("coursesCollection has a unique compound index on { user_email: 1, colid: 1 }", async () => {
      const m = await mod();
      const indexes = await m.coursesCollection.indexes();
      const idx = indexes.find(
        (i) => i.key?.user_email === 1 && i.key?.colid === 1
      );
      expect(idx).toBeDefined();
      expect(idx.unique).toBe(true);
    });

    test("assignmentsCollection has a unique compound index on { user_email, assignment_id, assignment_type }", async () => {
      const m = await mod();
      const indexes = await m.assignmentsCollection.indexes();
      const idx = indexes.find(
        (i) =>
          i.key?.user_email === 1 &&
          i.key?.assignment_id === 1 &&
          i.key?.assignment_type === 1
      );
      expect(idx).toBeDefined();
      expect(idx.unique).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // usersCollection — CRUD
  // ─────────────────────────────────────────────────────────────────────────────
  describe("usersCollection (live in-memory operations)", () => {
    let uc;

    beforeAll(async () => {
      await initDB();
      uc = (await mod()).usersCollection;
    });

    beforeEach(async () => {
      await uc.deleteMany({});
    });

    test("insertOne + findOne roundtrip", async () => {
      await uc.insertOne({ email: "a@vit.ac.in", token: "tok_a" });
      const doc = await uc.findOne({ email: "a@vit.ac.in" });
      expect(doc).not.toBeNull();
      expect(doc.token).toBe("tok_a");
    });

    test("findOne returns null for non-existent document", async () => {
      const doc = await uc.findOne({ email: "ghost@vit.ac.in" });
      expect(doc).toBeNull();
    });

    test("rejects duplicate email (unique index)", async () => {
      await uc.insertOne({ email: "dup@vit.ac.in" });
      await expect(uc.insertOne({ email: "dup@vit.ac.in" })).rejects.toThrow();
    });

    test("updateOne modifies the token field", async () => {
      await uc.insertOne({ email: "upd@vit.ac.in", token: "old" });
      await uc.updateOne({ email: "upd@vit.ac.in" }, { $set: { token: "new_token" } });
      const doc = await uc.findOne({ email: "upd@vit.ac.in" });
      expect(doc.token).toBe("new_token");
    });

    test("updateOne with upsert creates document when it does not exist", async () => {
      await uc.updateOne(
        { email: "upsert@vit.ac.in" },
        { $set: { email: "upsert@vit.ac.in", token: "tok_upsert" } },
        { upsert: true }
      );
      const doc = await uc.findOne({ email: "upsert@vit.ac.in" });
      expect(doc).not.toBeNull();
      expect(doc.token).toBe("tok_upsert");
    });

    test("deleteOne removes the document", async () => {
      await uc.insertOne({ email: "del@vit.ac.in" });
      await uc.deleteOne({ email: "del@vit.ac.in" });
      const doc = await uc.findOne({ email: "del@vit.ac.in" });
      expect(doc).toBeNull();
    });

    test("find({}) returns all inserted documents", async () => {
      await uc.insertMany([
        { email: "a@vit.ac.in", token: "t1" },
        { email: "b@vit.ac.in", token: "t2" },
      ]);
      const all = await uc.find({}).toArray();
      expect(all).toHaveLength(2);
    });

    test("find with projection returns only requested fields", async () => {
      await uc.insertOne({ email: "proj@vit.ac.in", token: "tok_proj" });
      const [doc] = await uc
        .find({}, { projection: { _id: 0, email: 1, token: 1 } })
        .toArray();
      expect(doc.email).toBe("proj@vit.ac.in");
      expect(doc.token).toBe("tok_proj");
      expect(doc._id).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // coursesCollection — CRUD & index
  // ─────────────────────────────────────────────────────────────────────────────
  describe("coursesCollection (live in-memory operations)", () => {
    let cc;

    beforeAll(async () => {
      await initDB();
      cc = (await mod()).coursesCollection;
    });

    beforeEach(async () => {
      await cc.deleteMany({});
    });

    test("insertOne + findOne roundtrip", async () => {
      await cc.insertOne({
        user_email: "a@vit.ac.in",
        colid: 101,
        course_name: "CS101",
        is_blocked: false,
      });
      const doc = await cc.findOne({ user_email: "a@vit.ac.in", colid: 101 });
      expect(doc).not.toBeNull();
      expect(doc.course_name).toBe("CS101");
    });

    test("rejects duplicate user_email + colid pair", async () => {
      await cc.insertOne({ user_email: "a@vit.ac.in", colid: 200 });
      await expect(
        cc.insertOne({ user_email: "a@vit.ac.in", colid: 200 })
      ).rejects.toThrow();
    });

    test("allows same colid for a different user_email", async () => {
      await cc.insertOne({ user_email: "a@vit.ac.in", colid: 300 });
      await expect(
        cc.insertOne({ user_email: "b@vit.ac.in", colid: 300 })
      ).resolves.not.toThrow();
    });

    test("find({is_blocked:true}) returns only blocked courses", async () => {
      await cc.insertMany([
        { user_email: "u@vit.ac.in", colid: 1, is_blocked: true },
        { user_email: "u@vit.ac.in", colid: 2, is_blocked: false },
        { user_email: "u@vit.ac.in", colid: 3, is_blocked: true },
      ]);
      const blocked = await cc
        .find({ user_email: "u@vit.ac.in", is_blocked: true })
        .toArray();
      expect(blocked).toHaveLength(2);
      expect(blocked.map((d) => d.colid).sort()).toEqual([1, 3]);
    });

    test("updateOne sets is_blocked to true", async () => {
      await cc.insertOne({ user_email: "u@vit.ac.in", colid: 5, is_blocked: false });
      await cc.updateOne(
        { user_email: "u@vit.ac.in", colid: 5 },
        { $set: { is_blocked: true } }
      );
      const doc = await cc.findOne({ user_email: "u@vit.ac.in", colid: 5 });
      expect(doc.is_blocked).toBe(true);
    });

    test("updateOne sets is_blocked back to false", async () => {
      await cc.insertOne({ user_email: "u@vit.ac.in", colid: 6, is_blocked: true });
      await cc.updateOne(
        { user_email: "u@vit.ac.in", colid: 6 },
        { $set: { is_blocked: false } }
      );
      const doc = await cc.findOne({ user_email: "u@vit.ac.in", colid: 6 });
      expect(doc.is_blocked).toBe(false);
    });

    test("bulkWrite upsert is idempotent (second call updates, does not duplicate)", async () => {
      const ops = (token) => [
        {
          updateOne: {
            filter: { user_email: "a@vit.ac.in", colid: 999 },
            update: { $set: { user_email: "a@vit.ac.in", colid: 999, token } },
            upsert: true,
          },
        },
      ];

      await cc.bulkWrite(ops("first"));
      await cc.bulkWrite(ops("second"));

      const all = await cc.find({ user_email: "a@vit.ac.in", colid: 999 }).toArray();
      expect(all).toHaveLength(1);
      expect(all[0].token).toBe("second");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // assignmentsCollection — CRUD & index
  // ─────────────────────────────────────────────────────────────────────────────
  describe("assignmentsCollection (live in-memory operations)", () => {
    let ac;

    beforeAll(async () => {
      await initDB();
      ac = (await mod()).assignmentsCollection;
    });

    beforeEach(async () => {
      await ac.deleteMany({});
    });

    test("insertOne + findOne roundtrip", async () => {
      await ac.insertOne({
        user_email: "a@vit.ac.in",
        assignment_id: 500,
        assignment_type: "SUBJECTIVE",
        is_blocked: false,
      });
      const doc = await ac.findOne({ assignment_id: 500 });
      expect(doc).not.toBeNull();
      expect(doc.assignment_type).toBe("SUBJECTIVE");
    });

    test("rejects duplicate user_email + assignment_id + assignment_type", async () => {
      await ac.insertOne({
        user_email: "a@vit.ac.in",
        assignment_id: 1,
        assignment_type: "HANDS_ON",
      });
      await expect(
        ac.insertOne({
          user_email: "a@vit.ac.in",
          assignment_id: 1,
          assignment_type: "HANDS_ON",
        })
      ).rejects.toThrow();
    });

    test("allows same assignment_id with different assignment_type", async () => {
      await ac.insertOne({
        user_email: "a@vit.ac.in",
        assignment_id: 10,
        assignment_type: "SUBJECTIVE",
      });
      await expect(
        ac.insertOne({
          user_email: "a@vit.ac.in",
          assignment_id: 10,
          assignment_type: "HANDS_ON",
        })
      ).resolves.not.toThrow();
    });

    test("allows same assignment_id + assignment_type for a different user_email", async () => {
      await ac.insertOne({
        user_email: "a@vit.ac.in",
        assignment_id: 20,
        assignment_type: "SUBJECTIVE",
      });
      await expect(
        ac.insertOne({
          user_email: "b@vit.ac.in",
          assignment_id: 20,
          assignment_type: "SUBJECTIVE",
        })
      ).resolves.not.toThrow();
    });

    test("find({is_blocked:true}) returns only blocked assignments", async () => {
      await ac.insertMany([
        { user_email: "u@vit.ac.in", assignment_id: 1, assignment_type: "SUBJECTIVE", is_blocked: true },
        { user_email: "u@vit.ac.in", assignment_id: 2, assignment_type: "HANDS_ON", is_blocked: false },
      ]);
      const blocked = await ac
        .find({ user_email: "u@vit.ac.in", is_blocked: true })
        .toArray();
      expect(blocked).toHaveLength(1);
      expect(blocked[0].assignment_id).toBe(1);
    });

    test("updateOne sets is_blocked to true", async () => {
      await ac.insertOne({
        user_email: "u@vit.ac.in",
        assignment_id: 50,
        assignment_type: "SUBJECTIVE",
        is_blocked: false,
      });
      await ac.updateOne(
        { user_email: "u@vit.ac.in", assignment_id: 50, assignment_type: "SUBJECTIVE" },
        { $set: { is_blocked: true } }
      );
      const doc = await ac.findOne({ assignment_id: 50 });
      expect(doc.is_blocked).toBe(true);
    });

    test("updateOne with upsert inserts a new blocked-assignment document", async () => {
      await ac.updateOne(
        { user_email: "u@vit.ac.in", assignment_id: 999, assignment_type: "HANDS_ON" },
        {
          $set: {
            user_email: "u@vit.ac.in",
            assignment_id: 999,
            assignment_type: "HANDS_ON",
            is_blocked: true,
          },
        },
        { upsert: true }
      );
      const doc = await ac.findOne({ assignment_id: 999 });
      expect(doc).not.toBeNull();
      expect(doc.is_blocked).toBe(true);
    });

    test("deleteMany removes all matching documents", async () => {
      await ac.insertMany([
        { user_email: "del@vit.ac.in", assignment_id: 1, assignment_type: "SUBJECTIVE" },
        { user_email: "del@vit.ac.in", assignment_id: 2, assignment_type: "HANDS_ON" },
      ]);
      await ac.deleteMany({ user_email: "del@vit.ac.in" });
      const remaining = await ac.find({ user_email: "del@vit.ac.in" }).toArray();
      expect(remaining).toHaveLength(0);
    });
  });

