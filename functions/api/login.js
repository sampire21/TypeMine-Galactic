import {
  json,
  readJson,
  normalizeUsername,
  hashPassword,
  burnPasswordHashTime,
  getSecret,
  publicUser,
  getJson,
  hasStorage,
  storageMissing,
  getClientIp,
  safeRateKeyPart,
  incrementRateLimit,
  rateLimited,
  constantTimeEqual,
  mintSessionTokens,
  sessionCookieHeaders,
  touchLastSeen,
  PASSWORD_MAX_LENGTH,
} from './_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return storageMissing();
  const body = await readJson(request);
  const usernameNorm = normalizeUsername(body.username);
  const password = String(body.password || '').slice(0, PASSWORD_MAX_LENGTH);
  const ip = safeRateKeyPart(getClientIp(request), 'unknown');
  const ipRate = await incrementRateLimit(env, `rate:login:ip:${ip}`, 60 * 10);
  if (ipRate.count > 30) return rateLimited('Too many login attempts. Please try again later.', ipRate.retryAfterSec);

  // Per-username limit is keyed by username + client IP and counts FAILED attempts only,
  // so a third party cannot lock a victim out from other IPs.
  const failKey = `rate:login:fail:${safeRateKeyPart(usernameNorm, 'unknown')}:${ip}`;
  const failState = await getJson(env, failKey, null);
  if (failState && Number(failState.resetAt) > Date.now() && Number(failState.count) >= 12) {
    return rateLimited('Too many login attempts for this account. Please try again later.', Math.max(1, Math.ceil((Number(failState.resetAt) - Date.now()) / 1000)));
  }
  const recordFailure = () => incrementRateLimit(env, failKey, 60 * 10);

  const userId = usernameNorm ? await env.TYPING_APP.get(`userByName:${usernameNorm}`) : null;
  const userRaw = userId ? await env.TYPING_APP.get(`user:${userId}`) : null;
  if (!userRaw) {
    // Hash anyway so a missing account takes as long as a wrong password.
    await burnPasswordHashTime(password);
    await recordFailure();
    return json({ error: 'Invalid username or password' }, 401);
  }
  const user = JSON.parse(userRaw);

  const { hash } = await hashPassword(password, user.passwordSalt);
  if (!constantTimeEqual(hash, user.passwordHash)) {
    await recordFailure();
    return json({ error: 'Invalid username or password' }, 401);
  }

  // The user record is not rewritten on login; "last seen" lives in its own small key.
  await touchLastSeen(env, user.id);

  const tokenSet = await mintSessionTokens(env, user.id, getSecret(env));
  return json({ user: publicUser(user, env) }, 200, sessionCookieHeaders(request, tokenSet));
}
