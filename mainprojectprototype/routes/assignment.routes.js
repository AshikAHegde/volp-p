import express from 'express';
import { requireUser } from '../middleware/auth.middleware.js';
import {
  getMyCourses,
  syncMyCourses,
  getMyAssignments,
  syncMyAssignments,
  triggerReminderSimulation,
  getReminderLogs
} from '../controllers/assignment.controller.js';

const router = express.Router();

router.get('/my-courses', requireUser, getMyCourses);
router.post('/my-courses', requireUser, getMyCourses);
router.get('/my-assignments', requireUser, getMyAssignments);
router.post('/my-assignments', requireUser, getMyAssignments);

router.post('/sync-courses', requireUser, syncMyCourses);
router.post('/sync-assignments', requireUser, syncMyAssignments);

router.post('/trigger-8pm-reminder', requireUser, triggerReminderSimulation);
router.get('/reminder-logs', requireUser, getReminderLogs);

export default router;