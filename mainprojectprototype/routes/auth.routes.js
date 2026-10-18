import express from 'express';
import {
  login,
  getActiveSession,
  logout,
  updateTelegramChatId,
  getTelegramConfig
} from '../controllers/auth.controller.js';
import { requireUser } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/login', login);
router.get('/session', getActiveSession);
router.post('/logout', logout);
router.post('/telegram-chat-id', requireUser, updateTelegramChatId);
router.get('/telegram-config', getTelegramConfig);

export default router;
