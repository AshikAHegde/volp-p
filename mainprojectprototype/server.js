import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { initDB } from './services/db.service.js';
import { startCronJob } from './services/cron.service.js';
import { startTelegramPolling } from './services/telegram.service.js';
import { projectRateLimiter } from './middleware/rate-limit.middleware.js';

import authRoutes from './routes/auth.routes.js';
import assignmentRoutes from './routes/assignment.routes.js';
import blockedRoutes from './routes/blocked_courses.routes.js';
import blockedAssignmentRoutes from './routes/blocked_assignments.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 4000);

// Serves the public landing page.
app.get(['/', '/landing', '/landing.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Serves the main student dashboard console.
app.get(['/dashboard', '/dashboard.html', '/index', '/index.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Serves the user login authentication page.
app.get(['/login', '/login.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(projectRateLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/blocked', blockedRoutes);
app.use('/api/blocked-assignments', blockedAssignmentRoutes);

await initDB();
startCronJob();
startTelegramPolling();

// Starts the Express server listener on the configured port.
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 VOLP Reminder Prototype Web UI: http://localhost:${PORT}`);
  console.log(`⏰ Cron Schedule: "${process.env.CRON_SCHEDULE}"`);
  console.log(`⚙️ Environment Mode: ${process.env.NODE_ENV}`);
  console.log(`🛡️ Rate Limiting: Active (Strict: /api/auth, /api/assignments | Simple: /api/*)`);
  console.log(`====================================================`);
});
