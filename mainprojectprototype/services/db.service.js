/**
 * db.service.js - Local MySQL Database Service (Modern ES Module with Dotenv)
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export const initDB = async () => {
  try {
    const connection = await pool.getConnection();
    console.log(`✓ Connected to MySQL database "${process.env.DB_NAME}" on ${process.env.DB_HOST}:${process.env.DB_PORT}.`);

    // Create Users Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        token TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Assignments Table (with is_blocked status)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL,
        assignment_id INT NOT NULL,
        assignment_type VARCHAR(50) NOT NULL,
        colid INT,
        course_name VARCHAR(255) NOT NULL,
        unit_name VARCHAR(255),
        title_html TEXT NOT NULL,
        due_date_raw VARCHAR(100),
        is_submitted BOOLEAN DEFAULT FALSE,
        is_blocked BOOLEAN DEFAULT FALSE,
        blocked_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY user_assignment (user_email, assignment_id, assignment_type)
      )
    `);

    // Create Courses Table (Cached from VOLP with is_blocked status)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL,
        colid INT NOT NULL,
        crsid INT,
        course_name VARCHAR(255) NOT NULL,
        semester VARCHAR(50),
        academic_year VARCHAR(50),
        is_blocked BOOLEAN DEFAULT FALSE,
        blocked_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY user_colid (user_email, colid)
      )
    `);

    connection.release();
    console.log('✓ Database tables initialized successfully.');
  } catch (err) {
    console.error('❌ MySQL initialization error:', err.message);
    throw err;
  }
};
