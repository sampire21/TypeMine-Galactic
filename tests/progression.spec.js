// @ts-check
// Progression and results screen: XP per run, counted-run rule, streak, quests, weekly counter,
// level-up overlay, shop prices, lifetime stats as a guest, today's goals strip.
const { test, expect } = require('@playwright/test');

async function dismissSplash(page) {
  const splash = page.locator('#entry-splash');
  if (!(await splash.isVisible({ timeout: 2000 }).catch(() => false))) return;
  await page.evaluate(() => { if (typeof hideSplashScreen === 'function') hideSplashScreen(); });
  await page.waitForTimeout(300);
  await expect(page.locator('#typing-area')).toBeVisible({ timeout: 5000 });
}

/** Load the page, optionally seed localStorage (runs before the app boots), then dismiss the splash. */
async function start(page, seed) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  if (seed) { await page.evaluate(seed); }
  await page.reload();
  await dismissSplash(page);
}

async function readTarget(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#quote-display span[class*="char-"]'))
    .map((s) => (s.textContent || '').replace(/ /g, ' ')).join(''));
}

/** Type the whole text at a human-looking pace so the run is counted and ranked. */
async function completeRun(page, { delay = 55 } = {}) {
  await page.locator('#quote-display').click();
  await expect(page.locator('#hidden-input')).toBeFocused({ timeout: 2000 });
  const text = await readTarget(page);
  await page.keyboard.type(text, { delay });
  await expect(page.locator('#result-overlay')).toHaveClass(/show/, { timeout: 15000 });
  await page.waitForTimeout(300);
  return text;
}

function dateKeyDaysAgo(n) {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test.describe('Progression', () => {
  test.beforeEach(async ({}, info) => {
    test.skip(info.project.name !== 'desktop-chrome', 'desktop only');
  });

  test('XP formula: 10 base, 1 per 5 WPM, times accuracy, PB bonuses, streak multiplier', async ({ page }) => {
    await start(page);
    const out = await page.evaluate(() => [
      computeRunXP({ wpm: 38, accuracy: 95 }),
      computeRunXP({ wpm: 120, accuracy: 98, isPB: true, isModePB: true, multiplier: 2 }),
      computeRunXP({ wpm: 0, accuracy: 100 }),
      getXPMultiplier(1), getXPMultiplier(2), getXPMultiplier(3), getXPMultiplier(5), getXPMultiplier(9),
    ]);
    expect(out[0]).toBe(16);   // (10 + 7) * 0.95 = 16.15
    expect(out[1]).toBe(107);  // ((10 + 24) * 0.98 + 20) * 2 = 106.64
    expect(out[2]).toBe(10);
    expect(out.slice(3)).toEqual([1, 1.25, 1.5, 2, 2]);
  });

  test('a counted run pays XP, shows "+N XP" on the card and raises the stored XP', async ({ page }) => {
    await start(page);
    const xpBefore = await page.evaluate(() => getTotalXP());
    await completeRun(page);
    const summary = await page.evaluate(() => window.lastRunSummary);
    expect(summary.counted).toBe(true);
    expect(summary.xpEarned).toBeGreaterThan(0);
    await expect(page.locator('#result-rewards-list li.reward-xp')).toContainText(`+${summary.xpEarned} XP`);
    await expect(page.locator('#final-wpm')).toHaveText(String(summary.wpm), { timeout: 3000 });
    await expect(page.locator('#final-accuracy')).toHaveText(`${summary.accuracy}%`);
    const xpAfter = await page.evaluate(() => getTotalXP());
    expect(xpAfter - xpBefore).toBeGreaterThanOrEqual(summary.xpEarned);
    // The run was handed to other code.
    expect(summary.mode).toBe('words');
    expect(typeof summary.date).toBe('number');
  });

  test('a run under 50% accuracy is not counted: no XP, no history, card says so', async ({ page }) => {
    await start(page);
    const xpBefore = await page.evaluate(() => getTotalXP());
    await page.locator('#quote-display').click();
    const text = await readTarget(page);
    for (const ch of text) {
      // Two wrong keys and two backspaces per letter: accuracy lands near 33%.
      const wrong = ch === 'q' ? 'w' : 'q';
      await page.keyboard.type(wrong + wrong, { delay: 5 });
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(ch, { delay: 5 });
    }
    await expect(page.locator('#result-overlay')).toHaveClass(/show/, { timeout: 15000 });
    const summary = await page.evaluate(() => window.lastRunSummary);
    expect(summary.accuracy).toBeLessThan(50);
    expect(summary.counted).toBe(false);
    expect(summary.xpEarned).toBe(0);
    await expect(page.locator('#result-not-counted')).toContainText('Not counted (accuracy under 50% or fewer than 10 words)');
    expect(await page.evaluate(() => getTotalXP())).toBe(xpBefore);
    expect(await page.evaluate(() => loadHistory().length)).toBe(0);
    expect(await page.evaluate(() => getStreakData().streak)).toBe(0);
  });

  test('streak: increments from yesterday, decays after a missed day, freeze covers one day', async ({ page }) => {
    const y = dateKeyDaysAgo(1), two = dateKeyDaysAgo(2), three = dateKeyDaysAgo(3);
    await start(page);
    const r = await page.evaluate(({ y, two, three }) => {
      const out = {};
      localStorage.setItem('sampire-streak', JSON.stringify({ lastPlayDate: y, streak: 3, freezes: 0 }));
      out.effYesterday = getEffectiveStreak();
      out.afterYesterday = updateStreak().streak;
      out.sameDayAgain = updateStreak().streak;
      localStorage.setItem('sampire-streak', JSON.stringify({ lastPlayDate: three, streak: 6, freezes: 0 }));
      out.effStale = getEffectiveStreak();
      out.multStale = getXPMultiplier();
      out.afterStale = updateStreak().streak;
      localStorage.setItem('sampire-streak', JSON.stringify({ lastPlayDate: two, streak: 4, freezes: 1 }));
      out.effFrozen = getEffectiveStreak();
      const u = updateStreak();
      out.afterFrozen = u.streak; out.freezeUsed = u.freezeUsed; out.freezesLeft = getStreakData().freezes;
      return out;
    }, { y, two, three });
    expect(r.effYesterday).toBe(3);
    expect(r.afterYesterday).toBe(4);
    expect(r.sameDayAgain).toBe(4);
    expect(r.effStale).toBe(0);
    expect(r.multStale).toBe(1);
    expect(r.afterStale).toBe(1);
    expect(r.effFrozen).toBe(4);
    expect(r.afterFrozen).toBe(5);
    expect(r.freezeUsed).toBe(true);
    expect(r.freezesLeft).toBe(0);
  });

  test('finishing a quest shows it in the rewards list and the weekly counter updates', async ({ page }) => {
    const today = dateKeyDaysAgo(0);
    await start(page, () => {});
    // One run away from every "volume" quest, whichever one today picked.
    await page.evaluate((today) => {
      localStorage.setItem('sampire-daily-stats', JSON.stringify({ days: { [today]: { runs: 4, words: 495, sumWpm: 160, bestWpm: 40, bestAcc: 95, runs96: 0, perfect: 0, modes: { quotes: 2, words: 2 } } } }));
    }, today);
    await page.reload();
    await dismissSplash(page);
    await page.locator('.mode-tab', { hasText: 'Quotes' }).click();
    await page.waitForTimeout(400);
    // Some quotes are under 10 words and would not count; draw until one is long enough.
    for (let i = 0; i < 12; i++) {
      const words = await page.evaluate(() => currentQuote.trim().split(/\s+/).length);
      if (words >= 12) break;
      await page.evaluate(() => newTest());
      await page.waitForTimeout(150);
    }
    await completeRun(page);
    const summary = await page.evaluate(() => window.lastRunSummary);
    expect(summary.counted).toBe(true);
    const volumeIds = ['runs_5', 'daily_quotes_5', 'words_500'];
    const doneVolume = summary.questCompletions.filter((q) => volumeIds.includes(q.id));
    expect(doneVolume.length).toBe(1);
    await expect(page.locator('#result-rewards-list li.reward-quest').first()).toContainText('Quest done');
    const dailyDone = await page.evaluate(() => getDailyCompletions());
    expect(dailyDone).toContain(doneVolume[0].id);
    const weekly = await page.evaluate(() => JSON.parse(localStorage.getItem('sampire-weekly-words')));
    expect(weekly.week).toBe(await page.evaluate(() => getWeekKey()));
    expect(weekly.runs).toBe(1);
    expect(weekly.words).toBe(summary.typedWords);
    expect(weekly.bestWpm).toBe(summary.wpm);
    expect(weekly.daysPlayed).toEqual([today]);
    // Today's goals on the card sit below the score and show the finished quest.
    await expect(page.locator('#result-goals .goal-row.done')).toHaveCount(await page.evaluate(() => getDailyCompletions().length));
    const scoreTop = (await page.locator('#final-wpm').boundingBox()).y;
    const goalsTop = (await page.locator('#result-goals').boundingBox()).y;
    expect(goalsTop).toBeGreaterThan(scoreTop);
  });

  test('crossing a level opens the level-up overlay and adds a crystal', async ({ page }) => {
    await start(page, () => { localStorage.setItem('sampire-xp', '485'); });
    const crystalsBefore = await page.evaluate(() => getSkillPoints());
    await completeRun(page);
    const level = await page.evaluate(() => getLevel(getTotalXP()));
    expect(level).toBeGreaterThanOrEqual(2);
    const overlay = page.locator('#levelup-overlay');
    await expect(overlay).toHaveClass(/show/);
    await expect(overlay).toContainText(`Level ${level}`);
    await expect(page.locator('#result-rewards-list li.reward-level')).toContainText(`Level ${level}`);
    // One crystal per level gained (words typed in one run are too few for a word crystal).
    expect(await page.evaluate(() => getSkillPoints())).toBe(crystalsBefore + level - 1);
    await expect(page.locator('#level-badge')).toHaveText(`Level ${level}`);
    // The results stay visible underneath the level-up card.
    await expect(page.locator('#result-overlay')).toHaveClass(/show/);
    await overlay.getByRole('button', { name: 'Keep going' }).click();
    await expect(overlay).not.toHaveClass(/show/);
    await expect(page.locator('#result-overlay')).toHaveClass(/show/);
  });

  test('results overlay is a dialog with a live announcement; Space starts a new run', async ({ page }) => {
    await start(page);
    await completeRun(page);
    expect(await page.locator('#result-overlay').getAttribute('role')).toBe('dialog');
    expect(await page.evaluate(() => activeModalEl === resultOverlay)).toBe(true);
    await expect(page.locator('#result-announce')).toContainText(/words per minute/);
    await expect(page.locator('#result-cta-btn')).toBeVisible();
    await expect(page.locator('#final-test-type')).toHaveText('Random words');
    await page.keyboard.press('Space');
    await expect(page.locator('#result-overlay')).not.toHaveClass(/show/);
    expect(await page.evaluate(() => activeModalEl)).toBeNull();
  });

  test('shop card prices match the item table', async ({ page }) => {
    await start(page);
    await page.evaluate(() => openSkills());
    await expect(page.locator('#skills-modal')).toHaveClass(/show/);
    const cards = page.locator('#skills-content [data-shop-item]');
    expect(await cards.count()).toBeGreaterThan(5);
    const rows = await cards.evaluateAll((els) => els.map((el) => ({
      id: el.dataset.shopItem,
      cost: Number(el.dataset.shopCost),
      shown: (el.querySelector('.skill-cost-current') || {}).textContent || '',
      button: (el.querySelector('.shop-buy-btn') || {}).textContent || '',
    })));
    const table = await page.evaluate(() => window.SHOP_ITEMS.map((i) => ({ id: i.id, cost: i.cost })));
    for (const row of rows) {
      expect(row.shown.trim().startsWith(String(row.cost))).toBe(true);
      expect(row.shown).not.toContain('9999');
      if (/Buy for/.test(row.button)) expect(row.button).toContain(`Buy for ${row.cost}`);
      const def = table.find((t) => t.id === row.id);
      if (def) expect(def.cost).toBe(row.cost);
    }
    await expect(page.locator('#skills-content')).not.toContainText('Flash Sale');
  });

  test('lifetime stats opens for a guest with numbers, not "Loading..."', async ({ page }) => {
    await start(page);
    await page.evaluate(() => openLifetimeStats());
    const modal = page.locator('#lifetime-stats-modal');
    await expect(modal).toHaveClass(/show/);
    await expect(modal.locator('#lifetime-stats-content')).not.toContainText('Loading');
    await expect(modal.locator('#lifetime-stats-content')).toContainText(/Words/i);
  });

  test("today's goals strip shows three quests, the streak line, and remembers being collapsed", async ({ page }) => {
    await start(page);
    const strip = page.locator('#goals-strip');
    await expect(strip).toBeVisible();
    await expect(strip.locator('.goal-row')).toHaveCount(3);
    await expect(strip.locator('.goals-strip-count')).toContainText('0 of 3 done');
    await expect(strip.locator('#goals-strip-streak')).toContainText(/streak/i);
    // Collapsed by default so the typing area stays near the top; opening it is remembered.
    await expect(strip.locator('#goals-strip-body')).toBeHidden();
    await strip.locator('.goals-strip-toggle').click();
    await expect(strip.locator('#goals-strip-body')).toBeVisible();
    await page.reload();
    await dismissSplash(page);
    await expect(page.locator('#goals-strip #goals-strip-body')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('sampire-goals-strip-open'))).toBe('1');
  });

  test('badges are tiered with progress; weekly quests and level names are sane', async ({ page }) => {
    await start(page);
    const r = await page.evaluate(() => ({
      runsProgress: getBadgeProgress('runs_50'),
      families: getBadgeFamilies().map((f) => f.family),
      hasMidnight: BADGE_DEFS.some((b) => b.id === 'midnight_oil'),
      weeklyIds: WEEKLY_QUESTS.map((q) => q.id),
      names: [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((l) => getLevelName(l)),
      capProgress: getLevelProgress(100 * 500 + 5000),
      capLevel: getLevel(10 ** 9),
      weekKeyUtc: getWeekKeyUtc(new Date(Date.UTC(2026, 10, 12, 1, 0, 0))),
    }));
    expect(r.runsProgress).toEqual({ value: 0, target: 50, pct: 0 });
    expect(r.families).toEqual(['runs', 'words', 'days', 'quests', 'perfect', 'speed']);
    expect(r.hasMidnight).toBe(false);
    expect(r.weeklyIds).toEqual(['marathon', 'days_5', 'beat_last_week', 'runs95_10', 'above_average', 'consistent_climber']);
    expect(new Set(r.names).size).toBeGreaterThanOrEqual(10);
    expect(r.capProgress).toBe(1);
    expect(r.capLevel).toBe(100);
    expect(r.weekKeyUtc).toBe('2026-11-08');
  });
});
