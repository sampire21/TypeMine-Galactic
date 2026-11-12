import {
  json,
  readJson,
  getJson,
  putJson,
  deleteKey,
  hasStorage,
  storageMissing,
  requireAdmin,
  flaggedScoreKey,
  FLAGGED_PREFIX,
  allTimeBestKey,
  weeklyBestKey,
  userScoreKey,
  isBetterScore,
  putBestRow,
  invalidateBoardCache,
  WEEKLY_KEY_TTL_SECONDS,
  getWeekKeyUtc,
} from '../_lib.js';

// GET /api/admin/scores?flagged=1 -> { scores: [{ id, userId, username, wpm, ..., reasons, weekKey, submittedAt }] }
export async function onRequestGet(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return storageMissing();
  const adminCheck = await requireAdmin(request, env);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);

  const scores = [];
  let cursor;
  do {
    const page = await env.TYPING_APP.list({ prefix: FLAGGED_PREFIX, cursor, limit: 1000 });
    for (const entry of (page && page.keys) || []) {
      const payload = await getJson(env, entry.name, null);
      if (!payload || !payload.score) continue;
      scores.push({ ...payload.score, reasons: payload.reasons || [], weekKey: payload.weekKey || '', submittedAt: payload.submittedAt || 0 });
    }
    cursor = page && !page.list_complete ? page.cursor : undefined;
  } while (cursor);
  scores.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  return json({ scores }, 200);
}

async function setFlaggedOnRecentRuns(env, userId, scoreId, flagged) {
  const rows = await getJson(env, userScoreKey(userId), []);
  if (!Array.isArray(rows)) return;
  let changed = false;
  for (const row of rows) {
    if (row && row.id === scoreId && !!row.flagged !== flagged) {
      row.flagged = flagged;
      if (!flagged) delete row.flagReasons;
      changed = true;
    }
  }
  if (changed) await putJson(env, userScoreKey(userId), rows);
}

// PATCH /api/admin/scores/<id> { approved: true } puts the run on the boards (if it is the user's best).
// { approved: false } throws the flagged run away. Either way the review entry is removed.
export async function onRequestPatch(context) {
  const { request, env, params } = context;
  if (!hasStorage(env)) return storageMissing();
  const adminCheck = await requireAdmin(request, env);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);

  const id = String(params && params.id || '').trim();
  if (!id) return json({ error: 'Invalid score id' }, 400);
  const payload = await getJson(env, flaggedScoreKey(id), null);
  if (!payload || !payload.score) return json({ error: 'Flagged score not found' }, 404);
  const body = await readJson(request);
  const approved = body.approved === true;

  const score = { ...payload.score, flagged: false };
  if (approved) {
    // Use the user's current name in case they renamed while the run sat in review.
    const user = await getJson(env, `user:${score.userId}`, null);
    if (user && user.username) score.username = user.username;
    const atKey = allTimeBestKey(score.mode, score.userId);
    if (isBetterScore(score, await getJson(env, atKey, null))) await putBestRow(env, atKey, score);
    const weekKey = payload.weekKey || getWeekKeyUtc(score.date);
    if (weekKey === getWeekKeyUtc()) {
      const wkKey = weeklyBestKey(weekKey, score.mode, score.userId);
      if (isBetterScore(score, await getJson(env, wkKey, null))) await putBestRow(env, wkKey, score, { expirationTtl: WEEKLY_KEY_TTL_SECONDS });
    }
    await setFlaggedOnRecentRuns(env, score.userId, id, false);
    invalidateBoardCache();
  }
  await deleteKey(env, flaggedScoreKey(id));
  return json({ ok: true, approved, score }, 200);
}
