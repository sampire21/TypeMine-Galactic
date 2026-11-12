// Local server: a thin adapter that runs the SAME /api handlers as the Cloudflare Worker
// (functions/api/*.js through worker.js) on top of an in-memory KV store saved to
// data/app-data.json, plus a static file server that stands in for Cloudflare's asset host.
//
//   node server.js            -> http://localhost:3000
//   PORT=3001 node server.js  -> http://localhost:3001
//
// Environment:
//   TYPING_TEST_TOKEN_SECRET (or TOKEN_SECRET)  signs login cookies; random per start if unset (sessions then die on restart)
//   ADMIN_USERNAME / ADMIN_USER_ID              who gets the admin panel
//   DATA_FILE                                   where accounts and scores are saved (default data/app-data.json)
//   TRUST_PROXY=1                               honour x-forwarded-for / x-forwarded-proto (behind a reverse proxy)
//   ASSET_CACHE=long|short                      long = cache assets a year; default short (revalidate), long when NODE_ENV=production
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const ROOT = __dirname;
const DEFAULT_PORT = 3000;
const MAX_API_BODY_BYTES = 1024 * 1024;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.webmanifest', '.txt', '.xml', '.svg']);
const MIN_COMPRESS_BYTES = 1024;

// Never served, even though they sit in the project folder.
const BLOCKED_PREFIXES = ['server.js', 'worker.js', 'functions', 'tests', 'test-results', 'docker', 'node_modules', 'data', '.git', 'playwright.config.js', 'progress.md'];
const BLOCKED_SUFFIXES = ['.md', '.toml', '.log'];
const BLOCKED_NAMES = ['package.json', 'package-lock.json', 'Dockerfile', '.assetsignore', '.wranglerignore', '.gitignore', '.env'];

function isBlockedPath(relative) {
    const rel = relative.split(path.sep).join('/');
    if (!rel) return false;
    const first = rel.split('/')[0];
    if (first.startsWith('.')) return true;
    if (BLOCKED_PREFIXES.includes(first)) return true;
    if (rel.split('/').some((part) => part.startsWith('.'))) return true;
    const base = path.posix.basename(rel);
    if (BLOCKED_NAMES.includes(base)) return true;
    if (base.startsWith('.env')) return true;
    return BLOCKED_SUFFIXES.some((suffix) => rel.toLowerCase().endsWith(suffix));
}

// ---------------------------------------------------------------------------
// In-memory KV with the subset of the Cloudflare KV API the handlers use.
// ---------------------------------------------------------------------------
class MemoryKV {
    constructor(filePath = null) {
        this.filePath = filePath;
        this.store = new Map(); // key -> { value: string, metadata: any, expiration: seconds|null }
        this.saveTimer = null;
        this.dirty = false;
        if (filePath) this.load();
    }

    load() {
        try {
            if (!fs.existsSync(this.filePath)) return;
            const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
            if (parsed && parsed.version === 2 && parsed.kv && typeof parsed.kv === 'object') {
                for (const [key, row] of Object.entries(parsed.kv)) {
                    if (!row || typeof row.value !== 'string') continue;
                    this.store.set(key, { value: row.value, metadata: row.metadata == null ? null : row.metadata, expiration: Number(row.expiration) || null });
                }
                return;
            }
            // Old hand-written server layout ({ users, scores }); keep a copy and start clean.
            const backup = `${this.filePath}.legacy-${Date.now()}.json`;
            fs.copyFileSync(this.filePath, backup);
            console.warn(`[server] data file was in the old format; copied to ${path.basename(backup)} and starting with an empty store`);
        } catch (e) {
            console.warn('[server] could not read data file, starting with an empty store:', e.message);
        }
    }

    scheduleSave() {
        if (!this.filePath) return;
        this.dirty = true;
        if (this.saveTimer) return;
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            this.flushSync();
        }, 50);
        if (typeof this.saveTimer.unref === 'function') this.saveTimer.unref();
    }

    flushSync() {
        if (!this.filePath || !this.dirty) return;
        this.dirty = false;
        if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
        this.sweepExpired();
        const kv = {};
        for (const [key, row] of this.store.entries()) kv[key] = row;
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tmp = `${this.filePath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify({ version: 2, savedAt: Date.now(), kv }, null, 1), 'utf8');
        fs.renameSync(tmp, this.filePath);
    }

    isExpired(row, nowSec = Date.now() / 1000) {
        return !!(row && row.expiration && row.expiration <= nowSec);
    }

    sweepExpired() {
        const nowSec = Date.now() / 1000;
        for (const [key, row] of this.store.entries()) {
            if (this.isExpired(row, nowSec)) this.store.delete(key);
        }
    }

    live(key) {
        const row = this.store.get(key);
        if (!row) return null;
        if (this.isExpired(row)) {
            this.store.delete(key);
            this.scheduleSave();
            return null;
        }
        return row;
    }

    async get(key, options = null) {
        const row = this.live(String(key));
        if (!row) return null;
        const type = typeof options === 'string' ? options : (options && options.type) || 'text';
        if (type === 'json') { try { return JSON.parse(row.value); } catch { return null; } }
        if (type === 'arrayBuffer') return new TextEncoder().encode(row.value).buffer;
        return row.value;
    }

    async getWithMetadata(key, options = null) {
        const row = this.live(String(key));
        const value = row ? await this.get(key, options) : null;
        return { value, metadata: row ? row.metadata : null };
    }

    async put(key, value, options = null) {
        const text = typeof value === 'string' ? value
            : value instanceof ArrayBuffer ? new TextDecoder().decode(new Uint8Array(value))
                : ArrayBuffer.isView(value) ? new TextDecoder().decode(value)
                    : String(value);
        let expiration = null;
        if (options && Number(options.expirationTtl) > 0) expiration = Math.floor(Date.now() / 1000) + Math.floor(Number(options.expirationTtl));
        else if (options && Number(options.expiration) > 0) expiration = Math.floor(Number(options.expiration));
        const metadata = options && options.metadata !== undefined ? JSON.parse(JSON.stringify(options.metadata)) : null;
        this.store.set(String(key), { value: text, metadata, expiration });
        this.scheduleSave();
    }

    async delete(key) {
        if (this.store.delete(String(key))) this.scheduleSave();
    }

    async list(options = {}) {
        const prefix = String((options && options.prefix) || '');
        const limit = Math.max(1, Math.min(1000, Number((options && options.limit) || 1000)));
        const start = Number((options && options.cursor) || 0) || 0;
        const nowSec = Date.now() / 1000;
        const names = [...this.store.keys()].filter((k) => k.startsWith(prefix) && !this.isExpired(this.store.get(k), nowSec)).sort();
        const page = names.slice(start, start + limit);
        const keys = page.map((name) => {
            const row = this.store.get(name);
            const out = { name };
            if (row.expiration) out.expiration = row.expiration;
            if (row.metadata != null) out.metadata = row.metadata;
            return out;
        });
        const listComplete = start + limit >= names.length;
        return { keys, list_complete: listComplete, cursor: listComplete ? undefined : String(start + limit), cacheStatus: null };
    }

    clear() {
        this.store.clear();
        this.scheduleSave();
    }
}

// ---------------------------------------------------------------------------
// Static files, standing in for Cloudflare's ASSETS binding.
// ---------------------------------------------------------------------------
function createAssets({ root = ROOT, cache = 'short' } = {}) {
    const compressedCache = new Map();

    function textResponse(status, text) {
        return new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
    }

    async function fetchAsset(request) {
        const url = new URL(request.url);
        const method = request.method.toUpperCase();
        if (method !== 'GET' && method !== 'HEAD') return textResponse(405, 'Method not allowed');
        let reqPath;
        try {
            reqPath = decodeURIComponent(url.pathname);
        } catch {
            return textResponse(400, 'Bad request');
        }
        if (reqPath.includes('\0')) return textResponse(400, 'Bad request');
        if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
        const resolved = path.resolve(root, `.${reqPath}`);
        if (resolved !== root && !resolved.startsWith(root + path.sep)) return textResponse(403, 'Forbidden');
        const relative = path.relative(root, resolved);
        if (isBlockedPath(relative)) return textResponse(404, 'Not found');

        let stat;
        try {
            stat = fs.statSync(resolved);
        } catch {
            return textResponse(404, 'Not found');
        }
        if (stat.isDirectory()) {
            const indexPath = path.join(resolved, 'index.html');
            if (!fs.existsSync(indexPath)) return textResponse(404, 'Not found');
            return fetchAsset(new Request(new URL(`${reqPath.replace(/\/?$/, '/')}index.html`, url).href, { method, headers: request.headers }));
        }

        const ext = path.extname(resolved).toLowerCase();
        const base = path.basename(resolved);
        const headers = new Headers();
        headers.set('content-type', MIME[ext] || 'application/octet-stream');
        headers.set('x-content-type-options', 'nosniff');
        const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
        headers.set('etag', etag);
        headers.set('last-modified', new Date(stat.mtimeMs).toUTCString());
        if (base === 'index.html' || base === 'sw.js') headers.set('cache-control', 'no-cache');
        else if (cache === 'long') headers.set('cache-control', 'public, max-age=31536000, immutable');
        else headers.set('cache-control', 'no-cache');
        headers.set('vary', 'Accept-Encoding');

        if (request.headers.get('if-none-match') === etag) {
            return new Response(null, { status: 304, headers });
        }

        let body = fs.readFileSync(resolved);
        if (COMPRESSIBLE.has(ext) && body.length >= MIN_COMPRESS_BYTES) {
            const accept = String(request.headers.get('accept-encoding') || '');
            const encoding = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : '';
            if (encoding) {
                const cacheKey = `${resolved}:${stat.size}:${Math.floor(stat.mtimeMs)}:${encoding}`;
                let compressed = compressedCache.get(cacheKey);
                if (!compressed) {
                    compressed = encoding === 'br'
                        ? zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })
                        : zlib.gzipSync(body, { level: 6 });
                    if (compressedCache.size > 200) compressedCache.clear();
                    compressedCache.set(cacheKey, compressed);
                }
                body = compressed;
                headers.set('content-encoding', encoding);
            }
        }
        headers.set('content-length', String(body.length));
        return new Response(method === 'HEAD' ? null : body, { status: 200, headers });
    }

    return { fetch: fetchAsset };
}

// ---------------------------------------------------------------------------
// Node <-> web Request/Response plumbing
// ---------------------------------------------------------------------------
function readBody(req, maxBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        req.on('data', (chunk) => {
            total += chunk.length;
            if (total > maxBytes) {
                const err = new Error('Payload too large');
                err.status = 413;
                req.destroy();
                reject(err);
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

async function toWebRequest(req, { trustProxy }) {
    const host = req.headers.host || 'localhost';
    const forwardedProto = trustProxy ? String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() : '';
    const proto = forwardedProto === 'https' ? 'https' : 'http';
    const url = `${proto}://${host}${req.url || '/'}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        if (value == null) continue;
        if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
        else headers.set(key, String(value));
    }
    const forwardedFor = trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
    headers.set('cf-connecting-ip', forwardedFor || req.socket.remoteAddress || 'unknown');
    const method = (req.method || 'GET').toUpperCase();
    const init = { method, headers };
    if (method !== 'GET' && method !== 'HEAD') {
        init.body = await readBody(req, MAX_API_BODY_BYTES);
    }
    return new Request(url, init);
}

async function sendWebResponse(res, response, method) {
    res.statusCode = response.status;
    for (const [key, value] of response.headers) {
        if (key.toLowerCase() === 'set-cookie') continue;
        res.setHeader(key, value);
    }
    const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    if (cookies.length) res.setHeader('set-cookie', cookies);
    if (method === 'HEAD' || response.status === 204 || response.status === 304 || !response.body) {
        res.end();
        return;
    }
    const buf = Buffer.from(await response.arrayBuffer());
    if (!res.hasHeader('content-length')) res.setHeader('content-length', String(buf.length));
    res.end(buf);
}

// ---------------------------------------------------------------------------
// App factory (used by `node server.js` and by tests/backend.test.js)
// ---------------------------------------------------------------------------
function createApp(options = {}) {
    const port = options.port != null ? Number(options.port) : Number(process.env.PORT || DEFAULT_PORT);
    const dataFile = options.dataFile === null ? null : (options.dataFile || process.env.DATA_FILE || path.join(ROOT, 'data', 'app-data.json'));
    const trustProxy = options.trustProxy != null ? !!options.trustProxy : process.env.TRUST_PROXY === '1';
    const assetCache = options.assetCache || process.env.ASSET_CACHE || (process.env.NODE_ENV === 'production' ? 'long' : 'short');
    const kv = options.kv || new MemoryKV(dataFile);

    let tokenSecret = String(options.tokenSecret || process.env.TYPING_TEST_TOKEN_SECRET || process.env.TOKEN_SECRET || '');
    let randomSecret = false;
    if (!tokenSecret) {
        tokenSecret = crypto.randomBytes(32).toString('hex');
        randomSecret = true;
    }
    const env = {
        TYPING_APP: kv,
        TOKEN_SECRET: tokenSecret,
        ADMIN_USERNAME: options.adminUsername != null ? options.adminUsername : (process.env.ADMIN_USERNAME || ''),
        ADMIN_USER_ID: options.adminUserId != null ? options.adminUserId : (process.env.ADMIN_USER_ID || ''),
        ASSETS: createAssets({ root: ROOT, cache: assetCache }),
    };
    const ctx = {
        waitUntil(promise) { Promise.resolve(promise).catch(() => {}); },
        passThroughOnException() {},
    };

    // The router and security headers are the same module worker.js uses.
    let worker = null;
    async function loadWorker() {
        if (!worker) {
            const mod = await import(pathToFileURL(path.join(ROOT, 'functions', 'api', '_router.js')).href);
            worker = {
                async fetch(request, workerEnv, workerCtx) {
                    const apiResponse = await mod.handleApiRequest(request, workerEnv, workerCtx);
                    if (apiResponse) return apiResponse;
                    const assetRes = await workerEnv.ASSETS.fetch(request);
                    return mod.applySecurityHeaders(assetRes, request);
                },
            };
        }
        return worker;
    }

    const server = http.createServer(async (req, res) => {
        const method = (req.method || 'GET').toUpperCase();
        try {
            const w = await loadWorker();
            const request = await toWebRequest(req, { trustProxy });
            const response = await w.fetch(request, env, ctx);
            await sendWebResponse(res, response, method);
        } catch (e) {
            const status = Number(e && e.status) || 500;
            if (status !== 413) console.error('[server] request failed:', e && e.stack ? e.stack : e);
            if (!res.headersSent) {
                res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
            }
            res.end(JSON.stringify({ error: status === 413 ? 'Request body too large' : 'Server error' }));
        }
    });

    async function start() {
        await loadWorker();
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(port, () => {
                server.off('error', reject);
                resolve();
            });
        });
        const actualPort = server.address().port;
        if (!options.quiet) {
            console.log(`Listening on http://localhost:${actualPort}`);
            console.log(`Data file: ${dataFile || '(memory only)'}`);
            if (randomSecret) {
                console.warn('WARNING: TYPING_TEST_TOKEN_SECRET is not set. Using a random secret for this run only, so every login will stop working when the server restarts. Set it in your environment to keep sessions.');
            }
            if (!env.ADMIN_USERNAME && !env.ADMIN_USER_ID) {
                console.log('Note: ADMIN_USERNAME is not set, so no account has the admin panel.');
            }
        }
        return actualPort;
    }

    async function stop() {
        kv.flushSync();
        await new Promise((resolve) => server.close(() => resolve()));
    }

    const flushOnExit = () => { try { kv.flushSync(); } catch {} };
    process.once('exit', flushOnExit);
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.once(signal, () => { flushOnExit(); process.exit(0); });
    }

    return { server, start, stop, kv, env, port };
}

module.exports = { createApp, MemoryKV, createAssets, isBlockedPath };

if (require.main === module) {
    createApp().start().catch((e) => {
        console.error('[server] failed to start:', e && e.message ? e.message : e);
        process.exit(1);
    });
}
