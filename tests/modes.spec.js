// @ts-check
// Story mode (Lyra Gate), the Story map and Orion Bulwark. Desktop project only; the 375 px
// case sets its own viewport.
const { test: base, expect } = require('@playwright/test');

const MINING_KEY = 'sampire-mining-state-v1';

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/Failed to load resource/i.test(t)) return;
      errors.push('console.error: ' + t);
    });
    await page.route('https://ipapi.co/**', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ country_code: 'US', country_name: 'United States' }),
    }));
    await use(page);
    expect(errors, 'uncaught page errors / console errors').toEqual([]);
  },
});

async function start(page, seed) {
  if (seed) await page.addInitScript((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, seed);
  await page.goto('/');
  const splash = page.locator('#entry-splash');
  if (await splash.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.evaluate(() => { if (typeof hideSplashScreen === 'function') hideSplashScreen(); });
    await page.waitForTimeout(300);
  }
}

async function openLyra(page) {
  const opened = await page.evaluate(() => openLyraGate());
  expect(opened).toBe(true);
  await page.waitForFunction(() => !lyraSetupInFlight && lyraGateState.words.length > 0, null, { timeout: 20000 });
  await page.waitForTimeout(150);
}

async function typeWords(page, count) {
  for (let i = 0; i < count; i++) {
    const word = await page.evaluate(() => lyraGateState.words[0] || '');
    await page.keyboard.type(word + ' ', { delay: 12 });
  }
}

function miningSeed(extra) {
  return { [MINING_KEY]: JSON.stringify({ version: 3, currentStoryBookId: 'alice-in-wonderland', currentStoryProgress: 0, ...extra }) };
}

test.describe('Story mode and modes', () => {
  test.beforeEach(async ({}, info) => {
    test.skip(info.project.name !== 'desktop-chrome', 'desktop only');
  });

  test('first open resumes at the saved word', async ({ page }) => {
    await start(page, miningSeed({ currentStoryProgress: 500, storyProgressByBook: { 'alice-in-wonderland': 500 } }));
    await openLyra(page);
    const expected = await page.evaluate(async () => (await (await fetch('assets/library/alice-in-wonderland.json')).json())[500]);
    const first = await page.evaluate(() => ({ word: lyraGateState.words[0], base: lyraGateState.storyBaseIndex, progress: lyraMiningState.currentStoryProgress }));
    expect(first.word).toBe(expected);
    expect(first.base).toBe(500);
    await typeWords(page, 1);
    expect(await page.evaluate(() => lyraMiningState.currentStoryProgress)).toBe(501);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sampire-mining-state-v1')).currentStoryProgress)).toBe(501);
  });

  test('power boost (Tab) activates when charged and keeps the session when not', async ({ page }) => {
    await start(page, miningSeed({ currentStoryProgress: 40, overloadMeter: 0 }));
    await openLyra(page);
    await typeWords(page, 2);
    const before = await page.evaluate(() => ({ progress: lyraMiningState.currentStoryProgress, base: lyraGateState.storyBaseIndex, completed: lyraGateState.totalCompleted }));
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({ progress: lyraMiningState.currentStoryProgress, base: lyraGateState.storyBaseIndex, completed: lyraGateState.totalCompleted, active: isLyraOverloadActive() }));
    expect(after).toEqual({ ...before, active: false });
    await expect(page.locator('#lyra-gate-modal')).toHaveClass(/show/);
    // Charge it fully, then Tab turns it on without errors.
    await page.evaluate(() => { lyraMiningState.overloadMeter = 100; renderLyraMiningHud(); });
    await expect(page.locator('#lyra-overload-trigger')).toBeEnabled();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => isLyraOverloadActive())).toBe(true);
    await expect(page.locator('#lyra-overload-trigger')).toHaveText('On');
    await typeWords(page, 1);
    expect(await page.evaluate(() => lyraMiningState.currentStoryProgress)).toBe(before.progress + 1);
  });

  test('chapter restart in Alice goes back to the chapter heading, and books with no chapters hide the option', async ({ page }) => {
    await start(page, miningSeed({ currentStoryProgress: 2300, storyProgressByBook: { 'alice-in-wonderland': 2300 } }));
    await openLyra(page);
    const starts = await page.evaluate(() => getLyraChapterStarts());
    expect(starts.length).toBe(12);
    expect(starts[1]).toBe(2181);
    await expect(page.locator('#lyra-story-reset-chapter')).toBeAttached();
    expect(await page.evaluate(() => document.getElementById('lyra-story-reset-chapter').hidden)).toBe(false);
    await page.evaluate(() => restartLyraStoryProgress('chapter'));
    const after = await page.evaluate(() => ({ progress: lyraMiningState.currentStoryProgress, word: lyraGateState.words[0], next: lyraGateState.words[1] }));
    expect(after.progress).toBe(2181);
    expect(after.word).toBe('CHAPTER');
    expect(after.next).toBe('II.');
    // Sherlock Holmes has no chapter headings: the option is hidden.
    await page.evaluate(() => selectLyraStoryBook('sherlock-holmes'));
    await page.waitForFunction(() => getLyraCurrentStoryBookId() === 'sherlock-holmes' && lyraGateState.words.length > 0, null, { timeout: 20000 });
    expect(await page.evaluate(() => getLyraChapterStarts().length)).toBe(1);
    expect(await page.evaluate(() => document.getElementById('lyra-story-reset-chapter').hidden)).toBe(true);
  });

  test('finishing the third chapter marks Lyra Gate cleared on the story map', async ({ page }) => {
    // Seeded right before the end of chapter 3 (chapter 4 starts at word 5982) with two chapters done.
    await start(page, miningSeed({
      currentStoryProgress: 5980,
      storyProgressByBook: { 'alice-in-wonderland': 5980 },
      milestones: { 'alice-in-wonderland': { chapters: 2, layers: 0, checkpoints: 2 } },
    }));
    await openLyra(page);
    expect(await page.evaluate(() => isSectorCleared('lyra'))).toBe(false);
    const crystalsBefore = await page.evaluate(() => lyraMiningState.totalAetherCrystals);
    await typeWords(page, 2);
    await expect(page.locator('.lyra-milestone-splash')).toContainText(/Lyra Gate cleared/);
    expect(await page.evaluate(() => isSectorCleared('lyra'))).toBe(true);
    expect(await page.evaluate(() => lyraMiningState.milestones['alice-in-wonderland'].chapters)).toBe(3);
    expect(await page.evaluate(() => lyraMiningState.totalAetherCrystals)).toBeGreaterThan(crystalsBefore + 500);
    // The wallet badge mirrors the mining wallet.
    expect(await page.evaluate(() => getSkillPoints())).toBe(await page.evaluate(() => lyraMiningState.totalAetherCrystals));
    await page.evaluate(() => closeLyraGate());
    await page.evaluate(() => openSectorMap());
    await expect(page.locator('#sector-map-nodes g[data-node-id="lyra"] .sector-node-status')).toHaveText('Cleared');
    await expect(page.locator('#sector-map-list .sector-list-item[data-sector-id="lyra"]')).toHaveClass(/is-cleared/);
  });

  test('Escape closes the restart menu before the gate; backdrop click is ignored mid-word', async ({ page }) => {
    await start(page, miningSeed({ currentStoryProgress: 10 }));
    await openLyra(page);
    await page.locator('#lyra-story-reset-toggle').click();
    await expect(page.locator('#lyra-story-reset')).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#lyra-story-reset')).not.toHaveClass(/open/);
    await expect(page.locator('#lyra-gate-modal')).toHaveClass(/show/);
    const word = await page.evaluate(() => lyraGateState.words[0]);
    await page.keyboard.type(word.slice(0, 2), { delay: 12 });
    await page.evaluate(() => handleLyraGateBackdrop({ target: document.getElementById('lyra-gate-modal') }));
    await expect(page.locator('#lyra-gate-modal')).toHaveClass(/show/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#lyra-gate-modal')).not.toHaveClass(/show/);
  });

  test('Lyra Gate is usable at 375 px: five words typed, no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await start(page, miningSeed({ currentStoryProgress: 0 }));
    await openLyra(page);
    expect(await page.evaluate(() => lyraVisibleWordWindow)).toBeLessThanOrEqual(10);
    const before = await page.evaluate(() => lyraMiningState.currentStoryProgress);
    await typeWords(page, 5);
    expect(await page.evaluate(() => lyraMiningState.currentStoryProgress)).toBe(before + 5);
    const layout = await page.evaluate(() => {
      const card = document.querySelector('#lyra-gate-modal .leaderboard-modal-card');
      const quote = document.getElementById('lyra-quote-display').getBoundingClientRect();
      const back = document.querySelector('#lyra-gate-modal .lyra-exit-btn').getBoundingClientRect();
      return {
        docOverflow: document.documentElement.scrollWidth > window.innerWidth,
        cardOverflow: card.scrollWidth > card.clientWidth + 1,
        quoteRight: quote.right, backVisible: back.width > 0 && back.right <= window.innerWidth + 1,
        label: document.querySelector('#lyra-gate-modal .lyra-exit-label').textContent.trim(),
      };
    });
    expect(layout.docOverflow).toBe(false);
    expect(layout.cardOverflow).toBe(false);
    expect(layout.quoteRight).toBeLessThanOrEqual(376);
    expect(layout.backVisible).toBe(true);
    expect(layout.label).toBe('Back to map');
    // The story map shows a list at this width.
    await page.evaluate(() => closeLyraGate());
    await page.evaluate(() => openSectorMap());
    await expect(page.locator('#sector-map-list .sector-list-item')).toHaveCount(7);
    await expect(page.locator('#sector-map-list')).toBeVisible();
    await expect(page.locator('#sector-map-modal .sector-map-wrap')).toBeHidden();
  });

  test('Orion Bulwark opens from the map at level 2 and shows the results card', async ({ page }) => {
    await start(page, { 'sampire-xp': '500' });
    await page.evaluate(() => openSectorMap());
    await expect(page.locator('#sector-map-nodes g[data-node-id="orion"] .sector-node-status')).toHaveText('Ready to play');
    await expect(page.locator('#sector-map-nodes g[data-node-id="orion"] .sector-node-name')).toHaveText('Orion Bulwark');
    await page.evaluate(() => handleSectorSystemSelectById('orion'));
    await expect(page.locator('#orion-mode')).toBeVisible({ timeout: 5000 });
    // Lose on purpose: hit the station with a direct shield drain through missed keys is slow, so
    // drive the public API: open with a tiny shield by typing wrong letters until the run ends.
    await page.waitForTimeout(3300);
    for (let i = 0; i < 60 && await page.locator('#orion-mode [data-r="overp"]').evaluate((el) => !el.classList.contains('show')); i++) {
      await page.keyboard.press('z');
    }
    await expect(page.locator('#orion-mode [data-r="overp"]')).toHaveClass(/show/);
    const card = page.locator('#orion-mode .om-card');
    await expect(card).toContainText('Wave reached');
    await expect(card).toContainText('WPM');
    await expect(card).toContainText('Accuracy');
    await expect(card.locator('[data-r="rxp"]')).toHaveText(/^\+\d+$/);
    expect(await page.evaluate(() => getTotalXP())).toBeGreaterThan(500);
    await page.locator('#orion-mode [data-r="exit2"]').click();
    await expect(page.locator('#orion-mode')).toHaveCount(0);
  });

  test('level 1 players see Orion as locked, with no speed requirement', async ({ page }) => {
    await start(page, { 'sampire-xp': '0' });
    await page.evaluate(() => openSectorMap());
    await expect(page.locator('#sector-map-nodes g[data-node-id="orion"] .sector-node-status')).toHaveText('Reach level 2');
    await expect(page.locator('#sector-map-nodes g.is-placeholder')).toHaveCount(5);
    await expect(page.locator('#sector-map-nodes .sector-node-name')).toHaveCount(7);
    await expect(page.locator('.sector-map-soon-banner')).toHaveCount(0);
  });

  test('AdaptivePractice exposes focus keys and a plain status line', async ({ page }) => {
    await start(page);
    const r = await page.evaluate(() => {
      const set = AdaptivePractice.setFocusKeys(['f', 'R', 'i', 'f', '!']);
      const got = AdaptivePractice.getFocusKeys();
      const line = AdaptivePractice.getStatusLine();
      const drill = AdaptivePractice.generateDrill({ wordCount: 60, wordPool: WORD_LIST }).split(' ');
      const hit = drill.filter((w) => /[fri]/.test(w)).length / drill.length;
      AdaptivePractice.setFocusKeys([]);
      return { set, got, line, hit, cleared: AdaptivePractice.getFocusKeys(), lineAfter: AdaptivePractice.getStatusLine() };
    });
    expect(r.set).toEqual(['f', 'r', 'i']);
    expect(r.got).toEqual(['f', 'r', 'i']);
    expect(r.line).toBe('Weak-key drill: f, r, i (picked from your last run)');
    expect(r.hit).toBeGreaterThan(0.7);
    expect(r.cleared).toEqual([]);
    expect(r.lineAfter).toBe('Type a few runs first so we can find your weak keys');
  });
});
