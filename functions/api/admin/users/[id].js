import {
  json,
  readJson,
  getJson,
  putJson,
  hasStorage,
  requireAdmin,
  userScoreKey,
  validateUsername,
  normalizeUsername,
  hashPassword,
  leaderboardKey,
} from '../../_lib.js';

const XP_PER_LEVEL = 500;
const DAILY_IDS = ['nobackspace', 'sprint', 'perfectionist', 'daily_quotes_5', 'daily_words_5', 'daily_words30_5'];
const WEEKLY_IDS = ['marathon', 'consistent_climber', 'rival_week', 'above_average'];
const ACHIEVEMENT_IDS = ['sonic_boom', 'speed_demon', 'flawless', 'midnight_oil', 'streak_master', 'triple_crown', 'founder', 'human_lectionary'];

function parseJsonSafe(raw, fallback) {
  try {
    const parsed = JSON.parse(raw || '');
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function dailyCompletionCount(dailyObj) {
  if (!dailyObj || typeof dailyObj !== 'object') return 0;
  if (Array.isArray(dailyObj.completions)) return dailyObj.completions.length;
  const days = dailyObj.days && typeof dailyObj.days === 'object' ? dailyObj.days : {};
  const keys = Object.keys(days);
  if (!keys.length) return 0;
  keys.sort();
  const latest = days[keys[keys.length - 1]] || {};
  return Array.isArray(latest.completions) ? latest.completions.length : 0;
}

function clampInt(value, min, max = Infinity) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function todayKeyLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function currentWeekKeyLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function idsForCount(ids, count) {
  const safe = Math.max(0, Math.floor(Number(count) || 0));
  return ids.slice(0, Math.min(ids.length, safe));
}

function buildUserDetail(user, progressPayload, scores) {
  const progress = (progressPayload && typeof progressPayload.progress === 'object' && progressPayload.progress)
    ? progressPayload.progress
    : {};
  const xp = Math.max(0, parseInt(progress['sampire-xp'] || '0', 10) || 0);
  const skillPoints = Math.max(0, parseInt(progress['sampire-skill-points'] || '0', 10) || 0);
  const skills = parseJsonSafe(progress['sampire-skills'] || '{}', {});
  const badges = parseJsonSafe(progress['sampire-badges'] || '[]', []);
  const daily = parseJsonSafe(progress['sampire-daily-v2'] || '{}', {});
  const weekly = parseJsonSafe(progress['sampire-weekly'] || '{}', {});
  const streak = parseJsonSafe(progress['sampire-streak'] || '{}', {});
  return {
    id: user.id,
    username: user.username,
    createdAt: Number(user.createdAt) || 0,
    lastLoginAt: Number(user.lastLoginAt) || 0,
    lastSeenAt: Math.max(Number(user.lastSeenAt) || 0, Number(progressPayload && progressPayload.updatedAt) || 0),
    level: Math.min(100, Math.floor(xp / XP_PER_LEVEL) + 1),
    xp,
    skillPoints,
    badges: Array.isArray(badges) ? badges.length : 0,
    dailyCompleted: dailyCompletionCount(daily),
    weeklyCompleted: Array.isArray(weekly.completions) ? weekly.completions.length : 0,
    streakDays: Math.max(0, Number(streak.streak) || 0),
    testsSaved: Array.isArray(scores) ? scores.length : 0,
    skillsUnlocked: ['aura', 'soundscapes', 'nebulaTrail'].filter((id) => !!skills[id]),
  };
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  if (!hasStorage(env)) return json({ error: 'Server storage not configured (TYPING_APP KV binding missing).' }, 500);
  const adminCheck = await requireAdmin(request, env);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);

  const id = String(params.id || '').trim();
  if (!id) return json({ error: 'Invalid user id' }, 400);
  const user = await getJson(env, `user:${id}`, null);
  if (!user) return json({ error: 'User not found' }, 404);

  const progressPayload = await getJson(env, `progress:user:${id}`, { progress: {}, updatedAt: 0 });
  const scores = await getJson(env, userScoreKey(id), []);
  return json({ user: buildUserDetail(user, progressPayload, Array.isArray(scores) ? scores : []) }, 200);
}

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  if (!hasStorage(env)) return json({ error: 'Server storage not configured (TYPING_APP KV binding missing).' }, 500);
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
  const setLevel = clampInt(body.setLevel, 1, 100);
  const setXp = clampInt(body.setXp, 0);
  const setSkillPoints = clampInt(body.setSkillPoints, 0);
  const setStreakDays = clampInt(body.setStreakDays, 0);
  const setDailyCompleted = clampInt(body.setDailyCompleted, 0, DAILY_IDS.length);
  const setWeeklyCompleted = clampInt(body.setWeeklyCompleted, 0, WEEKLY_IDS.length);
  const setAchievements = clampInt(body.setAchievements, 0, ACHIEVEMENT_IDS.length);
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

  const payload = await getJson(env, `progress:user:${id}`, { progress: {}, updatedAt: 0 });
  const progress = (payload && typeof payload.progress === 'object' && payload.progress) ? payload.progress : {};
  let xp = Math.max(0, parseInt(progress['sampire-xp'] || '0', 10) || 0);
  let sp = Math.max(0, parseInt(progress['sampire-skill-points'] || '0', 10) || 0);
  const skills = parseJsonSafe(progress['sampire-skills'] || '{}', {});
  if (setLevel !== null) xp += (setLevel - 1) * XP_PER_LEVEL;
  if (setXp !== null) xp += setXp;
  if (setSkillPoints !== null) sp += setSkillPoints;
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

  if (setStreakDays !== null) {
    progress['sampire-streak'] = JSON.stringify({
      lastPlayDate: todayKeyLocal(),
      streak: setStreakDays,
    });
  }
  if (setDailyCompleted !== null) {
    const key = todayKeyLocal();
    progress['sampire-daily-v2'] = JSON.stringify({
      days: {
        [key]: { completions: idsForCount(DAILY_IDS, setDailyCompleted) },
      },
    });
  }
  if (setWeeklyCompleted !== null) {
    progress['sampire-weekly'] = JSON.stringify({
      week: currentWeekKeyLocal(),
      completions: idsForCount(WEEKLY_IDS, setWeeklyCompleted),
    });
  }
  if (setAchievements !== null) {
    const now = Date.now();
    progress['sampire-badges'] = JSON.stringify(
      idsForCount(ACHIEVEMENT_IDS, setAchievements).map((id) => ({ id, earnedAt: now }))
    );
  }

  progress['sampire-xp'] = String(Math.max(0, xp));
  progress['sampire-skill-points'] = String(Math.max(0, sp));
  progress['sampire-skills'] = JSON.stringify({
    aura: !!skills.aura,
    soundscapes: !!skills.soundscapes,
    nebulaTrail: !!skills.nebulaTrail,
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
      await env.TYPING_APP.delete(`userByName:${prevNorm}`);
      await env.TYPING_APP.put(`userByName:${nextNorm}`, user.id);
      nextUser.username = usernameCheck.username;
      nextUser.usernameNorm = nextNorm;
      usernameChanged = true;
    }
  }
  if (resetPassword) {
    if (resetPassword.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
    const { salt, hash } = await hashPassword(resetPassword);
    nextUser.passwordSalt = salt;
    nextUser.passwordHash = hash;
    nextUser.sessionsValidAfter = Date.now(); // revokes all of the user's existing sessions
  }

  if (usernameChanged) {
    const rows = await getJson(env, leaderboardKey(), []);
    let changed = false;
    for (const row of rows) {
      if (row.userId === user.id && row.username !== nextUser.username) {
        row.username = nextUser.username;
        changed = true;
      }
    }
    if (changed) await putJson(env, leaderboardKey(), rows);
    const userScores = await getJson(env, userScoreKey(user.id), []);
    let scoreChanged = false;
    for (const score of userScores) {
      if (score.username !== nextUser.username) {
        score.username = nextUser.username;
        scoreChanged = true;
      }
    }
    if (scoreChanged) await putJson(env, userScoreKey(user.id), userScores);
  }

  const updatedAt = Date.now();
  await putJson(env, `progress:user:${id}`, { progress, updatedAt });
  nextUser.lastSeenAt = updatedAt;
  await putJson(env, `user:${id}`, nextUser);

  const scores = await getJson(env, userScoreKey(id), []);
  return json({ ok: true, user: buildUserDetail(nextUser, { progress, updatedAt }, Array.isArray(scores) ? scores : []) }, 200);
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  if (!hasStorage(env)) return json({ error: 'Server storage not configured (TYPING_APP KV binding missing).' }, 500);
  const adminCheck = await requireAdmin(request, env);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);

  const id = String(params.id || '').trim();
  if (!id) return json({ error: 'Invalid user id' }, 400);
  const user = await getJson(env, `user:${id}`, null);
  if (!user) return json({ error: 'User not found' }, 404);

  const norm = normalizeUsername(user.usernameNorm || user.username || '');
  await env.TYPING_APP.delete(`userByName:${norm}`);
  await env.TYPING_APP.delete(`user:${id}`);
  await env.TYPING_APP.delete(userScoreKey(id));
  await env.TYPING_APP.delete(`progress:user:${id}`);

  const rows = await getJson(env, leaderboardKey(), []);
  const filtered = rows.filter((row) => row.userId !== id);
  await putJson(env, leaderboardKey(), filtered);

  return json({ ok: true }, 200);
}
