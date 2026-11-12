// @ts-check
// Coach: first-run flow, goal chip, weekly lesson, accuracy tip, daily close-out.
const { test, expect } = require('@playwright/test');


/** Load the game past the splash. `seed` is a map of localStorage keys set before load. */
async function open(page, seed = {}, { auto = true } = {}) {
  await page.addInitScript(([s, a]) => {
    if (a) localStorage.setItem('sampire-coach-auto', '1');
    for (const k of Object.keys(s)) localStorage.setItem(k, typeof s[k] === 'string' ? s[k] : JSON.stringify(s[k]));
  }, [seed, auto]);
  await page.goto('/');
  await page.locator('#entry-guest-btn').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#entry-guest-btn').click();
  await expect(page.locator('#entry-splash')).toHaveClass(/hidden/, { timeout: 8000 });
}

async function typeChars(page, count) {
  const text = await page.evaluate(() => Array.from(document.querySelectorAll('#quote-display .quote-word'))
    .map(w => Array.from(w.querySelectorAll('span')).map(s => s.textContent.replace(' ', ' ')).join('')).join(' '));
  await page.locator('#quote-display').click({ force: true });
  await page.keyboard.type(text.slice(0, count), { delay: 5 });
}

/** Run the 30-second placement test, typing `count` characters. */
async function doPlacement(page, count) {
  await page.click('#coach-start-placement');
  await typeChars(page, count);
  await page.evaluate(() => window.__engineTestHooks.shiftStartTime(31000));
  await page.keyboard.type('a').catch(() => {});
  await expect(page.locator('#coach-placement-line')).toBeVisible({ timeout: 8000 });
}

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayKey = (offset) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test.describe('Coach first run', () => {
  test('appears for a fresh profile with the flag, not for a returning one', async ({ page }) => {
    await open(page);
    await expect(page.locator('#coach-modal')).toHaveClass(/show/, { timeout: 5000 });
    await expect(page.locator('#coach-start-placement')).toBeVisible();
  });

  test('does not appear for a returning player', async ({ page }) => {
    await open(page, { 'sampire-lifetime-tests-completed': '5' });
    await page.waitForTimeout(1200);
    await expect(page.locator('#coach-modal')).not.toHaveClass(/show/);
  });

  test('does not appear without the flag under automation', async ({ page }) => {
    await open(page, {}, { auto: false });
    await page.waitForTimeout(1200);
    await expect(page.locator('#coach-modal')).not.toHaveClass(/show/);
  });

  test('skip closes the flow and it does not come back', async ({ page }) => {
    await open(page);
    await page.click('#coach-skip');
    await expect(page.locator('#coach-modal')).not.toHaveClass(/show/);
    const state = await page.evaluate(() => Coach.getState());
    expect(state.skipped).toBe(true);
    expect(await page.evaluate(() => Coach.isReturningPlayer())).toBe(true);
  });

  test('placement hands off to a plain result, then the goal picker; slow typists see the finger map', async ({ page }) => {
    await open(page);
    await doPlacement(page, 60); // about 24 WPM
    await expect(page.locator('#coach-placement-line')).toContainText(/WPM/);
    await page.click('#coach-pick-goal');
    await expect(page.locator('#coach-goal-0')).toBeVisible();
    await page.click('#coach-goal-0');
    await expect(page.locator('#coach-finger-map')).toBeVisible();
    await expect(page.locator('#coach-finger-map svg')).toBeVisible({ timeout: 5000 });
    expect(await page.locator('#coach-finger-map .key.is-focus').count()).toBeGreaterThan(0);
    await expect(page.locator('#coach-fingers-ok')).toBeVisible();
  });

  test('fast, accurate typists skip the finger map', async ({ page }) => {
    await open(page);
    await doPlacement(page, 140); // about 56 WPM, 100 percent
    await page.click('#coach-pick-goal');
    await page.click('#coach-goal-0');
    await expect(page.locator('#coach-finger-map')).toHaveCount(0);
    await expect(page.locator('#coach-modal')).not.toHaveClass(/show/, { timeout: 5000 });
    const hint = page.locator('#coach-finger-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Drill 1 of 3');
  });

  test('drills set the focus keys and show a finger hint', async ({ page }) => {
    await open(page);
    await doPlacement(page, 60);
    await page.click('#coach-pick-goal');
    await page.click('#coach-goal-0');
    await page.click('#coach-fingers-ok');
    const hint = page.locator('#coach-finger-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText(/finger|thumb/);
    const keys = await page.evaluate(() => AdaptivePractice.getFocusKeys());
    expect(keys.length).toBe(1);
    expect(keys[0]).toMatch(/^[a-z]$/);
    await expect(hint).toContainText(`${keys[0]}:`);
    // Finish the drill; the note card appears with a next button.
    await typeChars(page, 400);
    await expect(page.locator('#coach-drill-note')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#coach-next-drill')).toBeVisible();
  });
});

test.describe('Coach ongoing', () => {
  const base = (extra) => ({
    'sampire-coach': Object.assign({ skipped: true, step: 'done', placementWpm: 30, placementAccuracy: 98, goalWpm: 60, goalStartWpm: 30,
      goalSetDate: dayKey(-14), goalDate: dayKey(14), goalLabel: '60 WPM in 4 weeks' }, extra || {}),
  });
  const hist = (wpm) => Array.from({ length: 4 }, (_, i) => ({ date: Date.now() - (i + 1) * 3600000, wpm, accuracy: 97, mode: 'words', time: 60 }));

  test('goal chip shows on track', async ({ page }) => {
    await open(page, Object.assign(base(), { 'sampire-typing-history': hist(50) }));
    const chip = page.locator('#coach-goal-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('data-status', 'ontrack');
    await expect(chip).toContainText('on track');
  });

  test('goal chip shows behind', async ({ page }) => {
    await open(page, Object.assign(base(), { 'sampire-typing-history': hist(32) }));
    const chip = page.locator('#coach-goal-chip');
    await expect(chip).toHaveAttribute('data-status', 'behind');
    await expect(chip).toContainText('behind');
  });

  test('Lesson button on the Challenges tab starts a drill', async ({ page }) => {
    await open(page, base());
    await page.evaluate(() => setMode('daily'));
    const btn = page.locator('#coach-lesson-btn');
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();
    await expect(page.locator('#coach-finger-hint')).toBeVisible();
    await expect(page.locator('#coach-finger-hint')).toContainText('Drill 1 of 3');
    expect((await page.evaluate(() => AdaptivePractice.getFocusKeys())).length).toBe(1);
  });

  test('tip appears when accuracy is under 90 percent, not above', async ({ page }) => {
    await open(page, base());
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('typemine:run-finished', { detail: { wpm: 30, accuracy: 82, counted: true } })));
    await expect(page.locator('#coach-result-tip')).toContainText('82%');
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('typemine:run-finished', { detail: { wpm: 30, accuracy: 96, counted: true } })));
    await expect(page.locator('#coach-result-tip')).toHaveCount(0);
  });

  test('close-out card appears once after the third counted run of the day', async ({ page }) => {
    await open(page, base());
    const today = todayKey();
    await page.evaluate((t) => {
      saveLocalJson('sampire-daily-stats', { days: { [t]: { runs: 3, words: 90, sumWpm: 120, bestWpm: 45, bestAcc: 97, runs96: 2, perfect: 0, modes: {} } } });
      document.dispatchEvent(new CustomEvent('typemine:run-finished', { detail: { wpm: 40, accuracy: 97, counted: true } }));
    }, today);
    await expect(page.locator('#coach-closeout-line')).toContainText('Come back tomorrow', { timeout: 5000 });
    await page.click('#coach-closeout-ok');
    await expect(page.locator('#coach-modal')).not.toHaveClass(/show/);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('typemine:run-finished', { detail: { wpm: 40, accuracy: 97, counted: true } })));
    await page.waitForTimeout(1500);
    await expect(page.locator('#coach-modal')).not.toHaveClass(/show/);
  });
});
