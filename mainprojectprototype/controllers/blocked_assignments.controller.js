import { assignmentsCollection } from '../services/db.service.js';

// Retrieves all blocked assignments for a specific user from the database.
export const getBlockedAssignments = async (req, res) => {
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
};

// Updates or toggles the blocked status of an assignment for a user.
export const updateAssignmentBlockStatus = async (req, res) => {
  const { email, assignment_id, assignment_type, colid, course_name, title_hint, is_blocked } = req.body;
  if (!email || !assignment_id || !assignment_type || typeof is_blocked !== 'boolean') {
    return res.status(400).json({ error: 'email, assignment_id, assignment_type, and boolean is_blocked are required.' });
  }

  try {
    const result = await assignmentsCollection.updateOne(
      { user_email: email, assignment_id: Number(assignment_id), assignment_type },
      {
        $set: {
          is_blocked,
          blocked_at: is_blocked ? new Date() : null,
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
      { upsert: is_blocked }
    );
    if (!is_blocked && result.matchedCount === 0) {
      return res.status(404).json({ error: 'No matching assignment found.' });
    }
    res.json({ success: true, is_blocked, message: `Assignment #${assignment_id} ${is_blocked ? 'blocked' : 'unblocked'}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
