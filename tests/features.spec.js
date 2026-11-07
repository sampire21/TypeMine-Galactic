// @ts-check
const { test: base, expect } = require('@playwright/test');

// Every test fails on uncaught page errors and on console errors from the app.
const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      // Network noise from the local static server (no backend API / optional assets) is not an app error.
      if (/Failed to load resource/i.test(t)) return;
      errors.push('console.error: ' + t);
    });
    // Third-party geo lookup is blocked by CORS from localhost; stub it so it is not counted as an app error.
    await page.route('https://ipapi.co/**', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ country_code: 'US', country_name: 'United States' }),
    }));
    await use(page);
    expect(errors, 'uncaught page errors / console errors').toEqual([]);
  },
});

async function dismissSplash(page) {
  const splash = page.locator('#entry-splash');
  if (!(await splash.isVisible({ timeout: 2000 }).catch(() => false))) return;
  await page.evaluate(() => { if (typeof hideSplashScreen === 'function') hideSplashScreen(); });
  await page.waitForTimeout(300);
  await expect(page.locator('#typing-area')).toBeVisible({ timeout: 5000 });
}

async function start(page) {
  await page.goto('/');
  await dismissSplash(page);
}

async function focusTyping(page) {
  await page.locator('#quote-display').click();
  await expect(page.locator('#hidden-input')).toBeFocused({ timeout: 2000 });
}

/** Target text, read from char spans (spaces between words are separate or nbsp spans). */
async function readTarget(page) {
  return page.evaluate(() => {
    const spans = document.querySelectorAll('#quote-display span[class*="char-"]');
    return Array.from(spans).map((s) => (s.textContent || '').replace(/ /g, ' ')).join('');
  });
}

const overlay = (page) => page.locator('#result-overlay');

async function typeAll(page, text) {
  await page.keyboard.type(text, { delay: 15 });
}

async function completeRun(page) {
  await focusTyping(page);
  const text = await readTarget(page);
  await typeAll(page, text);
  await expect(overlay(page)).toHaveClass(/show/, { timeout: 10000 });
  return text;
}

test.describe('Features (desktop)', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-chrome', 'desktop only');
    await start(page);
  });

  test('full typing run shows results with WPM, 100% accuracy and analysis', async ({ page }) => {
    await expect(page.locator('.mode-tab.active')).toHaveAttribute('data-mode', 'words');
    const text = await completeRun(page);
    expect(text.length).toBeGreaterThan(10);
    await expect(overlay(page)).toBeVisible();
    const wpm = parseFloat((await page.locator('#final-wpm').textContent()) || '0');
    expect(wpm).toBeGreaterThan(0);
    const acc = parseFloat((await page.locator('#final-accuracy').textContent()) || '0');
    expect(acc).toBe(100);
    await expect(page.locator('#run-analysis-container')).not.toBeEmpty();
    expect((await page.locator('#run-analysis-container').innerHTML()).trim().length).toBeGreaterThan(20);
  });

  test('corrected mistakes still count against accuracy', async ({ page }) => {
    await focusTyping(page);
    const text = await readTarget(page);
    const wrong = text[0] === 'z' ? 'x' : 'z';
    await page.keyboard.type(wrong, { delay: 15 });
    await page.keyboard.press('Backspace');
    await typeAll(page, text);
    await expect(overlay(page)).toHaveClass(/show/, { timeout: 10000 });
    const acc = parseFloat((await page.locator('#final-accuracy').textContent()) || '100');
    expect(acc).toBeLessThan(100);
  });

  test('adaptive mode renders a drill and accepts clean typing', async ({ page }) => {
    await page.locator('.mode-tab', { hasText: 'Adaptive' }).click();
    await expect(page.locator('.mode-tab.active')).toHaveAttribute('data-mode', 'adaptive');
    await expect(page.locator('#quote-source')).toContainText(/Adaptive/i);
    const text = await readTarget(page);
    expect(text.length).toBeGreaterThan(20);
    await focusTyping(page);
    const part = text.slice(0, 15);
    await typeAll(page, part);
    await expect(page.locator('#quote-display .char-correct')).toHaveCount(15);
    await expect(page.locator('#quote-display .char-incorrect')).toHaveCount(0);
  });

  test('ghost delta badge appears on the second run', async ({ page }) => {
    const enabled = await page.evaluate(() => ghostCursorEnabled);
    test.skip(!enabled, 'ghost cursor disabled by default in this build');
    await completeRun(page);
    await page.evaluate(() => closeResults());
    await page.keyboard.press('Tab'); // restart: new Random Words test with ghost from previous run
    await expect(overlay(page)).not.toHaveClass(/show/);
    await focusTyping(page);
    const text = await readTarget(page);
    await page.keyboard.type(text.slice(0, 6), { delay: 120 });
    const badge = page.locator('#ghost-delta-slot .ra-ghost-badge');
    await expect(badge).toBeVisible({ timeout: 5000 });
    await expect(badge).toHaveText(/(ahead|behind)/);
  });

  test('Orion Bulwark opens, types, pauses, exits, and leaks nothing over 5 cycles', async ({ page }) => {
    const open = () => page.evaluate(() => {
      window.OrionMode.open({ wordPool: WORD_LIST, onExit() {}, onRunComplete() {} });
    });
    await open();
    await expect(page.locator('#orion-mode')).toBeVisible();
    expect(await page.evaluate(() => OrionMode.isOpen())).toBe(true);

    // Wait out the wave interstitial until a word is spawned; read it from state if exposed.
    await page.waitForTimeout(4500);
    await page.keyboard.press('a');
    await page.keyboard.press('Escape');
    await expect(page.locator('#orion-mode [data-r="pausep"]')).toHaveClass(/show/);
    await page.locator('#orion-mode [data-r="exit1"]').click();
    await expect(page.locator('#orion-mode')).toHaveCount(0);

    for (let i = 0; i < 5; i++) {
      await open();
      await expect(page.locator('#orion-mode')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.locator('#orion-mode [data-r="exit1"]').click();
      await expect(page.locator('#orion-mode')).toHaveCount(0);
    }
    expect(await page.evaluate(() => OrionMode.isOpen())).toBe(false);

    // Main typing still works.
    await focusTyping(page);
    const text = await readTarget(page);
    await page.keyboard.press(text[0] === ' ' ? 'Space' : text[0]);
    await expect(page.locator('#quote-display .char-correct').first()).toBeVisible();
    await expect(page.locator('#quote-display .char-cursor')).toHaveCount(1);
  });

  test('Lyra Gate opens and closes without errors', async ({ page }) => {
    const opened = await page.evaluate(() => openLyraGate());
    expect(opened).toBe(true);
    const modal = page.locator('#lyra-gate-modal');
    await expect(modal).toHaveClass(/show/);
    await page.waitForTimeout(800);
    await page.evaluate(() => closeLyraGate());
    await expect(modal).not.toHaveClass(/show/);
  });
});

test.describe('Features (mobile)', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-chrome', 'mobile only');
    await start(page);
  });

  test('hidden input events advance typing and Backspace via deleteContentBackward works', async ({ page }) => {
    const input = page.locator('#hidden-input');
    await page.locator('#quote-display').click();
    await expect(input).toBeFocused();
    const text = await readTarget(page);
    await input.pressSequentially(text.slice(0, 5), { delay: 30 });
    await expect(page.locator('#quote-display .char-correct')).toHaveCount(5);
    // IME-style backspace: input event only, no usable keydown key.
    await page.evaluate(() => {
      const el = document.getElementById('hidden-input');
      el.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }));
    });
    await expect(page.locator('#quote-display .char-correct')).toHaveCount(4);
    await expect(page.locator('#quote-display .char-cursor')).toHaveCount(1);
  });
});
