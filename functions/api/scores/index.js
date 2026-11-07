import {
  json,
  readJson,
  getAuthUser,
  getJson,
  putJson,
  userScoreKey,
  leaderboardKey,
  normalizeMode,
  hasStorage,
} from '../_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return json({ error: 'Server storage not configured (TYPING_APP KV binding missing).' }, 500);
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const body = await readJson(request);
  const score = {
    id: crypto.randomUUID(),
    userId: user.id,
    username: user.username,
    wpm: Number(body.wpm) || 0,
    accuracy: Number(body.accuracy) || 0,
    rawWpm: Number(body.rawWpm) || 0,
    consistency: Number(body.consistency) || 0,
    time: Number(body.time) || 0,
    typedWords: Math.max(0, Math.floor(Number(body.typedWords) || 0)),
    mode: normalizeMode(body.mode),
    date: Date.now(), // server time; client-supplied date is ignored
    createdAt: Date.now(),
  };

  if (
    !Number.isFinite(score.wpm) || !Number.isFinite(score.rawWpm) ||
    !Number.isFinite(score.accuracy) || !Number.isFinite(score.consistency) || !Number.isFinite(score.time) ||
    score.wpm < 0 || score.wpm > 300 ||
    score.rawWpm < 0 || score.rawWpm > 400 ||
    score.accuracy < 0 || score.accuracy > 100 ||
    score.consistency < 0 || score.consistency > 100 ||
    score.time < 1 || score.time > 3600 ||
    score.typedWords > 20000
  ) {
    return json({ error: 'Invalid score payload' }, 400);
  }
  // Cross-check wpm against typed word count: wpm is chars/5 per minute, so with words of
  // up to ~12 chars it cannot exceed typedWords per minute * 2.5 (plus slack for short runs).
  if (score.typedWords > 0) {
    const wordsPerMin = score.typedWords / (score.time / 60);
    if (score.wpm > wordsPerMin * 2.5 + 10) return json({ error: 'Implausible score' }, 400);
    // Cannot type more than ~25 words/sec worth of text (300 wpm of 5-char words is 5/s).
    if (wordsPerMin > 900) return json({ error: 'Implausible score' }, 400);
  }

  const isBetterScore = (candidate, baseline) => {
    if (!baseline) return true;
    if ((candidate.wpm || 0) > (baseline.wpm || 0)) return true;
    if ((candidate.wpm || 0) < (baseline.wpm || 0)) return false;
    if ((candidate.accuracy || 0) > (baseline.accuracy || 0)) return true;
    if ((candidate.accuracy || 0) < (baseline.accuracy || 0)) return false;
    return (candidate.date || 0) > (baseline.date || 0);
  };

  const scoresKey = userScoreKey(user.id);
  const userScores = await getJson(env, scoresKey, []);
  const existingIdx = userScores.findIndex((s) => s.mode === score.mode);
  const existing = existingIdx >= 0 ? userScores[existingIdx] : null;
  if (!isBetterScore(score, existing)) {
    return json({ error: 'Only your best run for this mode can be submitted.' }, 409);
  }
  if (existingIdx >= 0) userScores[existingIdx] = score;
  else userScores.unshift(score);
  userScores.sort((a, b) => b.date - a.date);
  if (userScores.length > 200) userScores.length = 200;
  await putJson(env, scoresKey, userScores);

  const lbKey = leaderboardKey();
  const leaderboard = await getJson(env, lbKey, []);
  const entry = {
    userId: user.id,
    username: user.username,
    mode: score.mode,
    wpm: score.wpm,
    accuracy: score.accuracy,
    rawWpm: score.rawWpm,
    time: score.time,
    date: score.date,
  };
  const lbIdx = leaderboard.findIndex((row) => row.userId === user.id && row.mode === score.mode);
  const lbExisting = lbIdx >= 0 ? leaderboard[lbIdx] : null;
  if (lbIdx >= 0) {
    if (isBetterScore(entry, lbExisting)) leaderboard[lbIdx] = entry;
  } else {
    leaderboard.push(entry);
  }
  leaderboard.sort((a, b) => b.wpm - a.wpm || b.accuracy - a.accuracy || b.date - a.date);
  if (leaderboard.length > 300) leaderboard.length = 300;
  await putJson(env, lbKey, leaderboard);

  user.lastSeenAt = Date.now();
  await putJson(env, `user:${user.id}`, user);

  return json({ ok: true, score }, 201);
}
