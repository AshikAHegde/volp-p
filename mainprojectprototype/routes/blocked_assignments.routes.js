import express from 'express';
import { requireUser } from '../middleware/auth.middleware.js';
import {
  getBlockedAssignments,
  updateAssignmentBlockStatus
} from '../controllers/blocked_assignments.controller.js';

const router = express.Router();
router.use(requireUser);

router.get('/', getBlockedAssignments);
router.post('/', updateAssignmentBlockStatus);

export default router;
