import { jest } from '@jest/globals';

const mockPgQuery = jest.fn();
await jest.unstable_mockModule('../services/db.service.js', () => ({
  pgPool: {
    query: mockPgQuery,
  },
}));

// Import after mocking db.service.js
const {
  parseDevpostEndDate,
  deleteExpiredHackathons,
  fetchDevpostHackathons,
  fetchUnstopHackathons,
} = await import('../services/hackathon_pipeline.service.js');
const { listHackathons } = await import('../controllers/hackathons.controller.js');

describe('Hackathon Event Services & Controllers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseDevpostEndDate', () => {
    test('parses single date string into end-of-day Date', () => {
      const parsed = parseDevpostEndDate('Nov 02, 2026');
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(10); // November is 10
      expect(parsed.getDate()).toBe(2);
      expect(parsed.getHours()).toBe(23);
      expect(parsed.getMinutes()).toBe(59);
    });

    test('parses date range with month on both ends', () => {
      const parsed = parseDevpostEndDate('Oct 27 - Dec 22, 2026');
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(11); // December is 11
      expect(parsed.getDate()).toBe(22);
    });

    test('parses date range with month on start only', () => {
      const parsed = parseDevpostEndDate('Nov 02 - 05, 2026');
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(10); // November
      expect(parsed.getDate()).toBe(5);
    });

    test('parses date range spanning across years', () => {
      const parsed = parseDevpostEndDate('Dec 19, 2026 - Jan 18, 2027');
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed.getFullYear()).toBe(2027);
      expect(parsed.getMonth()).toBe(0); // January
      expect(parsed.getDate()).toBe(18);
    });

    test('parses ISO date strings', () => {
      const parsed = parseDevpostEndDate('2026-11-20T12:00:00+05:30');
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed.getTime()).not.toBeNaN();
    });

    test('returns null for null, empty or invalid strings', () => {
      expect(parseDevpostEndDate(null)).toBeNull();
      expect(parseDevpostEndDate('')).toBeNull();
      expect(parseDevpostEndDate('totally-invalid-random-string')).toBeNull();
    });
  });

  describe('deleteExpiredHackathons', () => {
    test('executes deletion queries for both unstop and devpost tables', async () => {
      // Mock unstop query result
      mockPgQuery.mockResolvedValueOnce({ rowCount: 15 });
      // Mock devpost query result (fetch existing rows)
      mockPgQuery.mockResolvedValueOnce({
        rows: [
          { id: '101', submission_period: 'Oct 01 - Oct 10, 2020', status: 'open' }, // completed long ago
          { id: '102', submission_period: 'Nov 01 - Dec 31, 2026', status: 'open' }, // future
        ],
      });
      // Mock devpost DELETE query result
      mockPgQuery.mockResolvedValueOnce({ rowCount: 1 });

      const res = await deleteExpiredHackathons({ days: 7 });

      expect(mockPgQuery).toHaveBeenCalledTimes(3);
      // Unstop delete query check
      expect(mockPgQuery.mock.calls[0][0]).toContain('DELETE FROM unstop_events');
      expect(mockPgQuery.mock.calls[0][1]).toEqual(['^[0-9]{4}-[0-9]{2}-[0-9]{2}', '7']);

      // Devpost delete query check
      expect(mockPgQuery.mock.calls[2][0]).toContain('DELETE FROM devpost_events');
      expect(mockPgQuery.mock.calls[2][1]).toEqual([['101']]);

      expect(res).toEqual({
        unstopDeleted: 15,
        devpostDeleted: 1,
        totalDeleted: 16,
      });
    });

    test('handles DB errors gracefully without throwing', async () => {
      mockPgQuery.mockRejectedValueOnce(new Error('DB failure'));

      const res = await deleteExpiredHackathons({ days: 7 });
      expect(res.totalDeleted).toBe(0);
      expect(res.error).toBe('DB failure');
    });
  });

  describe('listHackathons controller', () => {
    test('first deletes expired events and only keeps ongoing or future events', async () => {
      // Step 1: deleteExpiredHackathons mock queries
      mockPgQuery.mockResolvedValueOnce({ rowCount: 5 }); // unstop delete
      mockPgQuery.mockResolvedValueOnce({ rows: [] }); // devpost fetch for delete check

      // Step 2: Unstop query fetch
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      mockPgQuery.mockResolvedValueOnce({
        rows: [
          {
            id: '901',
            title: 'Future Unstop Hackathon',
            organization_name: 'Tech Corp',
            type: 'Hackathon',
            subtype: 'Web3',
            event_mode: 'Online',
            team_size: '2-4 Members',
            prize_pool: '₹50,000',
            is_paid: false,
            seo_url: 'https://unstop.com/h901',
            logo_url: null,
            deadline: futureDate,
            end_date: futureDate,
            status: 'LIVE',
          },
        ],
      });

      // Step 3: Devpost query fetch
      mockPgQuery.mockResolvedValueOnce({
        rows: [
          {
            id: '801',
            title: 'Future Devpost Hackathon',
            organization_name: 'Devpost Inc',
            url: 'https://devpost.com/d801',
            thumbnail_url: null,
            prize_amount: '$10,000',
            cash_prizes: 1,
            submission_period: 'Nov 01 - Dec 31, 2026',
            time_left: '20 days left',
            location: 'Online',
            status: 'open',
            themes: JSON.stringify([{ name: 'AI' }]),
            invite_only: false,
          },
          {
            id: '802',
            title: 'Old Concluded Devpost Hackathon',
            organization_name: 'Old Org',
            url: 'https://devpost.com/d802',
            thumbnail_url: null,
            prize_amount: '$1,000',
            cash_prizes: 1,
            submission_period: 'Oct 01 - Oct 05, 2020', // in past, not ongoing or future
            time_left: 'ended',
            location: 'Online',
            status: 'ended',
            themes: '[]',
            invite_only: false,
          },
        ],
      });

      const req = {
        query: { page: '1', limit: '50', source: 'all' },
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await listHackathons(req, res);

      expect(res.json).toHaveBeenCalled();
      const responseData = res.json.mock.calls[0][0];

      expect(responseData.success).toBe(true);
      // Event 802 should have been filtered out (completed in the past)
      // Only event 901 (Unstop) and event 801 (Devpost) should be kept
      expect(responseData.total).toBe(2);
      expect(responseData.events.map((e) => e.id)).toEqual(['unstop_901', 'devpost_801']);
      expect(responseData.events.find((e) => e.id === 'devpost_802')).toBeUndefined();
    });
  });

  describe('Skipping already ended hackathons at fetch time', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    test('fetchDevpostHackathons skips hackathons that are already ended', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          hackathons: [
            {
              id: 1,
              title: 'Ended Hackathon (open_state)',
              open_state: 'ended',
              submission_period_dates: 'Nov 01 - Dec 31, 2026',
            },
            {
              id: 2,
              title: 'Ended Hackathon (past date)',
              open_state: 'open',
              submission_period_dates: 'Oct 01 - Oct 10, 2020',
            },
            {
              id: 3,
              title: 'Active Future Hackathon',
              open_state: 'open',
              submission_period_dates: 'Nov 01 - Dec 31, 2026',
            },
          ],
        }),
      });

      mockPgQuery.mockResolvedValue({ rowCount: 1 });

      const stats = await fetchDevpostHackathons({ maxPages: 1 });

      expect(stats.attempted).toBe(3);
      expect(stats.upserted).toBe(1); // Only event 3 should be upserted
      expect(mockPgQuery).toHaveBeenCalledTimes(1);
      expect(mockPgQuery.mock.calls[0][1][0]).toBe(3); // ID 3 inserted
    });

    test('fetchUnstopHackathons skips hackathons that are already ended', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            data: [
              {
                id: 10,
                title: 'Expired Unstop (status)',
                status: 'EXPIRED',
                regn_open: 0,
                end_date: '2026-11-20T00:00:00Z',
              },
              {
                id: 11,
                title: 'Past Deadline Unstop',
                status: 'LIVE',
                regn_open: 1,
                regnRequirements: { end_regn_dt: '2020-01-01T00:00:00Z' },
                end_date: '2020-01-02T00:00:00Z',
              },
              {
                id: 12,
                title: 'Live Active Unstop',
                status: 'LIVE',
                regn_open: 1,
                regnRequirements: { end_regn_dt: '2026-12-31T00:00:00Z' },
                end_date: '2026-12-31T00:00:00Z',
              },
            ],
          },
        }),
      });

      mockPgQuery.mockResolvedValue({ rowCount: 1 });

      const stats = await fetchUnstopHackathons({ opportunities: ['hackathons'], maxPages: 1 });

      expect(stats.attempted).toBe(3);
      expect(stats.upserted).toBe(1); // Only event 12 should be upserted
      expect(mockPgQuery).toHaveBeenCalledTimes(1);
      expect(mockPgQuery.mock.calls[0][1][0]).toBe(12); // ID 12 inserted
    });
  });
});
