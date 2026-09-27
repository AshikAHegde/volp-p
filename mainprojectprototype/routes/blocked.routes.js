/**
 * blocked.routes.js - Blocked Courses Management Routes (Modern ES Module)
 */
import express from 'express';
import { pool } from '../services/db.service.js';

const router = express.Router();

// GET  /api/blocked?email=xxx  — list all blocked courses for a user
router.get('/', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email query param is required.' });

  try {
    const [rows] = await pool.query(
      'SELECT colid, crsid, course_name, semester, academic_year, blocked_at FROM courses WHERE user_email = ? AND is_blocked = TRUE ORDER BY blocked_at DESC',
      [email]
    );
    res.json({ success: true, email, blocked: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch blocked courses: ' + err.message });
  }
});

// POST /api/blocked — block a course for a user
router.post('/', async (req, res) => {
  const { email, colid, course_name } = req.body;
  if (!email || !colid) return res.status(400).json({ error: 'email and colid are required.' });

  try {
    await pool.query(
      `INSERT INTO courses (user_email, colid, course_name, is_blocked, blocked_at)
       VALUES (?, ?, ?, TRUE, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         course_name = COALESCE(VALUES(course_name), course_name),
         is_blocked = TRUE,
         blocked_at = CURRENT_TIMESTAMP`,
      [email, Number(colid), course_name ?? 'Course ' + colid]
    );
    res.json({ success: true, message: `Course ${colid} blocked for ${email}.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to block course: ' + err.message });
  }
});

// DELETE /api/blocked — unblock a course for a user
router.delete('/', async (req, res) => {
  const { email, colid } = req.body;
  if (!email || !colid) return res.status(400).json({ error: 'email and colid are required.' });

  try {
    const [result] = await pool.query(
      'UPDATE courses SET is_blocked = FALSE, blocked_at = NULL WHERE user_email = ? AND colid = ?',
      [email, Number(colid)]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'No matching course found.' });
    }
    res.json({ success: true, message: `Course ${colid} unblocked for ${email}.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unblock course: ' + err.message });
  }
});

export default router;
