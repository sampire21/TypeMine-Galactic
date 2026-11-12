import {
  json,
  normalizeUsername,
  getJson,
  hasStorage,
  storageMissing,
  progressKey,
  progressOf,
  parseJsonSafe,
  dailyCompletionsTotal,
  xpOf,
  levelFromXp,
  streakOf,
  contributionTotalKey,
  allTimeBestKey,
  weeklyBestKey,
  getWeekKeyUtc,
  communityContributionKey,
  userScoreKey,
  KNOWN_MODES,
  getClientIp,
  safeRateKeyPart,
  incrementRateLimit,
  rateLimited,
} from './_lib.js';

function weeklyCompletionsCount(weeklyObj) {
  if (!weeklyObj || typeof weeklyObj !== 'object') return 0;
  const completions = Array.isArray(weeklyObj.completions) ? weeklyObj.completions : [];
  return completions.length;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return storageMissing();

  const ip = safeRateKeyPart(getClientIp(request), 'unknown');
  const rate = await incrementRateLimit(env, `rate:usersummary:ip:${ip}`, 60 * 10);
  if (rate.count > 120) return rateLimited('Too many profile lookups. Please slow down.', rate.retryAfterSec);

  const url = new URL(request.url);
  const usernameRaw = String(url.searchParams.get('username') || '').trim();
  const usernameNorm = normalizeUsername(usernameRaw);
  if (!usernameNorm) return json({ error: 'username is required' }, 400);

  const userId = await env.TYPING_APP.get(`userByName:${usernameNorm}`);
  if (!userId) return json({ error: 'User not found' }, 404);
  const user = await getJson(env, `user:${userId}`, null);
  if (!user) return json({ error: 'User not found' }, 404);

  const progressPayload = await getJson(env, progressKey(userId), { progress: {} });
  const progress = progressOf(progressPayload);
  const badgesRaw = parseJsonSafe(progress['sampire-badges'] || '[]', []);
  const badgeIds = (Array.isArray(badgesRaw) ? badgesRaw : [])
    .map((b) => (typeof b === 'string' ? b : String(b && b.id || '')))
    .filter(Boolean);
  const badgeUnique = [...new Set(badgeIds)];

  const lifetimeStored = Math.max(0, parseInt(progress['sampire-lifetime-challenges-completed'] || '0', 10) || 0);
  const dailyTotal = dailyCompletionsTotal(parseJsonSafe(progress['sampire-daily-v2'] || '{}', {}));
  const weeklyCount = weeklyCompletionsCount(parseJsonSafe(progress['sampire-weekly'] || '{}', {}));
  const lifetimeChallengesCompleted = Math.max(lifetimeStored, dailyTotal + weeklyCount);
  const xp = xpOf(progress);
  const level = levelFromXp(xp);

  // Bests come from the per-mode best keys (direct reads, no list()).
  const weekKey = getWeekKeyUtc();
  let personalBestWpm = 0;
  let weeklyBestWpm = 0;
  const bestByMode = {};
  for (const mode of KNOWN_MODES) {
    const row = await getJson(env, allTimeBestKey(mode, userId), null);
    if (row && Number(row.wpm) > 0) {
      bestByMode[mode] = Number(row.wpm);
      personalBestWpm = Math.max(personalBestWpm, Number(row.wpm));
    }
    const weekRow = await getJson(env, weeklyBestKey(weekKey, mode, userId), null);
    if (weekRow && Number(weekRow.wpm) > weeklyBestWpm) weeklyBestWpm = Number(weekRow.wpm);
  }
  const totalState = await getJson(env, contributionTotalKey(userId), { words: 0 });
  const communityContributionTotal = Math.max(0, Math.floor(Number(totalState && totalState.words) || 0));

  // Recent runs (last 50, flagged ones excluded) for averages.
  const recentRaw = await getJson(env, userScoreKey(userId), []);
  const recent = (Array.isArray(recentRaw) ? recentRaw : []).filter((r) => r && !r.flagged && Number(r.wpm) > 0);
  const runs = recent.length;
  const round1 = (v) => Math.round(v * 10) / 10;
  const averageWpm = runs ? round1(recent.reduce((sum, r) => sum + (Number(r.wpm) || 0), 0) / runs) : 0;
  const averageAccuracy = runs ? round1(recent.reduce((sum, r) => sum + (Number(r.accuracy) || 0), 0) / runs) : 0;

  // Words typed toward this week's team goal.
  const weekState = await getJson(env, communityContributionKey(weekKey), null);
  const weekEntry = weekState && weekState.entries ? weekState.entries[`user:${userId}`] : null;
  let wordsThisWeek = Math.max(0, Math.floor(Number(weekEntry && weekEntry.damage) || 0));
  const weeklyWords = parseJsonSafe(progress['sampire-weekly-words'] || 'null', null);
  if (weeklyWords && String(weeklyWords.week || '') === weekKey) wordsThisWeek = Math.max(wordsThisWeek, Math.floor(Number(weeklyWords.words) || 0));

  return json({
    username: user.username,
    createdAt: Number(user.createdAt) || null,
    badgeIds: badgeUnique,
    lifetimeChallengesCompleted,
    level,
    streak: streakOf(progress),
    personalBestWpm,
    weeklyBestWpm,
    bestByMode,
    averageWpm,
    averageAccuracy,
    runs,
    wordsThisWeek,
    weekKey,
    communityContributionTotal,
  }, 200);
}
