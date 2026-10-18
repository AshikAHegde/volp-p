import express from 'express';
import {
  login,
  getActiveSession,
  logout,
  updateTelegramChatId,
  getTelegramConfig,
  getTelegramLinkToken,
  getTelegramStatus,
  disconnectTelegram
} from '../controllers/auth.controller.js';
import { requireUser } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/login', login);
router.get('/session', getActiveSession);
router.post('/logout', logout);
router.post('/telegram-chat-id', requireUser, updateTelegramChatId);
router.get('/telegram-config', getTelegramConfig);
router.post('/telegram-link-token', requireUser, getTelegramLinkToken);
router.get('/telegram-status', requireUser, getTelegramStatus);
router.post('/telegram-disconnect', requireUser, disconnectTelegram);

export default router;
