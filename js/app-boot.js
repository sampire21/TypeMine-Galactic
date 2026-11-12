// ── Boot: runs after every other app-*.js file has been parsed ──
snapshotCriticalStorageOnce();
const storedMusicMuted = localStorage.getItem('sampire-music-muted');
musicMuted = storedMusicMuted === null ? false : storedMusicMuted === '1';
setMusicVolume(localStorage.getItem(MUSIC_VOLUME_KEY)); // null -> default 25%
const storedActiveSoundscape = localStorage.getItem('sampire-active-soundscape');
activeMusicTheme = (storedActiveSoundscape === 'universe' && isRewardActive('soundscapes')) ? 'universe' : 'dark';
updateMusicToggleUi();
updateMusicMenuUI();
const storedKeySoundsEnabled = localStorage.getItem('sampire-key-sounds-enabled');
keySoundsEnabled = storedKeySoundsEnabled === null ? true : storedKeySoundsEnabled === '1';
setKeySoundVolume(localStorage.getItem(KEY_SOUND_VOLUME_KEY)); // null -> default 100%
const storedBibleMode = localStorage.getItem(BIBLE_MODE_KEY);
bibleModeEnabled = storedBibleMode === '1';
const storedKeySoundPack = localStorage.getItem(KEY_SOUND_PACK_KEY);
keySoundPackName = storedKeySoundPack ? String(storedKeySoundPack) : KEY_SOUND_DEFAULT_PACK;
if (!isKeySoundPackUnlocked(keySoundPackName)) {
    keySoundPackName = KEY_SOUND_DEFAULT_PACK;
    try { localStorage.setItem(KEY_SOUND_PACK_KEY, keySoundPackName); } catch (e) {}
}
// The key-sound pack config is fetched on the first click/keypress (see markAudioGesture
// in js/app-audio.js), so nothing under /Sound Effects/ is requested during page load.
setKeySoundToggleUI();
updateKeySoundPackMenuUI();
updateBibleModeUi();
loadLiveChartPreference();
if (!musicMuted) playThemeSoundtrack(); // waits for the first gesture

document.addEventListener('pointerdown', retryThemeMusicAfterGesture, { passive: true });
document.addEventListener('keydown', retryThemeMusicAfterGesture);
window.addEventListener('focus', retryThemeMusicAfterGesture);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) retryThemeMusicAfterGesture();
    if (document.hidden) flushProgressSyncNow();
});
window.addEventListener('pagehide', () => {
    flushProgressSyncNow();
});
window.addEventListener('scroll', updateScrollHeaderState, { passive: true });
updateScrollHeaderState();

bindAuthInputEvents();
setupLeaderboardHoverHandlers();
setupPwaInstallPrompt();
loadGhostCursorPreference();
loadMiningVisualsPreference();
// Effects (laser/asteroid animations) are off for new players; they can turn them on in Settings.
if (localStorage.getItem(MINING_VISUALS_ENABLED_KEY) === null) miningVisualsEnabled = false;
loadMiningLaserSoundPreference();
updateGhostToggleButton();
updateMiningFxToggleButton();
updateSectorMapButtonVisibility();
setupSettingsSwitchSync();
setupTopBarHeightVariable();
setupModeTabsA11y();
applyLaunchParams();
initializeEntrySplash();
renderHistory();
newTest();
sfxReady = true; // enable sounds after initial load
updateAuthUi();
updateXPDisplay();
restoreSession().then(() => {
    updateSplashForUser();
    refreshLeaderboard();
    if (currentUser) refreshCloudProgress();
});

setupServiceWorker();
setupIosInstallHint();

// ── Helpers (ui agent) ───────────────────────────────────────────────────────

// The three toggles that js/app-core.js owns (pace marker, effects, laser sounds)
// write "On"/"Off" text and classes into their buttons. The buttons now look like
// switches, so mirror that state into aria-checked and hide the laser row when
// effects are off.
function setupSettingsSwitchSync() {
    const sync = () => {
        const ghost = document.getElementById('ghost-toggle-btn');
        const fx = document.getElementById('mining-fx-toggle-btn');
        const laser = document.getElementById('mining-fx-sfx-toggle-btn');
        const laserRow = document.getElementById('laser-sound-row');
        if (ghost) ghost.setAttribute('aria-checked', (ghost.classList.contains('toggle-on') || /:\s*On$/i.test(ghost.textContent)) ? 'true' : 'false');
        if (fx) fx.setAttribute('aria-checked', (fx.classList.contains('toggle-on') || /:\s*On$/i.test(fx.textContent)) ? 'true' : 'false');
        if (laser) {
            laser.setAttribute('aria-checked', laser.classList.contains('on') ? 'true' : 'false');
            if (laserRow) laserRow.hidden = laser.style.display === 'none';
        }
    };
    sync();
    const obs = new MutationObserver(sync);
    ['ghost-toggle-btn', 'mining-fx-toggle-btn', 'mining-fx-sfx-toggle-btn'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) obs.observe(el, { attributes: true, attributeFilter: ['class', 'style'], childList: true, characterData: true, subtree: true });
    });
}

// Body padding is derived from the real top-bar height (CSS variable --top-bar-h).
function setupTopBarHeightVariable() {
    const bar = document.getElementById('top-bar');
    if (!bar) return;
    const apply = () => {
        const h = Math.round(bar.getBoundingClientRect().height);
        if (h > 0) document.documentElement.style.setProperty('--top-bar-h', `${h}px`);
    };
    apply();
    if ('ResizeObserver' in window) new ResizeObserver(apply).observe(bar);
    window.addEventListener('resize', apply);
}

// Mode tabs: tablist roles and left/right arrow keys. The .active class is set by
// setMode() in js/app-core.js; a MutationObserver keeps aria-selected in step.
function setupModeTabsA11y() {
    const nav = document.querySelector('.mode-tabs');
    if (!nav) return;
    nav.setAttribute('role', 'tablist');
    if (!nav.getAttribute('aria-label')) nav.setAttribute('aria-label', 'Modes');
    const tabs = () => Array.from(nav.querySelectorAll('.mode-tab'));
    const sync = () => {
        tabs().forEach((tab) => {
            const on = tab.classList.contains('active');
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
            tab.tabIndex = on ? 0 : -1;
        });
    };
    sync();
    new MutationObserver(sync).observe(nav, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true });
    nav.addEventListener('keydown', (e) => {
        const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (!keys.includes(e.key)) return;
        const list = tabs();
        const i = list.indexOf(document.activeElement);
        if (i < 0 || list.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        let next = i;
        if (e.key === 'ArrowLeft') next = (i - 1 + list.length) % list.length;
        if (e.key === 'ArrowRight') next = (i + 1) % list.length;
        if (e.key === 'Home') next = 0;
        if (e.key === 'End') next = list.length - 1;
        list[next].click();          // setMode() may move focus to the typing input
        list[next].focus();          // keep keyboard focus on the tab row
    });
}

// Manifest shortcuts: /?mode=words opens that mode, /?open=story opens the story map.
function applyLaunchParams() {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    const mode = params.get('mode');
    if (mode && document.querySelector(`.mode-tab[data-mode="${CSS.escape(mode)}"]`)) {
        try { localStorage.setItem('sampire-mode', mode); } catch (e) {}
        if (typeof currentMode !== 'undefined') currentMode = mode;
    }
    if (params.get('open') === 'story') pendingOpenAfterSplash = 'story';
}

// Service worker: register, and show an "update available, tap to refresh" toast
// instead of swapping code under the player's feet.
let swUpdateRequested = false;
function showServiceWorkerUpdateToast(registration) {
    const toast = document.getElementById('ui-toast');
    if (!toast || !registration) return;
    toast.textContent = 'A new version is ready. Tap here to refresh.';
    toast.classList.remove('error', 'success', 'top-left');
    toast.classList.add('info', 'update', 'show');
    toast.onclick = () => {
        swUpdateRequested = true;
        toast.classList.remove('show', 'update');
        toast.onclick = null;
        const waiting = registration.waiting;
        if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
        else window.location.reload();
    };
}
function setupServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((reg) => {
            if (reg.waiting && navigator.serviceWorker.controller) showServiceWorkerUpdateToast(reg);
            reg.addEventListener('updatefound', () => {
                const next = reg.installing;
                if (!next) return;
                next.addEventListener('statechange', () => {
                    if (next.state === 'installed' && navigator.serviceWorker.controller) showServiceWorkerUpdateToast(reg);
                });
            });
        }).catch(() => {});
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!swUpdateRequested) return; // first install: nothing to refresh
            swUpdateRequested = false;
            window.location.reload();
        });
    });
}

// iOS Safari never fires beforeinstallprompt. Offer the manual steps instead.
function setupIosInstallHint() {
    const btn = document.getElementById('install-app-btn');
    if (!btn) return;
    const ua = navigator.userAgent || '';
    const isIos = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    if (!isIos || standalone || ('onbeforeinstallprompt' in window)) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem('sampire-ios-install-hint') === '1'; } catch (e) {}
    if (dismissed) return;
    btn.textContent = 'Add to Home Screen';
    btn.classList.add('show');
    btn.addEventListener('click', () => {
        showUiMessage('In Safari, tap the Share button, then "Add to Home Screen".', 'info', 7000);
        btn.classList.remove('show');
        try { localStorage.setItem('sampire-ios-install-hint', '1'); } catch (e) {}
    });
}
