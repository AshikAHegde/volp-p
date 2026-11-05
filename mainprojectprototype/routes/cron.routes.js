import express from 'express';
import { runDailyReminderJob } from '../services/cron.service.js';

const router = express.Router();

/**
 * Validates the caller using CRON_SECRET or ADMIN_SECRET.
 * Supports:
 * - Header: 'x-cron-secret' or 'x-admin-secret'
 * - Header: 'authorization: Bearer <secret>'
 * - Query param: '?secret=<secret>'
 */
const verifyCronSecret = (req, res, next) => {
  const configuredSecret = process.env.CRON_SECRET || process.env.ADMIN_SECRET;

  // If no secret is configured in environment, allow execution with a warning (useful for dev/testing)
  if (!configuredSecret) {
    console.warn('⚠ [CRON ROUTE] No CRON_SECRET or ADMIN_SECRET configured. Webhook executed without secret validation.');
    return next();
  }

  const authHeader = req.headers.authorization || req.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  const incomingSecret =
    req.headers['x-cron-secret'] ||
    req.headers['x-admin-secret'] ||
    bearerToken ||
    req.query.secret;

  if (!incomingSecret || (incomingSecret !== process.env.CRON_SECRET && incomingSecret !== process.env.ADMIN_SECRET)) {
    return res.status(401).json({
      error: 'Unauthorized: Invalid or missing cron secret.',
      hint: 'Provide CRON_SECRET via x-cron-secret header, Bearer token, or ?secret= query parameter.'
    });
  }

  return next();
};

// GET /api/cron/ping — lightweight ping endpoint for keep-alive checkers
router.get(['/ping', '/health'], (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    timezone: process.env.CRON_TIMEZONE || 'Asia/Kolkata'
  });
});

// GET & POST /api/cron/trigger-reminders — external cron webhook to run the 8 PM daily reminder batch
// Can be called by cron-job.org, UptimeRobot, GitHub Actions, or Render Cron Job to wake up sleeping instances
router.all('/trigger-reminders', verifyCronSecret, async (req, res) => {
  console.log(`⚡ [CRON ROUTE] External reminder batch triggered at ${new Date().toISOString()} by ${req.ip || 'external client'}`);
  try {
    const result = await runDailyReminderJob();
    return res.status(200).json({
      success: true,
      message: 'Daily assignment reminder batch executed successfully.',
      result
    });
  } catch (error) {
    console.error('❌ [CRON ROUTE] Batch reminder execution error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET & POST /api/cron/trigger-hackathons — external webhook to run the hackathon ingestion pipeline
router.all('/trigger-hackathons', verifyCronSecret, async (req, res) => {
  console.log(`⚡ [CRON ROUTE] External hackathon pipeline sync triggered at ${new Date().toISOString()} by ${req.ip || 'external client'}`);
  try {
    const { runHackathonsPipeline } = await import('../services/hackathon_pipeline.service.js');
    const stats = await runHackathonsPipeline({
      devpostPages: 5,
      unstopPages: 3,
      unstopPerPage: 50
    });
    return res.status(200).json({
      success: true,
      message: 'Hackathon ingestion pipeline executed successfully.',
      stats
    });
  } catch (error) {
    console.error('❌ [CRON ROUTE] Hackathon pipeline sync error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
