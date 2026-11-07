import {
  json,
  readJson,
  getAuthUser,
  getJson,
  putJson,
  hasStorage,
  getWeekKeyUtc,
  communityContributionKey,
  getClientIp,
  safeRateKeyPart,
  incrementRateLimit,
} from '../_lib.js';

const MAX_WORDS_PER_CALL = 2000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return json({ error: 'Server storage not configured (TYPING_APP KV binding missing).' }, 500);

  const body = await readJson(request);
  const words = Math.max(0, Math.floor(Number(body.words) || 0));
  if (words <= 0) return json({ ok: true }, 200);
  if (words > MAX_WORDS_PER_CALL) return json({ error: 'Too many words in one contribution' }, 400);

  const ip = safeRateKeyPart(getClientIp(request), 'unknown');
  const rate = await incrementRateLimit(env, `rate:contribute:ip:${ip}`, 60);
  if (rate.count > 30) {
    return json({ error: 'Too many contributions. Please slow down.', code: 'RATE_LIMITED', retryAfter: rate.retryAfterSec }, 429);
  }

  const authUser = await getAuthUser(request, env);
  const guestIdRaw = String(body.guestId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  const guestNameRaw = String(body.guestName || '').trim().replace(/[\u0000-\u001f<>]/g, '').slice(0, 32);
  const fallbackGuestName = guestIdRaw ? `Guest-${guestIdRaw.slice(0, 4)}` : 'Guest';

  const contributorId = authUser
    ? `user:${authUser.id}`
    : `guest:${guestIdRaw || crypto.randomUUID()}`;
  const username = authUser
    ? authUser.username
    : (guestNameRaw || fallbackGuestName);

  // Only the current or previous week is accepted; anything else falls back to now.
  const now = Date.now();
  const clientDate = Number(body.date);
  const contribDate = (Number.isFinite(clientDate) && clientDate > 0 && clientDate <= now && now - clientDate <= 2 * WEEK_MS
    && getWeekKeyUtc(clientDate) >= getWeekKeyUtc(now - WEEK_MS))
    ? clientDate
    : now;
  const weekKey = getWeekKeyUtc(contribDate);
  const contribKey = communityContributionKey(weekKey);
  const contribState = await getJson(env, contribKey, { week: weekKey, entries: {} });
  const entries = (contribState && typeof contribState.entries === 'object' && !Array.isArray(contribState.entries))
    ? contribState.entries
    : {};

  const prev = entries[contributorId] || { id: contributorId, username, damage: 0 };
  entries[contributorId] = {
    id: contributorId,
    username,
    damage: Math.max(0, Math.floor(Number(prev.damage) || 0) + words),
  };

  await putJson(env, contribKey, { week: weekKey, entries });
  return json({ ok: true }, 201);
}

