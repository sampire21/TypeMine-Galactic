import {
  json,
  readJson,
  getAuthUser,
  getJson,
  putJson,
  userScoreKey,
  progressKey,
  allTimeBestKey,
  weeklyBestKey,
  flaggedScoreKey,
  normalizeMode,
  hasStorage,
  storageMissing,
  getWeekKeyUtc,
  WEEKLY_KEY_TTL_SECONDS,
  TIMED_MODE_SECONDS,
  isBetterScore,
  putBestRow,
  compactScoreRow,
  invalidateBoardCache,
  progressOf,
  xpOf,
  levelFromXp,
  incrementRateLimit,
  rateLimited,
  touchLastSeen,
} from '../_lib.js';

const MAX_RECENT_RUNS = 50;
const FLAG_ABSOLUTE_WPM = 200;
const FLAG_JUMP_WPM = 40;
const WPM_TOLERANCE_RATIO = 0.08;
const WPM_TOLERANCE_MIN = 1.5;
const FLAGGED_TTL_SECONDS = 90 * 24 * 60 * 60;

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

// Equipped title from the synced progress record (sampire-title = JSON { title, ... }), 24 chars max.
// The client escapes it on render.
function titleOf(progress) {
  try {
    const raw = progress && progress['sampire-title'];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return String(parsed && parsed.title || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24);
  } catch {
    return '';
  }
}

// Returns { ok: true, score } or { ok: false, error }.
export function validateScorePayload(body, nowMs = Date.now()) {
  const mode = normalizeMode(body.mode);
  const wpm = num(body.wpm);
  const rawWpm = num(body.rawWpm);
  const accuracy = num(body.accuracy);
  const consistency = body.consistency == null ? 0 : num(body.consistency);
  const time = num(body.time);
  const typedWords = Math.floor(num(body.typedWords));
  const typedChars = Math.floor(num(body.typedChars));
  const keystrokes = body.keystrokes == null ? null : Math.floor(num(body.keystrokes));
  const mistakes = body.mistakes == null ? null : Math.floor(num(body.mistakes));
  const backspaces = body.backspaces == null ? null : Math.floor(num(body.backspaces));

  if ([wpm, rawWpm, accuracy, consistency, time].some((v) => !Number.isFinite(v))) return { ok: false, error: 'Invalid score payload' };
  if (!Number.isFinite(typedWords) || typedWords < 1 || typedWords > 20000) return { ok: false, error: 'typedWords must be at least 1' };
  if (!Number.isFinite(typedChars) || typedChars < 1 || typedChars > 200000) return { ok: false, error: 'typedChars must be at least 1' };
  if (wpm < 0 || rawWpm < 0 || consistency < 0 || consistency > 100) return { ok: false, error: 'Invalid score payload' };
  if (accuracy < 50 || accuracy > 100) return { ok: false, error: 'Accuracy must be between 50 and 100 to count' };

  const timedSeconds = TIMED_MODE_SECONDS[mode];
  if (timedSeconds) {
    if (Math.abs(time - timedSeconds) > 1) return { ok: false, error: `Time for ${mode} must be ${timedSeconds} seconds` };
  } else if (typedWords < 10 || time < 1 || time > 3600) {
    // Same rule the client uses for a counted run (README interface item 2): at least 10 words.
    // A 10-word test typed at 70 WPM takes about 8 seconds, so a fixed time floor would reject real runs.
    return { ok: false, error: 'Runs shorter than 10 words do not count' };
  }

  // WPM is standard: five characters make one word.
  const expectedWpm = (typedChars / 5) / (time / 60);
  const tolerance = Math.max(WPM_TOLERANCE_MIN, expectedWpm * WPM_TOLERANCE_RATIO);
  if (Math.abs(wpm - expectedWpm) > tolerance) return { ok: false, error: 'WPM does not match the typed text and time' };
  if (rawWpm + 1 < wpm) return { ok: false, error: 'Raw WPM cannot be lower than WPM' };

  // Plausibility caps shared with the client (README interface item 2).
  const wordsPerMin = typedWords / (time / 60);
  if (wpm > 300 || wpm > wordsPerMin * 2.5 + 10) return { ok: false, error: 'Implausible score' };
  if (rawWpm > 400) return { ok: false, error: 'Implausible score' };
  if (keystrokes != null && Number.isFinite(keystrokes) && keystrokes > 0 && keystrokes < typedChars) return { ok: false, error: 'Keystrokes cannot be fewer than typed characters' };

  const round1 = (v) => Math.round(v * 10) / 10;
  return {
    ok: true,
    score: {
      id: crypto.randomUUID(),
      wpm: round1(wpm),
      rawWpm: round1(rawWpm),
      accuracy: round1(accuracy),
      consistency: round1(consistency),
      time: Math.round(time * 10) / 10,
      typedWords,
      typedChars,
      keystrokes: Number.isFinite(keystrokes) ? Math.max(0, keystrokes) : null,
      mistakes: Number.isFinite(mistakes) ? Math.max(0, mistakes) : null,
      backspaces: Number.isFinite(backspaces) ? Math.max(0, backspaces) : null,
      mode,
      date: nowMs, // server time; the client-supplied date is ignored
      createdAt: nowMs,
    },
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return storageMissing();
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const rate = await incrementRateLimit(env, `rate:scores:user:${user.id}`, 60 * 10);
  if (rate.count > 60) return rateLimited('Too many score submissions. Please slow down.', rate.retryAfterSec);

  const body = await readJson(request);
  const check = validateScorePayload(body);
  if (!check.ok) return json({ error: check.error }, 400);

  const progressPayload = await getJson(env, progressKey(user.id), null);
  const progress = progressOf(progressPayload);
  const level = levelFromXp(xpOf(progress));
  const score = { ...check.score, userId: user.id, username: user.username, level, title: titleOf(progress) };

  const weekKey = getWeekKeyUtc(score.date);
  const atKey = allTimeBestKey(score.mode, user.id);
  const wkKey = weeklyBestKey(weekKey, score.mode, user.id);
  const previousBest = await getJson(env, atKey, null);
  const previousWeekly = await getJson(env, wkKey, null);

  // Flag, never block: very fast runs and sudden jumps wait for an admin to approve them.
  const reasons = [];
  if (score.wpm > FLAG_ABSOLUTE_WPM) reasons.push(`over ${FLAG_ABSOLUTE_WPM} WPM`);
  if (previousBest && score.wpm > (Number(previousBest.wpm) || 0) + FLAG_JUMP_WPM) reasons.push(`jump of more than ${FLAG_JUMP_WPM} WPM over previous best`);
  score.flagged = reasons.length > 0;
  if (score.flagged) score.flagReasons = reasons;

  // Recent runs list (profile history and /api/scores/me).
  const recent = await getJson(env, userScoreKey(user.id), []);
  const rows = Array.isArray(recent) ? recent : [];
  rows.unshift(score);
  rows.sort((a, b) => (Number(b.date) || 0) - (Number(a.date) || 0));
  if (rows.length > MAX_RECENT_RUNS) rows.length = MAX_RECENT_RUNS;
  await putJson(env, userScoreKey(user.id), rows);

  let ranked = false;
  if (score.flagged) {
    await putJson(env, flaggedScoreKey(score.id), { score: compactScoreRow(score), weekKey, reasons, submittedAt: score.date }, { expirationTtl: FLAGGED_TTL_SECONDS });
  } else {
    if (isBetterScore(score, previousBest)) {
      await putBestRow(env, atKey, score);
      ranked = true;
    }
    if (isBetterScore(score, previousWeekly)) {
      await putBestRow(env, wkKey, score, { expirationTtl: WEEKLY_KEY_TTL_SECONDS });
      ranked = true;
    }
    if (ranked) invalidateBoardCache();
  }

  await touchLastSeen(env, user.id);
  return json({ ok: true, ranked, flagged: score.flagged, score: compactScoreRow(score) }, 200);
}
