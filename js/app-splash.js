// ── Entry splash ─────────────────────────────────────────────────────────────
// One screen: logo, a big "Start typing" button, and "Log in" / "Create account"
// links. Any key also starts. The old guide panel and "briefing" step are gone;
// the lore now lives in the Help modal (opened from the settings panel).

let splashHideTimer = null;
let pendingOpenAfterSplash = null; // set from app-boot.js for "?open=story" shortcuts

function isSplashScreenOpen() {
    const splash = document.getElementById('entry-splash');
    return !!(splash && !splash.classList.contains('hidden'));
}

// A modal (log in / create account) sitting on top of the splash counts as
// "options visible": the global key handler then leaves keystrokes alone so
// people can type into the form.
function isSplashOptionsVisible() {
    if (!isSplashScreenOpen()) return false;
    return !!(typeof activeModalEl !== 'undefined' && activeModalEl);
}

function isSplashGuideVisible() {
    return false;
}

function playUiCue(audio) {
    if (!audio) return;
    try {
        const cue = audio.cloneNode(true);
        cue.volume = audio.volume;
        cue.currentTime = 0;
        cue.play().catch(() => {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        });
    } catch (e) {
        try {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        } catch (err) {}
    }
}

function updateSplashGuideRoute() {}

function splashHasSavedUser() {
    return !!(typeof currentUser !== 'undefined' && currentUser && currentUser.username);
}

// Called after boot and again once restoreSession() resolves.
function updateSplashForUser() {
    const startBtn = document.getElementById('entry-guest-btn');
    const loginBtn = document.getElementById('entry-login-btn');
    const signupBtn = document.getElementById('entry-signup-btn');
    const note = document.getElementById('entry-splash-note');
    const title = document.getElementById('entry-splash-title');
    const saved = splashHasSavedUser();
    if (startBtn) startBtn.textContent = saved ? `Continue as ${currentUser.username}` : 'Start typing';
    if (loginBtn) loginBtn.hidden = saved;
    if (signupBtn) signupBtn.hidden = saved;
    if (note) note.textContent = saved ? 'Not you? Log out from your profile after you start.' : 'No account needed. Your progress is saved in this browser.';
    if (title) title.textContent = saved ? 'Press any key or tap Continue to begin' : 'Press any key or tap Start to begin';
}

function startFromSplash() {
    if (!isSplashScreenOpen()) return;
    if (typeof activeModalEl !== 'undefined' && activeModalEl) return;
    const saved = splashHasSavedUser();
    hideSplashScreen();
    playUiCue(SFX.logon);
    if (typeof setAuthNote === 'function') setAuthNote(saved ? `Continuing as ${currentUser.username}.` : 'Continuing as guest.');
    if (typeof hiddenInput !== 'undefined' && hiddenInput) hiddenInput.blur();
}

// Kept for the global key handler in js/app-input.js: "any key" now starts.
function revealSplashOptions() {
    startFromSplash();
}

function showSplashGuide() {
    startFromSplash();
}

function runSplashPendingAction() {
    startFromSplash();
}

function continueFromSplashGuide() {
    startFromSplash();
}

// Clicking the splash background does nothing; the Start button or a key starts.
function handleSplashScreenClick(event) {
    if (!isSplashScreenOpen()) return;
    if (event && event.target && event.target.closest('button, a, input')) return;
    if (event) event.stopPropagation();
}

function showSplashPrompt() {
    const splash = document.getElementById('entry-splash');
    if (!splash) return;
    splash.classList.remove('phase-guide', 'phase-options');
    splash.classList.add('phase-intro');
}

function initEntrySplashStars() {
    const starsLayer = document.getElementById('entry-splash-stars');
    if (!starsLayer || starsLayer.dataset.ready === '1') return;
    starsLayer.innerHTML = '';
    const narrow = window.innerWidth < 700;
    const base = narrow ? 50 : 100;
    const starCount = base + Math.floor(Math.random() * (narrow ? 26 : 51));
    const regularStarPalette = ['#eff6ff', '#e2e8f0', '#dbeafe', '#bfdbfe'];
    const aetherStarPalette = ['#ddd6fe', '#c4b5fd', '#fde68a', '#facc15'];
    for (let i = 0; i < starCount; i++) {
        const star = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const isAetherTint = Math.random() < 0.1;
        const palette = isAetherTint ? aetherStarPalette : regularStarPalette;
        const color = palette[Math.floor(Math.random() * palette.length)];
        const cx = Math.random() * 1200;
        const cy = Math.random() * 720;
        const r = 0.5 + Math.random() * 1.5;
        const duration = 1.6 + Math.random() * 3.6;
        const delay = Math.random() * 6.5;
        const minOpacity = 0.06 + Math.random() * 0.18;
        const maxOpacity = 0.72 + Math.random() * 0.28;

        star.setAttribute('class', 'sector-star');
        star.setAttribute('cx', cx.toFixed(2));
        star.setAttribute('cy', cy.toFixed(2));
        star.setAttribute('r', r.toFixed(2));
        star.setAttribute('fill', color);
        star.style.animationDuration = `${duration.toFixed(2)}s`;
        star.style.animationDelay = `${delay.toFixed(2)}s`;
        star.style.setProperty('--min-o', minOpacity.toFixed(2));
        star.style.setProperty('--max-o', maxOpacity.toFixed(2));
        starsLayer.appendChild(star);
    }
    starsLayer.dataset.ready = '1';
}

function hideSplashScreen() {
    const splash = document.getElementById('entry-splash');
    if (!splash) return;
    splash.classList.add('hidden');
    splash.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('splash-active');
    // After the fade, take the splash out of the layout entirely so its star
    // animations stop costing CPU (display: none via the "gone" class).
    if (splashHideTimer) clearTimeout(splashHideTimer);
    splashHideTimer = setTimeout(() => {
        splashHideTimer = null;
        if (splash.classList.contains('hidden')) splash.classList.add('gone');
    }, 320);
    if (pendingOpenAfterSplash === 'story') {
        pendingOpenAfterSplash = null;
        if (typeof openSectorMap === 'function') setTimeout(() => openSectorMap(), 350);
    }
}

function openLoginFromSplash() {
    playUiCue(SFX.ding);
    if (splashHasSavedUser()) {
        startFromSplash();
        return;
    }
    openLoginModal();
}

function openSignupFromSplash() {
    playUiCue(SFX.ding);
    openSignupModal();
}

function continueAsGuestFromSplash() {
    playUiCue(SFX.ding);
    startFromSplash();
}

function initializeEntrySplash() {
    const splash = document.getElementById('entry-splash');
    if (!splash) return;
    if (splashHideTimer) {
        clearTimeout(splashHideTimer);
        splashHideTimer = null;
    }
    initEntrySplashStars();
    document.body.classList.add('splash-active');
    showSplashPrompt();
    updateSplashForUser();
    splash.classList.remove('hidden', 'gone');
    splash.setAttribute('aria-hidden', 'false');
    if (typeof hiddenInput !== 'undefined' && hiddenInput) hiddenInput.blur();
}

function openLoginModal() {
    const modal = document.getElementById('login-modal');
    if (!modal) return;
    openModal(modal);
    setAuthNote('');
    const userInput = document.getElementById('auth-username');
    const passInput = document.getElementById('auth-password');
    if (userInput) userInput.value = '';
    if (passInput) passInput.value = '';
    if (userInput) userInput.focus();
}

function closeLoginModal() {
    const modal = document.getElementById('login-modal');
    if (!modal) return;
    closeModal(modal);
}

function handleLoginModalBackdrop(event) {
    if (event && event.target === document.getElementById('login-modal')) closeLoginModal();
}

function openProfileOrLogin() {
    if (currentUser) openProfile();
    else openLoginModal();
}

// ── Help modal (how the game works, plus the story lore) ────────────────────
function openHelpModal() {
    const modal = document.getElementById('help-modal');
    if (!modal) return;
    if (typeof closeSettingsPanel === 'function') closeSettingsPanel();
    openModal(modal);
}

function closeHelpModal() {
    const modal = document.getElementById('help-modal');
    if (!modal) return;
    closeModal(modal);
}

function handleHelpModalBackdrop(event) {
    if (event && event.target === document.getElementById('help-modal')) closeHelpModal();
}
