import {
  json,
  getJson,
  getAuthUser,
  normalizeMode,
  hasStorage,
  storageMissing,
  getWeekKeyUtc,
  communityContributionKey,
  getBoardRows,
  friendsKey,
} from './_lib.js';

function publicRow(row) {
  return {
    userId: row.userId,
    username: row.username,
    wpm: row.wpm,
    rawWpm: row.rawWpm,
    accuracy: row.accuracy,
    consistency: row.consistency,
    time: row.time,
    mode: row.mode,
    date: row.date,
    level: row.level,
    title: String(row.title || ''),
  };
}

// Keeps one row per user (their best across the selected modes) so the board is a list of people.
function bestPerUser(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (seen.has(row.userId)) continue;
    seen.add(row.userId);
    out.push(row);
  }
  return out;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return storageMissing();
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get('limit') || 100)));
  const tabParam = (url.searchParams.get('tab') || '').trim().toLowerCase();
  const community = url.searchParams.get('community') === '1' || tabParam === 'community';
  const modeParam = (url.searchParams.get('mode') || '').trim().toLowerCase();
  const mode = modeParam && modeParam !== 'all' ? normalizeMode(modeParam) : 'all';
  const weekKey = getWeekKeyUtc();

  if (community) {
    const contribKey = communityContributionKey(weekKey);
    const state = await getJson(env, contribKey, { week: weekKey, entries: {} });
    const entries = (state && typeof state.entries === 'object' && !Array.isArray(state.entries))
      ? state.entries
      : {};
    const contributions = Object.values(entries)
      .map((row) => ({
        id: String(row.id || ''),
        username: String(row.username || 'Unknown'),
        damage: Math.max(0, Math.floor(Number(row.damage) || 0)),
      }))
      .filter((row) => row.damage > 0)
      .sort((a, b) => b.damage - a.damage || a.username.localeCompare(b.username))
      .slice(0, limit);
    return json({ week: weekKey, weekKey, contributions }, 200);
  }

  const tab = tabParam === 'weekly' ? 'weekly' : tabParam === 'friends' ? 'friends' : 'alltime';
  const me = await getAuthUser(request, env);
  if (tab === 'friends' && !me) return json({ error: 'Log in to see your friends board' }, 401);

  const allRows = bestPerUser(await getBoardRows(env, tab === 'weekly' ? 'weekly' : 'alltime', mode, weekKey));
  let rows = allRows;
  if (tab === 'friends') {
    const ids = await getJson(env, friendsKey(me.id), []);
    const allowed = new Set([String(me.id), ...(Array.isArray(ids) ? ids.map(String) : [])]);
    rows = allRows.filter((row) => allowed.has(String(row.userId)));
  }

  let yourRank = null;
  if (me) {
    const idx = rows.findIndex((row) => String(row.userId) === String(me.id));
    if (idx >= 0) yourRank = { rank: idx + 1, wpm: rows[idx].wpm, total: rows.length };
  }

  const out = rows.slice(0, limit).map(publicRow);
  return json({
    rows: out,
    leaderboard: out, // older client code reads this name
    tab,
    mode,
    weekKey,
    total: rows.length,
    yourRank,
  }, 200);
}
