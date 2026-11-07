import {
  json,
  getSecret,
  verifyRefreshTokenFromRequest,
  getJson,
  authSessionKey,
  saveAuthSession,
  revokeAuthSession,
  createToken,
  createAccessSessionPayload,
  createRefreshSessionPayload,
  buildAccessSessionCookie,
  buildRefreshSessionCookie,
  clearAccessSessionCookie,
  clearRefreshSessionCookie,
  publicUser,
  hasStorage,
  REFRESH_SESSION_TTL_MS,
  getClientIp,
  safeRateKeyPart,
  incrementRateLimit,
} from './_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return json({ error: 'Server storage not configured (TYPING_APP KV binding missing).' }, 500);

  const ip = safeRateKeyPart(getClientIp(request), 'unknown');
  const ipRate = await incrementRateLimit(env, `rate:refresh:ip:${ip}`, 60 * 10);
  if (ipRate.count > 120) {
    return json({
      error: 'Too many refresh attempts. Please try again later.',
      code: 'RATE_LIMITED',
      retryAfter: ipRate.retryAfterSec,
    }, 429);
  }

  const payload = await verifyRefreshTokenFromRequest(request, env);
  if (!payload) return unauthorizedWithCookieClear(request);

  const session = await getJson(env, authSessionKey(payload.sid), null);
  if (!session || session.revoked) return unauthorizedWithCookieClear(request);
  if (String(session.uid || '') !== String(payload.uid || '')) {
    await revokeAuthSession(env, payload.sid);
    return unauthorizedWithCookieClear(request);
  }
  if (String(session.refreshJti || '') !== String(payload.jti || '')) {
    // Replay/reuse detected for rotated refresh token; revoke session.
    await revokeAuthSession(env, payload.sid);
    return unauthorizedWithCookieClear(request);
  }
  if (Number(session.refreshExp) > 0 && Date.now() > Number(session.refreshExp)) return unauthorizedWithCookieClear(request);

  const user = await getJson(env, `user:${payload.uid}`, null);
  if (!user) return unauthorizedWithCookieClear(request);
  if (Number(user.sessionsValidAfter) > 0 && Number(session.createdAt) < Number(user.sessionsValidAfter)) {
    await revokeAuthSession(env, payload.sid);
    return unauthorizedWithCookieClear(request);
  }

  const nextRefreshJti = crypto.randomUUID();
  const nextRefreshExp = Date.now() + REFRESH_SESSION_TTL_MS;
  session.refreshJti = nextRefreshJti;
  session.refreshExp = nextRefreshExp;
  session.lastSeenAt = Date.now();
  session.lastRotatedAt = Date.now();
  await saveAuthSession(env, session);

  const secret = getSecret(env);
  const accessToken = await createToken(createAccessSessionPayload(user.id, session.sid), secret);
  const refreshToken = await createToken(createRefreshSessionPayload(user.id, session.sid, nextRefreshJti), secret);
  const headers = new Headers();
  headers.append('set-cookie', buildAccessSessionCookie(request, accessToken));
  headers.append('set-cookie', buildRefreshSessionCookie(request, refreshToken));
  return json({ ok: true, user: publicUser(user) }, 200, headers);
}

function unauthorizedWithCookieClear(request) {
  const headers = new Headers();
  headers.append('set-cookie', clearAccessSessionCookie(request));
  headers.append('set-cookie', clearRefreshSessionCookie(request));
  return json({ error: 'Unauthorized' }, 401, headers);
}
