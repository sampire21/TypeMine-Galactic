import {
  json,
  readJson,
  getAuthUser,
  getJson,
  putJson,
  hasStorage,
  storageMissing,
  friendsKey,
  normalizeUsername,
  progressKey,
  progressOf,
  xpOf,
  levelFromXp,
  streakOf,
  getLastSeenAt,
  getBoardRows,
  getWeekKeyUtc,
  incrementRateLimit,
  rateLimited,
} from './_lib.js';

const MAX_FRIENDS = 50;

async function loadFriendIds(env, userId) {
  const ids = await getJson(env, friendsKey(userId), []);
  return Array.isArray(ids) ? [...new Set(ids.map(String).filter(Boolean))].slice(0, MAX_FRIENDS) : [];
}

async function describeFriend(env, friendId, allTimeRows, weeklyRows) {
  const user = await getJson(env, `user:${friendId}`, null);
  if (!user) return null;
  const progressPayload = await getJson(env, progressKey(friendId), null);
  const progress = progressOf(progressPayload);
  const bestRow = allTimeRows.find((row) => String(row.userId) === String(friendId));
  const weeklyRow = weeklyRows.find((row) => String(row.userId) === String(friendId));
  return {
    id: user.id,
    username: user.username,
    bestWpm: bestRow ? bestRow.wpm : 0,
    weeklyBestWpm: weeklyRow ? weeklyRow.wpm : 0,
    level: levelFromXp(xpOf(progress)),
    streak: streakOf(progress),
    lastSeenAt: await getLastSeenAt(env, user, progressPayload),
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return storageMissing();
  const me = await getAuthUser(request, env);
  if (!me) return json({ error: 'Unauthorized' }, 401);

  const ids = await loadFriendIds(env, me.id);
  const weekKey = getWeekKeyUtc();
  const allTimeRows = await getBoardRows(env, 'alltime', 'all', weekKey);
  const weeklyRows = await getBoardRows(env, 'weekly', 'all', weekKey);
  const friends = [];
  for (const id of ids) {
    const row = await describeFriend(env, id, allTimeRows, weeklyRows);
    if (row) friends.push(row);
  }
  friends.sort((a, b) => b.bestWpm - a.bestWpm || a.username.localeCompare(b.username));
  return json({ friends }, 200);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return storageMissing();
  const me = await getAuthUser(request, env);
  if (!me) return json({ error: 'Unauthorized' }, 401);
  const rate = await incrementRateLimit(env, `rate:friends:user:${me.id}`, 60 * 10);
  if (rate.count > 60) return rateLimited('Too many friend changes. Please slow down.', rate.retryAfterSec);

  const body = await readJson(request);
  const usernameNorm = normalizeUsername(body.username);
  if (!usernameNorm) return json({ error: 'username is required' }, 400);
  if (usernameNorm === normalizeUsername(me.usernameNorm || me.username)) return json({ error: 'You cannot add yourself' }, 400);
  const friendId = await env.TYPING_APP.get(`userByName:${usernameNorm}`);
  if (!friendId) return json({ error: 'No player with that username' }, 404);
  const friend = await getJson(env, `user:${friendId}`, null);
  if (!friend) return json({ error: 'No player with that username' }, 404);

  const ids = await loadFriendIds(env, me.id);
  if (ids.includes(String(friendId))) return json({ ok: true, alreadyAdded: true, friend: { id: friend.id, username: friend.username } }, 200);
  if (ids.length >= MAX_FRIENDS) return json({ error: `You can follow up to ${MAX_FRIENDS} players` }, 400);
  ids.push(String(friendId));
  await putJson(env, friendsKey(me.id), ids);
  return json({ ok: true, friend: { id: friend.id, username: friend.username } }, 201);
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  if (!hasStorage(env)) return storageMissing();
  const me = await getAuthUser(request, env);
  if (!me) return json({ error: 'Unauthorized' }, 401);

  const usernameNorm = normalizeUsername(params && params.username);
  if (!usernameNorm) return json({ error: 'username is required' }, 400);
  const friendId = await env.TYPING_APP.get(`userByName:${usernameNorm}`);
  const ids = await loadFriendIds(env, me.id);
  const next = ids.filter((id) => id !== String(friendId || ''));
  if (next.length !== ids.length) await putJson(env, friendsKey(me.id), next);
  return json({ ok: true, removed: next.length !== ids.length }, 200);
}
