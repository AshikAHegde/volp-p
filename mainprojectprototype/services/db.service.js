import 'dotenv/config';
import { MongoClient } from 'mongodb';
import pg from 'pg';

const { Pool } = pg;

// Postgres pool — connects to the same DB that n8n populates with hackathon events.
// All fields are optional; if not configured the pool will gracefully fail at query time.
export const pgPool = new Pool({
  host:     process.env.POSTGRES_HOST     || 'localhost',
  port:     Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB       || 'n8n',
  user:     process.env.POSTGRES_USER     || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  ssl:      (process.env.POSTGRES_SSL === 'true' || (process.env.POSTGRES_HOST && !['localhost', '127.0.0.1'].includes(process.env.POSTGRES_HOST)))
              ? { rejectUnauthorized: false }
              : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const mongoUri = process.env.MONGODB_URI;
const mongoDatabaseName = process.env.MONGODB_DB_NAME || 'volp_db';
const client = new MongoClient(mongoUri || 'mongodb://127.0.0.1:27017');

export let db;
export let usersCollection;
export let coursesCollection;
export let assignmentsCollection;
export let reminderLogsCollection;

// Connects to MongoDB and sets up database collections and unique indexes.
export const initDB = async () => {
  try {
    await client.connect();
    db = client.db(mongoDatabaseName);
    usersCollection = db.collection('users');
    coursesCollection = db.collection('courses');
    assignmentsCollection = db.collection('assignments');
    reminderLogsCollection = db.collection('reminder_logs');

    await Promise.all([
      usersCollection.createIndex({ email: 1 }, { unique: true }),
      coursesCollection.createIndex({ user_email: 1, colid: 1 }, { unique: true }),
      assignmentsCollection.createIndex(
        { user_email: 1, assignment_id: 1, assignment_type: 1 },
        { unique: true }
      ),
      reminderLogsCollection.createIndex({ user_email: 1, created_at: -1 })
    ]);

    console.log(`✓ Connected to MongoDB database "${mongoDatabaseName}".`);
  } catch (err) {
    console.error('❌ MongoDB initialization error:', err.message);
    throw err;
  }
};
