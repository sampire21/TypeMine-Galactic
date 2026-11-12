import { json, getAuthUser, publicUser, hasStorage, storageMissing, touchLastSeen } from './_lib.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!hasStorage(env)) return storageMissing();
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  await touchLastSeen(env, user.id);
  return json({ user: publicUser(user, env) }, 200);
}
