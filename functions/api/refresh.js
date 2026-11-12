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
  sessionCookieHeaders,
  clearAccessSessionCookie,
  clearRefreshSessionCookie,
  publicUser,
  hasStorage,
  storageMissing,
  REFRESH_SESSION_TTL_MS,
  getClientIp,
  safeRateKeyPart,
  incrementRateLimit,
  rateLimited,
} from './_lib.js';

// After a rotation the previous refresh token stays valid for this long. KV is eventually
// consistent, so a second tab or a retried request may still carry the old token.
const PREVIOUS_JTI_GRACE_MS = 120 * 1000;

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return storageMissing();

  const ip = safeRateKeyPart(getClientIp(request), 'unknown');
  const ipRate = await incrementRateLimit(env, `rate:refresh:ip:${ip}`, 60 * 10);
  if (ipRate.count > 120) return rateLimited('Too many refresh attempts. Please try again later.', ipRate.retryAfterSec);

  const payload = await verifyRefreshTokenFromRequest(request, env);
  if (!payload) return unauthorizedWithCookieClear(request);

  const session = await getJson(env, authSessionKey(payload.sid), null);
  if (!session || session.revoked) return unauthorizedWithCookieClear(request);
  if (String(session.uid || '') !== String(payload.uid || '')) {
    await revokeAuthSession(env, payload.sid);
    return unauthorizedWithCookieClear(request);
  }
  const now = Date.now();
  const isCurrent = String(session.refreshJti || '') === String(payload.jti || '');
  const isRecentPrevious = !!session.prevRefreshJti
    && String(session.prevRefreshJti) === String(payload.jti || '')
    && now <= Number(session.prevRefreshJtiUntil || 0);
  if (!isCurrent && !isRecentPrevious) {
    // A token older than the grace window is a replay; revoke the whole session.
    await revokeAuthSession(env, payload.sid);
    return unauthorizedWithCookieClear(request);
  }
  if (Number(session.refreshExp) > 0 && now > Number(session.refreshExp)) return unauthorizedWithCookieClear(request);

  const user = await getJson(env, `user:${payload.uid}`, null);
  if (!user) return unauthorizedWithCookieClear(request);
  if (Number(user.sessionsValidAfter) > 0 && Number(session.createdAt) < Number(user.sessionsValidAfter)) {
    await revokeAuthSession(env, payload.sid);
    return unauthorizedWithCookieClear(request);
  }

  const secret = getSecret(env);
  let refreshJti = session.refreshJti;
  if (isCurrent) {
    // Rotate, but remember the old id for a short grace period.
    refreshJti = crypto.randomUUID();
    session.prevRefreshJti = session.refreshJti;
    session.prevRefreshJtiUntil = now + PREVIOUS_JTI_GRACE_MS;
    session.refreshJti = refreshJti;
    session.refreshExp = now + REFRESH_SESSION_TTL_MS;
    session.lastRotatedAt = now;
    session.lastSeenAt = now;
    await saveAuthSession(env, session);
  }
  // A recent-previous token gets a fresh access token and the CURRENT refresh token, so both
  // tabs converge on the same refresh id instead of fighting over it.
  const accessToken = await createToken(createAccessSessionPayload(user.id, session.sid), secret);
  const refreshToken = await createToken(createRefreshSessionPayload(user.id, session.sid, refreshJti), secret);
  return json({ ok: true, user: publicUser(user, env) }, 200, sessionCookieHeaders(request, { accessToken, refreshToken }));
}

function unauthorizedWithCookieClear(request) {
  const headers = new Headers();
  headers.append('set-cookie', clearAccessSessionCookie(request));
  headers.append('set-cookie', clearRefreshSessionCookie(request));
  return json({ error: 'Unauthorized' }, 401, headers);
}
