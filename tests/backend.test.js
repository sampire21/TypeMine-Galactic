// Backend tests: run the local adapter (server.js) in this process on a spare port and talk to
// the real /api handlers over HTTP. Plain node, no test framework.
//
//   node tests/backend.test.js            (random free port)
//   PORT=3001 node tests/backend.test.js  (fixed port)
const assert = require('assert');
const { createApp } = require('../server.js');

const PORT = process.env.PORT ? Number(process.env.PORT) : 0;
const ADMIN_USERNAME = 'boss';

let app;
let base;
let passed = 0;

async function test(name, fn) {
    try {
        await fn();
        passed += 1;
        console.log(`  ok  ${name}`);
    } catch (e) {
        console.error(`  FAIL ${name}`);
        console.error(e && e.stack ? e.stack : e);
        process.exitCode = 1;
        throw e;
    }
}

// A tiny browser: keeps cookies per client and sends a fixed "IP".
function client(ip = '203.0.113.10') {
    const jar = new Map();
    async function call(method, path, body, extraHeaders = {}) {
        const headers = { 'x-forwarded-for': ip, ...extraHeaders };
        if (body !== undefined) headers['content-type'] = 'application/json';
        if (jar.size) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
        const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
        for (const raw of res.headers.getSetCookie()) {
            const [pair, ...attrs] = raw.split(';');
            const idx = pair.indexOf('=');
            const name = pair.slice(0, idx).trim();
            const value = pair.slice(idx + 1).trim();
            const maxAge = attrs.map((a) => a.trim()).find((a) => a.toLowerCase().startsWith('max-age='));
            if (!value || (maxAge && Number(maxAge.split('=')[1]) <= 0)) jar.delete(name);
            else jar.set(name, value);
        }
        let data = null;
        const text = await res.text();
        try { data = JSON.parse(text); } catch { data = text; }
        return { status: res.status, data, headers: res.headers, cookies: new Map(jar) };
    }
    return {
        jar,
        get: (p, h) => call('GET', p, undefined, h),
        post: (p, b, h) => call('POST', p, b, h),
        put: (p, b, h) => call('PUT', p, b, h),
        patch: (p, b, h) => call('PATCH', p, b, h),
        del: (p, b, h) => call('DELETE', p, b, h),
    };
}

function goodRun(wpm, overrides = {}) {
    // 30 second words30 run; typedChars matches the WPM so the server's recomputation agrees.
    const time = 30;
    const typedChars = Math.round(wpm * 5 * (time / 60));
    return {
        wpm,
        rawWpm: wpm + 4,
        accuracy: 96,
        consistency: 70,
        time,
        mode: 'words30',
        typedWords: Math.max(1, Math.round(typedChars / 5)),
        typedChars,
        keystrokes: typedChars + 10,
        mistakes: 3,
        backspaces: 2,
        ...overrides,
    };
}

async function main() {
    const started = Date.now();
    app = createApp({ port: PORT, dataFile: null, tokenSecret: 'test-secret-0123456789abcdef', adminUsername: ADMIN_USERNAME, trustProxy: true, quiet: true });
    const port = await app.start();
    base = `http://127.0.0.1:${port}`;
    console.log(`backend tests against ${base}`);

    const alice = client('203.0.113.1');
    const bob = client('203.0.113.2');
    const carol = client('203.0.113.3');
    const boss = client('203.0.113.4');
    const guest = client('203.0.113.50');
    let aliceId = '';
    let bobId = '';
    let flaggedId = '';

    await test('health route answers ok', async () => {
        const r = await guest.get('/api/health');
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.data.ok, true);
        assert.strictEqual(r.headers.get('cache-control'), 'no-store');
    });

    await test('static page carries security headers and blocked files are hidden', async () => {
        const page = await fetch(base + '/');
        assert.strictEqual(page.status, 200);
        assert.ok(String(page.headers.get('content-type')).includes('text/html'));
        assert.ok(String(page.headers.get('content-security-policy')).includes("frame-ancestors 'none'"));
        assert.strictEqual(page.headers.get('x-content-type-options'), 'nosniff');
        assert.ok(String(page.headers.get('cache-control')).includes('no-cache'));
        for (const p of ['/server.js', '/worker.js', '/functions/api/_lib.js', '/package.json', '/wrangler.toml', '/CLOUDFLARE_SETUP.md', '/tests/app.spec.js', '/data/app-data.json', '/.git/HEAD', '/playwright.config.js', '/docker/npm/docker-compose.yml']) {
            const r = await fetch(base + p);
            assert.strictEqual(r.status, 404, `${p} should be hidden`);
        }
        const css = await fetch(base + '/styles.css', { headers: { 'accept-encoding': 'gzip' } });
        assert.strictEqual(css.status, 200);
        assert.ok(String(css.headers.get('content-type')).startsWith('text/css'));
        assert.strictEqual(css.headers.get('content-encoding'), 'gzip');
        const unknown = await guest.get('/api/nope');
        assert.strictEqual(unknown.status, 404);
    });

    await test('signup, me, login and admin flag', async () => {
        const r = await alice.post('/api/signup', { username: 'alice', password: 'secret123' });
        assert.strictEqual(r.status, 201, JSON.stringify(r.data));
        assert.ok(alice.jar.has('sampire_session') && alice.jar.has('sampire_refresh'));
        aliceId = r.data.user.id;
        assert.strictEqual(r.data.user.isAdmin, false);
        const me = await alice.get('/api/me');
        assert.strictEqual(me.status, 200);
        assert.strictEqual(me.data.user.username, 'alice');

        const dup = await carol.post('/api/signup', { username: 'ALICE', password: 'secret123' });
        assert.strictEqual(dup.status, 409);
        const shortPw = await carol.post('/api/signup', { username: 'carol', password: '123' });
        assert.strictEqual(shortPw.status, 400);
        const longPw = await carol.post('/api/signup', { username: 'carol', password: 'x'.repeat(129) });
        assert.strictEqual(longPw.status, 400);

        const b = await bob.post('/api/signup', { username: 'bob', password: 'secret123' });
        assert.strictEqual(b.status, 201);
        bobId = b.data.user.id;
        const c = await carol.post('/api/signup', { username: 'carol', password: 'secret123' });
        assert.strictEqual(c.status, 201);
        const admin = await boss.post('/api/signup', { username: ADMIN_USERNAME, password: 'secret123' });
        assert.strictEqual(admin.status, 201);
        assert.strictEqual(admin.data.user.isAdmin, true);

        const wrong = await client('203.0.113.9').post('/api/login', { username: 'alice', password: 'nope-nope' });
        assert.strictEqual(wrong.status, 401);
        const missing = await client('203.0.113.9').post('/api/login', { username: 'nobody', password: 'nope-nope' });
        assert.strictEqual(missing.status, 401);
        const fresh = client('203.0.113.11');
        const ok = await fresh.post('/api/login', { username: 'Alice', password: 'secret123' });
        assert.strictEqual(ok.status, 200);
        assert.strictEqual(ok.data.user.id, aliceId);
    });

    await test('refresh rotates the session and tolerates the previous token briefly', async () => {
        const c = client('203.0.113.12');
        await c.post('/api/login', { username: 'bob', password: 'secret123' });
        const oldRefresh = c.jar.get('sampire_refresh');
        const r1 = await c.post('/api/refresh');
        assert.strictEqual(r1.status, 200);
        assert.notStrictEqual(c.jar.get('sampire_refresh'), oldRefresh);
        // Second tab still holding the old cookie must not be logged out.
        const stale = client('203.0.113.12');
        stale.jar.set('sampire_refresh', oldRefresh);
        const r2 = await stale.post('/api/refresh');
        assert.strictEqual(r2.status, 200);
        const junk = client('203.0.113.12');
        junk.jar.set('sampire_refresh', 'not.a.token');
        const r3 = await junk.post('/api/refresh');
        assert.strictEqual(r3.status, 401);
    });

    await test('logout clears cookies and revokes the session', async () => {
        const c = client('203.0.113.13');
        await c.post('/api/login', { username: 'carol', password: 'secret123' });
        const session = c.jar.get('sampire_session');
        const out = await c.post('/api/logout');
        assert.strictEqual(out.status, 200);
        assert.ok(!c.jar.has('sampire_session'));
        const replay = client('203.0.113.13');
        replay.jar.set('sampire_session', session);
        const me = await replay.get('/api/me');
        assert.strictEqual(me.status, 401);
    });

    await test('oversized JSON bodies are refused with 413', async () => {
        const r = await client('203.0.113.14').post('/api/signup', JSON.stringify({ username: 'big', password: 'x'.repeat(70 * 1024) }));
        assert.strictEqual(r.status, 413);
    });

    await test('score validation: reject 999 WPM and typedWords 0, mismatch, low accuracy, short runs', async () => {
        const r1 = await alice.post('/api/scores', goodRun(999));
        assert.strictEqual(r1.status, 400);
        const r2 = await alice.post('/api/scores', goodRun(60, { typedWords: 0 }));
        assert.strictEqual(r2.status, 400);
        const r3 = await alice.post('/api/scores', goodRun(60, { typedChars: 100 }));
        assert.strictEqual(r3.status, 400, 'wpm must match typedChars and time');
        const r4 = await alice.post('/api/scores', goodRun(60, { accuracy: 40 }));
        assert.strictEqual(r4.status, 400);
        const r5 = await alice.post('/api/scores', goodRun(60, { mode: 'quotes', time: 5, typedChars: 25, typedWords: 5 }));
        assert.strictEqual(r5.status, 400);
        const r6 = await alice.post('/api/scores', goodRun(60, { time: 25 }));
        assert.strictEqual(r6.status, 400, 'words30 must be 30 seconds');
        const noAuth = await guest.post('/api/scores', goodRun(60));
        assert.strictEqual(noAuth.status, 401);
    });

    await test('score accept: 60 WPM ranks, slower run still 200, 250 WPM is flagged not blocked', async () => {
        const r1 = await alice.post('/api/scores', goodRun(60));
        assert.strictEqual(r1.status, 200, JSON.stringify(r1.data));
        assert.deepStrictEqual([r1.data.ok, r1.data.ranked, r1.data.flagged], [true, true, false]);
        assert.ok(r1.data.score.date > started, 'date is server time');
        const r2 = await alice.post('/api/scores', goodRun(50));
        assert.strictEqual(r2.status, 200);
        assert.deepStrictEqual([r2.data.ok, r2.data.ranked, r2.data.flagged], [true, false, false]);
        const r3 = await alice.post('/api/scores', goodRun(250));
        assert.strictEqual(r3.status, 200, JSON.stringify(r3.data));
        assert.deepStrictEqual([r3.data.ok, r3.data.ranked, r3.data.flagged], [true, false, true]);
        flaggedId = r3.data.score.id;
        const mine = await alice.get('/api/scores/me?limit=10');
        assert.strictEqual(mine.data.scores.length, 3);
        await bob.post('/api/scores', goodRun(80, { mode: 'WORDS30' }));
        const bobQuotes = await bob.post('/api/scores', goodRun(45, { mode: 'quotes', time: 40, typedChars: 150, typedWords: 30, rawWpm: 50, keystrokes: 165 }));
        assert.strictEqual(bobQuotes.status, 200, JSON.stringify(bobQuotes.data));
        assert.strictEqual(bobQuotes.data.score.mode, 'quotes');
        await carol.post('/api/scores', goodRun(70));
    });

    await test('leaderboard: all-time and weekly boards, mode filter, yourRank, flagged rows hidden', async () => {
        const all = await alice.get('/api/leaderboard?tab=alltime&limit=100');
        assert.strictEqual(all.status, 200);
        assert.deepStrictEqual(all.data.rows.map((r) => r.username), ['bob', 'carol', 'alice']);
        assert.ok(all.data.rows.every((r) => typeof r.level === 'number' && r.userId));
        assert.ok(all.data.rows.every((r) => typeof r.title === 'string' && r.title.length <= 24), 'rows carry the equipped title (empty when none)');
        assert.deepStrictEqual(all.data.yourRank, { rank: 3, wpm: 60, total: 3 });
        assert.strictEqual(all.data.rows.find((r) => r.username === 'alice').wpm, 60, 'flagged 250 is not on the board');
        const weekly = await alice.get('/api/leaderboard?tab=weekly');
        assert.strictEqual(weekly.data.tab, 'weekly');
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(weekly.data.weekKey));
        assert.deepStrictEqual(weekly.data.rows.map((r) => r.username), ['bob', 'carol', 'alice']);
        const quotes = await guest.get('/api/leaderboard?mode=quotes');
        assert.deepStrictEqual(quotes.data.rows.map((r) => r.username), ['bob']);
        assert.strictEqual(quotes.data.yourRank, null);
        const limited = await guest.get('/api/leaderboard?limit=1');
        assert.strictEqual(limited.data.rows.length, 1);
        assert.strictEqual(limited.data.total, 3);
        assert.ok(Array.isArray(limited.data.leaderboard), 'old field name still present');
    });

    await test('friends: add, list, no self-add, unknown user, friends board, remove', async () => {
        const self = await alice.post('/api/friends', { username: 'alice' });
        assert.strictEqual(self.status, 400);
        const unknown = await alice.post('/api/friends', { username: 'zed' });
        assert.strictEqual(unknown.status, 404);
        const add = await alice.post('/api/friends', { username: 'Bob' });
        assert.strictEqual(add.status, 201);
        const again = await alice.post('/api/friends', { username: 'bob' });
        assert.strictEqual(again.status, 200);
        const list = await alice.get('/api/friends');
        assert.strictEqual(list.data.friends.length, 1);
        const row = list.data.friends[0];
        assert.strictEqual(row.username, 'bob');
        assert.strictEqual(row.bestWpm, 80);
        assert.strictEqual(row.weeklyBestWpm, 80);
        assert.ok(['id', 'level', 'streak', 'lastSeenAt'].every((k) => k in row));
        const board = await alice.get('/api/leaderboard?tab=friends');
        assert.deepStrictEqual(board.data.rows.map((r) => r.username), ['bob', 'alice']);
        assert.deepStrictEqual(board.data.yourRank, { rank: 2, wpm: 60, total: 2 });
        const anon = await guest.get('/api/leaderboard?tab=friends');
        assert.strictEqual(anon.status, 401);
        const rm = await alice.del('/api/friends/bob');
        assert.strictEqual(rm.status, 200);
        assert.strictEqual(rm.data.removed, true);
        const after = await alice.get('/api/friends');
        assert.deepStrictEqual(after.data.friends, []);
    });

    await test('community: guests pooled into one row with a per-IP cap, names never taken from the body', async () => {
        const g1 = await guest.post('/api/community/contribute', { words: 100, guestName: 'bob', guestId: 'x' });
        assert.strictEqual(g1.status, 201);
        const tooMany = await guest.post('/api/community/contribute', { words: 10000 });
        assert.strictEqual(tooMany.status, 400);
        for (let i = 0; i < 3; i++) await guest.post('/api/community/contribute', { words: 2000 });
        const g2 = client('203.0.113.51');
        await g2.post('/api/community/contribute', { words: 30 });
        const a = await alice.post('/api/community/contribute', { words: 50 });
        assert.strictEqual(a.status, 201);
        assert.strictEqual(a.data.lifetime, 50);
        const board = await guest.get('/api/leaderboard?community=1');
        const byName = Object.fromEntries(board.data.contributions.map((r) => [r.username, r.damage]));
        assert.strictEqual(byName.Guests, 5000 + 30, 'first IP capped at 5000 per day, second IP adds 30');
        assert.strictEqual(byName.alice, 50);
        assert.ok(!('bob' in byName) || byName.bob === undefined);
        const summary = await guest.get('/api/user-summary?username=alice');
        assert.strictEqual(summary.status, 200);
        assert.strictEqual(summary.data.communityContributionTotal, 50);
        assert.strictEqual(summary.data.personalBestWpm, 60);
        assert.strictEqual(summary.data.level, 1);
        assert.strictEqual(summary.data.weeklyBestWpm, 60);
        assert.strictEqual(summary.data.runs, 2, 'flagged run excluded from averages');
        assert.strictEqual(summary.data.averageWpm, 55);
        assert.strictEqual(summary.data.averageAccuracy, 96);
        assert.strictEqual(summary.data.wordsThisWeek, 50);
        assert.strictEqual(typeof summary.data.streak, 'number');
    });

    await test('admin: flagged scores need admin auth; approving puts the run on the boards', async () => {
        const anon = await guest.get('/api/admin/scores?flagged=1');
        assert.strictEqual(anon.status, 401);
        const notAdmin = await alice.get('/api/admin/scores?flagged=1');
        assert.strictEqual(notAdmin.status, 403);
        const users = await alice.get('/api/admin/users');
        assert.strictEqual(users.status, 403);
        const list = await boss.get('/api/admin/scores?flagged=1');
        assert.strictEqual(list.status, 200);
        assert.strictEqual(list.data.scores.length, 1);
        assert.strictEqual(list.data.scores[0].id, flaggedId);
        assert.ok(list.data.scores[0].reasons.length >= 1);
        const approve = await boss.patch(`/api/admin/scores/${flaggedId}`, { approved: true });
        assert.strictEqual(approve.status, 200);
        const board = await guest.get('/api/leaderboard');
        assert.strictEqual(board.data.rows[0].username, 'alice');
        assert.strictEqual(board.data.rows[0].wpm, 250);
        const empty = await boss.get('/api/admin/scores?flagged=1');
        assert.deepStrictEqual(empty.data.scores, []);
        const mine = await alice.get('/api/scores/me');
        assert.strictEqual(mine.data.scores.find((s) => s.id === flaggedId).flagged, false);
    });

    await test('admin user edits: set fields assign, daily completions use the client shape', async () => {
        const r = await boss.patch(`/api/admin/users/${bobId}`, { setLevel: 3, setDailyCompleted: 2, setWeeklyCompleted: 1, clientDateKey: '2026-01-02', clientWeekKey: '2025-12-28' });
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.data.user.xp, 1000);
        assert.strictEqual(r.data.user.level, 3);
        assert.strictEqual(r.data.user.dailyCompleted, 2);
        const r2 = await boss.patch(`/api/admin/users/${bobId}`, { setLevel: 2 });
        assert.strictEqual(r2.data.user.xp, 500, 'setLevel assigns instead of adding');
        const bobClient = client('203.0.113.20');
        await bobClient.post('/api/login', { username: 'bob', password: 'secret123' });
        const progress = await bobClient.get('/api/progress');
        const daily = JSON.parse(progress.data.progress['sampire-daily-v2']);
        const day = Object.keys(daily.days)[0];
        assert.strictEqual(day, '2026-01-02', 'admin writes use the admin\'s local day');
        assert.ok(Array.isArray(daily.days[day]) && daily.days[day].length === 2, 'days[key] is a plain array of ids');
        assert.strictEqual(JSON.parse(progress.data.progress['sampire-weekly']).week, '2025-12-28');
        const detail = await boss.get(`/api/admin/users/${bobId}`);
        assert.strictEqual(detail.data.user.dailyCompleted, 2);
        const all = await boss.get('/api/admin/users');
        assert.ok(all.data.users.some((u) => u.username === 'bob' && u.level === 2));
    });

    await test('progress: unknown keys dropped, XP jump capped, bad badges removed, 409 on stale base', async () => {
        const put = await alice.put('/api/progress', {
            baseUpdatedAt: 0,
            progress: {
                'sampire-xp': '5000',
                'sampire-badges': JSON.stringify([{ id: 'flawless', earnedAt: 1 }, { id: 'hacker', earnedAt: 2 }]),
                'sampire-streak': JSON.stringify({ lastPlayDate: '2026-11-10', streak: 4 }),
                'sampire-evil': '1',
            },
        });
        assert.strictEqual(put.status, 200, JSON.stringify(put.data));
        assert.ok(Array.isArray(put.data.clamped) && put.data.clamped.length >= 3);
        const got = await alice.get('/api/progress');
        assert.strictEqual(got.data.progress['sampire-xp'], '3000');
        assert.deepStrictEqual(JSON.parse(got.data.progress['sampire-badges']).map((b) => b.id), ['flawless']);
        assert.ok(!('sampire-evil' in got.data.progress));
        const stale = await alice.put('/api/progress', { baseUpdatedAt: 1, progress: { 'sampire-xp': '3000' } });
        assert.strictEqual(stale.status, 409);
        assert.strictEqual(stale.data.progress['sampire-xp'], '3000');
        const daily = await alice.put('/api/progress', { baseUpdatedAt: got.data.updatedAt, progress: { 'sampire-xp': '20000' } });
        assert.strictEqual(daily.status, 200);
        const got2 = await alice.get('/api/progress');
        assert.strictEqual(got2.data.progress['sampire-xp'], '6000', 'second save adds another 3000 at most');
        const bad = await alice.put('/api/progress', { baseUpdatedAt: got2.data.updatedAt, progress: [] });
        assert.strictEqual(bad.status, 400);
    });

    await test('progress: wave-2 keys, tiered badge ids and new quest ids round-trip unchanged', async () => {
        const before = await alice.get('/api/progress');
        // Values are written in the exact shape the server normalises to, so the strings must come back byte-for-byte.
        const snapshot = {
            'sampire-badges': JSON.stringify([
                { id: 'runs_50', earnedAt: 1700000000000 }, { id: 'words_10k', earnedAt: 1700000000001 }, { id: 'days_7', earnedAt: 1700000000002 },
                { id: 'quests_10', earnedAt: 1700000000003 }, { id: 'perfect_10', earnedAt: 1700000000004 }, { id: 'speed_60', earnedAt: 1700000000005 },
                { id: 'speed_120', earnedAt: 1700000000006 }, { id: 'triple_crown', earnedAt: 1700000000007 }, { id: 'fleet_defender', earnedAt: 1700000000008 },
                { id: 'founder', earnedAt: 1700000000009 }, { id: 'human_lectionary', earnedAt: 1700000000010 },
            ]),
            'sampire-streak': JSON.stringify({ lastPlayDate: '2026-11-10', streak: 4, freezes: 1 }),
            'sampire-daily-v2': JSON.stringify({ days: { '2026-11-10': ['runs_5', 'acc_96', 'beat_yesterday', 'drills_3'] } }),
            'sampire-weekly': JSON.stringify({ week: '2026-11-08', completions: ['days_5', 'runs95_10', 'beat_last_week'] }),
            'sampire-skills': JSON.stringify({ aura: true, soundscapes: false, nebulaTrail: true, keySoundPacks: { typewriter: true }, cosmetics: { name_sky: true, caret_orange: false } }),
            'sampire-crystal-ledger': JSON.stringify({ spent: 4, bonus: 2 }),
            'sampire-lifetime-counters': JSON.stringify({ daysPlayed: 9, perfectRuns: 2, countedRuns: 57 }),
            'sampire-title': JSON.stringify({ title: 'Rookie', nameColor: 'name_sky', caretColor: '', trailColor: '', nameColorValue: '#5ac8fa' }),
            'sampire-daily-stats': JSON.stringify({ days: { '2026-11-10': { runs: 3, words: 120, sumWpm: 150, bestWpm: 60, bestAcc: 98, runs96: 1, perfect: 0, modes: { words: 3 } } } }),
            'sampire-weekly-recap-seen': '2026-11-01',
            'sampire-coach': JSON.stringify({ placementWpm: 38, placementAccuracy: 94, goalWpm: 50, goalDate: '2026-12-01', step: 3, fingerMapSeen: true, dailyGoalWpm: 40 }),
        };
        const put = await alice.put('/api/progress', { baseUpdatedAt: before.data.updatedAt, progress: snapshot });
        assert.strictEqual(put.status, 200, JSON.stringify(put.data));
        assert.strictEqual(put.data.clamped, undefined, `nothing should be clamped or dropped: ${JSON.stringify(put.data.clamped)}`);
        const got = await alice.get('/api/progress');
        for (const [key, value] of Object.entries(snapshot)) {
            assert.strictEqual(got.data.progress[key], value, `${key} should round-trip unchanged`);
        }
    });

    await test('admin crystal grants are written to the ledger bonus, badge grants use the tiered ids', async () => {
        const r = await boss.patch(`/api/admin/users/${bobId}`, { addSkillPoints: 3, setAchievements: 2, setStreakDays: 5 });
        assert.strictEqual(r.status, 200, JSON.stringify(r.data));
        const bobClient = client('203.0.113.23');
        await bobClient.post('/api/login', { username: 'bob', password: 'secret123' });
        const progress = (await bobClient.get('/api/progress')).data.progress;
        assert.deepStrictEqual(JSON.parse(progress['sampire-crystal-ledger']), { spent: 0, bonus: 3 });
        assert.strictEqual(progress['sampire-skill-points'], '3', 'the cached balance follows the grant');
        assert.deepStrictEqual(JSON.parse(progress['sampire-badges']).map((b) => b.id), ['runs_50', 'runs_250']);
        assert.deepStrictEqual(JSON.parse(progress['sampire-streak']), { lastPlayDate: JSON.parse(progress['sampire-streak']).lastPlayDate, streak: 5, freezes: 0 });
        const r2 = await boss.patch(`/api/admin/users/${bobId}`, { setSkillPoints: 10 });
        assert.strictEqual(r2.status, 200);
        const progress2 = (await bobClient.get('/api/progress')).data.progress;
        assert.deepStrictEqual(JSON.parse(progress2['sampire-crystal-ledger']), { spent: 0, bonus: 10 }, 'set assigns: bonus moves by the difference from the cached balance');
        assert.strictEqual(progress2['sampire-skill-points'], '10');
    });

    await test('rename propagates to boards, community row and user summary', async () => {
        const r = await alice.patch('/api/account', { username: 'alice2' });
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.data.user.username, 'alice2');
        const board = await guest.get('/api/leaderboard');
        assert.ok(board.data.rows.some((row) => row.username === 'alice2'));
        assert.ok(!board.data.rows.some((row) => row.username === 'alice'));
        const weekly = await guest.get('/api/leaderboard?tab=weekly');
        assert.ok(weekly.data.rows.some((row) => row.username === 'alice2'));
        const community = await guest.get('/api/leaderboard?community=1');
        assert.ok(community.data.contributions.some((row) => row.username === 'alice2'));
        const old = await guest.get('/api/user-summary?username=alice');
        assert.strictEqual(old.status, 404);
        const now = await guest.get('/api/user-summary?username=alice2');
        assert.strictEqual(now.status, 200);
        const mine = await alice.get('/api/scores/me');
        assert.ok(mine.data.scores.every((s) => s.username === 'alice2'));
        const relogin = await client('203.0.113.21').post('/api/login', { username: 'alice2', password: 'secret123' });
        assert.strictEqual(relogin.status, 200);
    });

    await test('delete account removes the player everywhere', async () => {
        const wrongPw = await carol.del('/api/account', { usernameConfirm: 'carol', currentPassword: 'bad-bad-bad' });
        assert.strictEqual(wrongPw.status, 401);
        const r = await carol.del('/api/account', { usernameConfirm: 'carol', currentPassword: 'secret123' });
        assert.strictEqual(r.status, 200);
        const board = await guest.get('/api/leaderboard');
        assert.ok(!board.data.rows.some((row) => row.username === 'carol'));
        const summary = await guest.get('/api/user-summary?username=carol');
        assert.strictEqual(summary.status, 404);
        const me = await carol.get('/api/me');
        assert.strictEqual(me.status, 401);
    });

    await test('a 10-word run finished in under 10 seconds is accepted; a 9-word run is not', async () => {
        // A 10-word test typed at about 70 WPM takes about 8.5 seconds. The client counts it, so the server must too.
        const c = client('203.0.113.23');
        await c.post('/api/login', { username: 'bob', password: 'secret123' });
        const ok = await c.post('/api/scores', goodRun(70, { mode: 'words', time: 8.5, typedChars: 50, typedWords: 10, rawWpm: 71, keystrokes: 50 }));
        assert.strictEqual(ok.status, 200, JSON.stringify(ok.data));
        const nine = await c.post('/api/scores', goodRun(70, { mode: 'words', time: 7.7, typedChars: 45, typedWords: 9, rawWpm: 71, keystrokes: 45 }));
        assert.strictEqual(nine.status, 400);
    });

    await test('per-user score rate limit kicks in after 60 submissions in 10 minutes', async () => {
        const c = client('203.0.113.22');
        await c.post('/api/login', { username: 'bob', password: 'secret123' });
        let limited = 0;
        for (let i = 0; i < 62; i++) {
            const r = await c.post('/api/scores', goodRun(40));
            if (r.status === 429) limited += 1;
        }
        assert.ok(limited >= 1, 'expected at least one 429');
    });

    await app.stop();
    console.log(`backend tests passed (${passed}) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch(async (e) => {
    try { if (app) await app.stop(); } catch {}
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
});
