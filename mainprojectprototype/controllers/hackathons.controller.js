import { pgPool } from '../services/db.service.js';

// Safely format registration links with full https:// protocol and valid domain path
function buildEventUrl(primary, fallback, domain = 'unstop.com') {
  const raw = (primary || fallback || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return raw.startsWith('/') ? `https://${domain}${raw}` : `https://${domain}/${raw}`;
}

// Fetches hackathon events directly from Postgres tables (unstop_events and devpost_events).
// Only accessible to users with is_premium === true (enforced by requirePremium middleware).
export const listHackathons = async (req, res) => {
  const page    = Math.max(1, parseInt(req.query.page  || '1',  10));
  // Allow fetching up to 1000 hackathons for rich client-side filtering and calendar rendering
  const limit   = Math.min(1000, Math.max(1, parseInt(req.query.limit || '50', 10)));
  const offset  = (page - 1) * limit;
  const search  = (req.query.search || '').trim();
  const source  = (req.query.source || 'all').toLowerCase(); // 'unstop' | 'devpost' | 'all'

  const searchLike = search ? `%${search}%` : null;

  try {
    // ── Unstop events ───────────────────────────────────────────────────────────
    let unstopRows = [];
    if (source === 'all' || source === 'unstop') {
      // Bound query to a safe limit to prevent unbounded memory spikes
      const unstopQuery = searchLike
        ? `SELECT id, title, organization_name, type, subtype, event_mode,
                  team_size, prize_pool, is_paid, seo_url, short_url,
                  logo_url, deadline, status, region
             FROM unstop_events
            WHERE (title ILIKE $1 OR organization_name ILIKE $1 OR subtype ILIKE $1)
            ORDER BY created_at DESC
            LIMIT 2000`
        : `SELECT id, title, organization_name, type, subtype, event_mode,
                  team_size, prize_pool, is_paid, seo_url, short_url,
                  logo_url, deadline, status, region
             FROM unstop_events
            ORDER BY created_at DESC
            LIMIT 2000`;

      const { rows } = await pgPool.query(unstopQuery, searchLike ? [searchLike] : []);
      unstopRows = rows.map((r) => ({
        // Namespace ID with provider prefix to prevent collision across sources
        id:           `unstop_${r.id}`,
        source:       'unstop',
        title:        r.title         || 'Untitled Event',
        organization: r.organization_name || null,
        type:         r.type          || 'Competition',
        subtype:      r.subtype       || null,
        mode:         r.event_mode    || null,
        team_size:    r.team_size     || null,
        prize:        r.prize_pool    || 'Not specified',
        is_paid:      Boolean(r.is_paid),
        url:          buildEventUrl(r.seo_url, r.short_url, 'unstop.com'),
        logo_url:     r.logo_url      || null,
        deadline:     r.deadline      || null,
        status:       r.status        || null,
      }));
    }

    // ── Devpost events ──────────────────────────────────────────────────────────
    let devpostRows = [];
    if (source === 'all' || source === 'devpost') {
      // Bound query to a safe limit to prevent unbounded memory spikes
      const devpostQuery = searchLike
        ? `SELECT id, title, organization_name, url, thumbnail_url,
                  prize_amount, cash_prizes, submission_period, time_left,
                  location, status, themes, invite_only
             FROM devpost_events
            WHERE (title ILIKE $1 OR organization_name ILIKE $1)
            ORDER BY created_at DESC
            LIMIT 2000`
        : `SELECT id, title, organization_name, url, thumbnail_url,
                  prize_amount, cash_prizes, submission_period, time_left,
                  location, status, themes, invite_only
             FROM devpost_events
            ORDER BY created_at DESC
            LIMIT 2000`;

      const { rows } = await pgPool.query(devpostQuery, searchLike ? [searchLike] : []);
      devpostRows = rows.map((r) => {
        let themeNames = [];
        try {
          const parsed = typeof r.themes === 'string' ? JSON.parse(r.themes) : (r.themes || []);
          if (Array.isArray(parsed)) themeNames = parsed.map((t) => t && t.name).filter(Boolean);
        } catch (_) {}

        const prize = r.prize_amount
          || (r.cash_prizes ? `${r.cash_prizes} cash prizes` : 'Not specified');

        return {
          // Namespace ID with provider prefix to prevent collision across sources
          id:           `devpost_${r.id}`,
          source:       'devpost',
          title:        r.title         || 'Untitled Hackathon',
          organization: r.organization_name || null,
          type:         'Hackathon',
          subtype:      themeNames.slice(0, 3).join(', ') || null,
          mode:         r.location      || 'Online',
          team_size:    null,
          prize,
          is_paid:      false,
          url:          buildEventUrl(r.url, null, 'devpost.com'),
          logo_url:     r.thumbnail_url || null,
          deadline:     r.submission_period || r.time_left || null,
          status:       r.status        || null,
        };
      });
    }

    // Direct database query result merging without artificial fallbacks
    const all   = [...unstopRows, ...devpostRows];
    const total = all.length;
    const page_events = all.slice(offset, offset + limit);

    return res.json({
      success:     true,
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
      events:      page_events,
    });
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === '3D000') {
      return res.status(503).json({
        error: 'Hackathon database not available. Ensure POSTGRES_* env vars are configured and n8n has populated the tables.',
      });
    }
    console.error('Hackathon controller error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch hackathons: ' + err.message });
  }
};
