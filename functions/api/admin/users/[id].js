import {
  json,
  readJson,
  getJson,
  putJson,
  hasStorage,
  storageMissing,
  requireAdmin,
  userScoreKey,
  progressKey,
  validateUsername,
  validatePassword,
  normalizeUsername,
  hashPassword,
  propagateUsername,
  purgeUserData,
  parseJsonSafe,
  progressOf,
  formatDateKeyUtc,
  getWeekKeyUtc,
  XP_PER_LEVEL,
  MAX_LEVEL,
  BADGE_IDS,
  DAILY_IDS,
  WEEKLY_IDS,
} from '../../_lib.js';
import { summarizeUser } from '../users.js';

function clampInt(value, min, max = Infinity) {
  if (value == null || value === '') return null;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function idsForCount(ids, count) {
  const safe = Math.max(0, Math.floor(Number(count) || 0));
  return ids.slice(0, Math.min(ids.length, safe));
}

async function buildUserDetail(env, user, progressPayload, scores) {
  return summarizeUser(env, user, progressPayload, scores);
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  if (!hasStorage(env)) return storageMissing();
  const adminCheck = await requireAdmin(request, env);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);

  const id = String(params.id || '').trim();
  if (!id) return json({ error: 'Invalid user id' }, 400);
  const user = await getJson(env, `user:${id}`, null);
  if (!user) return json({ error: 'User not found' }, 404);

  const progressPayload = await getJson(env, progressKey(id), { progress: {}, updatedAt: 0 });
  const scores = await getJson(env, userScoreKey(id), []);
  return json({ user: await buildUserDetail(env, user, progressPayload, Array.isArray(scores) ? scores : []) }, 200);
}

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  if (!hasStorage(env)) return storageMissing();
  const adminCheck = await requireAdmin(request, env);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);

  const id = String(params.id || '').trim();
  if (!id) return json({ error: 'Invalid user id' }, 400);
  const user = await getJson(env, `user:${id}`, null);
  if (!user) return json({ error: 'User not found' }, 404);

  const body = await readJson(request);
  const addXp = Math.max(0, Math.floor(Number(body.addXp) || 0));
  const addSkillPoints = Math.max(0, Math.floor(Number(body.addSkillPoints) || 0));
  const unlockRewards = Array.isArray(body.unlockRewards) ? body.unlockRewards.map((r) => String(r)) : [];
  const setLevel = clampInt(body.setLevel, 1, MAX_LEVEL);
  const setXp = clampInt(body.setXp, 0, XP_PER_LEVEL * MAX_LEVEL);
  const setSkillPoints = clampInt(body.setSkillPoints, 0, 500);
  const setStreakDays = clampInt(body.setStreakDays, 0, 100000);
  const setDailyCompleted = clampInt(body.setDailyCompleted, 0, DAILY_IDS.length);
  const setWeeklyCompleted = clampInt(body.setWeeklyCompleted, 0, WEEKLY_IDS.length);
  const setAchievements = clampInt(body.setAchievements, 0, BADGE_IDS.length);
  const setRewards = (body && typeof body.setRewards === 'object' && body.setRewards && !Array.isArray(body.setRewards))
    ? body.setRewards
    : null;
  const resetUsernameRaw = body.resetUsername != null ? String(body.resetUsername).trim() : '';
  const resetPassword = body.resetPassword != null ? String(body.resetPassword) : '';

  const hasSetOps = (
    setLevel !== null ||
    setXp !== null ||
    setSkillPoints !== null ||
    setStreakDays !== null ||
    setDailyCompleted !== null ||
    setWeeklyCompleted !== null ||
    setAchievements !== null ||
    !!setRewards
  );
  if (addXp <= 0 && addSkillPoints <= 0 && unlockRewards.length === 0 && !hasSetOps && !resetUsernameRaw && !resetPassword) {
    return json({ error: 'No grant changes provided' }, 400);
  }

  const payload = await getJson(env, progressKey(id), { progress: {}, updatedAt: 0 });
  const progress = { ...progressOf(payload) };
  let xp = Math.max(0, parseInt(progress['sampire-xp'] || '0', 10) || 0);
  let sp = Math.max(0, parseInt(progress['sampire-skill-points'] || '0', 10) || 0);
  const skills = parseJsonSafe(progress['sampire-skills'] || '{}', {});
  // "set" fields assign; "add" fields add.
  if (setLevel !== null) xp = (setLevel - 1) * XP_PER_LEVEL;
  if (setXp !== null) xp = setXp;
  if (setSkillPoints !== null) sp = setSkillPoints;
  xp += addXp;
  sp += addSkillPoints;
  if (setRewards) {
    for (const key of ['aura', 'soundscapes', 'nebulaTrail']) {
      if (Object.prototype.hasOwnProperty.call(setRewards, key)) skills[key] = !!setRewards[key];
    }
  }
  for (const reward of unlockRewards) {
    if (['aura', 'soundscapes', 'nebulaTrail'].includes(reward)) skills[reward] = true;
  }

  // The admin's own local day and week start, when the client sends them; otherwise the server's UTC day.
  const dateKeyRe = /^\d{4}-\d{2}-\d{2}$/;
  const clientDateKey = dateKeyRe.test(String(body.clientDateKey || '')) ? String(body.clientDateKey) : '';
  const clientWeekKey = dateKeyRe.test(String(body.clientWeekKey || '')) ? String(body.clientWeekKey) : '';
  const todayKey = clientDateKey || formatDateKeyUtc(new Date());
  const weekKeyForWrites = clientWeekKey || getWeekKeyUtc();
  if (setStreakDays !== null) {
    progress['sampire-streak'] = JSON.stringify({
      lastPlayDate: todayKey,
      streak: setStreakDays,
    });
  }
  if (setDailyCompleted !== null) {
    // Same shape the client writes: days[dateKey] = [ids]. Other days are kept.
    const existing = parseJsonSafe(progress['sampire-daily-v2'] || '{}', {});
    const days = existing && typeof existing.days === 'object' && existing.days ? { ...existing.days } : {};
    days[todayKey] = idsForCount(DAILY_IDS, setDailyCompleted);
    progress['sampire-daily-v2'] = JSON.stringify({ days });
  }
  if (setWeeklyCompleted !== null) {
    progress['sampire-weekly'] = JSON.stringify({
      week: weekKeyForWrites,
      completions: idsForCount(WEEKLY_IDS, setWeeklyCompleted),
    });
  }
  if (setAchievements !== null) {
    const now = Date.now();
    progress['sampire-badges'] = JSON.stringify(
      idsForCount(BADGE_IDS, setAchievements).map((badgeId) => ({ id: badgeId, earnedAt: now }))
    );
  }

  progress['sampire-xp'] = String(Math.min(XP_PER_LEVEL * MAX_LEVEL, Math.max(0, xp)));
  progress['sampire-skill-points'] = String(Math.max(0, sp));
  progress['sampire-skills'] = JSON.stringify({
    aura: !!skills.aura,
    soundscapes: !!skills.soundscapes,
    nebulaTrail: !!skills.nebulaTrail,
    keySoundPacks: skills.keySoundPacks && typeof skills.keySoundPacks === 'object' ? skills.keySoundPacks : {},
  });

  let usernameChanged = false;
  const nextUser = { ...user };
  if (resetUsernameRaw) {
    const usernameCheck = validateUsername(resetUsernameRaw);
    if (!usernameCheck.ok) return json({ error: usernameCheck.error }, 400);
    const nextNorm = normalizeUsername(usernameCheck.username);
    if (nextNorm !== String(user.usernameNorm || '')) {
      const existingUserId = await env.TYPING_APP.get(`userByName:${nextNorm}`);
      if (existingUserId && existingUserId !== user.id) return json({ error: 'Username already exists' }, 409);
      const prevNorm = normalizeUsername(user.usernameNorm || user.username || '');
      await env.TYPING_APP.put(`userByName:${nextNorm}`, user.id);
      await env.TYPING_APP.delete(`userByName:${prevNorm}`);
      nextUser.username = usernameCheck.username;
      nextUser.usernameNorm = nextNorm;
      usernameChanged = true;
    } else if (usernameCheck.username !== user.username) {
      nextUser.username = usernameCheck.username;
      usernameChanged = true;
    }
  }
  if (resetPassword) {
    const passwordCheck = validatePassword(resetPassword);
    if (!passwordCheck.ok) return json({ error: passwordCheck.error }, 400);
    const { salt, hash } = await hashPassword(passwordCheck.password);
    nextUser.passwordSalt = salt;
    nextUser.passwordHash = hash;
    nextUser.sessionsValidAfter = Date.now(); // revokes all of the user's existing sessions
  }

  const updatedAt = Date.now();
  await putJson(env, progressKey(id), { progress, updatedAt });
  if (usernameChanged || resetPassword) await putJson(env, `user:${id}`, nextUser);
  if (usernameChanged) await propagateUsername(env, user.id, nextUser.username);

  const scores = await getJson(env, userScoreKey(id), []);
  return json({ ok: true, user: await buildUserDetail(env, nextUser, { progress, updatedAt }, Array.isArray(scores) ? scores : []) }, 200);
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  if (!hasStorage(env)) return storageMissing();
  const adminCheck = await requireAdmin(request, env);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);

  const id = String(params.id || '').trim();
  if (!id) return json({ error: 'Invalid user id' }, 400);
  const user = await getJson(env, `user:${id}`, null);
  if (!user) return json({ error: 'User not found' }, 404);

  await purgeUserData(env, user);
  return json({ ok: true }, 200);
}
