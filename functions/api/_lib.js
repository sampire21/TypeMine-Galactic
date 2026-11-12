export const ACCESS_SESSION_TTL_MS = 1000 * 60 * 15;
export const REFRESH_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const SESSION_COOKIE_NAME = 'sampire_session';
const REFRESH_COOKIE_NAME = 'sampire_refresh';

export const MAX_JSON_BODY_BYTES = 64 * 1024;
export const WEEK_SECONDS = 7 * 24 * 60 * 60;
export const WEEKLY_KEY_TTL_SECONDS = 5 * WEEK_SECONDS;
export const XP_PER_LEVEL = 500;
export const MAX_LEVEL = 100;
export const KNOWN_MODES = ['quotes', 'words', 'words30', 'words15', 'words60', 'words120'];
export const TIMED_MODE_SECONDS = { words30: 30, words15: 15, words60: 60, words120: 120 };

// Badge ids must match BADGE_DEFS in js/app-progression.js. The tiered ids come first so an admin
// "set achievements to N" hands out the low tiers first. The trailing legacy ids are kept so old
// saves are not stripped before the client migrates them (LEGACY_BADGE_IDS in app-progression.js).
export const BADGE_IDS = [
  'runs_50', 'runs_250', 'runs_1000',
  'words_10k', 'words_50k', 'words_250k',
  'days_7', 'days_30', 'days_100',
  'quests_10', 'quests_50', 'quests_200',
  'perfect_10', 'perfect_50',
  'speed_60', 'speed_80', 'speed_100', 'speed_120',
  'triple_crown', 'fleet_defender', 'founder', 'human_lectionary',
  // legacy ids from the old badge scheme
  'sonic_boom', 'speed_demon', 'flawless', 'midnight_oil', 'streak_master', 'marathon', 'consistent_climber', 'above_average', 'aura', 'soundscapes',
];
// Quest ids must match DAILY_QUEST_POOL and WEEKLY_QUESTS in js/app-progression.js (old ids kept at the end).
export const DAILY_IDS = [
  'runs_5', 'daily_quotes_5', 'words_500', 'acc_96', 'drills_3', 'nobackspace', 'beat_avg', 'beat_yesterday',
  'sprint', 'perfectionist', 'daily_words_5', 'daily_words30_5',
];
export const WEEKLY_IDS = ['marathon', 'days_5', 'beat_last_week', 'runs95_10', 'above_average', 'consistent_climber', 'rival_week'];

export class HttpError extends Error {
  constructor(status, message, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(data, status = 200, extraHeaders = null) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'geolocation=(), microphone=(), camera=()',
    'cross-origin-resource-policy': 'same-origin',
  });
  if (extraHeaders) {
    const incoming = extraHeaders instanceof Headers ? extraHeaders : new Headers(extraHeaders);
    for (const [key, value] of incoming.entries()) headers.append(key, value);
  }
  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

// Reads a JSON body of at most maxBytes. Throws HttpError(413) when the body is too big,
// which worker.js turns into a 413 response. Invalid or empty JSON becomes {}.
export async function readJson(request, maxBytes = MAX_JSON_BODY_BYTES) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new HttpError(413, 'Request body too large', 'PAYLOAD_TOO_LARGE');
  let text = '';
  try {
    text = await request.text();
  } catch {
    return {};
  }
  if (text.length > maxBytes) throw new HttpError(413, 'Request body too large', 'PAYLOAD_TOO_LARGE');
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

export function validateUsername(usernameRaw) {
  const username = String(usernameRaw || '').trim();
  const normalized = normalizeUsername(username);
  if (!normalized || normalized.length < 3 || normalized.length > 24 || !/^[a-z0-9_]+$/.test(normalized)) {
    return { ok: false, error: 'Username must be 3-24 chars: a-z, 0-9, _' };
  }
  return { ok: true, username, normalized };
}

export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;

export function validatePassword(passwordRaw) {
  const password = String(passwordRaw == null ? '' : passwordRaw);
  if (password.length < PASSWORD_MIN_LENGTH) return { ok: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` };
  if (password.length > PASSWORD_MAX_LENGTH) return { ok: false, error: `Password must be at most ${PASSWORD_MAX_LENGTH} characters` };
  return { ok: true, password };
}

function utf8Bytes(value) {
  return new TextEncoder().encode(String(value));
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64Url(base64) {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad === 0) return base64;
  return base64 + '='.repeat(4 - pad);
}

function bytesToBase64Url(bytes) {
  return toBase64Url(bytesToBase64(bytes));
}

function stringToBase64Url(value) {
  return bytesToBase64Url(utf8Bytes(value));
}

function base64UrlToString(value) {
  const bytes = base64ToBytes(fromBase64Url(value));
  return new TextDecoder().decode(bytes);
}

export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export function getSecret(env) {
  const secret = String((env && env.TOKEN_SECRET) || '');
  if (!secret) throw new Error('TOKEN_SECRET environment variable is not set. Set it in your Cloudflare Worker settings.');
  if (secret.length < 16) throw new Error('TOKEN_SECRET is too short. Use at least 16 characters (32 or more is better).');
  return secret;
}

export function hasStorage(env) {
  return !!(env && env.TYPING_APP);
}

export async function hashPassword(password, saltBase64 = null) {
  const salt = saltBase64
    ? base64ToBytes(saltBase64)
    : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', utf8Bytes(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    key,
    256
  );
  return {
    salt: bytesToBase64(salt),
    hash: bytesToBase64(new Uint8Array(bits)),
  };
}

// A fixed salt used only to burn the same CPU time when the username does not exist,
// so a login attempt takes the same time whether or not the account is real.
const DUMMY_SALT_BASE64 = 'AAAAAAAAAAAAAAAAAAAAAA==';
export async function burnPasswordHashTime(password) {
  try { await hashPassword(String(password || ''), DUMMY_SALT_BASE64); } catch {}
}

async function hmacSign(input, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    utf8Bytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, utf8Bytes(input));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function createToken(payloadObj, secret) {
  const payload = stringToBase64Url(JSON.stringify(payloadObj));
  const sig = await hmacSign(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifyToken(token, secret) {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = await hmacSign(payload, secret);
  if (!constantTimeEqual(sig, expectedSig)) return null;
  try {
    const parsed = JSON.parse(base64UrlToString(payload));
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function publicUser(user, env = null) {
  return {
    id: user.id,
    username: user.username,
    createdAt: Number(user.createdAt) || null,
    isAdmin: env ? isAdminUser(user, env) : false,
  };
}

export async function getAuthUser(request, env) {
  const payload = await verifyAccessTokenFromRequest(request, env);
  if (!payload || !payload.uid) return null;
  let session = null;
  if (payload.sid && hasStorage(env)) {
    session = await getJson(env, authSessionKey(payload.sid), null);
    if (!session || session.revoked) return null;
    if (String(session.uid || '') !== String(payload.uid || '')) return null;
    if (Number(session.refreshExp) > 0 && Date.now() > Number(session.refreshExp)) return null;
  }
  const user = await getJson(env, `user:${payload.uid}`);
  if (!user) return null;
  // Password change/reset sets sessionsValidAfter; older sessions are no longer valid.
  if (payload.sid && Number(user.sessionsValidAfter) > 0) {
    if (!session || Number(session.createdAt) < Number(user.sessionsValidAfter)) return null;
  }
  return user;
}

export function isAdminUser(user, env) {
  if (!user) return false;
  const adminUserId = String((env && env.ADMIN_USER_ID) || '').trim();
  if (adminUserId && String(user.id || '') === adminUserId) return true;
  // No default username: without explicit config, nobody is admin.
  const adminUsername = normalizeUsername((env && env.ADMIN_USERNAME) || '');
  if (!adminUsername) return false;
  return normalizeUsername(user.usernameNorm || user.username || '') === adminUsername;
}

export async function requireAdmin(request, env) {
  const user = await getAuthUser(request, env);
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };
  if (!isAdminUser(user, env)) return { ok: false, status: 403, error: 'Forbidden' };
  return { ok: true, user };
}

export async function getJson(env, key, fallback = null) {
  if (!hasStorage(env)) return fallback;
  const raw = await env.TYPING_APP.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function putJson(env, key, value, options = null) {
  if (!hasStorage(env)) return;
  if (options) await env.TYPING_APP.put(key, JSON.stringify(value), options);
  else await env.TYPING_APP.put(key, JSON.stringify(value));
}

export async function deleteKey(env, key) {
  if (!hasStorage(env)) return;
  try { await env.TYPING_APP.delete(key); } catch {}
}

// ---------------------------------------------------------------------------
// KV key layout (see CLOUDFLARE_SETUP.md for the plain-English version)
// ---------------------------------------------------------------------------
export function userScoreKey(userId) {
  return `scores:user:${userId}`;
}

export function progressKey(userId) {
  return `progress:user:${userId}`;
}

export function lastSeenKey(userId) {
  return `seen:v1:${userId}`;
}

export function allTimeBestKey(mode, userId) {
  return `lb:v1:${mode}:${userId}`;
}

export function allTimeBestPrefix(mode) {
  return `lb:v1:${mode}:`;
}

export function weeklyBestKey(weekKey, mode, userId) {
  return `lbw:v1:${weekKey}:${mode}:${userId}`;
}

export function weeklyBestPrefix(weekKey, mode) {
  return `lbw:v1:${weekKey}:${mode}:`;
}

export function flaggedScoreKey(scoreId) {
  return `flagged:v1:${scoreId}`;
}

export const FLAGGED_PREFIX = 'flagged:v1:';

export function friendsKey(userId) {
  return `friends:${userId}`;
}

export function contributionTotalKey(userId) {
  return `contrib-total:v1:${userId}`;
}

export function xpDayKey(userId, dateKey) {
  return `xpday:v1:${userId}:${dateKey}`;
}

export function formatDateKeyUtc(dateObj) {
  const y = dateObj.getUTCFullYear();
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getWeekKeyUtc(baseDateMs = Date.now()) {
  const d = new Date(Number(baseDateMs) || Date.now());
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return formatDateKeyUtc(d);
}

export function communityContributionKey(weekKey) {
  return `community-contrib:v1:${String(weekKey || getWeekKeyUtc())}`;
}

// ---------------------------------------------------------------------------
// "Last seen" without rewriting the user record. Written at most once an hour.
// ---------------------------------------------------------------------------
const LAST_SEEN_WRITE_INTERVAL_MS = 60 * 60 * 1000;
const lastSeenMemory = new Map();

export async function touchLastSeen(env, userId, nowMs = Date.now()) {
  if (!hasStorage(env) || !userId) return;
  const now = Number(nowMs) || Date.now();
  const remembered = Number(lastSeenMemory.get(userId)) || 0;
  if (now - remembered < LAST_SEEN_WRITE_INTERVAL_MS) return;
  const stored = await getJson(env, lastSeenKey(userId), null);
  const storedAt = Number(stored && stored.t) || 0;
  if (now - storedAt < LAST_SEEN_WRITE_INTERVAL_MS) {
    lastSeenMemory.set(userId, storedAt);
    return;
  }
  await putJson(env, lastSeenKey(userId), { t: now }, { expirationTtl: 60 * 60 * 24 * 30 });
  lastSeenMemory.set(userId, now);
}

export async function getLastSeenAt(env, user, progressPayload = null) {
  const stored = await getJson(env, lastSeenKey(user && user.id), null);
  return Math.max(
    Number(user && user.lastSeenAt) || 0,
    Number(user && user.lastLoginAt) || 0,
    Number(stored && stored.t) || 0,
    Number(progressPayload && progressPayload.updatedAt) || 0
  );
}

// ---------------------------------------------------------------------------
// Progress helpers shared by several handlers
// ---------------------------------------------------------------------------
export function parseJsonSafe(raw, fallback) {
  try {
    const parsed = JSON.parse(raw || '');
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function progressOf(progressPayload) {
  return (progressPayload && progressPayload.progress && typeof progressPayload.progress === 'object' && !Array.isArray(progressPayload.progress))
    ? progressPayload.progress
    : {};
}

export function xpOf(progress) {
  return Math.max(0, parseInt((progress && progress['sampire-xp']) || '0', 10) || 0);
}

export function levelFromXp(xp) {
  return Math.min(MAX_LEVEL, Math.floor((Number(xp) || 0) / XP_PER_LEVEL) + 1);
}

export function streakOf(progress) {
  const streak = parseJsonSafe(progress && progress['sampire-streak'] || '{}', {});
  return Math.max(0, Math.floor(Number(streak && streak.streak) || 0));
}

// Reads daily completions in both shapes: days[key] = [ids] (client) and days[key] = { completions: [ids] } (old admin).
export function dailyCompletionsForDay(dailyObj, dayKey) {
  if (!dailyObj || typeof dailyObj !== 'object') return [];
  const days = dailyObj.days && typeof dailyObj.days === 'object' ? dailyObj.days : {};
  const row = days[dayKey];
  if (Array.isArray(row)) return row.map(String);
  if (row && Array.isArray(row.completions)) return row.completions.map(String);
  return [];
}

export function dailyCompletionsTotal(dailyObj) {
  if (!dailyObj || typeof dailyObj !== 'object') return 0;
  if (Array.isArray(dailyObj.completions)) return dailyObj.completions.length;
  const days = dailyObj.days && typeof dailyObj.days === 'object' ? dailyObj.days : {};
  return Object.keys(days).reduce((sum, key) => sum + dailyCompletionsForDay(dailyObj, key).length, 0);
}

export function dailyCompletionsLatestDay(dailyObj) {
  if (!dailyObj || typeof dailyObj !== 'object') return 0;
  if (Array.isArray(dailyObj.completions)) return dailyObj.completions.length;
  const days = dailyObj.days && typeof dailyObj.days === 'object' ? dailyObj.days : {};
  const keys = Object.keys(days).sort();
  if (!keys.length) return 0;
  return dailyCompletionsForDay(dailyObj, keys[keys.length - 1]).length;
}

// ---------------------------------------------------------------------------
// Score rows and leaderboards
// ---------------------------------------------------------------------------
export function compactScoreRow(row) {
  return {
    id: String(row.id || ''),
    userId: String(row.userId || ''),
    username: String(row.username || ''),
    wpm: Number(row.wpm) || 0,
    rawWpm: Number(row.rawWpm) || 0,
    accuracy: Number(row.accuracy) || 0,
    consistency: Number(row.consistency) || 0,
    time: Number(row.time) || 0,
    mode: String(row.mode || 'quotes'),
    date: Number(row.date) || 0,
    level: Math.max(1, Math.floor(Number(row.level) || 1)),
    title: String(row.title || '').slice(0, 24),
    flagged: !!row.flagged,
  };
}

export function isBetterScore(candidate, baseline) {
  if (!baseline) return true;
  if ((candidate.wpm || 0) > (baseline.wpm || 0)) return true;
  if ((candidate.wpm || 0) < (baseline.wpm || 0)) return false;
  if ((candidate.accuracy || 0) > (baseline.accuracy || 0)) return true;
  if ((candidate.accuracy || 0) < (baseline.accuracy || 0)) return false;
  // Tie: the earlier run keeps its place.
  return (candidate.date || 0) < (baseline.date || 0);
}

export function sortBoardRows(rows) {
  return rows.sort((a, b) => (b.wpm - a.wpm) || (b.accuracy - a.accuracy) || (a.date - b.date) || a.username.localeCompare(b.username));
}

// Writes the best-row key. The compact row is also stored as KV metadata so list() returns
// everything in one call and the leaderboard never has to get() each key.
export async function putBestRow(env, key, row, options = null) {
  const compact = compactScoreRow(row);
  const opts = { metadata: compact, ...(options || {}) };
  await env.TYPING_APP.put(key, JSON.stringify(compact), opts);
}

export async function listBestRows(env, prefix) {
  const rows = [];
  let cursor;
  do {
    const page = await env.TYPING_APP.list({ prefix, cursor, limit: 1000 });
    for (const entry of (page && page.keys) || []) {
      const name = String(entry && entry.name || '');
      if (!name) continue;
      let row = entry && entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : null;
      if (!row) row = await getJson(env, name, null);
      if (!row || !row.userId) continue;
      rows.push(compactScoreRow(row));
    }
    cursor = page && !page.list_complete ? page.cursor : undefined;
  } while (cursor);
  return rows;
}

// Leaderboards are rebuilt from the per-user keys and cached inside this isolate for 30 s.
const BOARD_CACHE_TTL_MS = 30 * 1000;
const boardCache = new Map();

export async function getBoardRows(env, tab, mode, weekKey = getWeekKeyUtc()) {
  const modes = mode && mode !== 'all' ? [mode] : KNOWN_MODES;
  const cacheKey = `${tab}:${weekKey}:${modes.join(',')}`;
  const cached = boardCache.get(cacheKey);
  if (cached && Date.now() - cached.at < BOARD_CACHE_TTL_MS) return cached.rows;
  let rows = [];
  for (const m of modes) {
    const prefix = tab === 'weekly' ? weeklyBestPrefix(weekKey, m) : allTimeBestPrefix(m);
    rows = rows.concat(await listBestRows(env, prefix));
  }
  rows = sortBoardRows(rows.filter((row) => !row.flagged));
  boardCache.set(cacheKey, { at: Date.now(), rows });
  return rows;
}

export function invalidateBoardCache() {
  boardCache.clear();
}

export function createAccessSessionPayload(userId, sessionId) {
  return {
    uid: String(userId || ''),
    sid: String(sessionId || ''),
    typ: 'access',
    exp: Date.now() + ACCESS_SESSION_TTL_MS,
  };
}

export function createRefreshSessionPayload(userId, sessionId, refreshJti) {
  return {
    uid: String(userId || ''),
    sid: String(sessionId || ''),
    jti: String(refreshJti || ''),
    typ: 'refresh',
    exp: Date.now() + REFRESH_SESSION_TTL_MS,
  };
}

export function createSessionPayload(userId) {
  // Legacy compatibility for older callsites.
  return createAccessSessionPayload(userId, '');
}

function parseCookieHeader(rawCookie) {
  const out = {};
  const parts = String(rawCookie || '').split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

export function getAuthTokenFromRequest(request) {
  const rawCookie = request && request.headers ? request.headers.get('cookie') : '';
  const cookies = parseCookieHeader(rawCookie);
  const cookieToken = String(cookies[SESSION_COOKIE_NAME] || '').trim();
  if (cookieToken) return cookieToken;
  const auth = request && request.headers ? (request.headers.get('authorization') || '') : '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

export function getRefreshTokenFromRequest(request) {
  const rawCookie = request && request.headers ? request.headers.get('cookie') : '';
  const cookies = parseCookieHeader(rawCookie);
  return String(cookies[REFRESH_COOKIE_NAME] || '').trim();
}

export async function verifyAccessTokenFromRequest(request, env) {
  const token = getAuthTokenFromRequest(request);
  if (!token) return null;
  const payload = await verifyToken(token, getSecret(env));
  if (!payload || !payload.uid) return null;
  if (payload.typ && payload.typ !== 'access') return null;
  return payload;
}

export async function verifyRefreshTokenFromRequest(request, env) {
  const token = getRefreshTokenFromRequest(request);
  if (!token) return null;
  const payload = await verifyToken(token, getSecret(env));
  if (!payload || !payload.uid || !payload.sid || !payload.jti) return null;
  if (payload.typ !== 'refresh') return null;
  return payload;
}

function shouldUseSecureCookie(request) {
  try {
    const url = new URL(request.url);
    return url.protocol === 'https:';
  } catch {
    return true;
  }
}

export function buildSessionCookie(request, token) {
  return buildAccessSessionCookie(request, token);
}

export function buildAccessSessionCookie(request, token) {
  const safeToken = String(token || '').trim();
  if (!safeToken) return clearAccessSessionCookie(request);
  const parts = [
    `${SESSION_COOKIE_NAME}=${safeToken}`,
    'Path=/',
    `Max-Age=${Math.floor(ACCESS_SESSION_TTL_MS / 1000)}`,
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (shouldUseSecureCookie(request)) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(request) {
  return clearAccessSessionCookie(request);
}

export function clearAccessSessionCookie(request) {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (shouldUseSecureCookie(request)) parts.push('Secure');
  return parts.join('; ');
}

export function buildRefreshSessionCookie(request, token) {
  const safeToken = String(token || '').trim();
  if (!safeToken) return clearRefreshSessionCookie(request);
  const parts = [
    `${REFRESH_COOKIE_NAME}=${safeToken}`,
    'Path=/',
    `Max-Age=${Math.floor(REFRESH_SESSION_TTL_MS / 1000)}`,
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (shouldUseSecureCookie(request)) parts.push('Secure');
  return parts.join('; ');
}

export function clearRefreshSessionCookie(request) {
  const parts = [
    `${REFRESH_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (shouldUseSecureCookie(request)) parts.push('Secure');
  return parts.join('; ');
}

export function sessionCookieHeaders(request, tokenSet) {
  const headers = new Headers();
  headers.append('set-cookie', buildAccessSessionCookie(request, tokenSet.accessToken));
  headers.append('set-cookie', buildRefreshSessionCookie(request, tokenSet.refreshToken));
  return headers;
}

export function authSessionKey(sessionId) {
  return `auth-session:${String(sessionId || '')}`;
}

export async function createAuthSession(env, userId, nowMs = Date.now()) {
  const now = Number(nowMs) || Date.now();
  const sid = crypto.randomUUID();
  const refreshJti = crypto.randomUUID();
  const refreshExp = now + REFRESH_SESSION_TTL_MS;
  const session = {
    sid,
    uid: String(userId || ''),
    refreshJti,
    prevRefreshJti: '',
    prevRefreshJtiUntil: 0,
    refreshExp,
    createdAt: now,
    lastSeenAt: now,
    lastRotatedAt: now,
    revoked: false,
  };
  await saveAuthSession(env, session);
  return session;
}

export async function saveAuthSession(env, session) {
  if (!hasStorage(env) || !session || !session.sid) return;
  const now = Date.now();
  const ttlSec = Math.max(60, Math.ceil((Number(session.refreshExp) - now) / 1000));
  await env.TYPING_APP.put(authSessionKey(session.sid), JSON.stringify(session), { expirationTtl: ttlSec });
}

export async function revokeAuthSession(env, sessionId) {
  if (!hasStorage(env) || !sessionId) return;
  const existing = await getJson(env, authSessionKey(sessionId), null);
  if (!existing) return;
  existing.revoked = true;
  existing.revokedAt = Date.now();
  await saveAuthSession(env, existing);
}

export async function mintSessionTokens(env, userId, secret) {
  const session = await createAuthSession(env, userId, Date.now());
  const accessToken = await createToken(createAccessSessionPayload(userId, session.sid), secret);
  const refreshToken = await createToken(createRefreshSessionPayload(userId, session.sid, session.refreshJti), secret);
  return { session, accessToken, refreshToken };
}

export function normalizeMode(mode) {
  const value = String(mode || 'quotes').trim().toLowerCase();
  if (KNOWN_MODES.includes(value)) return value;
  return 'quotes';
}

export function getClientIp(request) {
  const cfIp = String(request.headers.get('cf-connecting-ip') || '').trim();
  if (cfIp) return cfIp;
  const xff = String(request.headers.get('x-forwarded-for') || '').trim();
  if (!xff) return 'unknown';
  const first = xff.split(',')[0].trim();
  return first || 'unknown';
}

export function safeRateKeyPart(value, fallback = 'unknown') {
  const out = String(value || '').trim().toLowerCase();
  if (!out) return fallback;
  return out.replace(/[^a-z0-9._:-]/g, '_').slice(0, 120);
}

export async function incrementRateLimit(env, key, windowSec, nowMs = Date.now(), amount = 1) {
  if (!hasStorage(env)) return { count: amount, retryAfterSec: windowSec, resetAt: nowMs + (windowSec * 1000) };
  const now = Number(nowMs) || Date.now();
  const safeWindowSec = Math.max(1, Math.floor(Number(windowSec) || 1));
  const raw = await env.TYPING_APP.get(key);
  let count = 0;
  let resetAt = now + (safeWindowSec * 1000);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const parsedResetAt = Number(parsed && parsed.resetAt) || 0;
      if (parsedResetAt > now) {
        count = Math.max(0, Math.floor(Number(parsed && parsed.count) || 0));
        resetAt = parsedResetAt;
      }
    } catch {
      // Ignore parse errors and reset the window below.
    }
  }
  count += Math.max(1, Math.floor(Number(amount) || 1));
  const ttl = Math.max(1, Math.ceil((resetAt - now) / 1000));
  await env.TYPING_APP.put(key, JSON.stringify({ count, resetAt }), { expirationTtl: ttl });
  return { count, retryAfterSec: ttl, resetAt };
}

export function rateLimited(message, retryAfterSec) {
  return json({ error: message, code: 'RATE_LIMITED', retryAfter: retryAfterSec }, 429);
}

export function storageMissing() {
  return json({ error: 'Server storage not configured (TYPING_APP KV binding missing).' }, 500);
}

// Rewrites a user's display name on every row that carries it (used by rename, self or admin).
export async function propagateUsername(env, userId, username) {
  const scores = await getJson(env, userScoreKey(userId), []);
  if (Array.isArray(scores) && scores.length) {
    let changed = false;
    for (const row of scores) {
      if (row && row.username !== username) { row.username = username; changed = true; }
    }
    if (changed) await putJson(env, userScoreKey(userId), scores);
  }
  const weekKey = getWeekKeyUtc();
  for (const mode of KNOWN_MODES) {
    const atKey = allTimeBestKey(mode, userId);
    const atRow = await getJson(env, atKey, null);
    if (atRow && atRow.username !== username) await putBestRow(env, atKey, { ...atRow, username });
    const wkKey = weeklyBestKey(weekKey, mode, userId);
    const wkRow = await getJson(env, wkKey, null);
    if (wkRow && wkRow.username !== username) await putBestRow(env, wkKey, { ...wkRow, username }, { expirationTtl: WEEKLY_KEY_TTL_SECONDS });
  }
  const contribKey = communityContributionKey(weekKey);
  const contrib = await getJson(env, contribKey, null);
  const entryId = `user:${userId}`;
  if (contrib && contrib.entries && contrib.entries[entryId] && contrib.entries[entryId].username !== username) {
    contrib.entries[entryId].username = username;
    await putJson(env, contribKey, contrib, { expirationTtl: WEEKLY_KEY_TTL_SECONDS });
  }
  invalidateBoardCache();
}

// Removes every key that belongs to a user (self delete or admin delete).
export async function purgeUserData(env, user) {
  const userId = String(user.id || '');
  const norm = normalizeUsername(user.usernameNorm || user.username || '');
  await deleteKey(env, `userByName:${norm}`);
  await deleteKey(env, `user:${userId}`);
  await deleteKey(env, userScoreKey(userId));
  await deleteKey(env, progressKey(userId));
  await deleteKey(env, friendsKey(userId));
  await deleteKey(env, contributionTotalKey(userId));
  await deleteKey(env, lastSeenKey(userId));
  const weekKey = getWeekKeyUtc();
  for (const mode of KNOWN_MODES) {
    await deleteKey(env, allTimeBestKey(mode, userId));
    await deleteKey(env, weeklyBestKey(weekKey, mode, userId));
  }
  const contribKey = communityContributionKey(weekKey);
  const contrib = await getJson(env, contribKey, null);
  if (contrib && contrib.entries && contrib.entries[`user:${userId}`]) {
    delete contrib.entries[`user:${userId}`];
    await putJson(env, contribKey, contrib, { expirationTtl: WEEKLY_KEY_TTL_SECONDS });
  }
  for (const prefix of [`xpday:v1:${userId}:`]) {
    const page = await env.TYPING_APP.list({ prefix, limit: 1000 });
    for (const entry of (page && page.keys) || []) await deleteKey(env, entry.name);
  }
  invalidateBoardCache();
}
