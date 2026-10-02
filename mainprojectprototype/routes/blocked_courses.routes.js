import express from 'express';
import { requireUser } from '../middleware/auth.middleware.js';
import {
  getBlockedCourses,
  updateCourseBlockStatus
} from '../controllers/blocked_courses.controller.js';

const router = express.Router();
router.use(requireUser);

router.get('/', getBlockedCourses);
router.post('/', updateCourseBlockStatus);

export default router;