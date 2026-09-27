/**
 * blocked_assignments.routes.js - Block / Unblock individual assignments (Modern ES Module)
 */
import express from 'express';
import { pool } from '../services/db.service.js';

const router = express.Router();

// GET - list all blocked assignments for a user
router.get('/', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email required.' });

  try {
    const [rows] = await pool.query(
      `SELECT assignment_id, assignment_type, colid, course_name, unit_name, title_html AS title_hint, due_date_raw, blocked_at
       FROM assignments
       WHERE user_email = ? AND is_blocked = TRUE
       ORDER BY blocked_at DESC`,
      [email]
    );
    res.json({ success: true, blocked: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - block a specific assignment
router.post('/', async (req, res) => {
  const { email, assignment_id, assignment_type, colid, course_name, title_hint } = req.body;
  if (!email || !assignment_id || !assignment_type) {
    return res.status(400).json({ error: 'email, assignment_id, and assignment_type are required.' });
  }

  try {
    await pool.query(
      `INSERT INTO assignments
        (user_email, assignment_id, assignment_type, colid, course_name, title_html, is_blocked, blocked_at)
       VALUES (?, ?, ?, ?, ?, ?, TRUE, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         is_blocked = TRUE,
         blocked_at = CURRENT_TIMESTAMP`,
      [email, Number(assignment_id), assignment_type, colid ? Number(colid) : null, course_name || 'Assignment', title_hint || '']
    );
    res.json({ success: true, message: `Assignment #${assignment_id} blocked. It will no longer appear in reminder emails.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE - unblock a specific assignment
router.delete('/', async (req, res) => {
  const { email, assignment_id, assignment_type } = req.body;
  if (!email || !assignment_id || !assignment_type) {
    return res.status(400).json({ error: 'email, assignment_id, and assignment_type are required.' });
  }

  try {
    const [result] = await pool.query(
      'UPDATE assignments SET is_blocked = FALSE, blocked_at = NULL WHERE user_email = ? AND assignment_id = ? AND assignment_type = ?',
      [email, Number(assignment_id), assignment_type]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'No matching assignment found.' });
    }
    res.json({ success: true, message: `Assignment #${assignment_id} unblocked. It will appear in future reminder emails.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
