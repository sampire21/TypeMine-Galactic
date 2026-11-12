import { json, hasStorage } from './_lib.js';

// The client calls this once at boot to decide between "Cloud account" and
// "Saved on this device only". It never needs a login.
export async function onRequestGet(context) {
  const { env } = context;
  if (!hasStorage(env)) return json({ ok: false, error: 'Server storage not configured (TYPING_APP KV binding missing).' }, 503);
  let secretOk = true;
  try {
    const secret = String((env && env.TOKEN_SECRET) || '');
    secretOk = secret.length >= 16;
  } catch {
    secretOk = false;
  }
  if (!secretOk) return json({ ok: false, error: 'TOKEN_SECRET is not set on the server.' }, 503);
  return json({ ok: true, time: Date.now() }, 200);
}
