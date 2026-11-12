// @ts-check
// End-to-end happy paths against a real copy of the server (server.js adapter, in-memory store, cloud
// mode). Each worker starts its own server so throwaway accounts never touch the shared :3000 server.
const { test, expect } = require('@playwright/test');
const { startTestServer } = require('./_server');

let server;

test.beforeAll(async () => { server = await startTestServer(); });
test.afterAll(async () => { if (server) await server.stop(); });

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== 'desktop-chrome', 'desktop only');
  // Each test types real runs at a human pace and talks to a server; leave headroom for a busy machine.
  test.setTimeout(60000);
});

function uniqueName(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`.slice(0, 20);
}

async function dismissSplash(page) {
  const splash = page.locator('#entry-splash');
  if (!(await splash.isVisible({ timeout: 2000 }).catch(() => false))) return;
  await page.evaluate(() => { if (typeof hideSplashScreen === 'function') hideSplashScreen(); });
  await expect(page.locator('#typing-area')).toBeVisible({ timeout: 5000 });
}

/** Fresh page on the private server: clean localStorage, 10-word runs, splash dismissed. */
async function boot(page) {
  await page.goto(server.base + '/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('sampire-engine-options', JSON.stringify({ words: 10 }));
  });
  await page.reload();
  await dismissSplash(page);
  await expect.poll(() => page.evaluate(() => typeof isCloudMode === 'function' ? isCloudMode() : null), { timeout: 10000 }).toBe(true);
}

async function readTarget(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#quote-display span[class*="char-"]'))
    .map((s) => (s.textContent || '').replace(/ /g, ' ')).join(''));
}

/** Type the whole text correctly at a human pace: a counted, ranked run. */
async function completeRun(page) {
  await page.evaluate(() => { if (typeof closeResults === 'function') closeResults(); });
  await page.locator('#quote-display').click();
  await expect(page.locator('#hidden-input')).toBeFocused({ timeout: 2000 });
  const text = await readTarget(page);
  // About 70 WPM: fast enough to be quick, slow enough that the server does not flag the run.
  await page.keyboard.type(text, { delay: 170 });
  await expect(page.locator('#result-overlay')).toHaveClass(/show/, { timeout: 15000 });
  await expect.poll(() => page.evaluate(() => !!window.lastRunSummary)).toBe(true);
  return page.evaluate(() => window.lastRunSummary);
}

async function dismissOverlays(page) {
  await page.evaluate(() => {
    if (typeof closeResults === 'function') closeResults();
    if (typeof closeLevelUpOverlay === 'function') closeLevelUpOverlay();
  });
}

/**
 * After a sign-up or login the client hydrates progress from the server and pushes a snapshot back.
 * signupUser/loginUser are awaited by page.evaluate, so here we only wait for the concrete end state:
 * the account owns this browser's progress, no progress save is in flight, the dialogs are closed and
 * a fresh text is on screen. (networkidle never settles: the page keeps polling.)
 */
async function settle(page) {
  await expect.poll(() => page.evaluate(() => {
    const open = (id) => !!document.getElementById(id)?.classList.contains('show');
    return !!currentUser
      && getProgressOwner() === String(currentUser.id)
      && !progressSyncInFlight
      && !open('signup-modal') && !open('login-modal');
  }), { message: 'sign-in settled', timeout: 15000 }).toBe(true);
  await expect(page.locator('#quote-display span[class*="char-"]').first()).toBeVisible();
}

const currentUsername = (page) => page.evaluate(() => (typeof currentUser !== 'undefined' && currentUser) ? currentUser.username : null);
const totalXp = (page) => page.evaluate(() => getTotalXP());
const progressOwner = (page) => page.evaluate(() => getProgressOwner());
const userId = (page) => page.evaluate(() => (currentUser && currentUser.id) || '');

/** Sign up through the real signup modal (username, password, confirm, captcha). */
async function signupViaModal(page, username, password) {
  await page.evaluate(() => openSignupModal());
  await expect(page.locator('#signup-modal')).toHaveClass(/show/);
  await page.fill('#signup-username', username);
  await page.fill('#signup-password', password);
  await page.fill('#signup-password-confirm', password);
  const answer = await page.evaluate(() => signupCaptchaAnswer);
  await page.fill('#signup-captcha-input', String(answer));
  await page.evaluate(() => signupUserFromModal());
  await expect.poll(() => currentUsername(page), { timeout: 10000 }).toBe(username);
  await expect.poll(() => progressOwner(page), { timeout: 10000 }).not.toBe('');
  await settle(page);
}

/** Sign up with the app's own function (no modal), then wait until progress is hydrated. */
async function signupDirect(page, username, password) {
  await page.evaluate(([u, p]) => signupUser(u, p), [username, password]);
  await expect.poll(() => currentUsername(page), { timeout: 10000 }).toBe(username);
  await expect.poll(() => progressOwner(page), { timeout: 10000 }).not.toBe('');
  await settle(page);
}

async function loginDirect(page, username, password) {
  await page.evaluate(([u, p]) => {
    document.getElementById('auth-username').value = u;
    document.getElementById('auth-password').value = p;
    return loginUser();
  }, [username, password]);
  await expect.poll(() => currentUsername(page), { timeout: 10000 }).toBe(username);
  await settle(page);
}

async function apiGet(page, path) {
  const res = await page.request.get(server.base + path);
  return { status: res.status(), data: await res.json().catch(() => null) };
}

test.describe('Integration: account, run, boards, session', () => {
  test('sign up, finish a counted run, see it on the boards, reload, log out, log in', async ({ page }) => {
    const username = uniqueName('it');
    const password = 'secret123';
    await boot(page);
    await signupViaModal(page, username, password);
    expect(await page.evaluate(() => getProgressOwner() === String(currentUser.id))).toBe(true);

    // A counted run: XP bar moves, results card shows +N XP.
    const xpBefore = await totalXp(page);
    const counterBefore = await page.locator('#xp-counter').textContent();
    const summary = await completeRun(page);
    expect(summary.counted).toBe(true);
    expect(summary.xpEarned).toBeGreaterThan(0);
    await expect(page.locator('#result-rewards')).toContainText(`+${summary.xpEarned} XP`);
    // Quests and badges finished by the same run add more XP on top of the run's own XP.
    await expect.poll(() => totalXp(page)).toBeGreaterThanOrEqual(xpBefore + summary.xpEarned);
    const xpAfterRun = await totalXp(page);
    await expect(page.locator('#xp-counter')).not.toHaveText(counterBefore || '');
    await expect(page.locator('#xp-counter')).toContainText(`${xpAfterRun} /`);

    // The score reached the server under the right name, on both boards.
    await expect.poll(async () => (await apiGet(page, '/api/scores/me')).data?.scores?.length || 0, { timeout: 10000 }).toBeGreaterThan(0);
    const mine = await apiGet(page, '/api/scores/me');
    expect(mine.status).toBe(200);
    expect(mine.data.scores[0].username).toBe(username);
    expect(Math.round(mine.data.scores[0].wpm)).toBe(Math.round(summary.wpm));
    for (const tab of ['alltime', 'weekly']) {
      await expect.poll(async () => {
        const board = await apiGet(page, `/api/leaderboard?tab=${tab}&mode=all&limit=100`);
        return (board.data?.rows || []).some((row) => row.username === username && Math.round(row.wpm) === Math.round(summary.wpm));
      }, { message: `${tab} board shows ${username}`, timeout: 10000 }).toBe(true);
    }
    await dismissOverlays(page);
    // Make sure the progress save landed before we reload.
    await page.evaluate(() => flushProgressSyncNow());
    await expect.poll(async () => (await apiGet(page, '/api/progress')).data?.progress?.['sampire-xp'], { timeout: 10000 }).toBe(String(xpAfterRun));

    // Reload: the cookie session is restored and progress hydrated.
    await page.reload();
    await dismissSplash(page);
    await expect.poll(() => currentUsername(page), { timeout: 10000 }).toBe(username);
    await expect.poll(() => progressOwner(page), { timeout: 10000 }).toBe(await userId(page));
    expect(await totalXp(page)).toBe(xpAfterRun);

    // Log out: this browser's copy of the progress is cleared.
    await page.evaluate(() => logoutUser());
    await expect.poll(() => currentUsername(page)).toBe(null);
    expect(await page.evaluate(() => localStorage.getItem('sampire-xp'))).toBe(null);
    expect(await totalXp(page)).toBe(0);
    expect(await progressOwner(page)).toBe('');

    // Log in again: XP is back from the server.
    await loginDirect(page, username, password);
    await expect.poll(() => totalXp(page), { timeout: 10000 }).toBe(xpAfterRun);
    expect(await progressOwner(page)).toBe(await userId(page));
  });

  test('two users: add a friend, the Friends tab lists both, head-to-head opens', async ({ browser }) => {
    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const nameA = uniqueName('ann');
    const nameB = uniqueName('ben');
    try {
      await boot(pageA);
      await boot(pageB);
      await signupDirect(pageA, nameA, 'secret123');
      await signupDirect(pageB, nameB, 'secret123');
      // Give B a score so the head-to-head has something to show.
      const runB = await completeRun(pageB);
      expect(runB.counted).toBe(true);
      await dismissOverlays(pageB);

      await pageA.evaluate(() => openLeaderboard());
      await expect(pageA.locator('#leaderboard-modal')).toHaveClass(/show/);
      await pageA.evaluate(() => setLbTab('friends'));
      await expect(pageA.locator('#lb-friend-input')).toBeVisible({ timeout: 10000 });
      await pageA.fill('#lb-friend-input', nameB);
      await pageA.evaluate(() => submitAddFriend());
      // The list is a header row, the player's own row, then one row per friend; only real rows carry data-friend.
      const rows = pageA.locator('.lb-friend-row[data-friend]');
      await expect(rows).toHaveCount(2, { timeout: 10000 });
      await expect(pageA.locator('.lb-friend-row.lb-row-self')).toHaveAttribute('data-friend', nameA);
      await expect(pageA.locator(`.lb-friend-row[data-friend="${nameA}"]`)).toHaveCount(1);
      await expect(pageA.locator(`.lb-friend-row[data-friend="${nameB}"]`)).toHaveCount(1);
      const friends = await apiGet(pageA, '/api/friends');
      expect(friends.data.friends.map((f) => f.username)).toContain(nameB);
      // Under the list, "Best runs" shows the friend's run from the friends board.
      const board = pageA.locator('#lb-friends-board');
      await expect(board).toContainText('Best runs', { timeout: 10000 });
      await expect(board.locator('.lb-score-row', { hasText: nameB })).toHaveCount(1);

      await pageA.locator(`.lb-friend-row[data-friend="${nameB}"] button`, { hasText: 'Compare' }).click();
      const panel = pageA.locator('#lb-compare-panel');
      await expect(panel).toBeVisible();
      await expect(panel).toContainText(nameA, { timeout: 10000 });
      await expect(panel).toContainText(nameB);
      await expect(panel.locator('.h2h-value').first()).toBeVisible();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('guest plays a run, signs up, and the guest XP is merged into the new account', async ({ page }) => {
    await boot(page);
    const summary = await completeRun(page);
    expect(summary.counted).toBe(true);
    await dismissOverlays(page);
    const guestXp = await totalXp(page);
    expect(guestXp).toBeGreaterThan(0);
    expect(await progressOwner(page)).toBe('');

    const username = uniqueName('gu');
    await signupViaModal(page, username, 'secret123');
    expect(await totalXp(page)).toBe(guestXp);
    expect(await progressOwner(page)).toBe(await userId(page));
    await page.evaluate(() => flushProgressSyncNow());
    await expect.poll(async () => (await apiGet(page, '/api/progress')).data?.progress?.['sampire-xp'], { timeout: 10000 }).toBe(String(guestXp));
    const history = await apiGet(page, '/api/progress');
    expect(JSON.parse(history.data.progress['sampire-typing-history']).length).toBeGreaterThan(0);

    // And it survives a fresh load.
    await page.reload();
    await dismissSplash(page);
    await expect.poll(() => currentUsername(page), { timeout: 10000 }).toBe(username);
    await expect.poll(() => totalXp(page), { timeout: 10000 }).toBe(guestXp);
  });
});
