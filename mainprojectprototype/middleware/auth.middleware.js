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
      { projection: { _id: 0, email: 1, token: 1, is_premium: 1, token_expires_at: 1, created_at: 1, updated_at: 1 } }
    );

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token.' });
    }

    // Invalidate session if backend 2-hour expiration window has elapsed
    if (user.token_expires_at && new Date() > new Date(user.token_expires_at)) {
      await usersCollection.updateOne({ token }, { $unset: { token: "" } });
      return res.status(401).json({ error: 'Unauthorized: Session expired after 2 hours. Please log in again.' });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(500).json({ error: 'Authentication service unavailable.' });
  }
};

// Extends requireUser: also checks that the user has is_premium === true.
// Returns 403 if the user is authenticated but does not have premium access.
export const requirePremium = async (req, res, next) => {
  // Re-use requireUser inline so we only hit the DB once.
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
      { projection: { _id: 0, email: 1, token: 1, is_premium: 1, token_expires_at: 1, created_at: 1, updated_at: 1 } }
    );

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token.' });
    }

    // Invalidate session if backend 2-hour expiration window has elapsed
    if (user.token_expires_at && new Date() > new Date(user.token_expires_at)) {
      await usersCollection.updateOne({ token }, { $unset: { token: "" } });
      return res.status(401).json({ error: 'Unauthorized: Session expired after 2 hours. Please log in again.' });
    }

    if (!user.is_premium) {
      return res.status(403).json({ error: 'Premium access required. Contact the developer to enable this feature.' });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(500).json({ error: 'Authentication service unavailable.' });
  }
};
