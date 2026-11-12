// @ts-check
// Typing engine tests (desktop only): formulas, word-level input, options, hotkeys, timing.
const { test: base, expect } = require('@playwright/test');

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

async function start(page, { options } = {}) {
  await page.goto('/');
  if (options) {
    await page.evaluate((opts) => { for (const k of Object.keys(opts)) setEngineOption(k, opts[k], { restart: false }); newTest(true); }, options);
  }
  const splash = page.locator('#entry-splash');
  if (await splash.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.evaluate(() => { if (typeof hideSplashScreen === 'function') hideSplashScreen(); });
    await page.waitForTimeout(300);
  }
  await expect(page.locator('#typing-area')).toBeVisible({ timeout: 5000 });
}

async function focusTyping(page) {
  await page.locator('#quote-display').click();
  await expect(page.locator('#hidden-input')).toBeFocused({ timeout: 2000 });
}

const readTarget = (page) => page.evaluate(() => currentQuote);
const state = (page) => page.evaluate(() => window.__engineTestHooks.getState());
const overlay = (page) => page.locator('#result-overlay');

/** Clear the last hand-off; a later waitForRunFinished() then proves showResults ran for this run. */
const armRunFinished = (page) => page.evaluate(() => { window.lastRunSummary = null; });
async function waitForRunFinished(page, timeout = 10000) {
  await page.waitForFunction(() => !!window.lastRunSummary, null, { timeout });
  return page.evaluate(() => window.lastRunSummary);
}

/** Load a fixed passage into the engine (same code path as a normal test). */
async function loadPassage(page, text) {
  await page.evaluate((t) => { init(t, 'test passage'); }, text);
  await focusTyping(page);
}

test.describe('Typing engine', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-chrome', 'desktop only');
    await start(page);
  });

  test('formula check: two corrected errors give the expected accuracy and WPM', async ({ page }) => {
    const text = 'the quick brown fox jumps over the lazy dog and runs away';
    await loadPassage(page, text);
    // Type with a wrong first key, fix it, and later a second wrong key, fixed too.
    await page.keyboard.type('x', { delay: 20 });
    await page.keyboard.press('Backspace');
    await page.keyboard.type(text.slice(0, 10), { delay: 20 });
    await page.keyboard.type('q', { delay: 20 });
    await page.keyboard.press('Backspace');
    const t0 = Date.now();
    await page.keyboard.type(text.slice(10), { delay: 20 });
    await waitForRunFinished(page);
    const stats = await page.evaluate(() => getRunStats());
    const keystrokes = text.length + 2;
    const expectedAcc = Math.round(((keystrokes - 2) / keystrokes) * 100); // 57 -> 96%
    expect(stats.keystrokes).toBe(keystrokes);
    expect(stats.mistakes).toBe(2);
    expect(stats.uncorrected).toBe(0);
    expect(stats.accuracy).toBe(Math.min(expectedAcc, 99));
    expect(stats.backspaces).toBe(2);
    // WPM = correct chars / 5 / minutes; the elapsed time is measured by the engine, so compare against it.
    const expectedWpm = (text.length / 5) / (stats.elapsed / 60);
    expect(Math.abs(stats.wpm - expectedWpm) / expectedWpm).toBeLessThan(0.03);
    expect(stats.elapsed).toBeGreaterThan(0.5);
    expect(stats.typedWords).toBe(12);
    expect(stats.correctWords).toBe(12);
    await expect(page.locator('#final-accuracy')).toHaveText(`${stats.accuracy}%`, { timeout: 3000 });
  });

  test('extra letters are appended and Space mid-word skips the rest of the word', async ({ page }) => {
    await loadPassage(page, 'alpha beta gamma delta');
    // Extra letters past the end of "alpha"
    await page.keyboard.type('alphaxyz', { delay: 15 });
    await expect(page.locator('#quote-display .char-extra')).toHaveCount(3);
    let s = await state(page);
    expect(s.currentIndex).toBe(5);
    expect(s.mistakeCount).toBe(3);
    // Backspace removes extras first
    await page.keyboard.press('Backspace');
    await expect(page.locator('#quote-display .char-extra')).toHaveCount(2);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(page.locator('#quote-display .char-extra')).toHaveCount(0);
    s = await state(page);
    expect(s.currentIndex).toBe(5);
    expect(s.backspaces).toBe(3);
    // Space, then skip "beta" after two letters
    await page.keyboard.type(' be ', { delay: 15 });
    s = await state(page);
    expect(s.currentIndex).toBe(11); // cursor on "gamma"
    await expect(page.locator('#quote-display .char-missed')).toHaveCount(2);
    await expect(page.locator('#quote-display .quote-word.word-error')).toHaveCount(1);
    // Double space at a word start is ignored
    await page.keyboard.press('Space');
    s = await state(page);
    expect(s.currentIndex).toBe(11);
    // Backspace jumps back over the skipped letters to the last typed letter
    await page.keyboard.press('Backspace');
    s = await state(page);
    expect(s.currentIndex).toBe(8);
    await expect(page.locator('#quote-display .quote-word.word-error')).toHaveCount(0);
    // Extras cap at 20 per word
    await page.keyboard.type('ta', { delay: 10 });
    await page.keyboard.type('q'.repeat(25), { delay: 5 });
    await expect(page.locator('#quote-display .char-extra')).toHaveCount(20);
    const stats = await page.evaluate(() => getRunStats());
    expect(stats.uncorrected).toBe(20);
    expect(stats.mistakes).toBeGreaterThanOrEqual(stats.uncorrected);
  });

  test('stop on error: letter mode rejects wrong keys, word mode holds the word', async ({ page }) => {
    await page.evaluate(() => setEngineOption('stopOnError', 'letter', { restart: false }));
    await loadPassage(page, 'one two three');
    await page.keyboard.type('x', { delay: 15 });
    let s = await state(page);
    expect(s.currentIndex).toBe(0);
    expect(s.startTime).toBeNull(); // a rejected first key does not start the clock
    await page.keyboard.type('onx', { delay: 15 });
    s = await state(page);
    expect(s.currentIndex).toBe(2);
    expect(s.mistakeCount).toBe(2);
    await page.keyboard.type('e ', { delay: 15 });
    s = await state(page);
    expect(s.currentIndex).toBe(4);

    await page.evaluate(() => setEngineOption('stopOnError', 'word', { restart: false }));
    await loadPassage(page, 'one two three');
    await page.keyboard.type('onx ', { delay: 15 });
    s = await state(page);
    expect(s.currentIndex).toBe(3); // Space blocked: the word has an error
    await page.keyboard.press('Backspace');
    await page.keyboard.type('e ', { delay: 15 });
    s = await state(page);
    expect(s.currentIndex).toBe(4);
    await page.evaluate(() => setEngineOption('stopOnError', 'off', { restart: false }));
  });

  test('strict backspace cannot enter a correct finished word', async ({ page }) => {
    await page.evaluate(() => setEngineOption('strictBackspace', true, { restart: false }));
    await loadPassage(page, 'one two three');
    await page.keyboard.type('one t', { delay: 15 });
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    let s = await state(page);
    expect(s.currentIndex).toBe(4);
    await page.evaluate(() => setEngineOption('strictBackspace', false, { restart: false }));
    await page.keyboard.press('Backspace');
    s = await state(page);
    expect(s.currentIndex).toBe(3);
  });

  test('Tab and letters inside a modal do nothing to the run', async ({ page }) => {
    await loadPassage(page, 'hello world again');
    await page.keyboard.type('hel', { delay: 15 });
    await page.evaluate(() => openModal(document.getElementById('leaderboard-modal')));
    await expect(page.locator('#leaderboard-modal')).toHaveClass(/show/);
    await page.keyboard.press('Tab');
    await page.keyboard.type('lo', { delay: 15 });
    const s = await state(page);
    expect(s.currentIndex).toBe(3);
    expect(s.isComplete).toBe(false);
    await expect(page.locator('#leaderboard-modal')).toHaveClass(/show/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#leaderboard-modal')).not.toHaveClass(/show/);
  });

  test('Tab on a fresh test moves focus instead of trapping it', async ({ page }) => {
    await focusTyping(page);
    await page.keyboard.press('Tab');
    await expect(page.locator('#hidden-input')).not.toBeFocused();
    expect((await state(page)).startTime).toBeNull();
    // Shift+Tab mid-run never restarts
    await focusTyping(page);
    const text = await readTarget(page);
    await page.keyboard.type(text.slice(0, 3), { delay: 15 });
    await page.keyboard.press('Shift+Tab');
    expect((await state(page)).currentIndex).toBe(3);
  });

  test('result is not lost when Tab is pressed right after finishing', async ({ page }) => {
    const text = 'a short passage that we finish fast and then press tab at once';
    await loadPassage(page, text);
    await armRunFinished(page);
    await page.keyboard.type(text, { delay: 10 });
    await page.keyboard.press('Tab'); // inside the 400 ms delay
    await page.waitForTimeout(600);
    const summary = await page.evaluate(() => window.lastRunSummary);
    expect(summary && summary.text).toBe(text);
    expect(summary.typedWords).toBe(13);
    // The restart happened: a fresh run on the same text
    const s = await state(page);
    expect(s.isComplete).toBe(false);
    expect(s.currentIndex).toBe(0);
    expect(await readTarget(page)).toBe(text);
    await expect(overlay(page)).not.toHaveClass(/show/);
  });

  test('Space on a fresh test does not change the text; Esc gives new text', async ({ page }) => {
    const text = await readTarget(page);
    await focusTyping(page);
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    expect(await readTarget(page)).toBe(text);
    expect((await state(page)).startTime).toBeNull();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    expect(await readTarget(page)).not.toBe(text);
  });

  test('time option 60 ends the run after 60 seconds and reports the duration', async ({ page }) => {
    await page.locator('.mode-tab', { hasText: 'Timed' }).click();
    await page.locator('#engine-options [data-opt="time"][data-val="60"]').click();
    await expect(page.locator('#timer')).toHaveText('60s');
    await expect(page.locator('#timer-label')).toHaveText('Time left');
    await focusTyping(page);
    const text = await readTarget(page);
    await page.keyboard.type(text.slice(0, 30), { delay: 10 });
    await page.evaluate(() => window.__engineTestHooks.shiftStartTime(45 * 1000));
    await page.waitForTimeout(400);
    expect((await state(page)).isComplete).toBe(false);
    await armRunFinished(page);
    await page.evaluate(() => window.__engineTestHooks.shiftStartTime(16 * 1000));
    const summary = await waitForRunFinished(page, 3000);
    const stats = await page.evaluate(() => getRunStats());
    expect(stats.duration).toBe(60);
    expect(stats.time).toBe(60);
    expect(summary.time).toBe(60);
    expect(summary.mode).toBe('words30');
    await expect(page.locator('#final-time')).toHaveText('60s', { timeout: 3000 });
    await page.evaluate(() => setEngineOption('time', 30, { restart: false }));
  });

  test('same seed and options give the same text', async ({ page }) => {
    const first = await page.evaluate(() => ({ seed: getCurrentTestSeed(), text: currentQuote }));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    expect(await readTarget(page)).not.toBe(first.text);
    await page.evaluate((seed) => newTest({ seed, mode: 'words' }), first.seed);
    expect(await readTarget(page)).toBe(first.text);
    expect(await page.evaluate(() => getCurrentTestSeed())).toBe(first.seed);
    // Options are part of the spec too
    await page.evaluate((seed) => newTest({ seed, mode: 'words', options: { words: 10, punctuation: true } }), first.seed);
    const withOpts = await readTarget(page);
    expect(withOpts).not.toBe(first.text);
    expect(withOpts.split(' ').filter(w => w !== '-').length).toBe(10);
    await page.evaluate((seed) => newTest({ seed, mode: 'words', options: { words: 25, punctuation: false } }), first.seed);
    expect(await readTarget(page)).toBe(first.text);
  });

  test('options persist across reloads', async ({ page }) => {
    await page.locator('#engine-options [data-opt="words"][data-val="50"]').click();
    await page.locator('#engine-options [data-opt="numbers"]').click();
    await page.locator('#engine-opt-more').click();
    await page.locator('#engine-options [data-opt="caret"][data-val="block"]').click();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sampire-engine-options')));
    expect(stored.words).toBe(50);
    expect(stored.numbers).toBe(true);
    expect(stored.caret).toBe('block');
    await page.reload();
    await start(page);
    await expect(page.locator('#engine-options [data-opt="words"][data-val="50"]')).toHaveClass(/active/);
    await expect(page.locator('#engine-options [data-opt="numbers"]')).toHaveClass(/active/);
    await expect(page.locator('#typing-caret')).toHaveClass(/caret-block/);
    expect((await readTarget(page)).split(' ').length).toBe(50);
    await page.evaluate(() => { setEngineOption('words', 25, { restart: false }); setEngineOption('numbers', false, { restart: false }); setEngineOption('caret', 'line', { restart: false }); });
  });

  test('caps lock badge shows while Caps Lock is on', async ({ page }) => {
    await focusTyping(page);
    const badge = page.locator('#capslock-badge');
    await expect(badge).toBeHidden();
    await page.evaluate(() => {
      document.getElementById('hidden-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'CapsLock', modifierCapsLock: true, bubbles: true }));
    });
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/caps lock/i);
    await page.evaluate(() => {
      document.getElementById('hidden-input').dispatchEvent(new KeyboardEvent('keyup', { key: 'CapsLock', modifierCapsLock: false, bubbles: true }));
    });
    await expect(badge).toBeHidden();
  });

  test('focus lost overlay appears mid-run and the clock keeps running', async ({ page }) => {
    const text = await readTarget(page);
    await focusTyping(page);
    await page.keyboard.type(text.slice(0, 4), { delay: 15 });
    await page.evaluate(() => document.getElementById('hidden-input').blur());
    await expect(page.locator('#quote-display')).toHaveClass(/focus-lost/, { timeout: 2000 });
    await expect(page.locator('#focus-lost-overlay')).toBeVisible();
    await page.waitForTimeout(1100);
    expect(await page.locator('#timer').textContent()).not.toBe('0s');
    await page.keyboard.type(text[4], { delay: 15 });
    await expect(page.locator('#quote-display')).not.toHaveClass(/focus-lost/);
    expect((await state(page)).currentIndex).toBe(5);
  });

  test('caret is a separate element and the text does not shift when typing', async ({ page }) => {
    await loadPassage(page, 'steady text here');
    const before = await page.evaluate(() => Array.from(document.querySelectorAll('#quote-display .quote-word span')).slice(0, 6).map(s => Math.round(s.getBoundingClientRect().left * 10) / 10));
    await page.keyboard.type('ste', { delay: 15 });
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => Array.from(document.querySelectorAll('#quote-display .quote-word span')).slice(0, 6).map(s => Math.round(s.getBoundingClientRect().left * 10) / 10));
    expect(after).toEqual(before);
    const caret = page.locator('#typing-caret');
    await expect(caret).toHaveCSS('position', 'absolute');
    const transform = await caret.evaluate(el => el.style.transform);
    expect(transform).toMatch(/translate\(/);
  });

  test('stats expose burst and cumulative series with Monkeytype consistency', async ({ page }) => {
    await loadPassage(page, 'a fairly long passage so that the run lasts more than two seconds in total here');
    const text = 'a fairly long passage so that the run lasts more than two seconds in total here';
    await armRunFinished(page);
    await page.keyboard.type(text, { delay: 32 });
    await waitForRunFinished(page);
    const stats = await page.evaluate(() => getRunStats());
    expect(stats.burstSeries.length).toBeGreaterThanOrEqual(2);
    expect(stats.cumulativeSeries.length).toBe(stats.burstSeries.length);
    expect(stats.peakWpm).toBeGreaterThanOrEqual(stats.wpm);
    const bursts = stats.burstSeries.map(s => s.wpm);
    const mean = bursts.reduce((a, b) => a + b, 0) / bursts.length;
    const sd = Math.sqrt(bursts.reduce((a, v) => a + (v - mean) ** 2, 0) / bursts.length);
    const cv = sd / mean;
    const expected = Math.round(100 * (1 - Math.tanh(cv + cv ** 3 / 3 + cv ** 5 / 5)));
    expect(stats.consistency).toBe(Math.max(0, Math.min(100, expected)));
    expect(stats.uncorrected).toBe(0);
    expect(stats.mistakes).toBe(0);
  });

  test('labels use plain words and the effects default is off', async ({ page }) => {
    await expect(page.locator('.mode-tab[data-mode="words30"]')).toHaveText('Timed');
    await expect(page.locator('.mode-tab[data-mode="adaptive"]')).toHaveText('Weak keys');
    expect(await page.evaluate(() => miningVisualsEnabled)).toBe(false);
    expect(await page.evaluate(() => document.getElementById('hint').textContent)).toMatch(/Tab: restart/);
  });
});
