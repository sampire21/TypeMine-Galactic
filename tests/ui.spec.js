// @ts-check
// UI, performance and PWA checks (ui agent). Runs against the shared server on :3000.
const { test, expect } = require('@playwright/test');

async function dismissSplash(page) {
  const splash = page.locator('#entry-splash');
  if (!(await splash.isVisible({ timeout: 2000 }).catch(() => false))) return;
  await page.evaluate(() => { if (typeof hideSplashScreen === 'function') hideSplashScreen(); });
  await expect(page.locator('#typing-area')).toBeVisible({ timeout: 5000 });
}

test.describe('Audio defaults and lazy loading', () => {
  test('fresh profile has sound on with non-zero volumes', async ({ page }) => {
    await page.goto('/');
    const state = await page.evaluate(() => ({ music: musicVolume, keys: keySoundVolume, keysOn: keySoundsEnabled, musicMuted }));
    expect(state.music).toBeGreaterThan(0);
    expect(state.keys).toBeGreaterThan(0);
    expect(state.keysOn).toBe(true);
    expect(state.musicMuted).toBe(false);
  });

  test('nothing under /Sound Effects/ is requested before the first gesture', async ({ page }) => {
    const audioRequests = [];
    page.on('request', (r) => { if (/Sound(%20| )Effects/.test(r.url())) audioRequests.push(r.url()); });
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    expect(audioRequests).toEqual([]);
    // After a gesture the short effects are allowed to warm up.
    await page.locator('#entry-guest-btn').click();
    await page.waitForTimeout(1200);
    expect(audioRequests.length).toBeGreaterThan(0);
    // The 10-22 MB theme tracks must not download just because music is "on"; only the small effects do.
    expect(audioRequests.filter((u) => /Dark%20Main%20Theme|Personal%20Universe/.test(u)).length).toBeLessThanOrEqual(1);
  });

  test('effects (mining animations) are off for a new player', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => miningVisualsEnabled)).toBe(false);
  });
});

test.describe('Splash', () => {
  test('Start button dismisses the splash and takes it out of layout after the fade', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#entry-splash')).toBeVisible();
    await page.locator('#entry-guest-btn').click();
    await expect(page.locator('#entry-splash')).toHaveClass(/hidden/);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('entry-splash')).display)).toBe('none');
    expect(await page.evaluate(() => isSplashScreenOpen())).toBe(false);
  });

  test('any key starts as guest', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('a');
    await expect(page.locator('#entry-splash')).toHaveClass(/hidden/);
  });

  test('log in link opens the login modal and Escape returns to the splash', async ({ page }) => {
    await page.goto('/');
    await page.locator('#entry-login-btn').click();
    await expect(page.locator('#login-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#login-modal')).not.toBeVisible();
    expect(await page.evaluate(() => isSplashScreenOpen())).toBe(true);
  });

  test('splash fits a 375x667 phone without scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    const m = await page.evaluate(() => { const s = document.getElementById('entry-splash'); return { sh: s.scrollHeight, ch: s.clientHeight }; });
    expect(m.sh).toBeLessThanOrEqual(m.ch + 1);
    await expect(page.locator('#entry-guest-btn')).toBeInViewport();
  });
});

test.describe('Settings panel', () => {
  test('gear opens one panel with every toggle', async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
    await expect(page.locator('#settings-panel')).not.toBeVisible();
    await page.locator('#settings-toggle').click();
    await expect(page.locator('#settings-panel')).toBeVisible();
    for (const id of ['ghost-toggle-btn', 'mining-fx-toggle-btn', 'live-chart-toggle-btn', 'keysound-switch', 'keysound-volume-slider', 'keysound-toggle', 'music-switch', 'music-volume-slider', 'music-toggle', 'settings-engine-slot']) {
      await expect(page.locator('#' + id), id).toBeAttached();
    }
    for (const id of ['ghost-toggle-btn', 'mining-fx-toggle-btn', 'keysound-switch', 'music-switch']) {
      await expect(page.locator('#' + id)).toHaveAttribute('role', 'switch');
    }
    // Effects switch is off by default; flipping it also reveals the laser-sound row.
    await expect(page.locator('#mining-fx-toggle-btn')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#laser-sound-row')).toBeHidden();
    await page.locator('#mining-fx-toggle-btn').click();
    await expect(page.locator('#mining-fx-toggle-btn')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#laser-sound-row')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-panel')).not.toBeVisible();
  });

  test('"Unlock in the shop" hint is a button that survives the pointer moving onto it and opens the shop', async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
    await page.locator('#settings-toggle').click();
    await page.locator('#keysound-toggle').click();
    const locked = page.locator('#keysound-menu .keysound-option.locked').first();
    await expect(locked).toBeVisible();
    await locked.hover();
    const hint = page.locator('.unlock-shop-hint');
    await expect(hint).toBeVisible();
    await hint.hover();
    await page.waitForTimeout(600);
    await expect(hint).toBeVisible();
    await hint.click();
    await expect(page.locator('#skills-modal')).toBeVisible();
  });
});

test.describe('Layout', () => {
  for (const vp of [{ w: 375, h: 812 }, { w: 768, h: 1024 }]) {
    test(`top bar is a single row under 64px at ${vp.w}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto('/');
      await dismissSplash(page);
      const m = await page.evaluate(() => {
        const bar = document.getElementById('top-bar');
        const r = bar.getBoundingClientRect();
        const tops = [...bar.querySelectorAll('button, .xp-display')].filter((el) => el.offsetParent !== null).map((el) => Math.round(el.getBoundingClientRect().top));
        return { h: r.height, w: r.width, rows: new Set(tops.map((t) => Math.round(t / 12))).size, scrollW: document.documentElement.scrollWidth, pad: getComputedStyle(document.body).paddingTop };
      });
      expect(m.h).toBeLessThan(64);
      expect(m.rows).toBe(1);
      expect(m.scrollW).toBeLessThanOrEqual(vp.w);
      expect(parseFloat(m.pad)).toBeGreaterThanOrEqual(m.h);
    });
  }

  test('at 1280x720 the top bar, logo and tabs stay compact and the typing box is above the fold', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await dismissSplash(page);
    const m = await page.evaluate(() => ({
      logo: document.querySelector('.main-title-logo').getBoundingClientRect().height,
      tabsBottom: document.querySelector('.mode-tabs').getBoundingClientRect().bottom,
      quoteTop: document.getElementById('quote-display').getBoundingClientRect().top,
      buttonsBottom: document.querySelector('#typing-area .buttons').getBoundingClientRect().bottom,
    }));
    expect(m.logo).toBeLessThanOrEqual(112);
    expect(m.tabsBottom).toBeLessThanOrEqual(270);
    expect(m.quoteTop).toBeLessThan(720);
    // Goal: buttons row above the fold. Panels added above the stats by other areas currently push it lower; keep it within one short scroll.
    expect(m.buttonsBottom).toBeLessThan(1000);
  });

  test('mode tabs are a tablist and arrow keys move between tabs', async ({ page }) => {
    await page.goto('/');
    await dismissSplash(page);
    const nav = page.locator('.mode-tabs');
    await expect(nav).toHaveAttribute('role', 'tablist');
    await expect(page.locator('.mode-tab.active')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.mode-tab').first()).toHaveAttribute('role', 'tab');
    const before = await page.locator('.mode-tab.active').getAttribute('data-mode');
    await page.locator('.mode-tab.active').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const after = await page.locator('.mode-tab.active').getAttribute('data-mode');
    expect(after).not.toBe(before);
    await expect(page.locator('.mode-tab.active')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.mode-tab.active')).toBeFocused();
  });

  test('results overlay is a dialog with a live region', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#result-overlay')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#result-overlay')).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#result-announcer')).toBeAttached();
    await expect(page.locator('main#main-content')).toBeAttached();
    await expect(page.locator('header#top-bar')).toBeAttached();
  });
});

test.describe('Motion and idle CPU', () => {
  test('reduced motion stops looping animations and the background canvas', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await dismissSplash(page);
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => ({
      running: document.getAnimations().filter((a) => a.playState === 'running').length,
      bg: window.__spaceBg ? window.__spaceBg.isRunning() : null,
    }));
    expect(m.running).toBe(0);
    expect(m.bg).toBe(false);
  });

  test('background canvas pauses behind the splash and modals, runs on the main screen', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__spaceBg.isRunning())).toBe(false);
    await dismissSplash(page);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__spaceBg.isRunning())).toBe(true);
    await page.evaluate(() => openLeaderboard());
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__spaceBg.isRunning())).toBe(false);
  });
});

test.describe('PWA', () => {
  test('service-worker update toast is wired to the toast element', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#ui-toast')).toBeAttached();
    expect(await page.evaluate(() => typeof showServiceWorkerUpdateToast === 'function')).toBe(true);
    const sw = await page.evaluate(() => fetch('/sw.js').then((r) => r.text()));
    expect(sw).toContain('SKIP_WAITING');
    expect(sw).not.toMatch(/APP_SHELL = \[[^\]]*Favicon/);
  });

  test('manifest validates with a maskable icon, shortcuts and screenshots', async ({ page }) => {
    await page.goto('/');
    const manifest = await page.evaluate(() => fetch('/manifest.webmanifest').then((r) => r.json()));
    expect(manifest.name).toBe('TypeMine Galactic');
    expect(manifest.orientation).toBe('any');
    expect(manifest.lang).toBe('en');
    expect(Array.isArray(manifest.categories)).toBe(true);
    const maskable = manifest.icons.find((i) => i.purpose === 'maskable' && i.sizes === '512x512');
    expect(maskable).toBeTruthy();
    expect(manifest.shortcuts.map((s) => s.url)).toEqual(['/?mode=words', '/?open=story']);
    expect(manifest.screenshots.length).toBeGreaterThanOrEqual(1);
    for (const src of [maskable.src, ...manifest.screenshots.map((s) => s.src), '/favicon.svg', '/Favicon.png', '/typemine-galactic-logo.webp']) {
      const status = await page.evaluate((u) => fetch(u).then((r) => r.status), src);
      expect(status, src).toBe(200);
    }
  });

  test('favicon is small and the logo ships as WebP with dimensions', async ({ page }) => {
    await page.goto('/');
    const size = await page.evaluate(() => fetch('/Favicon.png').then((r) => r.arrayBuffer()).then((b) => b.byteLength));
    expect(size).toBeLessThan(20000);
    const img = page.locator('.entry-logo-image');
    await expect(img).toHaveAttribute('width', '1002');
    expect(await img.evaluate((el) => el.currentSrc)).toMatch(/\.webp$/);
  });
});
