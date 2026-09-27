/**
 * auth.routes.js - User Authentication Routes (Modern ES Module)
 */
import express from 'express';
import { loginVOLP } from '../services/volp.service.js';
import { pool } from '../services/db.service.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    // 1. Authenticate with VOLP Admin portal
    const token = await loginVOLP(username, password);

    // 2. Save/Update User in MySQL database
    await pool.query(
      `INSERT INTO users (email, password, token) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE password = VALUES(password), token = VALUES(token)`,
      [username, password, token]
    );

    // 3. Return session response
    res.json({
      success: true,
      message: 'VOLP Login & User Registration Successful',
      email: username,
      token
    });
  } catch (err) {
    res.status(401).json({ error: 'Authentication failed: ' + err.message });
  }
});

export default router;
