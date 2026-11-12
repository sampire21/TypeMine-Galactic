import {
  json,
  readJson,
  getAuthUser,
  validateUsername,
  validatePassword,
  normalizeUsername,
  hashPassword,
  publicUser,
  hasStorage,
  storageMissing,
  constantTimeEqual,
  getSecret,
  mintSessionTokens,
  sessionCookieHeaders,
  propagateUsername,
  purgeUserData,
  PASSWORD_MAX_LENGTH,
} from './_lib.js';

export async function onRequestPatch(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return storageMissing();
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const body = await readJson(request);
  const nextUsernameRaw = body.username != null ? String(body.username).trim() : '';
  const newPassword = body.newPassword != null ? String(body.newPassword) : '';
  const currentPassword = body.currentPassword != null ? String(body.currentPassword).slice(0, PASSWORD_MAX_LENGTH) : '';

  if (!nextUsernameRaw && !newPassword) {
    return json({ error: 'No account changes provided' }, 400);
  }

  const updated = { ...user };
  let passwordChanged = false;
  let usernameChanged = false;

  if (nextUsernameRaw) {
    const usernameCheck = validateUsername(nextUsernameRaw);
    if (!usernameCheck.ok) return json({ error: usernameCheck.error }, 400);
    const nextNorm = normalizeUsername(usernameCheck.username);
    if (nextNorm !== user.usernameNorm) {
      const existingUserId = await env.TYPING_APP.get(`userByName:${nextNorm}`);
      if (existingUserId && existingUserId !== user.id) return json({ error: 'Username already exists' }, 409);
      await env.TYPING_APP.put(`userByName:${nextNorm}`, user.id);
      await env.TYPING_APP.delete(`userByName:${user.usernameNorm}`);
      updated.username = usernameCheck.username;
      updated.usernameNorm = nextNorm;
      usernameChanged = true;
    } else if (usernameCheck.username !== user.username) {
      // Same letters, different capitalisation.
      updated.username = usernameCheck.username;
      usernameChanged = true;
    }
  }

  if (newPassword) {
    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.ok) return json({ error: passwordCheck.error }, 400);
    const { hash: currentHash } = await hashPassword(currentPassword, user.passwordSalt);
    if (!constantTimeEqual(currentHash, user.passwordHash)) return json({ error: 'Current password is incorrect' }, 401);
    const { salt, hash } = await hashPassword(passwordCheck.password);
    updated.passwordSalt = salt;
    updated.passwordHash = hash;
    updated.sessionsValidAfter = Date.now(); // revokes all existing sessions
    passwordChanged = true;
  }

  await env.TYPING_APP.put(`user:${user.id}`, JSON.stringify(updated));
  if (usernameChanged) await propagateUsername(env, user.id, updated.username);

  if (passwordChanged) {
    // Issue a fresh session for the current device; all others were just revoked.
    const tokenSet = await mintSessionTokens(env, updated.id, getSecret(env));
    return json({ ok: true, user: publicUser(updated, env) }, 200, sessionCookieHeaders(request, tokenSet));
  }
  return json({ ok: true, user: publicUser(updated, env) }, 200);
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return storageMissing();
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const body = await readJson(request);
  const usernameConfirm = String(body.usernameConfirm || '').trim();
  if (usernameConfirm !== user.username) {
    return json({ error: 'Username confirmation does not match' }, 400);
  }
  const currentPassword = body.currentPassword != null ? String(body.currentPassword).slice(0, PASSWORD_MAX_LENGTH) : '';
  const { hash: currentHash } = await hashPassword(currentPassword, user.passwordSalt);
  if (!constantTimeEqual(currentHash, user.passwordHash)) return json({ error: 'Current password is incorrect' }, 401);

  await purgeUserData(env, user);
  return json({ ok: true }, 200);
}
