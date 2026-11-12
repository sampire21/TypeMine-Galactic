import {
  json,
  readJson,
  getAuthUser,
  getJson,
  putJson,
  hasStorage,
  storageMissing,
  getWeekKeyUtc,
  communityContributionKey,
  contributionTotalKey,
  formatDateKeyUtc,
  getClientIp,
  safeRateKeyPart,
  incrementRateLimit,
  rateLimited,
  WEEKLY_KEY_TTL_SECONDS,
} from '../_lib.js';

const MAX_WORDS_PER_CALL = 2000;
const GUEST_WORDS_PER_IP_PER_DAY = 5000;
export const GUEST_POOL_ID = 'guests';
export const GUEST_POOL_NAME = 'Guests';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return storageMissing();

  const body = await readJson(request);
  let words = Math.max(0, Math.floor(Number(body.words) || 0));
  if (words <= 0) return json({ ok: true, words: 0 }, 200);
  if (words > MAX_WORDS_PER_CALL) return json({ error: 'Too many words in one contribution' }, 400);

  const ip = safeRateKeyPart(getClientIp(request), 'unknown');
  const rate = await incrementRateLimit(env, `rate:contribute:ip:${ip}`, 60);
  if (rate.count > 30) return rateLimited('Too many contributions. Please slow down.', rate.retryAfterSec);

  const authUser = await getAuthUser(request, env);
  const now = Date.now();
  const weekKey = getWeekKeyUtc(now); // server time only; the week cannot be chosen by the client

  let contributorId;
  let username;
  if (authUser) {
    contributorId = `user:${authUser.id}`;
    username = authUser.username;
  } else {
    // Guests share one pooled row and each IP can add only so much per day.
    const dayKey = formatDateKeyUtc(new Date(now));
    const capKey = `rate:contribute:guestwords:${ip}:${dayKey}`;
    const capState = await getJson(env, capKey, { count: 0, resetAt: 0 });
    const used = Number(capState && capState.resetAt) > now ? Math.max(0, Number(capState.count) || 0) : 0;
    const allowed = Math.max(0, GUEST_WORDS_PER_IP_PER_DAY - used);
    if (allowed <= 0) return json({ ok: true, words: 0, capped: true }, 200);
    words = Math.min(words, allowed);
    await incrementRateLimit(env, capKey, 24 * 60 * 60, now, words);
    contributorId = GUEST_POOL_ID;
    username = GUEST_POOL_NAME;
  }

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
  await putJson(env, contribKey, { week: weekKey, entries }, { expirationTtl: WEEKLY_KEY_TTL_SECONDS });

  let lifetime = 0;
  if (authUser) {
    const totalState = await getJson(env, contributionTotalKey(authUser.id), { words: 0 });
    lifetime = Math.max(0, Math.floor(Number(totalState && totalState.words) || 0)) + words;
    await putJson(env, contributionTotalKey(authUser.id), { words: lifetime, updatedAt: now });
  }
  return json({ ok: true, words, weekKey, weekTotal: entries[contributorId].damage, lifetime }, 201);
}
