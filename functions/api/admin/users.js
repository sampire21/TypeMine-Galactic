import {
  json,
  getJson,
  hasStorage,
  storageMissing,
  requireAdmin,
  userScoreKey,
  progressKey,
  progressOf,
  parseJsonSafe,
  xpOf,
  levelFromXp,
  streakOf,
  dailyCompletionsLatestDay,
  getLastSeenAt,
} from '../_lib.js';

const ACTIVE_MS = 15 * 60 * 1000;

export async function summarizeUser(env, user, progressPayload, scores) {
  const progress = progressOf(progressPayload);
  const xp = xpOf(progress);
  const skillPoints = Math.max(0, parseInt(progress['sampire-skill-points'] || '0', 10) || 0);
  const badges = parseJsonSafe(progress['sampire-badges'] || '[]', []);
  const daily = parseJsonSafe(progress['sampire-daily-v2'] || '{}', {});
  const weekly = parseJsonSafe(progress['sampire-weekly'] || '{}', {});
  const skills = parseJsonSafe(progress['sampire-skills'] || '{}', {});
  const rows = Array.isArray(scores) ? scores : [];
  const testsSaved = rows.length;
  const bestWpm = testsSaved > 0 ? Math.max(...rows.map((s) => Number(s.wpm) || 0)) : 0;
  const lastSeenAt = await getLastSeenAt(env, user, progressPayload);

  return {
    id: user.id,
    username: user.username,
    createdAt: Number(user.createdAt) || 0,
    lastLoginAt: Number(user.lastLoginAt) || 0,
    lastSeenAt,
    isActive: lastSeenAt > 0 && (Date.now() - lastSeenAt) <= ACTIVE_MS,
    level: levelFromXp(xp),
    xp,
    skillPoints,
    badges: Array.isArray(badges) ? badges.length : 0,
    dailyCompleted: dailyCompletionsLatestDay(daily),
    weeklyCompleted: Array.isArray(weekly.completions) ? weekly.completions.length : 0,
    streakDays: streakOf(progress),
    testsSaved,
    bestWpm,
    flaggedRuns: rows.filter((s) => s && s.flagged).length,
    skillsUnlocked: ['aura', 'soundscapes', 'nebulaTrail'].filter((id) => !!skills[id]),
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return storageMissing();
  const adminCheck = await requireAdmin(request, env);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);

  const users = [];
  let cursor;
  do {
    const listed = await env.TYPING_APP.list({ prefix: 'user:', cursor, limit: 100 });
    cursor = listed.list_complete ? undefined : listed.cursor;
    for (const keyEntry of listed.keys || []) {
      const key = String(keyEntry && keyEntry.name || '');
      if (!key.startsWith('user:')) continue;
      const user = await getJson(env, key, null);
      if (!user || !user.id) continue;
      users.push(user);
    }
  } while (cursor);

  const out = [];
  for (const user of users) {
    const progress = await getJson(env, progressKey(user.id), { progress: {}, updatedAt: 0 });
    const scores = await getJson(env, userScoreKey(user.id), []);
    out.push(await summarizeUser(env, user, progress, Array.isArray(scores) ? scores : []));
  }
  out.sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0) || (a.username || '').localeCompare(b.username || ''));
  return json({ users: out }, 200);
}
