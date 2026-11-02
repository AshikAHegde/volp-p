import express from 'express';
import {
  login,
  getActiveSession,
  logout,
  updateTelegramChatId,
  getTelegramConfig,
  getTelegramLinkToken,
  getTelegramStatus,
  disconnectTelegram,
  setPremium,
} from '../controllers/auth.controller.js';
import { requireUser } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/login', login);
router.get('/session', getActiveSession);
// Require authentication to prevent unauthenticated session termination attacks
router.post('/logout', requireUser, logout);
router.post('/telegram-chat-id', requireUser, updateTelegramChatId);
router.get('/telegram-config', getTelegramConfig);
router.post('/telegram-link-token', requireUser, getTelegramLinkToken);
router.get('/telegram-status', requireUser, getTelegramStatus);
router.post('/telegram-disconnect', requireUser, disconnectTelegram);
// Developer-only: toggle premium flag for a user (requires x-admin-secret header)
router.post('/set-premium', setPremium);

export default router;
