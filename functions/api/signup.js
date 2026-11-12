import {
  json,
  readJson,
  validateUsername,
  validatePassword,
  normalizeUsername,
  hashPassword,
  getSecret,
  publicUser,
  hasStorage,
  storageMissing,
  getClientIp,
  safeRateKeyPart,
  incrementRateLimit,
  rateLimited,
  mintSessionTokens,
  sessionCookieHeaders,
} from './_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return storageMissing();
  const body = await readJson(request);
  const ip = safeRateKeyPart(getClientIp(request), 'unknown');
  const ipRate = await incrementRateLimit(env, `rate:signup:ip:${ip}`, 60 * 60);
  if (ipRate.count > 12) return rateLimited('Too many signup attempts. Please try again later.', ipRate.retryAfterSec);

  const usernameCheck = validateUsername(body.username);
  if (!usernameCheck.ok) return json({ error: usernameCheck.error }, 400);
  const passwordCheck = validatePassword(body.password);
  if (!passwordCheck.ok) return json({ error: passwordCheck.error }, 400);

  const usernameNorm = normalizeUsername(usernameCheck.username);
  const usernameRate = await incrementRateLimit(env, `rate:signup:user:${safeRateKeyPart(usernameNorm, 'unknown')}`, 60 * 60);
  if (usernameRate.count > 6) return rateLimited('Too many signup attempts for this username. Please try again later.', usernameRate.retryAfterSec);

  const existingUserId = await env.TYPING_APP.get(`userByName:${usernameNorm}`);
  if (existingUserId) return json({ error: 'Username already exists' }, 409);

  const id = crypto.randomUUID();
  const { salt, hash } = await hashPassword(passwordCheck.password);
  const now = Date.now();
  const user = {
    id,
    username: usernameCheck.username,
    usernameNorm,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: now,
    lastLoginAt: now,
  };

  // Claim the name first so two signups racing on the same name cannot both win.
  await env.TYPING_APP.put(`userByName:${usernameNorm}`, id);
  await env.TYPING_APP.put(`user:${id}`, JSON.stringify(user));

  const tokenSet = await mintSessionTokens(env, id, getSecret(env));
  return json({ user: publicUser(user, env) }, 201, sessionCookieHeaders(request, tokenSet));
}
