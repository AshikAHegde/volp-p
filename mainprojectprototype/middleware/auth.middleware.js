/**
 * auth.middleware.js - Verify authenticated VOLP sessions against MongoDB.
 */
import { usersCollection } from '../services/db.service.js';

/**
 * Authenticate a request using the stored user email and VOLP session token.
 */
export const requireUser = async (request, response, next) => {
  const authorization = request.get('authorization') || '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : request.body?.token || request.get('x-auth-token');
  const requestedEmail = request.body?.email || request.query?.email || request.get('x-user-email');

  if (!requestedEmail || !token) {
    return response.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const user = await usersCollection.findOne(
      { email: requestedEmail, token },
      { projection: { _id: 0, email: 1 } }
    );

    if (!user) {
      return response.status(401).json({ error: 'Invalid or expired session.' });
    }

    request.authenticatedEmail = user.email;
    return next();
  } catch (error) {
    return response.status(500).json({ error: 'Authentication service unavailable.' });
  }
};
