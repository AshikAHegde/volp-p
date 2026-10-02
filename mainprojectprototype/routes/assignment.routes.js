/**
 * assignment.routes.js - Assignment & Course Management Routes (Modern ES Module)
 */

import express from 'express';
import { requireUser } from '../middleware/auth.middleware.js';
import {
  getMyCourses,
  syncMyCourses,
  getMyAssignments,
  syncMyAssignments,
  triggerReminderSimulation
} from '../controllers/assignment.controller.js';

const router = express.Router();

// ==========================================
// 1. NON-REFRESH (DB-Only) - GET and POST (Simple Rate Limit)
// Fast find from MongoDB without calling college portal.
// POST aliases allow frontend to send email/token/refresh in body.
// ==========================================
router.get('/my-courses', requireUser, getMyCourses);
router.post('/my-courses', requireUser, getMyCourses);
router.get('/my-assignments', requireUser, getMyAssignments);
router.post('/my-assignments', requireUser, getMyAssignments);

// ==========================================
// Live VOLP Sync Endpoints: Strict Rate Limiter
// ==========================================
router.post('/sync-courses', requireUser, syncMyCourses);
router.post('/sync-assignments', requireUser, syncMyAssignments);

// ==========================================
// Manual Reminder Simulation
// ==========================================
router.post('/trigger-8pm-reminder', requireUser, triggerReminderSimulation);

export default router;