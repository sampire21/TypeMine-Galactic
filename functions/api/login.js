import {
  json,
  readJson,
  normalizeUsername,
  hashPassword,
  getSecret,
  publicUser,
  putJson,
  getJson,
  hasStorage,
  looksLikeEmptyAuthNamespace,
  markStorageReady,
  getClientIp,
  safeRateKeyPart,
  incrementRateLimit,
  constantTimeEqual,
  mintSessionTokens,
  buildAccessSessionCookie,
  buildRefreshSessionCookie,
} from './_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const requestId = context.requestId || request.headers.get('cf-ray') || crypto.randomUUID();
  if (!hasStorage(env)) return json({ error: 'Server storage not configured (TYPING_APP KV binding missing).' }, 500);
  const body = await readJson(request);
  const usernameNorm = normalizeUsername(body.username);
  const password = String(body.password || '');
  const ip = safeRateKeyPart(getClientIp(request), 'unknown');
  const ipRate = await incrementRateLimit(env, `rate:login:ip:${ip}`, 60 * 10);
  if (ipRate.count > 30) {
    return json({
      error: 'Too many login attempts. Please try again later.',
      code: 'RATE_LIMITED',
      retryAfter: ipRate.retryAfterSec,
    }, 429);
  }
  // Per-username limit is keyed by username + client IP and counts FAILED attempts only,
  // so a third party cannot lock a victim out from other IPs.
  const failKey = `rate:login:fail:${safeRateKeyPart(usernameNorm, 'unknown')}:${ip}`;
  const failState = await getJson(env, failKey, null);
  if (failState && Number(failState.resetAt) > Date.now() && Number(failState.count) >= 12) {
    return json({
      error: 'Too many login attempts for this account. Please try again later.',
      code: 'RATE_LIMITED',
      retryAfter: Math.max(1, Math.ceil((Number(failState.resetAt) - Date.now()) / 1000)),
    }, 429);
  }
  const recordFailure = () => incrementRateLimit(env, failKey, 60 * 10);

  const userId = await env.TYPING_APP.get(`userByName:${usernameNorm}`);
  if (!userId) {
    const kvLikelyEmpty = await looksLikeEmptyAuthNamespace(env);
    if (kvLikelyEmpty) {
      console.error('[auth-kv-misconfig]', {
        requestId,
        method: 'POST',
        path: '/api/login',
        usernameNorm,
      });
      return json({
        error: 'Authentication storage appears empty or misconfigured. Verify KV namespace IDs/binding.',
        code: 'KV_NAMESPACE_EMPTY_OR_MISMATCH',
        requestId,
      }, 503);
    }
    await recordFailure();
    return json({ error: 'Invalid username or password' }, 401);
  }

  const userRaw = await env.TYPING_APP.get(`user:${userId}`);
  if (!userRaw) {
    await recordFailure();
    return json({ error: 'Invalid username or password' }, 401);
  }
  const user = JSON.parse(userRaw);

  const { hash } = await hashPassword(password, user.passwordSalt);
  if (!constantTimeEqual(hash, user.passwordHash)) {
    await recordFailure();
    return json({ error: 'Invalid username or password' }, 401);
  }

  const now = Date.now();
  user.lastLoginAt = now;
  user.lastSeenAt = now;
  await putJson(env, `user:${user.id}`, user);
  await markStorageReady(env);

  const tokenSet = await mintSessionTokens(env, user.id, getSecret(env));
  const headers = new Headers();
  headers.append('set-cookie', buildAccessSessionCookie(request, tokenSet.accessToken));
  headers.append('set-cookie', buildRefreshSessionCookie(request, tokenSet.refreshToken));
  return json({ user: publicUser(user) }, 200, headers);
}
