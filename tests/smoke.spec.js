// @ts-check
// Console-error sweep: open every screen as a guest and as a logged-in player, on desktop (1280) and
// phone (375), and fail on any page error or console.error. Runs on a private copy of the server.
const { test, expect } = require('@playwright/test');
const { startTestServer } = require('./_server');

let server;
test.beforeAll(async () => { server = await startTestServer(); });
test.afterAll(async () => { if (server) await server.stop(); });

const VIEWPORTS = { 'desktop-chrome': { width: 1280, height: 720 }, 'mobile-chrome': { width: 375, height: 812 } };

test.beforeEach(async ({}, info) => {
  test.skip(!VIEWPORTS[info.project.name], 'desktop and phone only');
  // About 35 screens plus one run typed at a human pace; leave headroom for a busy machine.
  test.setTimeout(90000);
});

/**
 * Records page errors and console errors. While nobody is logged in, the session probe on boot
 * (GET /api/me, then POST /api/refresh with no cookie) answers 401 and Chromium logs that as a
 * console error; those two are expected. Everything else counts.
 */
function watchErrors(page, state) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    const url = (m.location() && m.location().url) || '';
    if (!state.loggedIn && /Failed to load resource/i.test(text) && /\/api\/(me|refresh)(\?|$)/.test(url) && /\b401\b/.test(text)) return;
    errors.push(`console.error: ${text}${url ? ` (${url})` : ''}`);
  });
  return errors;
}

async function readTarget(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#quote-display span[class*="char-"]'))
    .map((s) => (s.textContent || '').replace(/ /g, ' ')).join(''));
}

function uniqueName(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`.slice(0, 20);
}

async function sweep(page, { guest, width }) {
  const state = { loggedIn: false };
  const errors = watchErrors(page, state);
  const failures = [];
  const seen = [];
  const step = async (name, fn) => {
    const before = errors.length;
    try {
      await fn();
    } catch (e) {
      failures.push(`${name}: ${e && e.message ? e.message.split('\n')[0] : e}`);
    }
    for (const err of errors.slice(before)) failures.push(`${name}: ${err}`);
    seen.push(name);
  };
  const shown = (id) => expect(page.locator(`#${id}`)).toHaveClass(/show/, { timeout: 5000 });
  const notShown = (id) => expect(page.locator(`#${id}`)).not.toHaveClass(/show/, { timeout: 5000 });
  const call = (code) => page.evaluate(code);
  // Let the page paint and run its animation loop a few times, so errors thrown by drawing code surface.
  const frames = (n = 3) => page.evaluate((count) => new Promise((resolve) => {
    let left = count;
    const tick = () => { left -= 1; if (left <= 0) resolve(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }), n);
  const clearOverlays = () => call(() => {
    if (typeof closeResults === 'function') closeResults();
    if (typeof closeLevelUpOverlay === 'function') closeLevelUpOverlay();
  });

  await step('splash', async () => {
    await page.goto(server.base + '/');
    await expect(page.locator('#entry-splash')).toBeVisible();
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('sampire-engine-options', JSON.stringify({ words: 10 }));
    });
    await page.reload();
    await expect(page.locator('#entry-splash')).toBeVisible();
  });

  if (!guest) {
    await step('sign up', async () => {
      const name = uniqueName('smoke');
      await page.evaluate((n) => signupUser(n, 'secret123'), name);
      await expect.poll(() => page.evaluate(() => !!(currentUser && currentUser.username)), { timeout: 10000 }).toBe(true);
      state.loggedIn = true;
      // signupUser is awaited above; wait for its end state (progress owned and saved), not for network idle,
      // which never comes because the page keeps polling.
      await expect.poll(() => page.evaluate(() => getProgressOwner() === String(currentUser.id) && !progressSyncInFlight),
        { timeout: 15000 }).toBe(true);
    });
  }

  await step('main', async () => {
    await call(() => { if (typeof hideSplashScreen === 'function') hideSplashScreen(); });
    await expect(page.locator('#typing-area')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#top-bar')).toBeVisible();
  });

  for (const mode of ['quotes', 'words', 'words30', 'adaptive', 'daily']) {
    await step(`mode tab ${mode}`, async () => {
      await call(`setMode(${JSON.stringify(mode)})`);
      await expect(page.locator('.mode-tab.active')).toHaveAttribute('data-mode', mode);
      if (mode === 'daily') await expect(page.locator('#challenge-panel')).toBeVisible();
    });
  }
  await step('challenges panel', async () => {
    await call(() => setMode('daily'));
    await expect(page.locator('#challenge-panel')).toBeVisible();
    await call(() => setMode('words'));
  });

  await step('options bar', async () => {
    await expect(page.locator('#engine-options')).toBeAttached();
    await call(() => setEngineOption('punctuation', true));
    await call(() => setEngineOption('punctuation', false));
    await call(() => setEngineOption('liveChart', true));
    await expect(page.locator('#live-chart-toggle-btn')).toHaveAttribute('aria-checked', 'true');
    await call(() => setEngineOption('liveChart', false));
  });

  await step('settings panel', async () => {
    await call(() => openSettingsPanel());
    await expect(page.locator('#settings-panel')).toHaveClass(/show/);
    await call(() => toggleLiveChart());
    await call(() => toggleLiveChart());
    await call(() => closeSettingsPanel());
    await expect(page.locator('#settings-panel')).not.toHaveClass(/show/);
  });

  await step('help', async () => {
    await call(() => openHelpModal());
    await shown('help-modal');
    await call(() => closeHelpModal());
    await notShown('help-modal');
  });

  await step('results', async () => {
    await call(() => setMode('words'));
    await page.locator('#quote-display').click();
    await expect(page.locator('#hidden-input')).toBeFocused({ timeout: 3000 });
    const text = await readTarget(page);
    // About 70 WPM, so the run is counted and ranked like a real one (and, logged in, is sent to the server).
    await page.locator('#hidden-input').pressSequentially(text, { delay: 170 });
    // The results dialog opens 400 ms after the last key; allow for a slow machine.
    await expect(page.locator('#result-overlay')).toHaveClass(/show/, { timeout: 15000 });
    await expect.poll(() => page.evaluate(() => !!(window.lastRunSummary && window.lastRunSummary.counted))).toBe(true);
    await expect(page.locator('#result-title')).toBeVisible();
    await clearOverlays();
    await notShown('result-overlay');
  });

  await step('level-up', async () => {
    await call(() => showLevelUpOverlay({ level: 2, prevLevel: 1 }));
    await shown('levelup-overlay');
    await call(() => closeLevelUpOverlay());
    await notShown('levelup-overlay');
  });

  await step('weekly recap', async () => {
    await call(() => {
      if (typeof showWeeklyRecap !== 'function') return;
      showWeeklyRecap({ week: '2026-11-01', words: 1200, runs: 14, bestWpm: 61, avgWpm: 48, days: 4, questsDone: 3, runs95: 2, previous: null });
    });
    await call(() => { if (typeof closeWeeklyRecap === 'function') closeWeeklyRecap(); });
  });

  await step('shop', async () => {
    await call(() => openSkills());
    await shown('skills-modal');
    await call(() => closeSkills());
    await notShown('skills-modal');
  });

  await step('owned items', async () => {
    await call(() => openInventory());
    await shown('inventory-modal');
    await call(() => closeInventory());
    await notShown('inventory-modal');
  });

  await step('leaderboard', async () => {
    await call(() => openLeaderboard());
    await shown('leaderboard-modal');
  });
  for (const tab of ['alltime', 'weekly', 'friends', 'community']) {
    await step(`leaderboard tab ${tab}`, async () => {
      await call(`setLbTab(${JSON.stringify(tab)})`);
      await expect(page.locator(`.lb-tab[data-tab="${tab}"]`)).toHaveAttribute('aria-selected', 'true');
      // Wait for the board to finish loading so any error from rendering its rows is caught here.
      await expect(page.locator('#leaderboard-list')).not.toContainText('Loading', { timeout: 10000 });
      await frames();
    });
  }
  await step('leaderboard close', async () => {
    await call(() => closeLeaderboard());
    await notShown('leaderboard-modal');
  });

  await step('team goal', async () => {
    await call(() => openCommunityHub());
    await shown('community-hub-modal');
    await frames();
    await call(() => closeCommunityHub());
    await notShown('community-hub-modal');
  });

  await step(guest ? 'login modal' : 'profile', async () => {
    await call(() => openProfileOrLogin());
    if (guest) {
      await shown('login-modal');
      await call(() => closeLoginModal());
      await notShown('login-modal');
    } else {
      await shown('profile-modal');
      await call(() => closeProfile());
      await notShown('profile-modal');
    }
  });

  await step('signup modal', async () => {
    await call(() => openSignupModal());
    await shown('signup-modal');
    await call(() => closeSignupModal());
    await notShown('signup-modal');
  });

  await step('mission briefing', async () => {
    await call(() => { if (typeof openMissionBriefing === 'function') openMissionBriefing(); });
    await call(() => { if (typeof closeMissionBriefing === 'function') closeMissionBriefing(); });
  });

  await step('lifetime stats', async () => {
    await call(() => openLifetimeStatsModal());
    await shown('lifetime-stats-modal');
    await call(() => closeLifetimeStatsModal());
    await notShown('lifetime-stats-modal');
  });

  if (!guest) {
    await step('account', async () => {
      await call(() => openAccountManagement());
      await shown('account-modal');
      await call(() => closeAccountManagement());
      await notShown('account-modal');
    });
  }

  await step('story map', async () => {
    await call(() => openSectorMap());
    await shown('sector-map-modal');
    await frames();
    await call(() => closeSectorMap());
    await notShown('sector-map-modal');
  });

  await step('Lyra Gate', async () => {
    await call(() => openLyraGate());
    await shown('lyra-gate-modal');
    await frames(10);
    await call(() => closeLyraGate());
    await notShown('lyra-gate-modal');
  });

  await step('Orion', async () => {
    await call(() => window.OrionMode.open({ wordPool: WORD_LIST, onExit() {}, onRunComplete() {} }));
    await expect(page.locator('#orion-mode')).toBeVisible();
    await frames(10);
    await call(() => window.OrionMode.close());
    await expect.poll(() => page.evaluate(() => window.OrionMode.isOpen())).toBe(false);
  });

  await step('idle after sweep', async () => {
    // Late async work (progress save, board refresh) must also finish without errors.
    if (!guest) await expect.poll(() => page.evaluate(() => !progressSyncInFlight), { timeout: 10000 }).toBe(true);
    await frames(5);
  });

  expect(seen.length).toBeGreaterThan(20);
  expect(failures, `console-error sweep (${guest ? 'guest' : 'logged in'}, ${width}px)`).toEqual([]);
}

test.describe('Console-error sweep', () => {
  test('guest: every screen opens without page or console errors', async ({ page }, info) => {
    const vp = VIEWPORTS[info.project.name];
    await page.setViewportSize(vp);
    await sweep(page, { guest: true, width: vp.width });
  });

  test('logged in: every screen opens without page or console errors', async ({ page }, info) => {
    const vp = VIEWPORTS[info.project.name];
    await page.setViewportSize(vp);
    await sweep(page, { guest: false, width: vp.width });
  });
});
