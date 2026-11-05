import { jest } from '@jest/globals';
import express from 'express';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

const mockRunDailyReminderJob = jest.fn();
await jest.unstable_mockModule('../services/cron.service.js', () => ({
  runDailyReminderJob: mockRunDailyReminderJob,
  startCronJob: jest.fn(),
  triggerCronNow: jest.fn(),
}));

const mockRunHackathonsPipeline = jest.fn();
await jest.unstable_mockModule('../services/hackathon_pipeline.service.js', () => ({
  runHackathonsPipeline: mockRunHackathonsPipeline,
}));

// Dynamic import after mocks
const { startKeepAlive, stopKeepAlive, pingHealth } = await import('../services/keepalive.service.js');
const { default: cronRoutes } = await import('../routes/cron.routes.js');

describe('KeepAlive Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    stopKeepAlive();
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
    stopKeepAlive();
  });

  test('does nothing when ENABLE_KEEP_ALIVE is "false"', () => {
    process.env.ENABLE_KEEP_ALIVE = 'false';
    process.env.RENDER_EXTERNAL_URL = 'https://myapp.onrender.com';
    startKeepAlive();
    stopKeepAlive();
  });

  test('does nothing when neither KEEP_ALIVE_URL nor RENDER_EXTERNAL_URL is set', () => {
    delete process.env.KEEP_ALIVE_URL;
    delete process.env.RENDER_EXTERNAL_URL;
    startKeepAlive();
    stopKeepAlive();
  });

  test('pingHealth catches fetch errors gracefully without throwing', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('Network offline'));

    await expect(pingHealth('https://fake-url.com/api/health')).resolves.not.toThrow();

    global.fetch = originalFetch;
  });

  test('pingHealth succeeds when endpoint returns 200', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    await pingHealth('https://fake-url.com/api/health');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://fake-url.com/api/health',
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': 'VOLP-KeepAlive-Worker/1.0' }),
      })
    );

    global.fetch = originalFetch;
  });
});

describe('Cron Webhook Routes (/api/cron)', () => {
  let app;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.CRON_SECRET = 'test_secret_123';
    jest.clearAllMocks();

    app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use('/api/cron', cronRoutes);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('GET /api/cron/ping returns 200 OK with health status', async () => {
    const res = await fetchResponse(app, 'GET', '/api/cron/ping');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
  });

  test('POST /api/cron/trigger-reminders rejects unauthorized request (401) when secret is wrong', async () => {
    const res = await fetchResponse(app, 'POST', '/api/cron/trigger-reminders', {
      headers: { 'x-cron-secret': 'wrong_secret' },
    });
    expect(res.status).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Unauthorized');
    expect(mockRunDailyReminderJob).not.toHaveBeenCalled();
  });

  test('POST /api/cron/trigger-reminders executes when x-cron-secret header is valid', async () => {
    mockRunDailyReminderJob.mockResolvedValue({
      success: true,
      totalUsers: 5,
      processed: 5,
      failed: 0,
    });

    const res = await fetchResponse(app, 'POST', '/api/cron/trigger-reminders', {
      headers: { 'x-cron-secret': 'test_secret_123' },
    });

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(mockRunDailyReminderJob).toHaveBeenCalledTimes(1);
  });

  test('GET /api/cron/trigger-reminders executes when ?secret= query param is valid', async () => {
    mockRunDailyReminderJob.mockResolvedValue({ success: true });

    const res = await fetchResponse(app, 'GET', '/api/cron/trigger-reminders?secret=test_secret_123');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(mockRunDailyReminderJob).toHaveBeenCalled();
  });

  test('POST /api/cron/trigger-reminders executes when Authorization: Bearer <secret> is valid', async () => {
    mockRunDailyReminderJob.mockResolvedValue({ success: true });

    const res = await fetchResponse(app, 'POST', '/api/cron/trigger-reminders', {
      headers: { authorization: 'Bearer test_secret_123' },
    });
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });
});

/** Helper to simulate HTTP requests against express app directly without network socket */
async function fetchResponse(app, method, urlPath, { headers = {}, body = null } = {}) {
  const [pathname, search] = urlPath.split('?');
  const queryParams = new URLSearchParams(search || '');
  const query = Object.fromEntries(queryParams.entries());

  return new Promise((resolve) => {
    const req = {
      method,
      url: urlPath,
      path: pathname,
      headers: { ...headers },
      get: (h) => headers[h.toLowerCase()] || headers[h],
      query,
      body: body || {},
      ip: '127.0.0.1',
      app,
    };

    let statusCode = 200;
    const resHeaders = {};
    let responseBody = '';

    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      setHeader: (k, v) => {
        resHeaders[k] = v;
        return res;
      },
      json: (data) => {
        responseBody = JSON.stringify(data);
        resolve({ status: statusCode, headers: resHeaders, body: responseBody });
        return res;
      },
      send: (data) => {
        responseBody = typeof data === 'object' ? JSON.stringify(data) : String(data);
        resolve({ status: statusCode, headers: resHeaders, body: responseBody });
        return res;
      },
    };

    app.handle(req, res);
  });
}
