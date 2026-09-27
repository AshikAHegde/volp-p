/**
 * blocked.routes.js - Blocked Courses Management Routes (Modern ES Module)
 */
import express from 'express';
import { coursesCollection } from '../services/db.service.js';
import { requireUser } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(requireUser);

// GET  /api/blocked?email=xxx  — list all blocked courses for a user
router.get('/', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email query param is required.' });

  try {
    const rows = await coursesCollection
      .find(
        { user_email: email, is_blocked: true },
        { projection: { _id: 0, colid: 1, crsid: 1, course_name: 1, semester: 1, academic_year: 1, blocked_at: 1 } }
      )
      .sort({ blocked_at: -1 })
      .toArray();
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
    await coursesCollection.updateOne(
      { user_email: email, colid: Number(colid) },
      {
        $set: {
          course_name: course_name ?? 'Course ' + colid,
          is_blocked: true,
          blocked_at: new Date(),
          updated_at: new Date()
        },
        $setOnInsert: {
          user_email: email,
          colid: Number(colid),
          is_blocked: true
        }
      },
      { upsert: true }
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
    const result = await coursesCollection.updateOne(
      { user_email: email, colid: Number(colid) },
      { $set: { is_blocked: false, blocked_at: null, updated_at: new Date() } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'No matching course found.' });
    }
    res.json({ success: true, message: `Course ${colid} unblocked for ${email}.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unblock course: ' + err.message });
  }
});

export default router;
