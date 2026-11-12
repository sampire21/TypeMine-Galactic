// @ts-check
// Social features: leaderboard tabs and mode filter, friends, invite link, head-to-head,
// share card, shared-result banner, phone layout, keyboard tooltip.
// The shared dev server on port 3000 still runs the old API, so every contract route is mocked.
const { test: base, expect } = require('@playwright/test');
const { startTestServer } = require('./_server');

const ALLTIME_ROWS = [
  { userId: 'u-alpha', username: 'alpha', wpm: 120, rawWpm: 125, accuracy: 98, consistency: 80, time: 30, mode: 'quotes', date: 1762900000000, level: 23 },
  { userId: 'u-bravo', username: 'bravo', wpm: 95, rawWpm: 100, accuracy: 96, consistency: 75, time: 30, mode: 'words30', date: 1762900000001, level: 7 },
  { userId: 'u-tester', username: 'tester', wpm: 80, rawWpm: 88, accuracy: 93, consistency: 70, time: 42, mode: 'words', date: 1762900000002, level: 3 },
  { userId: 'guest:abc', username: 'Guest from Canada', wpm: 150, rawWpm: 150, accuracy: 100, consistency: 90, time: 20, mode: 'quotes', date: 1762900000003, level: 1 },
];
const WEEKLY_ROWS = [
  { userId: 'u-bravo', username: 'bravo', wpm: 90, rawWpm: 95, accuracy: 97, consistency: 75, time: 30, mode: 'words30', date: 1762900000010, level: 7 },
];
const FRIEND_ROWS = [
  { userId: 'u-alpha', username: 'alpha', wpm: 120, rawWpm: 125, accuracy: 98, consistency: 80, time: 30, mode: 'quotes', date: 1762900000000, level: 23 },
  { userId: 'u-tester', username: 'tester', wpm: 80, rawWpm: 88, accuracy: 93, consistency: 70, time: 42, mode: 'words', date: 1762900000002, level: 3 },
];

const test = base.extend({
  // The service worker would answer fetches itself and bypass page.route, so keep it out of these tests.
  serviceWorkers: 'block',
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.route('https://ipapi.co/**', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ country_code: 'US', country_name: 'United States' }),
    }));
    await use(page);
    expect(errors, 'uncaught page errors').toEqual([]);
  },
});

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Mock the contract routes. `state` is mutated by the friend add/remove handlers so tests can assert on it. */
async function mockApi(page, { loggedIn = true, state = {} } = {}) {
  state.friends = state.friends || [
    { id: 'u-alpha', username: 'alpha', bestWpm: 120, weeklyBestWpm: 110, level: 23, streak: 5, lastSeenAt: 1762900000000 },
  ];
  state.requests = state.requests || [];
  await page.route('**/api/health', (r) => json(r, { ok: true }));
  await page.route('**/api/me', (r) => (loggedIn
    ? json(r, { user: { id: 'u-tester', username: 'tester', createdAt: 1760000000000, isAdmin: false } })
    : json(r, { error: 'Unauthorized' }, 401)));
  await page.route('**/api/refresh', (r) => json(r, { error: 'Unauthorized' }, 401));
  await page.route('**/api/progress', (r) => json(r, { progress: {}, updatedAt: 0, ok: true }));
  await page.route('**/api/scores/me**', (r) => json(r, { scores: [] }));
  await page.route('**/api/leaderboard**', (r) => {
    const url = new URL(r.request().url());
    state.requests.push(url.search);
    if (url.searchParams.get('community') === '1') return json(r, { week: '2026-11-08', contributions: [{ id: 'user:u-alpha', username: 'alpha', damage: 1200 }] });
    const tab = url.searchParams.get('tab') || 'alltime';
    const mode = url.searchParams.get('mode') || 'all';
    let rows = tab === 'weekly' ? WEEKLY_ROWS : (tab === 'friends' ? FRIEND_ROWS : ALLTIME_ROWS);
    if (mode !== 'all') rows = rows.filter((row) => row.mode === mode);
    if (state.titles) rows = rows.map((row) => (state.titles[row.username] ? { ...row, title: state.titles[row.username] } : row));
    const yourRank = tab === 'alltime' && mode === 'all' ? { rank: 3, wpm: 80 } : null;
    return json(r, { rows, weekKey: '2026-11-08', yourRank });
  });
  await page.route('**/api/friends', (r) => {
    const req = r.request();
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      state.requests.push('POST friends ' + body.username);
      state.friends.push({ id: 'u-' + body.username, username: body.username, bestWpm: 70, weeklyBestWpm: 65, level: 2, streak: 1, lastSeenAt: 0 });
      return json(r, { ok: true });
    }
    return json(r, { friends: state.friends });
  });
  await page.route('**/api/friends/*', (r) => {
    const name = decodeURIComponent(r.request().url().split('/api/friends/')[1]);
    state.requests.push('DELETE friends ' + name);
    state.friends = state.friends.filter((f) => f.username !== name);
    return json(r, { ok: true });
  });
  await page.route('**/api/user-summary**', (r) => {
    const name = new URL(r.request().url()).searchParams.get('username');
    const known = {
      alpha: { username: 'alpha', badgeIds: ['sonic_boom'], level: 23, personalBestWpm: 120, weeklyBestWpm: 110, averageWpm: 101, runs: 240, averageAccuracy: 97, streak: 5, wordsThisWeek: 1200, communityContributionTotal: 9000 },
      tester: { username: 'tester', badgeIds: [], level: 3, personalBestWpm: 80, weeklyBestWpm: 80, averageWpm: 66, runs: 31, averageAccuracy: 92, streak: 2, wordsThisWeek: 300, communityContributionTotal: 300 },
    };
    return known[name] ? json(r, known[name]) : json(r, { error: 'User not found' }, 404);
  });
}

async function start(page, path = '/') {
  // The shared dev server 404s on "/?query", so serve the document for any query string from "/".
  await page.route((url) => url.pathname === '/' && !!url.search, (r) => r.continue({ url: 'http://localhost:3000/' }));
  await page.goto(path);
  const splash = page.locator('#entry-splash');
  if (await splash.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.evaluate(() => { if (typeof hideSplashScreen === 'function') hideSplashScreen(); });
  }
  await expect(page.locator('#typing-area')).toBeVisible({ timeout: 5000 });
  // let restoreSession finish
  await page.waitForFunction(() => typeof currentUser !== 'undefined', null, { timeout: 5000 });
  await page.waitForTimeout(300);
}

async function openBoard(page) {
  await page.evaluate(() => openLeaderboard());
  await expect(page.locator('#leaderboard-modal')).toBeVisible({ timeout: 3000 });
}

/** Target text, read from the char spans (same approach as features.spec.js). */
async function readTarget(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#quote-display span[class*="char-"]'))
    .map((s) => (s.textContent || '').replace(/\u00a0/g, ' ')).join(''));
}

/**
 * Type the whole target correctly. The default 170 ms per key is about 70 WPM: a run typed at machine
 * speed is marked unranked and earns no speed XP, so tests that need a real, counted run use a human pace.
 */
async function completeRun(page, { delay = 170 } = {}) {
  await page.evaluate(() => { window.lastRunSummary = null; });
  await page.locator('#quote-display').click();
  await expect(page.locator('#hidden-input')).toBeFocused({ timeout: 2000 });
  const text = await readTarget(page);
  await page.keyboard.type(text, { delay });
  // The results card opens 400 ms after the last key.
  await expect(page.locator('#result-overlay')).toHaveClass(/show/, { timeout: 15000 });
  await expect.poll(() => page.evaluate(() => !!window.lastRunSummary)).toBe(true);
  return text;
}

/** Close the level-up card the way a player would; it sits on top of the results card after a level up. */
async function dismissLevelUp(page) {
  const overlay = page.locator('#levelup-overlay');
  if (!(await overlay.evaluate((el) => el.classList.contains('show')))) return;
  await overlay.getByRole('button', { name: 'Keep going' }).click();
  await expect(overlay).not.toHaveClass(/show/);
}

/**
 * A browser context against a real server (no API mocks), with the same safety net as the fixture.
 * These tests use a private in-memory copy of the server (tests/_server.js), not the shared one on
 * :3000, so throwaway accounts and scores never reach the shared server and its rate limits.
 */
async function realContext(browser, baseURL, { permissions = [] } = {}) {
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block', permissions, viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.route('https://ipapi.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' }));
  return { context, page, errors };
}

/** Open a page on the real server and wait until the boot session check has answered and cloud mode is on. */
async function startReal(page, path = '/') {
  const sessionProbe = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/me');
  await page.goto(path);
  await sessionProbe;
  const splash = page.locator('#entry-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.evaluate(() => { if (typeof hideSplashScreen === 'function') hideSplashScreen(); });
  }
  await expect(page.locator('#typing-area')).toBeVisible({ timeout: 5000 });
  await expect.poll(() => page.evaluate(() => typeof isCloudMode === 'function' && isCloudMode())).toBe(true);
  await expect(page.locator('#quote-display span[class*="char-"]').first()).toBeVisible();
}

/** Realistic test length: 10 words, so a run typed at a human pace takes about eight seconds. */
async function useTenWords(page) {
  await page.evaluate(() => setEngineOption('words', 10));
  await expect.poll(() => readTarget(page).then((t) => t.split(' ').length)).toBe(10);
}

const AUDIT_PASSWORD = 'audit-pass-123';
function auditName(tag) {
  return `audit_${tag}${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 1000).toString(36)}`.slice(0, 24);
}
/** Sign up with the app's own function, then wait until the account owns this browser's progress and the save is done. */
async function signUp(page, username) {
  await page.evaluate(async ({ username, password }) => { await signupUser(username, password); }, { username, password: AUDIT_PASSWORD });
  await expect.poll(() => page.evaluate(() => (typeof currentUser !== 'undefined' && currentUser) ? currentUser.username : null), { timeout: 10000 }).toBe(username);
  await expect.poll(() => page.evaluate(() => getProgressOwner() === String(currentUser.id) && !progressSyncInFlight), { timeout: 15000 }).toBe(true);
}

test.describe('Social features', () => {
  test.beforeEach(async ({}, info) => {
    test.skip(info.project.name !== 'desktop-chrome', 'desktop only');
  });

  test('tabs and mode filter render rows and your rank from the server', async ({ page }) => {
    const state = {};
    await mockApi(page, { state });
    await start(page);
    await openBoard(page);
    const rows = page.locator('#leaderboard-list .lb-score-row:not(.lb-head)');
    await expect(rows).toHaveCount(3, { timeout: 5000 }); // guest row filtered out
    await expect(rows.nth(0).locator('.lb-user')).toHaveText('alpha');
    await expect(rows.nth(0).locator('.lb-user')).toHaveClass(/lb-tier-3/);
    await expect(rows.nth(0).locator('.lb-user')).toHaveAttribute('title', 'Level 23, Typist');
    await expect(rows.nth(0).locator('.lb-acc')).toContainText('98%');
    await expect(page.locator('#leaderboard-list')).not.toContainText('Guest from Canada');
    const yourRank = page.locator('[data-testid="lb-your-rank"]');
    await expect(yourRank.locator('.lb-rank-orb')).toHaveText('3');
    await expect(yourRank).toContainText('Your rank');
    await expect(yourRank).toContainText('80');
    await expect(page.locator('#leaderboard-list .lb-row-self .lb-user')).toHaveText('tester');

    // mode filter
    await page.locator('#lb-mode-filter [data-mode="quotes"]').click();
    await expect(rows).toHaveCount(1, { timeout: 5000 });
    await expect(rows.nth(0).locator('.lb-mode')).toHaveText('Quotes');
    expect(state.requests.some((q) => q.includes('tab=alltime') && q.includes('mode=quotes'))).toBe(true);
    await expect(page.locator('[data-testid="lb-your-rank"]')).toContainText("not on this board yet");

    // weekly tab comes from the server, no client date filter
    await page.locator('.lb-tab[data-tab="weekly"]').click();
    await expect(page.locator('.lb-tab[data-tab="weekly"]')).toHaveClass(/active/);
    await page.locator('#lb-mode-filter [data-mode="all"]').click();
    await expect(rows).toHaveCount(1, { timeout: 5000 });
    await expect(rows.nth(0).locator('.lb-user')).toHaveText('bravo');
    expect(state.requests.some((q) => q.includes('tab=weekly'))).toBe(true);
    await expect(page.locator('#leaderboard-list .lb-crown')).toHaveCount(0); // fewer than 10 rows: no crown

    // empty state copy
    await page.locator('#lb-mode-filter [data-mode="quotes"]').click();
    await expect(page.locator('#leaderboard-list .history-empty')).toHaveText('Nobody on the board yet. Finish a run to claim #1.');

    // 30 s cache: switching back to a cached tab does not re-request
    const before = state.requests.length;
    await page.locator('.lb-tab[data-tab="alltime"]').click();
    await page.locator('#lb-mode-filter [data-mode="all"]').click();
    await expect(rows).toHaveCount(3);
    expect(state.requests.length).toBe(before);
  });

  test('friends tab: add and remove a friend', async ({ page }) => {
    const state = {};
    await mockApi(page, { state });
    await start(page);
    await openBoard(page);
    await page.locator('.lb-tab[data-tab="friends"]').click();
    await expect(page.locator('#lb-friend-input')).toBeVisible({ timeout: 5000 });
    const friendRows = page.locator('#leaderboard-list .lb-friend-row:not(.lb-head)');
    await expect(friendRows).toHaveCount(2); // you + alpha
    await expect(friendRows.nth(0)).toContainText('tester');
    await expect(friendRows.nth(0)).toContainText('you');
    await expect(friendRows.nth(1)).toContainText('alpha');
    await expect(friendRows.nth(1)).toContainText('120');
    await expect(friendRows.nth(1)).toContainText('110 WPM');
    await expect(friendRows.nth(1)).toContainText('23');
    await expect(friendRows.nth(1)).toContainText('5 days');

    await page.locator('#lb-friend-input').fill('charlie');
    await page.locator('#lb-friend-add-btn').click();
    await expect(page.locator('#lb-friends-note')).toHaveText('Added charlie.', { timeout: 5000 });
    expect(state.requests).toContain('POST friends charlie');
    await expect(page.locator('#leaderboard-list .lb-friend-row[data-friend="charlie"]')).toBeVisible();

    await page.locator('.lb-friend-row[data-friend="charlie"] .lb-mini-danger').click();
    expect(state.requests).toContain('DELETE friends charlie');
    await expect(page.locator('#leaderboard-list .lb-friend-row[data-friend="charlie"]')).toHaveCount(0, { timeout: 5000 });
  });

  test('invite link ?addfriend= offers to add that friend', async ({ page }) => {
    const state = {};
    await mockApi(page, { state });
    await start(page, '/?addfriend=alpha');
    const banner = page.locator('#friend-invite-banner');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toContainText('Add alpha as a friend?');
    await banner.locator('button', { hasText: 'Add friend' }).click();
    await expect.poll(() => state.requests.includes('POST friends alpha')).toBe(true);
    await expect(banner).not.toBeVisible();
    await expect.poll(() => page.evaluate(() => location.search)).not.toContain('addfriend');
  });

  test('head-to-head shows two columns with best, average, runs, accuracy, streak', async ({ page }) => {
    await mockApi(page);
    await start(page);
    await openBoard(page);
    await expect(page.locator('#leaderboard-list .lb-score-row:not(.lb-head)')).toHaveCount(3);
    await page.evaluate(() => openHeadToHead('alpha'));
    const panel = page.locator('#lb-compare-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('You vs alpha');
    await expect(panel.locator('.h2h-row:not(.h2h-row-head)')).toHaveCount(5, { timeout: 5000 });
    const labels = await panel.locator('.h2h-label').allTextContents();
    expect(labels).toEqual(['Best', 'Average', 'Runs', 'Accuracy', 'Streak']);
    await expect(panel.locator('.h2h-row').nth(1)).toContainText('120 WPM');
    await expect(panel.locator('.h2h-row').nth(1)).toContainText('80 WPM');
    await expect(panel.locator('.h2h-row').nth(3)).toContainText('240');
    await expect(page.locator('#leaderboard-list')).toBeHidden();
    await panel.locator('.h2h-back').click();
    await expect(panel).toBeHidden();
    await expect(page.locator('#leaderboard-list')).toBeVisible();
  });

  test('share card renders a 1200x630 PNG and a decodable link', async ({ page }) => {
    await mockApi(page, { loggedIn: false });
    await start(page);
    const out = await page.evaluate(async () => {
      const summary = { wpm: 74, accuracy: 98, time: 30, mode: 'quotes', name: 'sam', date: Date.now() };
      const blob = await ShareCard.render(summary);
      const bmp = await createImageBitmap(blob);
      const recap = await ShareCard.renderRecap({ name: 'sam', runs: 12, bestWpm: 80, avgWpm: 70, words: 3000, accuracy: 96, streak: 4 });
      const link = ShareCard.buildShareLink(summary);
      const decoded = ShareCard.decodeShareParam(new URL(link).searchParams.get('r'));
      return { size: blob.size, type: blob.type, w: bmp.width, h: bmp.height, recapSize: recap.size, link, decoded, text: ShareCard.buildShareText(summary) };
    });
    expect(out.type).toBe('image/png');
    expect(out.size).toBeGreaterThan(5000);
    expect(out.w).toBe(1200);
    expect(out.h).toBe(630);
    expect(out.recapSize).toBeGreaterThan(5000);
    expect(out.link).toContain('?r=');
    expect(out.decoded).toEqual({ wpm: 74, accuracy: 98, mode: 'quotes', name: 'sam' });
    expect(out.text).toBe('sam typed 74 WPM at 98% accuracy in Quotes on TypeMine Galactic. Can you beat it?');
    await expect(page.locator('#share-result-btn')).toHaveText('Share result');
  });

  test('?r= link shows the beat-it banner and starts the same mode', async ({ page }) => {
    await mockApi(page, { loggedIn: false });
    const param = Buffer.from(JSON.stringify({ wpm: 74, accuracy: 98, mode: 'quotes', name: 'sam' })).toString('base64').replace(/=+$/, '');
    await start(page, `/?r=${param}`);
    const banner = page.locator('#shared-result-banner');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toContainText('sam typed 74 WPM in Quotes. Can you beat it?');
    await banner.locator('button', { hasText: 'Try it' }).click();
    await expect(page.locator('.mode-tab[data-mode="quotes"]')).toHaveClass(/active/);
    await expect(banner).not.toBeVisible();
  });

  test('375 px: rows collapse to two-line cards with no header', async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await start(page);
    await openBoard(page);
    const row = page.locator('#leaderboard-list .lb-score-row:not(.lb-head)').first();
    await expect(row).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#leaderboard-list .lb-head')).toBeHidden();
    const boxes = await row.evaluate((el) => {
      const get = (sel) => el.querySelector(sel).getBoundingClientRect();
      return { user: get('.lb-user'), wpm: get('.lb-wpm'), acc: get('.lb-acc'), time: get('.lb-time'), row: el.getBoundingClientRect() };
    });
    expect(Math.abs(boxes.user.top - boxes.wpm.top)).toBeLessThan(14); // same first line
    expect(boxes.acc.top).toBeGreaterThan(boxes.user.top + 8); // second line
    expect(Math.abs(boxes.acc.top - boxes.time.top)).toBeLessThan(6);
    expect(boxes.row.right).toBeLessThanOrEqual(375);
    const card = await page.locator('#leaderboard-modal .leaderboard-modal-card').boundingBox();
    expect(card.width).toBeLessThanOrEqual(375);
    expect(card.height).toBeLessThanOrEqual(812);
  });

  test('tooltip opens on keyboard focus and offers Compare', async ({ page }) => {
    await mockApi(page);
    await start(page);
    await openBoard(page);
    const name = page.locator('#leaderboard-list .lb-user-hover').first();
    await expect(name).toHaveText('alpha', { timeout: 5000 });
    await name.focus();
    const tooltip = page.locator('#lb-user-tooltip');
    await expect(tooltip).toHaveClass(/show/);
    await expect(tooltip).toContainText('alpha');
    await expect(tooltip).toContainText('Level: 23 (Typist)', { timeout: 5000 });
    await expect(tooltip).toContainText('Best: 120 WPM');
    await expect(tooltip.locator('.lb-tooltip-compare')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('#lb-compare-panel')).toBeVisible();
  });

  test('board shows your equipped name colour and title; other players\' titles come from the row', async ({ page }) => {
    const state = { titles: { alpha: 'Speedster' } };
    await mockApi(page, { state });
    await start(page);
    // Level 6 (XP 2500) unlocks the Rookie title; the sky blue name colour value is what the shop writes.
    await page.evaluate(() => {
      localStorage.setItem('sampire-xp', '2500');
      localStorage.setItem('sampire-title', JSON.stringify({ title: 'Rookie', nameColor: 'name_sky', caretColor: '', trailColor: '', nameColorValue: '#5ac8fa' }));
    });
    await openBoard(page);
    const self = page.locator('#leaderboard-list .lb-row-self .lb-user');
    await expect(self).toContainText('tester', { timeout: 5000 });
    await expect(self.locator('.lb-user-title')).toHaveText('Rookie');
    await expect(self).toHaveCSS('color', 'rgb(90, 200, 250)');
    const alpha = page.locator('#leaderboard-list .lb-user[data-username="alpha"]');
    await expect(alpha.locator('.lb-user-title')).toHaveText('Speedster');
    await expect(alpha).toHaveAttribute('aria-label', /alpha, Speedster, Level 23, Typist/);
    // bravo has no title and no colour of its own: tier colour only, no tag
    await expect(page.locator('#leaderboard-list .lb-user[data-username="bravo"] .lb-user-title')).toHaveCount(0);
    // A title that is not unlocked is not shown (guards against a hand-edited record).
    await page.evaluate(() => localStorage.setItem('sampire-title', JSON.stringify({ title: 'Elite', nameColorValue: 'javascript:bad' })));
    await page.locator('.lb-tab[data-tab="weekly"]').click();
    await page.locator('.lb-tab[data-tab="alltime"]').click();
    await expect(page.locator('#leaderboard-list .lb-row-self .lb-user-title')).toHaveCount(0);
    await expect(page.locator('#leaderboard-list .lb-row-self .lb-user')).not.toHaveAttribute('style', /./);
  });

  test('challenge link: encode and decode round trip, bad input rejected', async ({ page }) => {
    await mockApi(page, { loggedIn: false });
    await start(page);
    const out = await page.evaluate(() => {
      const spec = { seed: 123456789, mode: 'words', options: { words: 25, punctuation: true, numbers: false, wordList: 'common', time: 30, caret: 'block', liveChart: true } };
      const link = ShareCard.buildChallengeLink({ wpm: 84, accuracy: 97, name: 'sam', mode: 'words' }, spec);
      const param = new URL(link).searchParams.get('c');
      const decoded = ShareCard.decodeChallengeParam(param);
      const bad = [
        ShareCard.decodeChallengeParam('not-base64!!'),
        ShareCard.decodeChallengeParam(ShareCard.encodeChallengeParam({ seed: 5, mode: 'adaptive', wpm: 50 })),
        ShareCard.decodeChallengeParam(ShareCard.encodeChallengeParam({ seed: -1, mode: 'words', wpm: 50 })),
        ShareCard.decodeChallengeParam(ShareCard.encodeChallengeParam({ seed: 5, mode: 'words', wpm: 0 })),
        ShareCard.decodeChallengeParam(ShareCard.encodeChallengeParam({ seed: 5.5, mode: 'words', wpm: 50 })),
      ];
      const noSpec = ShareCard.buildChallengeLink({ wpm: 84 }, { seed: 1, mode: 'story' });
      const text = ShareCard.buildChallengeText({ wpm: 84, accuracy: 97, name: 'sam', mode: 'words' });
      return { link, decoded, bad, noSpec, text };
    });
    expect(out.link).toContain('?c=');
    // The parameter is url-safe base64: no "+", "/" or "=" padding (the "//" in "http://" is not part of it).
    expect(new URL(out.link).searchParams.get('c')).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(out.decoded).toEqual({ seed: 123456789, mode: 'words', options: { time: 30, words: 25, punctuation: true, numbers: false, wordList: 'common' }, wpm: 84, accuracy: 97, name: 'sam' });
    expect(out.bad).toEqual([null, null, null, null, null]);
    expect(out.noSpec).toBe('');
    expect(out.text).toBe('sam typed 84 WPM at 97% accuracy on this exact text in Random Words. Beat it?');
    await expect(page.locator('#challenge-friend-btn')).toHaveText('Challenge a friend');
  });

  test('challenge link end to end on a real server: copy, open fresh, same text, win banner, rematch', async ({ browser }) => {
    test.setTimeout(120000);
    const server = await startTestServer();
    const a = await realContext(browser, server.base, { permissions: ['clipboard-read', 'clipboard-write'] });
    const b = await realContext(browser, server.base);
    try {
      // Player A finishes a 10-word Random Words run at about 70 WPM and copies the challenge link.
      await startReal(a.page);
      await expect(a.page.locator('.mode-tab.active')).toHaveAttribute('data-mode', 'words');
      await useTenWords(a.page);
      const textA = await completeRun(a.page);
      const wpmA = await a.page.evaluate(() => Math.round(window.lastRunSummary.wpm));
      expect(wpmA).toBeGreaterThan(0);
      await expect(a.page.locator('#challenge-outcome')).toBeHidden(); // not a challenge run
      await dismissLevelUp(a.page);
      await a.page.locator('#challenge-friend-btn').click();
      await expect(a.page.locator('#ui-toast')).toContainText('Challenge link copied', { timeout: 5000 });
      const clip = await a.page.evaluate(() => navigator.clipboard.readText());
      const link = (clip.match(/https?:\/\/\S+\?c=[A-Za-z0-9_-]+/) || [])[0];
      expect(link, 'clipboard holds the challenge link: ' + clip).toBeTruthy();
      expect(link.startsWith(server.base + '/')).toBe(true);
      expect(clip).toContain(`Guest typed ${wpmA} WPM`);
      const spec = await a.page.evaluate(() => ShareCard.getLastRunChallengeSpec());
      expect(spec.mode).toBe('words');
      expect(spec.options.words).toBe(10);

      // Player B opens the link in a fresh browser context.
      await startReal(b.page, link);
      const banner = b.page.locator('#challenge-banner');
      await expect(banner).toBeVisible({ timeout: 10000 });
      await expect(banner).toContainText(`Guest typed ${wpmA} WPM on this exact text. Beat it?`);
      await banner.locator('button', { hasText: 'Try it' }).click();
      await expect(banner).toBeHidden();
      await expect(b.page.locator('#typing-area')).toBeVisible({ timeout: 5000 });
      await expect(b.page.locator('.mode-tab[data-mode="words"]')).toHaveClass(/active/);
      await expect.poll(() => b.page.evaluate(() => location.search)).not.toContain('c=');
      await expect.poll(() => readTarget(b.page), { timeout: 5000 }).toBe(textA);
      const specB = await b.page.evaluate(() => getCurrentTestSpec());
      expect(specB.seed).toBe(spec.seed);

      // B types faster (about 100 WPM), so B should win; the banner on the results card offers a rematch on the same text.
      await completeRun(b.page, { delay: 120 });
      const wpmB = await b.page.evaluate(() => Math.round(window.lastRunSummary.wpm));
      const outcome = b.page.locator('#challenge-outcome');
      await expect(outcome).toBeVisible();
      if (wpmB > wpmA) {
        await expect(outcome).toHaveClass(/win/);
        await expect(outcome).toContainText(`You beat Guest: ${wpmB} vs ${wpmA} WPM!`);
      } else {
        await expect(outcome).toHaveClass(/lose/);
        await expect(outcome).toContainText(`Guest still leads, ${wpmA} vs ${wpmB}. Try again?`);
      }
      await dismissLevelUp(b.page);
      // A real click: the banner must sit inside the results card (css/social.css challengeOutcomeIn).
      const rematch = outcome.locator('.challenge-rematch-btn');
      await expect(rematch).toHaveText('Rematch');
      await rematch.click();
      await expect(b.page.locator('#result-overlay')).not.toHaveClass(/show/);
      await expect(outcome).toBeHidden();
      await expect.poll(() => readTarget(b.page), { timeout: 5000 }).toBe(textA);
      // "New text" leaves the challenge: a different seed, and a later run shows no banner.
      await b.page.evaluate(() => newTest());
      await expect.poll(() => readTarget(b.page)).not.toBe(textA);
      expect(a.errors).toEqual([]);
      expect(b.errors).toEqual([]);
    } finally {
      await a.context.close();
      await b.context.close();
      await server.stop();
    }
  });

  test('friends on a real server: two accounts, add, list, friends board, overtake toast, remove', async ({ browser }) => {
    test.setTimeout(120000);
    const server = await startTestServer();
    const a = await realContext(browser, server.base);
    const b = await realContext(browser, server.base);
    const nameA = auditName('a');
    const nameB = auditName('b');
    try {
      await startReal(a.page);
      await startReal(b.page);
      await signUp(a.page, nameA);
      await signUp(b.page, nameB);
      await useTenWords(a.page);
      await useTenWords(b.page);
      // B posts a counted, ranked run at about 70 WPM so B has a best on the boards.
      await completeRun(b.page);
      const runB = await b.page.evaluate(() => window.lastRunSummary);
      expect(runB.counted && runB.ranked).toBe(true);
      const wpmB = Math.round(runB.wpm);
      await expect.poll(async () => b.page.evaluate(async () => (await (await fetch('/api/scores/me?limit=5', { credentials: 'include' })).json()).scores.length), { timeout: 10000 }).toBeGreaterThan(0);

      // A adds B from the Friends tab.
      await openBoard(a.page);
      await a.page.locator('.lb-tab[data-tab="friends"]').click();
      await expect(a.page.locator('#lb-friend-input')).toBeVisible({ timeout: 10000 });
      await a.page.locator('#lb-friend-input').fill(nameB);
      await a.page.locator('#lb-friend-add-btn').click();
      await expect(a.page.locator('#lb-friends-note')).toHaveText(`Added ${nameB}.`, { timeout: 10000 });
      const rowB = a.page.locator(`#leaderboard-list .lb-friend-row[data-friend="${nameB}"]`);
      await expect(rowB).toBeVisible();
      await expect(rowB).toContainText(String(wpmB));
      await expect(a.page.locator('#leaderboard-list .lb-friend-row.lb-row-self')).toContainText(nameA);
      // The list holds A's own row and B's row (the header row carries no data-friend).
      await expect(a.page.locator('#leaderboard-list .lb-friend-row[data-friend]')).toHaveCount(2);
      // Friends board (best runs of you and your friends) lists B; A has no run yet.
      const board = a.page.locator('#lb-friends-board');
      await expect(board).toContainText('Best runs', { timeout: 10000 });
      await expect(board.locator('.lb-score-row:not(.lb-head)')).toHaveCount(1, { timeout: 10000 });
      await expect(board.locator('.lb-score-row:not(.lb-head) .lb-user')).toHaveText(nameB);
      // Server agrees.
      const friends = await a.page.evaluate(async () => (await (await fetch('/api/friends', { credentials: 'include' })).json()).friends.map((f) => f.username));
      expect(friends).toEqual([nameB]);
      // Friendship is one way: B's list is empty.
      const friendsOfB = await b.page.evaluate(async () => (await (await fetch('/api/friends', { credentials: 'include' })).json()).friends);
      expect(friendsOfB).toEqual([]);

      // A finishes a faster run (about 100 WPM): the overtake toast names B.
      await a.page.evaluate(() => closeLeaderboard());
      await expect(a.page.locator('#leaderboard-modal')).not.toHaveClass(/show/);
      await completeRun(a.page, { delay: 120 });
      const runA = await a.page.evaluate(() => window.lastRunSummary);
      expect(runA.counted && runA.ranked).toBe(true);
      if (Math.round(runA.wpm) > wpmB) {
        await expect(a.page.locator('#ui-toast')).toContainText(`You passed ${nameB}'s`, { timeout: 5000 });
      }
      await dismissLevelUp(a.page);
      await a.page.evaluate(() => closeResults());

      // Remove B.
      await openBoard(a.page);
      await a.page.locator('.lb-tab[data-tab="friends"]').click();
      await expect(rowB).toBeVisible({ timeout: 10000 });
      await rowB.locator('.lb-mini-danger').click();
      await expect(rowB).toHaveCount(0, { timeout: 10000 });
      const after = await a.page.evaluate(async () => (await (await fetch('/api/friends', { credentials: 'include' })).json()).friends);
      expect(after).toEqual([]);
      expect(a.errors).toEqual([]);
      expect(b.errors).toEqual([]);
    } finally {
      await a.context.close();
      await b.context.close();
      await server.stop();
    }
  });
});
