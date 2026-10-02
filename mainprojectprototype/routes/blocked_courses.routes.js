/**
 * blocked_courses.routes.js - Blocked Courses Management Routes (Modern ES Module)
 */
import express from 'express';
import { requireUser } from '../middleware/auth.middleware.js';
import {
  getBlockedCourses,
  updateCourseBlockStatus
} from '../controllers/blocked_courses.controller.js';

const router = express.Router();
router.use(requireUser);

// GET  /api/blocked?email=xxx — list all blocked courses for a user
router.get('/', getBlockedCourses);

// POST /api/blocked — set a course block state for a user
router.post('/', updateCourseBlockStatus);

export default router;