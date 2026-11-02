import express from 'express';
import { listHackathons, syncHackathonsPipeline } from '../controllers/hackathons.controller.js';
import { requirePremium, requirePremiumOrAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// GET /api/hackathons — returns merged unstop + devpost hackathon events.
// Requires a valid Bearer token AND is_premium === true on the user document.
// Query params: ?source=all|unstop|devpost  ?search=text  ?page=1  ?limit=50
router.get('/', requirePremium, listHackathons);

// POST /api/hackathons/pipeline/sync — executes the live Devpost & Unstop ingestion pipeline.
// Accessible strictly to Premium users or Admin with x-admin-secret.
router.post('/pipeline/sync', requirePremiumOrAdmin, syncHackathonsPipeline);
router.post('/sync', requirePremiumOrAdmin, syncHackathonsPipeline);

export default router;
