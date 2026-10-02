/**
 * blocked_assignments.routes.js - Block / Unblock individual assignments (Modern ES Module)
 */
import express from 'express';
import { requireUser } from '../middleware/auth.middleware.js';
import {
  getBlockedAssignments,
  updateAssignmentBlockStatus
} from '../controllers/blocked_assignments.controller.js';

const router = express.Router();
router.use(requireUser);

// GET /api/blocked-assignments - list all blocked assignments for a user
router.get('/', getBlockedAssignments);

// POST /api/blocked-assignments - set a specific assignment block state
router.post('/', updateAssignmentBlockStatus);

export default router;

