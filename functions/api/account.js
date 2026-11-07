import {
  json,
  readJson,
  getAuthUser,
  validateUsername,
  normalizeUsername,
  hashPassword,
  getJson,
  putJson,
  userScoreKey,
  leaderboardKey,
  publicUser,
  hasStorage,
  constantTimeEqual,
  getSecret,
  mintSessionTokens,
  buildAccessSessionCookie,
  buildRefreshSessionCookie,
} from './_lib.js';

export async function onRequestPatch(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return json({ error: 'Server storage not configured (TYPING_APP KV binding missing).' }, 500);
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const body = await readJson(request);
  const nextUsernameRaw = body.username != null ? String(body.username).trim() : '';
  const newPassword = body.newPassword != null ? String(body.newPassword) : '';
  const currentPassword = body.currentPassword != null ? String(body.currentPassword) : '';

  if (!nextUsernameRaw && !newPassword) {
    return json({ error: 'No account changes provided' }, 400);
  }

  const updated = { ...user };
  let passwordChanged = false;

  if (nextUsernameRaw) {
    const usernameCheck = validateUsername(nextUsernameRaw);
    if (!usernameCheck.ok) return json({ error: usernameCheck.error }, 400);
    const nextNorm = normalizeUsername(usernameCheck.username);
    if (nextNorm !== user.usernameNorm) {
      const existingUserId = await env.TYPING_APP.get(`userByName:${nextNorm}`);
      if (existingUserId && existingUserId !== user.id) return json({ error: 'Username already exists' }, 409);
      await env.TYPING_APP.delete(`userByName:${user.usernameNorm}`);
      await env.TYPING_APP.put(`userByName:${nextNorm}`, user.id);
      updated.username = usernameCheck.username;
      updated.usernameNorm = nextNorm;
    }
  }

  if (newPassword) {
    if (newPassword.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
    const { hash: currentHash } = await hashPassword(currentPassword, user.passwordSalt);
    if (!constantTimeEqual(currentHash, user.passwordHash)) return json({ error: 'Current password is incorrect' }, 401);
    const { salt, hash } = await hashPassword(newPassword);
    updated.passwordSalt = salt;
    updated.passwordHash = hash;
    updated.sessionsValidAfter = Date.now(); // revokes all existing sessions
    passwordChanged = true;
  }

  if (updated.username !== user.username) {
    const rows = await getJson(env, leaderboardKey(), []);
    let changed = false;
    for (const row of rows) {
      if (row.userId === user.id && row.username !== updated.username) {
        row.username = updated.username;
        changed = true;
      }
    }
    if (changed) await putJson(env, leaderboardKey(), rows);
  }

  await env.TYPING_APP.put(`user:${user.id}`, JSON.stringify(updated));
  if (passwordChanged) {
    // Issue a fresh session for the current device; all others were just revoked.
    const tokenSet = await mintSessionTokens(env, updated.id, getSecret(env));
    const headers = new Headers();
    headers.append('set-cookie', buildAccessSessionCookie(request, tokenSet.accessToken));
    headers.append('set-cookie', buildRefreshSessionCookie(request, tokenSet.refreshToken));
    return json({ ok: true, user: publicUser(updated) }, 200, headers);
  }
  return json({ ok: true, user: publicUser(updated) }, 200);
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return json({ error: 'Server storage not configured (TYPING_APP KV binding missing).' }, 500);
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const body = await readJson(request);
  const usernameConfirm = String(body.usernameConfirm || '').trim();
  if (usernameConfirm !== user.username) {
    return json({ error: 'Username confirmation does not match' }, 400);
  }
  const currentPassword = body.currentPassword != null ? String(body.currentPassword) : '';
  const { hash: currentHash } = await hashPassword(currentPassword, user.passwordSalt);
  if (!constantTimeEqual(currentHash, user.passwordHash)) return json({ error: 'Current password is incorrect' }, 401);

  await env.TYPING_APP.delete(`userByName:${user.usernameNorm}`);
  await env.TYPING_APP.delete(`user:${user.id}`);
  await env.TYPING_APP.delete(userScoreKey(user.id));
  await env.TYPING_APP.delete(`progress:user:${user.id}`);

  const rows = await getJson(env, leaderboardKey(), []);
  const filtered = rows.filter((row) => row.userId !== user.id);
  await putJson(env, leaderboardKey(), filtered);

  return json({ ok: true }, 200);
}
