// @ts-check
const { test, expect } = require('@playwright/test');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Dismiss the splash screen programmatically for speed, then verify main UI visible */
async function dismissSplash(page) {
  const splash = page.locator('#entry-splash');
  if (!(await splash.isVisible({ timeout: 2000 }).catch(() => false))) return;
  await page.evaluate(() => {
    if (typeof hideSplashScreen === 'function') hideSplashScreen();
  });
  await page.waitForTimeout(300);
  await expect(page.locator('#typing-area')).toBeVisible({ timeout: 5000 });
}

/** Dismiss splash by clicking through the full UI flow (used for splash-specific tests) */
async function dismissSplashViaUI(page) {
  // Single-phase splash: the Start button (guest) dismisses it directly.
  await page.locator('#entry-guest-btn').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#entry-guest-btn').click();
  await expect(page.locator('#entry-splash')).toHaveClass(/hidden/, { timeout: 8000 });
}

/** Focus the hidden typing input so keystrokes register */
async function focusTypingInput(page) {
  await page.locator('#quote-display').click();
  await expect(page.locator('#hidden-input')).toBeFocused({ timeout: 2000 });
}

/** Get the first actual character span (skip mobile-tap-hint and word-wrapping spans) */
async function getFirstCharSpan(page) {
  // Character spans are direct children with char-* classes inside quote-word spans
  return page.locator('#quote-display .quote-word span').first();
}

/** Get the text of the first character to type */
async function getFirstCharText(page) {
  const span = await getFirstCharSpan(page);
  const text = await span.textContent();
  return text.replace('\u00A0', ' ');
}

// ─── Page Load & Splash Screen ───────────────────────────────────────────────

test.describe('Page Load', () => {
  test('page loads with correct title and splash visible', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('TypeMine Galactic');
    const splash = page.locator('#entry-splash');
    await expect(splash).toBeVisible();
  });

  test('splash screen shows logo and prompt text', async ({ page }) => {
    await page.goto('/');
    const logo = page.locator('.entry-logo-image');
    const prompt = page.locator('#entry-splash-title');
    await expect(logo).toBeVisible({ timeout: 3000 });
    await expect(prompt).toBeVisible();
    const promptText = await prompt.textContent();
    expect(promptText).toMatch(/tap|press any key/i);
  });

  test('splash shows login/signup/guest options', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#entry-login-btn')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#entry-guest-btn')).toBeVisible();
  });

  test('continue as guest dismisses splash and shows main UI', async ({ page }) => {
    await page.goto('/');
    await dismissSplashViaUI(page);
    await expect(page.locator('#typing-area')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.mode-tabs')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#top-bar')).toBeVisible({ timeout: 3000 });
  });
});

// ─── Main UI Structure ───────────────────────────────────────────────────────

test.describe('Main UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
  });

  test('stats bar shows WPM, Accuracy, Time', async ({ page }) => {
    await expect(page.locator('#wpm')).toBeVisible();
    await expect(page.locator('#accuracy')).toBeVisible();
    await expect(page.locator('#timer')).toBeVisible();
  });

  test('quote display is visible and contains text', async ({ page }) => {
    const quoteDisplay = page.locator('#quote-display');
    await expect(quoteDisplay).toBeVisible();
    const charSpan = await getFirstCharSpan(page);
    await expect(charSpan).toBeVisible({ timeout: 3000 });
  });

  test('mode tabs are present and one is active', async ({ page }) => {
    const tabs = page.locator('.mode-tab');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(3);
    const activeTab = page.locator('.mode-tab.active');
    await expect(activeTab).toBeVisible();
  });

  test('buttons row contains New Quote and Restart', async ({ page }) => {
    // Use .first() since there's also a New Quote button in the result overlay
    await expect(page.locator('#typing-area .new-test-btn').first()).toBeVisible();
    await expect(page.locator('#typing-area button', { hasText: 'Restart' })).toBeVisible();
  });

  test('top bar shows key controls', async ({ page }) => {
    await expect(page.locator('#top-bar')).toBeVisible();
    await expect(page.locator('#profile-toggle')).toBeVisible();
    // Key sound and music controls now live in the settings panel (gear button).
    await page.locator('#settings-toggle').click();
    await expect(page.locator('#keysound-toggle')).toBeVisible();
    await expect(page.locator('#music-toggle')).toBeVisible();
  });
});

// ─── Typing Gameplay ─────────────────────────────────────────────────────────

test.describe('Typing Gameplay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
  });

  test('clicking quote display focuses hidden input', async ({ page }) => {
    await focusTypingInput(page);
    const quoteDisplay = page.locator('#quote-display');
    await expect(quoteDisplay).toHaveClass(/focused/);
  });

  test('typing a character updates the display', async ({ page }) => {
    await focusTypingInput(page);
    const firstChar = await getFirstCharText(page);
    const charSpan = await getFirstCharSpan(page);
    await page.keyboard.press(firstChar === ' ' ? 'Space' : firstChar);
    await expect(charSpan).toHaveClass(/char-correct/, { timeout: 2000 });
  });

  test('typing wrong character marks it incorrect', async ({ page }) => {
    await focusTypingInput(page);
    const firstChar = await getFirstCharText(page);
    const wrongChar = firstChar === 'z' ? 'x' : 'z';
    const charSpan = await getFirstCharSpan(page);
    await page.keyboard.press(wrongChar);
    await expect(charSpan).toHaveClass(/char-incorrect/, { timeout: 2000 });
  });

  test('typing starts the timer', async ({ page }) => {
    await focusTypingInput(page);
    const timerBefore = await page.locator('#timer').textContent();
    expect(timerBefore).toBe('0s');
    const firstChar = await getFirstCharText(page);
    await page.keyboard.press(firstChar === ' ' ? 'Space' : firstChar);
    await page.waitForTimeout(1200);
    const timerAfter = await page.locator('#timer').textContent();
    expect(timerAfter).not.toBe('0s');
  });

  test('backspace removes last typed character', async ({ page }) => {
    await focusTypingInput(page);
    const firstChar = await getFirstCharText(page);
    const charSpan = await getFirstCharSpan(page);
    await page.keyboard.press(firstChar === ' ' ? 'Space' : firstChar);
    await expect(charSpan).toHaveClass(/char-correct/, { timeout: 2000 });
    await page.keyboard.press('Backspace');
    await expect(charSpan).toHaveClass(/char-cursor/, { timeout: 2000 });
  });

  test('Tab key restarts the test', async ({ page }) => {
    await focusTypingInput(page);
    const firstChar = await getFirstCharText(page);
    await page.keyboard.press(firstChar === ' ' ? 'Space' : firstChar);
    await page.waitForTimeout(200);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    // After restart, first span should be cursor again
    const charSpan = await getFirstCharSpan(page);
    await expect(charSpan).toHaveClass(/char-cursor/, { timeout: 3000 });
  });
});

// ─── Mode Switching ──────────────────────────────────────────────────────────

test.describe('Mode Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
  });

  test('switching to Quotes mode loads a quote', async ({ page }) => {
    await page.locator('.mode-tab', { hasText: 'Quotes' }).click();
    await page.waitForTimeout(500);
    const spans = page.locator('#quote-display .quote-word span');
    const count = await spans.count();
    expect(count).toBeGreaterThan(5);
  });

  test('switching to Timed mode shows compact display', async ({ page }) => {
    await page.locator('.mode-tab', { hasText: 'Timed' }).click();
    await page.waitForTimeout(500);
    const quoteDisplay = page.locator('#quote-display');
    await expect(quoteDisplay).toHaveClass(/words30-compact/, { timeout: 3000 });
  });

  test('switching to Challenges mode shows challenge panel', async ({ page }) => {
    await page.locator('.mode-tab', { hasText: 'Challenges' }).click();
    const panel = page.locator('#challenge-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });
  });

  test('New Quote button loads a new test', async ({ page }) => {
    await focusTypingInput(page);
    const firstChar = await getFirstCharText(page);
    await page.keyboard.press(firstChar === ' ' ? 'Space' : firstChar);
    // Click New Quote button (in the typing area, not result overlay)
    await page.locator('#typing-area .new-test-btn').first().click();
    await page.waitForTimeout(500);
    const timer = await page.locator('#timer').textContent();
    expect(timer).toBe('0s');
  });
});

// ─── Menus & Modals ──────────────────────────────────────────────────────────

test.describe('Menus and Modals', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
  });

  test('key sound menu opens and closes', async ({ page }) => {
    const menu = page.locator('#keysound-menu');
    await expect(menu).not.toBeVisible();
    await page.locator('#settings-toggle').click();
    await page.locator('#keysound-toggle').click();
    await expect(menu).toBeVisible({ timeout: 2000 });
    await page.locator('body').click({ position: { x: 10, y: 400 } });
    await expect(menu).not.toBeVisible({ timeout: 2000 });
  });

  test('music menu opens and closes', async ({ page }) => {
    const menu = page.locator('#music-menu');
    await expect(menu).not.toBeVisible();
    await page.locator('#settings-toggle').click();
    await page.locator('#music-toggle').click();
    await expect(menu).toBeVisible({ timeout: 2000 });
    await page.locator('body').click({ position: { x: 10, y: 400 } });
    await expect(menu).not.toBeVisible({ timeout: 2000 });
  });

  test('leaderboard modal opens and closes', async ({ page }) => {
    await page.locator('#leaderboard-toggle').click();
    const modal = page.locator('#leaderboard-modal');
    await expect(modal).toBeVisible({ timeout: 3000 });
    await page.locator('#leaderboard-modal .leaderboard-modal-close').click();
    await expect(modal).not.toBeVisible({ timeout: 2000 });
  });

  test('Escape key closes modals', async ({ page }) => {
    await page.locator('#leaderboard-toggle').click();
    await expect(page.locator('#leaderboard-modal')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('#leaderboard-modal')).not.toBeVisible({ timeout: 2000 });
  });
});

// ─── Mobile-Specific Tests ───────────────────────────────────────────────────

test.describe('Mobile Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
  });

  test('page renders without horizontal overflow', async ({ page }) => {
    const viewport = page.viewportSize();
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 2);
  });

  test('all buttons are visible and tappable', async ({ page }) => {
    const buttons = page.locator('#typing-area .buttons button');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const box = await btn.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(30);
      }
    }
  });

  test('mode tabs are accessible and scrollable', async ({ page }) => {
    const tabs = page.locator('.mode-tab');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < count; i++) {
      await expect(tabs.nth(i)).toBeAttached();
    }
  });

  test('quote display is readable and not clipped', async ({ page }) => {
    const quoteDisplay = page.locator('#quote-display');
    const box = await quoteDisplay.boundingBox();
    const viewport = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 2);
    expect(box.height).toBeGreaterThanOrEqual(60);
  });

  test('stat values are visible', async ({ page }) => {
    await expect(page.locator('#wpm')).toBeVisible();
    await expect(page.locator('#accuracy')).toBeVisible();
    await expect(page.locator('#timer')).toBeVisible();
  });

  test('top bar fits within viewport', async ({ page }) => {
    const topBar = page.locator('#top-bar');
    const box = await topBar.boundingBox();
    const viewport = page.viewportSize();
    expect(box.width).toBeLessThanOrEqual(viewport.width + 2);
  });
});

// ─── Mobile Touch Input ──────────────────────────────────────────────────────

test.describe('Mobile Touch Input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
  });

  test('tapping quote display focuses input', async ({ page }) => {
    await page.locator('#quote-display').tap().catch(() => {
      return page.locator('#quote-display').click();
    });
    const hiddenInput = page.locator('#hidden-input');
    await expect(hiddenInput).toBeFocused({ timeout: 3000 });
  });

  test('splash screen responds to tap', async ({ page }) => {
    await page.goto('/');
    const start = page.locator('#entry-guest-btn');
    if (await start.isVisible()) {
      await start.tap().catch(() => start.click());
      await expect(page.locator('#entry-splash')).toHaveClass(/hidden/, { timeout: 5000 });
    }
  });
});

// ─── Responsive Breakpoints ──────────────────────────────────────────────────

test.describe('Responsive Breakpoints', () => {
  test('480px: new-quote button is wider', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.goto('/');
    await dismissSplash(page);
    const newQuoteBtn = page.locator('#typing-area .new-test-btn').first();
    const box = await newQuoteBtn.boundingBox();
    const viewport = page.viewportSize();
    expect(box.width).toBeGreaterThan(viewport.width * 0.5);
  });

  test('480px: keyboard shortcut hints are hidden', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.goto('/');
    await dismissSplash(page);
    const hints = page.locator('.btn-hint');
    const count = await hints.count();
    for (let i = 0; i < count; i++) {
      await expect(hints.nth(i)).not.toBeVisible();
    }
  });

  test('768px: auth grid stacks to single column', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await dismissSplash(page);
    await page.locator('#profile-toggle').click();
    await page.waitForTimeout(500);
    const authGrid = page.locator('.auth-grid');
    if (await authGrid.isVisible()) {
      const gridStyle = await authGrid.evaluate(el => getComputedStyle(el).gridTemplateColumns);
      const columnCount = gridStyle.split(' ').filter(v => v !== '').length;
      expect(columnCount).toBeLessThanOrEqual(1);
    }
  });

  test('1280px desktop: layout is unchanged', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await dismissSplash(page);
    const statValue = page.locator('.stat-value').first();
    const fontSize = await statValue.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(20);
  });
});

// ─── Service Worker ──────────────────────────────────────────────────────────

test.describe('Service Worker', () => {
  test('service worker registers', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const swRegistered = await page.evaluate(async () => {
      if (!navigator.serviceWorker) return false;
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.length > 0;
    });
    expect(swRegistered).toBe(true);
  });
});

// ─── Accessibility Basics ────────────────────────────────────────────────────

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
  });

  test('page has lang attribute', async ({ page }) => {
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('en');
  });

  test('hidden input has aria-label', async ({ page }) => {
    const label = await page.locator('#hidden-input').getAttribute('aria-label');
    expect(label).toBeTruthy();
  });

  test('leaderboard modal has proper ARIA role', async ({ page }) => {
    await page.locator('#leaderboard-toggle').click();
    // Target the leaderboard modal's dialog specifically
    const dialog = page.locator('#leaderboard-modal [role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });
    const ariaModal = await dialog.getAttribute('aria-modal');
    expect(ariaModal).toBe('true');
  });
});
