import { onRequestGet as handleHealth } from './health.js';
import { onRequestPost as handleSignup } from './signup.js';
import { onRequestPost as handleLogin } from './login.js';
import { onRequestPost as handleRefresh } from './refresh.js';
import { onRequestPost as handleLogout } from './logout.js';
import { onRequestGet as handleMe } from './me.js';
import { onRequestPost as handleScores } from './scores/index.js';
import { onRequestGet as handleScoresMe } from './scores/me.js';
import { onRequestGet as handleLeaderboard } from './leaderboard.js';
import { onRequestGet as handleProgressGet, onRequestPut as handleProgressPut } from './progress.js';
import { onRequestPost as handleCommunityContribute } from './community/contribute.js';
import { onRequestPatch as handleAccountPatch, onRequestDelete as handleAccountDelete } from './account.js';
import { onRequestGet as handleUserSummary } from './user-summary.js';
import { onRequestGet as handleFriendsGet, onRequestPost as handleFriendsPost, onRequestDelete as handleFriendsDelete } from './friends.js';
import { onRequestGet as handleAdminUsers } from './admin/users.js';
import { onRequestGet as handleAdminUserGet, onRequestPatch as handleAdminUserPatch, onRequestDelete as handleAdminUserDelete } from './admin/users/[id].js';
import { onRequestGet as handleAdminScoresGet, onRequestPatch as handleAdminScorePatch } from './admin/scores.js';

const routes = [
  { method: 'GET', path: '/api/health', handler: handleHealth },
  { method: 'POST', path: '/api/signup', handler: handleSignup },
  { method: 'POST', path: '/api/login', handler: handleLogin },
  { method: 'POST', path: '/api/refresh', handler: handleRefresh },
  { method: 'POST', path: '/api/logout', handler: handleLogout },
  { method: 'GET', path: '/api/me', handler: handleMe },
  { method: 'POST', path: '/api/scores', handler: handleScores },
  { method: 'GET', path: '/api/scores/me', handler: handleScoresMe },
  { method: 'GET', path: '/api/leaderboard', handler: handleLeaderboard },
  { method: 'GET', path: '/api/progress', handler: handleProgressGet },
  { method: 'PUT', path: '/api/progress', handler: handleProgressPut },
  { method: 'POST', path: '/api/community/contribute', handler: handleCommunityContribute },
  { method: 'PATCH', path: '/api/account', handler: handleAccountPatch },
  { method: 'DELETE', path: '/api/account', handler: handleAccountDelete },
  { method: 'GET', path: '/api/user-summary', handler: handleUserSummary },
  { method: 'GET', path: '/api/friends', handler: handleFriendsGet },
  { method: 'POST', path: '/api/friends', handler: handleFriendsPost },
  { method: 'GET', path: '/api/admin/users', handler: handleAdminUsers },
  { method: 'GET', path: '/api/admin/scores', handler: handleAdminScoresGet },
];

// Routes with a value in the path.
const dynamicRoutes = [
  { pattern: /^\/api\/admin\/users\/([^/]+)$/, param: 'id', handlers: { GET: handleAdminUserGet, PATCH: handleAdminUserPatch, DELETE: handleAdminUserDelete } },
  { pattern: /^\/api\/admin\/scores\/([^/]+)$/, param: 'id', handlers: { PATCH: handleAdminScorePatch } },
  { pattern: /^\/api\/friends\/([^/]+)$/, param: 'username', handlers: { DELETE: handleFriendsDelete } },
];

const API_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
};

function apiJson(data, status) {
  return new Response(JSON.stringify(data), { status, headers: API_HEADERS });
}

function errorResponse(err, requestId, request, url) {
  const status = Number(err && err.status) || 0;
  if (status >= 400 && status < 500) {
    return apiJson({ error: err.message || 'Request failed', code: err.code || undefined, requestId }, status);
  }
  console.error('[api-error]', {
    requestId,
    method: request.method,
    path: url.pathname,
    error: err && err.message ? err.message : 'Internal server error',
    stack: err && err.stack ? err.stack : null,
  });
  return apiJson({ error: 'Internal server error', code: 'INTERNAL_ERROR', requestId }, 500);
}

// Handles /api/* requests. Returns null for anything else so the caller can serve assets.
export async function handleApiRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  const requestId = request.headers.get('cf-ray') || crypto.randomUUID();

  for (const route of dynamicRoutes) {
    const match = url.pathname.match(route.pattern);
    if (!match) continue;
    const handler = route.handlers[request.method];
    if (!handler) return apiJson({ error: 'Method not allowed' }, 405);
    try {
      return await handler({ request, env, ctx, params: { [route.param]: decodeURIComponent(match[1]) }, requestId });
    } catch (err) {
      return errorResponse(err, requestId, request, url);
    }
  }

  const match = routes.find((r) => r.method === request.method && r.path === url.pathname);
  if (match) {
    try {
      return await match.handler({ request, env, ctx, requestId });
    } catch (err) {
      return errorResponse(err, requestId, request, url);
    }
  }
  if (routes.some((r) => r.path === url.pathname)) return apiJson({ error: 'Method not allowed' }, 405);
  return apiJson({ error: 'Not found' }, 404);
}

function buildCsp(isHttps) {
  const parts = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (isHttps) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}

// Adds the browser security headers to a page or asset response.
export function applySecurityHeaders(response, request) {
  const url = new URL(request.url);
  const isHttps = url.protocol === 'https:';
  const reqPath = url.pathname || '/';
  const isHtml = reqPath === '/' || reqPath.endsWith('.html') || String(response.headers.get('content-type') || '').includes('text/html');
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=()');
  headers.set('cross-origin-opener-policy', 'same-origin');
  headers.set('cross-origin-resource-policy', 'same-origin');
  if (isHttps) headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  if (isHtml) {
    headers.set('content-security-policy', buildCsp(isHttps));
    headers.set('x-frame-options', 'DENY');
    // Keep HTML uncached so clients always bootstrap with the newest app script.
    headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
    headers.set('pragma', 'no-cache');
    headers.set('expires', '0');
  } else if (reqPath === '/sw.js') {
    headers.set('cache-control', 'no-cache');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
