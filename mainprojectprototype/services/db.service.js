/**
 * db.service.js - MongoDB Database Service (Modern ES Module with Dotenv)
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const mongoUri = process.env.MONGODB_URI;
const mongoDatabaseName = process.env.MONGODB_DB_NAME || 'volp_db';
const client = new MongoClient(mongoUri || 'mongodb://127.0.0.1:27017');

export let db;
export let usersCollection;
export let coursesCollection;
export let assignmentsCollection;

export const initDB = async () => {
  try {
    await client.connect();
    db = client.db(mongoDatabaseName);
    usersCollection = db.collection('users');
    coursesCollection = db.collection('courses');
    assignmentsCollection = db.collection('assignments');

    await Promise.all([
      usersCollection.createIndex({ email: 1 }, { unique: true }),
      coursesCollection.createIndex({ user_email: 1, colid: 1 }, { unique: true }),
      assignmentsCollection.createIndex(
        { user_email: 1, assignment_id: 1, assignment_type: 1 },
        { unique: true }
      )
    ]);

    console.log(`✓ Connected to MongoDB database "${mongoDatabaseName}".`);
  } catch (err) {
    console.error('❌ MongoDB initialization error:', err.message);
    throw err;
  }
};
