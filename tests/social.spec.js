// @ts-check
// Social features: leaderboard tabs and mode filter, friends, invite link, head-to-head,
// share card, shared-result banner, phone layout, keyboard tooltip.
// The shared dev server on port 3000 still runs the old API, so every contract route is mocked.
const { test: base, expect } = require('@playwright/test');

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
});
