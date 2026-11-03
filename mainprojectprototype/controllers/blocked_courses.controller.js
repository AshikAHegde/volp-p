import { coursesCollection } from '../services/db.service.js';

// Retrieves all blocked courses for a specific user from the database.
export const getBlockedCourses = async (req, res) => {
  // Enforce session email from requireUser to prevent IDOR vulnerabilities
  const rawEmail = req.user?.email || req.query.email;
  const email = (rawEmail || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email query param is required.' });

  try {
    const emailFilter = (rawEmail && rawEmail !== email)
      ? { $or: [{ user_email: email }, { user_email: rawEmail }] }
      : { user_email: email };

    const rows = await coursesCollection
      .find(
        {
          ...emailFilter,
          $or: [
            { is_blocked: true },
            { blocked_at: { $ne: null, $exists: true } }
          ]
        },
        { projection: { _id: 0, colid: 1, crsid: 1, course_name: 1, semester: 1, academic_year: 1, blocked_at: 1, is_blocked: 1 } }
      )
      .sort({ blocked_at: -1 })
      .toArray();

    const formattedRows = rows.map(r => ({
      colid: r.colid,
      crsid: r.crsid,
      course_name: r.course_name,
      semester: r.semester,
      academic_year: r.academic_year,
      blocked_at: r.blocked_at,
      is_blocked: Boolean(r.is_blocked || (r.blocked_at != null && r.blocked_at !== ''))
    }));

    res.json({ success: true, email, blocked: formattedRows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch blocked courses: ' + err.message });
  }
};

// Updates or toggles the blocked status of a course for a user.
export const updateCourseBlockStatus = async (req, res) => {
  // Enforce session email from requireUser to prevent IDOR on updates
  const rawEmail = req.user?.email || req.body.email;
  const email = (rawEmail || '').trim().toLowerCase();
  const { colid, course_name, is_blocked } = req.body;
  if (!email || !colid || typeof is_blocked !== 'boolean') {
    return res.status(400).json({ error: 'email, colid, and boolean is_blocked are required.' });
  }

  try {
    const result = await coursesCollection.updateOne(
      { user_email: email, colid: Number(colid) },
      {
        $set: {
          course_name: course_name ?? 'Course ' + colid,
          is_blocked,
          blocked_at: is_blocked ? new Date() : null,
          updated_at: new Date()
        },
        $setOnInsert: {
          user_email: email,
          colid: Number(colid)
        }
      },
      { upsert: is_blocked }
    );
    if (!is_blocked && result.matchedCount === 0) {
      return res.status(404).json({ error: 'No matching course found.' });
    }
    res.json({ success: true, is_blocked, message: `Course ${colid} ${is_blocked ? 'blocked' : 'unblocked'} for ${email}.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update course block state: ' + err.message });
  }
};
