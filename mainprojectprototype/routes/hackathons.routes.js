import express from 'express';
import { listHackathons } from '../controllers/hackathons.controller.js';
import { requirePremium } from '../middleware/auth.middleware.js';

const router = express.Router();

// GET /api/hackathons — returns merged unstop + devpost hackathon events.
// Requires a valid Bearer token AND is_premium === true on the user document.
// Query params: ?source=all|unstop|devpost  ?search=text  ?page=1  ?limit=50
router.get('/', requirePremium, listHackathons);

export default router;
