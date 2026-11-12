import {
  json,
  getAuthUser,
  getJson,
  putJson,
  hasStorage,
  storageMissing,
  progressKey,
  xpDayKey,
  isAdminUser,
  touchLastSeen,
  formatDateKeyUtc,
  parseJsonSafe,
  BADGE_IDS,
  DAILY_IDS,
  WEEKLY_IDS,
  XP_PER_LEVEL,
  MAX_LEVEL,
  HttpError,
} from './_lib.js';

const MAX_PROGRESS_BYTES = 256 * 1024;
const MAX_XP = XP_PER_LEVEL * MAX_LEVEL; // level 100
const XP_DELTA_PER_PUT = 3000;
const XP_DELTA_PER_DAY = 10000;
const MAX_HISTORY_ROWS = 50;

// Every localStorage key the client is allowed to sync. Anything else is dropped.
export const KNOWN_PROGRESS_KEYS = [
  'sampire-typing-history',
  'sampire-xp',
  'sampire-lifetime-challenges-completed',
  'sampire-lifetime-tests-completed',
  'sampire-lifetime-words-typed',
  'sampire-lifetime-time-seconds',
  'sampire-lifetime-best-wpm',
  'sampire-lifetime-bible-tests-completed',
  'sampire-streak',
  'sampire-badges',
  'sampire-daily',
  'sampire-daily-v2',
  'sampire-weekly',
  'sampire-weekly-rival-target',
  'sampire-skill-points',
  'sampire-skills',
  'sampire-reward-settings',
  'sampire-active-soundscape',
  'sampire-music-muted',
  'sampire-music-volume',
  'sampire-key-sounds-enabled',
  'sampire-key-sound-volume',
  'sampire-mining-visuals-enabled',
  'sampire-mining-laser-sound-enabled',
  'sampire-bible-mode',
  'sampire-key-sound-pack',
  'sampire-mining-state-v1',
  'sampire-weekly-words',
  'sampire-friends-cache',
  'sampire-daily-stats',
  'sampire-lifetime-counters',
  'sampire-crystal-ledger',
  'sampire-title',
  'sampire-weekly-recap-seen',
  'sampire-coach',
];

const INT_RANGES = {
  'sampire-xp': [0, MAX_XP],
  'sampire-lifetime-challenges-completed': [0, 1000000],
  'sampire-lifetime-tests-completed': [0, 10000000],
  'sampire-lifetime-words-typed': [0, 1000000000],
  'sampire-lifetime-time-seconds': [0, 1000000000],
  'sampire-lifetime-best-wpm': [0, 300],
  'sampire-lifetime-bible-tests-completed': [0, 10000000],
  'sampire-skill-points': [0, 500],
};

function clampIntString(raw, min, max) {
  const n = Math.floor(Number(String(raw == null ? '' : raw).trim()));
  if (!Number.isFinite(n)) return String(min);
  return String(Math.min(max, Math.max(min, n)));
}

function hasBadNumbers(value, depth = 0) {
  if (depth > 10) return true;
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some((v) => hasBadNumbers(v, depth + 1));
  if (value && typeof value === 'object') return Object.values(value).some((v) => hasBadNumbers(v, depth + 1));
  return false;
}

// Cleans one snapshot. Returns { progress, notes } where notes lists what was changed or dropped.
export function sanitizeProgress(input, options = {}) {
  const notes = [];
  const out = {};
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  for (const [key, raw] of Object.entries(src)) {
    if (!KNOWN_PROGRESS_KEYS.includes(key)) { notes.push(`dropped unknown key ${key}`); continue; }
    if (raw == null) continue;
    if (typeof raw !== 'string') { notes.push(`dropped non-string value for ${key}`); continue; }
    out[key] = raw;
  }

  for (const [key, [min, max]] of Object.entries(INT_RANGES)) {
    if (out[key] == null) continue;
    const clamped = clampIntString(out[key], min, max);
    if (clamped !== String(out[key]).trim()) notes.push(`clamped ${key}`);
    out[key] = clamped;
  }

  const jsonKeys = ['sampire-typing-history', 'sampire-streak', 'sampire-badges', 'sampire-daily', 'sampire-daily-v2', 'sampire-weekly',
    'sampire-weekly-rival-target', 'sampire-skills', 'sampire-reward-settings', 'sampire-mining-state-v1', 'sampire-weekly-words', 'sampire-friends-cache',
    'sampire-daily-stats', 'sampire-lifetime-counters', 'sampire-crystal-ledger', 'sampire-title', 'sampire-coach'];
  for (const key of jsonKeys) {
    if (out[key] == null) continue;
    const parsed = parseJsonSafe(out[key], undefined);
    if (parsed === undefined || hasBadNumbers(parsed)) { delete out[key]; notes.push(`dropped invalid JSON in ${key}`); }
  }

  if (out['sampire-badges'] != null) {
    const rows = parseJsonSafe(out['sampire-badges'], []);
    const seen = new Set();
    const cleaned = [];
    for (const entry of Array.isArray(rows) ? rows : []) {
      const id = typeof entry === 'string' ? entry : String(entry && entry.id || '');
      if (!BADGE_IDS.includes(id) || seen.has(id)) { if (id && !BADGE_IDS.includes(id)) notes.push(`dropped unknown badge ${id}`); continue; }
      seen.add(id);
      const earnedAt = Number(entry && entry.earnedAt);
      cleaned.push({ id, earnedAt: Number.isFinite(earnedAt) && earnedAt > 0 ? Math.floor(earnedAt) : null });
    }
    out['sampire-badges'] = JSON.stringify(cleaned);
  }

  if (out['sampire-streak'] != null) {
    const s = parseJsonSafe(out['sampire-streak'], {});
    const streak = Math.min(100000, Math.max(0, Math.floor(Number(s && s.streak) || 0)));
    const lastPlayDate = /^\d{4}-\d{2}-\d{2}$/.test(String(s && s.lastPlayDate || '')) ? String(s.lastPlayDate) : '';
    const freezes = Math.min(2, Math.max(0, Math.floor(Number(s && s.freezes) || 0)));
    out['sampire-streak'] = JSON.stringify({ lastPlayDate, streak, freezes });
  }

  // Crystal ledger: balance is derived on the client from levels + words + bonus - spent.
  if (out['sampire-crystal-ledger'] != null) {
    const l = parseJsonSafe(out['sampire-crystal-ledger'], {});
    const spent = Math.min(1000000, Math.max(0, Math.floor(Number(l && l.spent) || 0)));
    const bonus = Math.min(1000000, Math.max(0, Math.floor(Number(l && l.bonus) || 0)));
    out['sampire-crystal-ledger'] = JSON.stringify({ spent, bonus });
  }

  if (out['sampire-lifetime-counters'] != null) {
    const c = parseJsonSafe(out['sampire-lifetime-counters'], {});
    const clampCount = (v) => Math.min(100000000, Math.max(0, Math.floor(Number(v) || 0)));
    out['sampire-lifetime-counters'] = JSON.stringify({ daysPlayed: clampCount(c && c.daysPlayed), perfectRuns: clampCount(c && c.perfectRuns), countedRuns: clampCount(c && c.countedRuns) });
  }

  if (out['sampire-title'] != null) {
    const t = parseJsonSafe(out['sampire-title'], {});
    const str = (v) => String(v == null ? '' : v).slice(0, 64);
    out['sampire-title'] = JSON.stringify({ title: str(t && t.title), nameColor: str(t && t.nameColor), caretColor: str(t && t.caretColor), trailColor: str(t && t.trailColor), nameColorValue: str(t && t.nameColorValue) });
  }

  // The recap marker is a plain week key, not JSON.
  if (out['sampire-weekly-recap-seen'] != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(out['sampire-weekly-recap-seen']).trim())) {
    delete out['sampire-weekly-recap-seen'];
    notes.push('dropped invalid sampire-weekly-recap-seen');
  }

  if (out['sampire-typing-history'] != null) {
    const rows = parseJsonSafe(out['sampire-typing-history'], []);
    const cleaned = (Array.isArray(rows) ? rows : [])
      .filter((r) => r && typeof r === 'object')
      .slice(0, MAX_HISTORY_ROWS)
      .map((r) => ({ ...r, wpm: Math.min(300, Math.max(0, Number(r.wpm) || 0)), text: String(r.text || '').slice(0, 2000) }));
    if (Array.isArray(rows) && rows.length > MAX_HISTORY_ROWS) notes.push('trimmed history to 50 rows');
    out['sampire-typing-history'] = JSON.stringify(cleaned);
  }

  if (out['sampire-daily-v2'] != null) {
    const v2 = parseJsonSafe(out['sampire-daily-v2'], {});
    const days = v2 && typeof v2.days === 'object' && v2.days ? v2.days : {};
    const cleanDays = {};
    for (const [day, row] of Object.entries(days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const list = Array.isArray(row) ? row : (row && Array.isArray(row.completions) ? row.completions : []);
      cleanDays[day] = [...new Set(list.map(String).filter((id) => DAILY_IDS.includes(id)))];
    }
    out['sampire-daily-v2'] = JSON.stringify({ days: cleanDays });
  }

  if (out['sampire-weekly'] != null) {
    const w = parseJsonSafe(out['sampire-weekly'], {});
    const week = /^\d{4}-\d{2}-\d{2}$/.test(String(w && w.week || '')) ? String(w.week) : '';
    const completions = [...new Set((Array.isArray(w && w.completions) ? w.completions : []).map(String).filter((id) => WEEKLY_IDS.includes(id)))];
    out['sampire-weekly'] = JSON.stringify({ week, completions });
  }

  if (out['sampire-skills'] != null) {
    const s = parseJsonSafe(out['sampire-skills'], {});
    const packs = {};
    for (const [id, on] of Object.entries(s && s.keySoundPacks && typeof s.keySoundPacks === 'object' ? s.keySoundPacks : {})) {
      packs[String(id).slice(0, 64)] = !!on;
    }
    const cosmetics = {};
    for (const [id, on] of Object.entries(s && s.cosmetics && typeof s.cosmetics === 'object' ? s.cosmetics : {})) {
      cosmetics[String(id).slice(0, 64)] = !!on;
    }
    out['sampire-skills'] = JSON.stringify({ aura: !!(s && s.aura), soundscapes: !!(s && s.soundscapes), nebulaTrail: !!(s && s.nebulaTrail), keySoundPacks: packs, cosmetics });
  }

  return { progress: out, notes };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return storageMissing();
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const payload = await getJson(env, progressKey(user.id), { progress: {}, updatedAt: 0 });
  return json({
    progress: (payload && payload.progress && typeof payload.progress === 'object') ? payload.progress : {},
    updatedAt: Number(payload && payload.updatedAt) || 0,
  }, 200);
}

export async function onRequestPut(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return storageMissing();
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_PROGRESS_BYTES) throw new HttpError(413, 'Progress payload too large', 'PAYLOAD_TOO_LARGE');
  let rawBody = '';
  try { rawBody = await request.text(); } catch { rawBody = ''; }
  if (rawBody.length > MAX_PROGRESS_BYTES) throw new HttpError(413, 'Progress payload too large', 'PAYLOAD_TOO_LARGE');
  let body = {};
  try { body = JSON.parse(rawBody); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid progress payload' }, 400);
  const existing = await getJson(env, progressKey(user.id), { progress: {}, updatedAt: 0 });
  const existingUpdatedAt = Number(existing && existing.updatedAt) || 0;
  const existingProgress = (existing && existing.progress && typeof existing.progress === 'object') ? existing.progress : {};
  const baseUpdatedAtRaw = Number(body && body.baseUpdatedAt);
  const baseUpdatedAt = Number.isFinite(baseUpdatedAtRaw) ? Math.max(0, Math.floor(baseUpdatedAtRaw)) : 0;
  if (baseUpdatedAt < existingUpdatedAt) {
    return json({
      error: 'Progress conflict: newer progress exists on another session.',
      progress: existingProgress,
      updatedAt: existingUpdatedAt,
    }, 409);
  }

  const incoming = (body && body.progress && typeof body.progress === 'object' && !Array.isArray(body.progress))
    ? body.progress
    : null;
  if (!incoming) return json({ error: 'Progress must be an object' }, 400);
  const { progress, notes } = sanitizeProgress(incoming);

  // XP can only grow so fast per save and per day unless an admin is doing it.
  if (!isAdminUser(user, env) && progress['sampire-xp'] != null) {
    const prevXp = Math.max(0, parseInt(existingProgress['sampire-xp'] || '0', 10) || 0);
    const nextXp = Math.max(0, parseInt(progress['sampire-xp'] || '0', 10) || 0);
    const delta = nextXp - prevXp;
    if (delta > 0) {
      const dayKey = formatDateKeyUtc(new Date());
      const dayState = await getJson(env, xpDayKey(user.id, dayKey), { xp: 0 });
      const usedToday = Math.max(0, Number(dayState && dayState.xp) || 0);
      const allowed = Math.max(0, Math.min(XP_DELTA_PER_PUT, XP_DELTA_PER_DAY - usedToday));
      const granted = Math.min(delta, allowed);
      if (granted < delta) {
        progress['sampire-xp'] = String(prevXp + granted);
        notes.push(`xp gain limited to ${granted} (per-save cap ${XP_DELTA_PER_PUT}, daily cap ${XP_DELTA_PER_DAY})`);
      }
      if (granted > 0) await putJson(env, xpDayKey(user.id, dayKey), { xp: usedToday + granted }, { expirationTtl: 2 * 24 * 60 * 60 });
    }
  }

  const updatedAt = Date.now();
  await putJson(env, progressKey(user.id), { progress, updatedAt });
  await touchLastSeen(env, user.id);
  const out = { ok: true, updatedAt };
  if (notes.length) { out.clamped = notes; out.progress = progress; }
  return json(out, 200);
}
