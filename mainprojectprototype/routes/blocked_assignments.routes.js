/**
 * blocked_assignments.routes.js - Block / Unblock individual assignments (Modern ES Module)
 */
import express from 'express';
import { assignmentsCollection } from '../services/db.service.js';
import { requireUser } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(requireUser);

// GET - list all blocked assignments for a user
router.get('/', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email required.' });

  try {
    const rows = await assignmentsCollection
      .find(
        { user_email: email, is_blocked: true },
        { projection: { _id: 0, assignment_id: 1, assignment_type: 1, colid: 1, course_name: 1, unit_name: 1, title_html: 1, due_date_raw: 1, blocked_at: 1 } }
      )
      .sort({ blocked_at: -1 })
      .toArray();
    rows.forEach(row => {
      row.title_hint = row.title_html;
      delete row.title_html;
    });
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
    await assignmentsCollection.updateOne(
      { user_email: email, assignment_id: Number(assignment_id), assignment_type },
      {
        $set: {
          is_blocked: true,
          blocked_at: new Date(),
          updated_at: new Date()
        },
        $setOnInsert: {
          user_email: email,
          assignment_id: Number(assignment_id),
          assignment_type,
          colid: colid ? Number(colid) : null,
          course_name: course_name || 'Assignment',
          title_html: title_hint || '',
          is_submitted: false,
          created_at: new Date()
        }
      },
      { upsert: true }
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
    const result = await assignmentsCollection.updateOne(
      { user_email: email, assignment_id: Number(assignment_id), assignment_type },
      { $set: { is_blocked: false, blocked_at: null, updated_at: new Date() } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'No matching assignment found.' });
    }
    res.json({ success: true, message: `Assignment #${assignment_id} unblocked. It will appear in future reminder emails.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
