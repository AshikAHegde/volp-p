/**
 * keepalive.service.js
 *
 * Self-pinging background service designed specifically for Render Free Web Services.
 *
 * Background:
 * Render Free tier instances spin down after 15 minutes of inbound HTTP inactivity.
 * When spun down, the Node.js process halts and internal node-cron jobs will not execute.
 *
 * How this service works:
 * 1. Checks for RENDER_EXTERNAL_URL (automatically provided by Render) or KEEP_ALIVE_URL.
 * 2. Periodically issues a lightweight HTTP GET to /api/health every 13 minutes (safely under the 15-minute threshold).
 * 3. Each ping resets Render's inactivity counter, keeping the web service warm and running.
 */

let keepAliveTimer = null;

export const startKeepAlive = () => {
  if (process.env.ENABLE_KEEP_ALIVE === 'false') {
    console.log('ℹ Keep-Alive: Disabled via ENABLE_KEEP_ALIVE=false.');
    return;
  }

  // Render automatically injects RENDER_EXTERNAL_URL (e.g., https://volp-reminder.onrender.com)
  const targetUrl = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;

  if (!targetUrl) {
    console.log('ℹ Keep-Alive: No KEEP_ALIVE_URL or RENDER_EXTERNAL_URL found in environment.');
    console.log('  Render Free Instance Tip: Set KEEP_ALIVE_URL in your environment or use an external ping service (cron-job.org / UptimeRobot).');
    return;
  }

  const cleanUrl = targetUrl.replace(/\/+$/, '');
  const healthEndpoint = `${cleanUrl}/api/health`;
  const intervalMs = Number(process.env.KEEP_ALIVE_INTERVAL_MS) || 13 * 60 * 1000; // 13 minutes

  console.log(`📡 Keep-Alive: Active. Pinging ${healthEndpoint} every ${Math.round(intervalMs / 60000)} minutes to prevent Render spin-down.`);

  // Initial keepalive ping after 30 seconds
  const initialTimeout = setTimeout(() => {
    pingHealth(healthEndpoint);
  }, 30000);
  if (initialTimeout?.unref) initialTimeout.unref();

  keepAliveTimer = setInterval(() => {
    pingHealth(healthEndpoint);
  }, intervalMs);

  if (keepAliveTimer?.unref) {
    keepAliveTimer.unref();
  }
};

export const pingHealth = async (url) => {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'VOLP-KeepAlive-Worker/1.0',
        'X-Keep-Alive-Ping': 'true'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (res.ok) {
      console.log(`[KeepAlive] ✓ Ping successful [HTTP ${res.status}] at ${new Date().toISOString()}`);
    } else {
      console.warn(`[KeepAlive] ⚠ Ping returned status ${res.status} (${url})`);
    }
  } catch (err) {
    console.warn(`[KeepAlive] ⚠ Ping error: ${err.message}`);
  }
};

export const stopKeepAlive = () => {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
};
