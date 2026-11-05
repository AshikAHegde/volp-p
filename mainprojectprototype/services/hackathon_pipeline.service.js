import { pgPool } from './db.service.js';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 VOLP-HackathonBot/1.0';

/**
 * Strips HTML tags and normalizes whitespace from strings.
 */
function stripHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Normalizes registration/event links to full absolute HTTPS URLs.
 */
function normalizeUrl(url, domain = 'devpost.com') {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return trimmed.startsWith('/') ? `https://${domain}${trimmed}` : `https://${domain}/${trimmed}`;
}

/**
 * Fetches and upserts hackathons from Devpost public API.
 * @param {object} options
 * @param {number} options.maxPages - Number of Devpost pages to fetch (default: 5)
 */
export async function fetchDevpostHackathons({ maxPages = 5 } = {}) {
  let attempted = 0;
  let upserted = 0;
  const errors = [];

  const devpostSql = `
    INSERT INTO devpost_events (
      id, title, organization_name, url, submission_gallery_url,
      start_submission_url, location, location_icon, status, featured,
      submission_period, time_left, prize_amount, cash_prizes, other_prizes,
      registrations_count, thumbnail_url, themes, invite_only,
      managed_by_devpost, winners_announced, analytics_identifier,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19,
      $20, $21, $22, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      organization_name = EXCLUDED.organization_name,
      url = EXCLUDED.url,
      submission_gallery_url = EXCLUDED.submission_gallery_url,
      start_submission_url = EXCLUDED.start_submission_url,
      location = EXCLUDED.location,
      location_icon = EXCLUDED.location_icon,
      status = EXCLUDED.status,
      featured = EXCLUDED.featured,
      submission_period = EXCLUDED.submission_period,
      time_left = EXCLUDED.time_left,
      prize_amount = EXCLUDED.prize_amount,
      cash_prizes = EXCLUDED.cash_prizes,
      other_prizes = EXCLUDED.other_prizes,
      registrations_count = EXCLUDED.registrations_count,
      thumbnail_url = EXCLUDED.thumbnail_url,
      themes = EXCLUDED.themes,
      invite_only = EXCLUDED.invite_only,
      managed_by_devpost = EXCLUDED.managed_by_devpost,
      winners_announced = EXCLUDED.winners_announced,
      analytics_identifier = EXCLUDED.analytics_identifier,
      updated_at = NOW()
  `;

  for (let page = 1; page <= maxPages; page++) {
    try {
      const endpoint = `https://devpost.com/api/hackathons?page=${page}`;
      const res = await fetch(endpoint, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        errors.push(`Devpost page ${page} returned HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const hackathons = data.hackathons || [];
      if (hackathons.length === 0) break;

      // Upsert in concurrent chunks matching pgPool connection capacity
      const CHUNK_SIZE = 5;
      for (let i = 0; i < hackathons.length; i += CHUNK_SIZE) {
        const chunk = hackathons.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(async (item) => {
          attempted++;
          try {
            // Do not store hackathon in database if it is already ended
            if (item.open_state === 'ended') {
              return;
            }
            if (item.time_left_to_submission && /ended|concluded/i.test(item.time_left_to_submission)) {
              return;
            }
            const endDate = parseDevpostEndDate(item.submission_period_dates);
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            if (endDate && endDate < startOfToday) {
              return;
            }

            const rawPrize = item.prize_amount || '';
            const cleanPrize = stripHtml(rawPrize) || null;
            const thumbUrl = normalizeUrl(item.thumbnail_url);
            const eventUrl = normalizeUrl(item.url, 'devpost.com');
            const galleryUrl = normalizeUrl(item.submission_gallery_url, 'devpost.com');
            const startSubUrl = normalizeUrl(item.start_a_submission_url, 'devpost.com');

            await pgPool.query(devpostSql, [
              item.id,
              item.title || 'Untitled Devpost Hackathon',
              item.organization_name || null,
              eventUrl,
              galleryUrl,
              startSubUrl,
              item.displayed_location?.location || 'Online',
              item.displayed_location?.icon || null,
              item.open_state || 'open',
              Boolean(item.featured),
              item.submission_period_dates || null,
              item.time_left_to_submission || null,
              cleanPrize,
              item.prizes_counts?.cash || 0,
              item.prizes_counts?.other || 0,
              item.registrations_count || 0,
              thumbUrl,
              JSON.stringify(item.themes || []),
              Boolean(item.invite_only),
              Boolean(item.managed_by_devpost_badge),
              Boolean(item.winners_announced),
              item.analytics_identifier || null,
            ]);
            upserted++;
          } catch (itemErr) {
            errors.push(`Devpost item ${item.id} failed: ${itemErr.message}`);
          }
        }));
      }
    } catch (pageErr) {
      errors.push(`Devpost page ${page} request failed: ${pageErr.message}`);
    }
  }

  return { attempted, upserted, errors };
}

/**
 * Fetches and upserts hackathons/competitions from Unstop public API.
 * @param {object} options
 * @param {string[]} options.opportunities - Opportunity filters (e.g. ['hackathons', 'competitions'])
 * @param {number} options.perPage - Items per request (default: 50)
 * @param {number} options.maxPages - Pages to fetch per category (default: 2)
 */
export async function fetchUnstopHackathons({
  opportunities = ['hackathons', 'competitions'],
  perPage = 50,
  maxPages = 2,
} = {}) {
  let attempted = 0;
  let upserted = 0;
  const errors = [];

  const unstopSql = `
    INSERT INTO unstop_events (
      id, title, type, subtype, public_url, seo_url, short_url,
      organization_id, organization_name, status, region, visibility,
      regn_open, is_paid, end_date, updated_at, details, logo_url,
      created_at, prize_pool, team_size, event_mode, deadline
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, NOW(),
      $19, $20, $21, $22
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      type = EXCLUDED.type,
      subtype = EXCLUDED.subtype,
      public_url = EXCLUDED.public_url,
      seo_url = EXCLUDED.seo_url,
      short_url = EXCLUDED.short_url,
      organization_id = EXCLUDED.organization_id,
      organization_name = EXCLUDED.organization_name,
      status = EXCLUDED.status,
      region = EXCLUDED.region,
      visibility = EXCLUDED.visibility,
      regn_open = EXCLUDED.regn_open,
      is_paid = EXCLUDED.is_paid,
      end_date = EXCLUDED.end_date,
      updated_at = EXCLUDED.updated_at,
      details = EXCLUDED.details,
      logo_url = EXCLUDED.logo_url,
      prize_pool = EXCLUDED.prize_pool,
      team_size = EXCLUDED.team_size,
      event_mode = EXCLUDED.event_mode,
      deadline = EXCLUDED.deadline
  `;

  for (const opp of opportunities) {
    for (let page = 1; page <= maxPages; page++) {
      try {
        const endpoint = `https://unstop.com/api/public/opportunity/search-result?opportunity=${opp}&per_page=${perPage}&page=${page}`;
        const res = await fetch(endpoint, {
          headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(20000),
        });

        if (!res.ok) {
          errors.push(`Unstop ${opp} page ${page} returned HTTP ${res.status}`);
          continue;
        }

        const json = await res.json();
        const items = json.data?.data || [];
        if (items.length === 0) break;

        // Upsert in concurrent chunks matching pgPool connection capacity
        const CHUNK_SIZE = 5;
        for (let i = 0; i < items.length; i += CHUNK_SIZE) {
          const chunk = items.slice(i, i + CHUNK_SIZE);
          await Promise.all(chunk.map(async (item) => {
            attempted++;
            try {
              // Calculate prize pool summary
              let totalCash = 0;
              if (Array.isArray(item.prizes)) {
                for (const p of item.prizes) {
                  if (p && typeof p.cash === 'number') totalCash += p.cash;
                }
              }
              const prizePool = totalCash > 0
                ? `₹${totalCash.toLocaleString('en-IN')}`
                : (item.prizes?.length ? 'Prizes & Certificates' : 'Not specified');

              // Calculate team size
              let teamSize = null;
              const minT = item.regnRequirements?.min_team_size;
              const maxT = item.regnRequirements?.max_team_size;
              if (minT && maxT) {
                teamSize = minT === maxT ? `${minT} Members` : `${minT}-${maxT} Members`;
              }

              // Mode & URLs
              const isOnline = (item.region || '').toLowerCase() === 'online';
              const eventMode = isOnline ? 'Online' : (item.regnRequirements?.work_location_type || 'Offline');
              const seoUrl = item.seo_url || (item.public_url ? `https://unstop.com/${item.public_url}` : null);
              const logoUrl = item.logoUrl2 || item.organisation?.logoUrl2 || item.organisation?.logoUrl || null;
              const deadline = item.regnRequirements?.end_regn_dt || item.end_date || null;
              const detailsClean = item.details ? stripHtml(item.details).slice(0, 1000) : null;

              // Do not store hackathon in database if it is already ended/expired
              const completionDateRaw = deadline || item.end_date;
              const now = new Date();
              const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

              if (item.status && ['EXPIRED', 'CLOSED', 'ENDED', 'CONCLUDED'].includes(String(item.status).toUpperCase()) && String(item.regn_open) === '0') {
                return; // Skip already ended hackathon
              }
              if (completionDateRaw) {
                const parsedCompDate = new Date(completionDateRaw);
                if (!isNaN(parsedCompDate.getTime()) && parsedCompDate < startOfToday) {
                  return; // Skip already ended hackathon
                }
              }

              await pgPool.query(unstopSql, [
                item.id,
                item.title || 'Untitled Unstop Competition',
                item.type || (opp === 'hackathons' ? 'Hackathon' : 'Competition'),
                item.subtype || null,
                item.public_url || null,
                seoUrl,
                item.short_url || null,
                item.organization_id || item.organisation?.id || null,
                item.organisation?.name || null,
                item.status || (item.regn_open ? 'LIVE' : 'CLOSED'),
                item.region || 'online',
                item.visibility || 'public',
                item.regn_open !== undefined ? String(item.regn_open) : '1',
                Boolean(item.isPaid),
                item.end_date || null,
                item.updated_at || new Date().toISOString(),
                detailsClean,
                logoUrl,
                prizePool,
                teamSize,
                eventMode,
                deadline,
              ]);
              upserted++;
            } catch (itemErr) {
              errors.push(`Unstop item ${item.id} failed: ${itemErr.message}`);
            }
          }));
        }
      } catch (pageErr) {
        errors.push(`Unstop ${opp} page ${page} request failed: ${pageErr.message}`);
      }
    }
  }

  return { attempted, upserted, errors };
}

const VALID_MONTH_NAMES = /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/i;

/**
 * Parses Devpost submission period date strings into a valid Date object.
 * Examples:
 *   "Nov 02, 2026"
 *   "Oct 27 - Dec 22, 2026"
 *   "Nov 02 - 05, 2026"
 *   "Jul 16, 2026 - Jan 15, 2027"
 */
export function parseDevpostEndDate(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim();
  if (!str) return null;

  // Try direct Date parsing if it has digits and no range separator
  if (!str.includes(' - ')) {
    if (/\d/.test(str)) {
      const directDate = new Date(str);
      if (!isNaN(directDate.getTime())) {
        if (!str.includes(':') && !str.includes('T')) {
          directDate.setHours(23, 59, 59, 999);
        }
        return directDate;
      }
    }
    return null;
  }

  // Handle range formats: "Oct 27 - Dec 22, 2026", "Nov 02 - 05, 2026", "Dec 19, 2026 - Jan 18, 2027"
  const parts = str.split(/\s*-\s*/);
  if (parts.length >= 2) {
    const startPart = parts[0].trim();
    const endPart = parts[parts.length - 1].trim();

    // 1. Try parsing endPart directly (e.g. "Dec 22, 2026", "Jan 18, 2027")
    if (/\d/.test(endPart) && (VALID_MONTH_NAMES.test(endPart) || /^\d{4}/.test(endPart))) {
      let d = new Date(endPart);
      if (!isNaN(d.getTime())) {
        if (!endPart.includes(':')) d.setHours(23, 59, 59, 999);
        return d;
      }
    }

    // 2. Month only in startPart: e.g. start="Nov 02", end="05, 2026" or "05"
    const monthMatch = startPart.match(VALID_MONTH_NAMES);
    const dayMatch = endPart.match(/\b\d{1,2}\b/);
    if (monthMatch && dayMatch) {
      const yearMatch = endPart.match(/,?\s*(\d{4})$/) || startPart.match(/,?\s*(\d{4})$/);
      const year = yearMatch ? yearMatch[1] : new Date().getFullYear();
      const month = monthMatch[1];
      const day = dayMatch[0];
      const d = new Date(`${month} ${day}, ${year}`);
      if (!isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        return d;
      }
    }
  }

  return null;
}

/**
 * Deletes events from unstop_events and devpost_events that were completed 7+ days ago.
 * @param {object} options
 * @param {number} options.days - Number of days past completion to delete (default: 7)
 */
export async function deleteExpiredHackathons({ days = 7 } = {}) {
  try {
    // 1. Delete Unstop events completed 7+ days ago
    // Evaluates completion timestamp COALESCE(deadline, end_date) against NOW() - INTERVAL '7 days'
    const unstopDeleteSql = `
      DELETE FROM unstop_events
       WHERE (
         COALESCE(deadline, end_date) IS NOT NULL
         AND COALESCE(deadline, end_date) ~ $1
         AND COALESCE(deadline, end_date)::timestamptz < NOW() - ($2 || ' days')::INTERVAL
       )
    `;
    const unstopRes = await pgPool.query(unstopDeleteSql, ['^[0-9]{4}-[0-9]{2}-[0-9]{2}', String(days)]);

    // 2. Delete Devpost events completed 7+ days ago
    const { rows: devpostRows } = await pgPool.query(
      'SELECT id, submission_period, status, updated_at FROM devpost_events'
    );
    const now = new Date();
    const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const expiredDevpostIds = [];

    for (const row of devpostRows) {
      const endDate = parseDevpostEndDate(row.submission_period);
      if (endDate) {
        if (endDate < threshold) {
          expiredDevpostIds.push(row.id);
        }
      } else if (row.status === 'ended' && row.updated_at && new Date(row.updated_at) < threshold) {
        expiredDevpostIds.push(row.id);
      }
    }

    let devpostDeleted = 0;
    if (expiredDevpostIds.length > 0) {
      const devpostRes = await pgPool.query(
        'DELETE FROM devpost_events WHERE id = ANY($1::bigint[])',
        [expiredDevpostIds]
      );
      devpostDeleted = devpostRes.rowCount || 0;
    }

    return {
      unstopDeleted: unstopRes.rowCount || 0,
      devpostDeleted,
      totalDeleted: (unstopRes.rowCount || 0) + devpostDeleted,
    };
  } catch (err) {
    console.error('Error deleting expired hackathons:', err.message);
    return { unstopDeleted: 0, devpostDeleted: 0, totalDeleted: 0, error: err.message };
  }
}

/**
 * Runs the complete ingestion pipeline across both Devpost and Unstop,
 * upserting fresh live records into the PostgreSQL database.
 */
export async function runHackathonsPipeline({
  devpostPages = 5,
  unstopPages = 2,
  unstopPerPage = 50,
} = {}) {
  const startTime = Date.now();

  // First, delete completed events from 7+ days ago and clean any placeholder rows
  let deletedStats = { unstopDeleted: 0, devpostDeleted: 0, totalDeleted: 0 };
  try {
    await pgPool.query('DELETE FROM unstop_events WHERE title IS NULL');
    await pgPool.query('DELETE FROM devpost_events WHERE title IS NULL');
    deletedStats = await deleteExpiredHackathons({ days: 7 });
  } catch (_) {}

  // Run both fetchers in parallel
  const [devpostRes, unstopRes] = await Promise.allSettled([
    fetchDevpostHackathons({ maxPages: devpostPages }),
    fetchUnstopHackathons({ perPage: unstopPerPage, maxPages: unstopPages }),
  ]);

  const devpost = devpostRes.status === 'fulfilled'
    ? devpostRes.value
    : { attempted: 0, upserted: 0, errors: [devpostRes.reason?.message || 'Devpost pipeline failed'] };

  const unstop = unstopRes.status === 'fulfilled'
    ? unstopRes.value
    : { attempted: 0, upserted: 0, errors: [unstopRes.reason?.message || 'Unstop pipeline failed'] };

  // Fetch final total live counts from PostgreSQL
  let totalDevpostInDb = 0;
  let totalUnstopInDb = 0;
  try {
    const dCount = await pgPool.query('SELECT COUNT(*) FROM devpost_events');
    const uCount = await pgPool.query('SELECT COUNT(*) FROM unstop_events');
    totalDevpostInDb = parseInt(dCount.rows[0].count, 10);
    totalUnstopInDb = parseInt(uCount.rows[0].count, 10);
  } catch (_) {}

  const durationMs = Date.now() - startTime;

  return {
    success: true,
    timestamp: new Date().toISOString(),
    durationMs,
    devpost: {
      attempted: devpost.attempted,
      upserted: devpost.upserted,
      totalInDatabase: totalDevpostInDb,
      errors: devpost.errors.slice(0, 5),
    },
    unstop: {
      attempted: unstop.attempted,
      upserted: unstop.upserted,
      totalInDatabase: totalUnstopInDb,
      errors: unstop.errors.slice(0, 5),
    },
    deletedExpired: deletedStats,
    totalUpserted: devpost.upserted + unstop.upserted,
    totalInDatabase: totalDevpostInDb + totalUnstopInDb,
  };
}
