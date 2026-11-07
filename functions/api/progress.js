import { json, readJson, getAuthUser, getJson, putJson, hasStorage } from './_lib.js';

function progressKey(userId) {
  return `progress:user:${userId}`;
}

const MAX_PROGRESS_BYTES = 256 * 1024;
const NUMERIC_PROGRESS_KEY = /^(sampire-)?(xp|skill-points|skillpoints|totalxp)$/i;

// Reject non-finite or negative values for XP / skill-point style fields (recursive, depth-limited).
function progressNumbersValid(value, depth = 0) {
  if (depth > 8 || !value || typeof value !== 'object') return true;
  for (const [key, v] of Object.entries(value)) {
    if (NUMERIC_PROGRESS_KEY.test(key) && typeof v !== 'object') {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return false;
    } else if (typeof v === 'number' && !Number.isFinite(v)) {
      return false;
    } else if (v && typeof v === 'object' && !progressNumbersValid(v, depth + 1)) {
      return false;
    }
  }
  return true;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return json({ error: 'Server storage not configured (TYPING_APP KV binding missing).' }, 500);
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const payload = await getJson(env, progressKey(user.id), { progress: {}, updatedAt: 0 });
  return json({
    progress: (payload && payload.progress && typeof payload.progress === 'object') ? payload.progress : {},
    updatedAt: Number(payload && payload.updatedAt) || 0,
  }, 200);
}

export async function onRequestPut(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return json({ error: 'Server storage not configured (TYPING_APP KV binding missing).' }, 500);
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_PROGRESS_BYTES) return json({ error: 'Progress payload too large' }, 413);
  let rawBody = '';
  try { rawBody = await request.text(); } catch { rawBody = ''; }
  if (rawBody.length > MAX_PROGRESS_BYTES) return json({ error: 'Progress payload too large' }, 413);
  let body = {};
  try { body = JSON.parse(rawBody); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid progress payload' }, 400);
  const existing = await getJson(env, progressKey(user.id), { progress: {}, updatedAt: 0 });
  const existingUpdatedAt = Number(existing && existing.updatedAt) || 0;
  const baseUpdatedAtRaw = Number(body && body.baseUpdatedAt);
  const baseUpdatedAt = Number.isFinite(baseUpdatedAtRaw) ? Math.max(0, Math.floor(baseUpdatedAtRaw)) : 0;
  if (baseUpdatedAt < existingUpdatedAt) {
    return json({
      error: 'Progress conflict: newer progress exists on another session.',
      progress: (existing && existing.progress && typeof existing.progress === 'object') ? existing.progress : {},
      updatedAt: existingUpdatedAt,
    }, 409);
  }

  const progress = (body && body.progress && typeof body.progress === 'object' && !Array.isArray(body.progress))
    ? body.progress
    : null;
  if (!progress) return json({ error: 'Progress must be an object' }, 400);
  if (!progressNumbersValid(progress)) return json({ error: 'Invalid numeric progress values' }, 400);
  const updatedAt = Date.now();
  await putJson(env, progressKey(user.id), { progress, updatedAt });
  user.lastSeenAt = updatedAt;
  await putJson(env, `user:${user.id}`, user);
  return json({ ok: true, updatedAt }, 200);
}
