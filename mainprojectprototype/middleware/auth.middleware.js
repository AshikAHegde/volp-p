import { usersCollection } from '../services/db.service.js';

// Validates the incoming Bearer token against MongoDB and attaches the user document to req.user.
export const requireUser = async (req, res, next) => {
  const authHeader = req.headers.authorization || req.get('authorization') || '';

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Bearer token required in Authorization header.' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Session token missing.' });
  }

  try {
    const user = await usersCollection.findOne(
      { token },
      { projection: { _id: 0, email: 1, token: 1, created_at: 1, updated_at: 1 } }
    );

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token.' });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(500).json({ error: 'Authentication service unavailable.' });
  }
};
