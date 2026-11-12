function isSplashScreenOpen() {
    const splash = document.getElementById('entry-splash');
    return !!(splash && !splash.classList.contains('hidden'));
}

function isSplashOptionsVisible() {
    const splash = document.getElementById('entry-splash');
    return !!(splash && splash.classList.contains('phase-options'));
}

function isSplashGuideVisible() {
    const splash = document.getElementById('entry-splash');
    return !!(splash && splash.classList.contains('phase-guide'));
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

function updateSplashGuideRoute(action) {
    const note = document.getElementById('entry-guide-route-note');
    if (!note) return;
    if (action === 'login') {
        note.textContent = 'Authentication console selected. Review the systems brief, then continue to login.';
        return;
    }
    if (action === 'signup') {
        note.textContent = 'New pilot registration selected. Review the systems brief, then continue to account creation.';
        return;
    }
    if (action === 'continue-user' && currentUser && currentUser.username) {
        note.textContent = `Identity lock confirmed for ${currentUser.username}. Review the systems brief, then continue to the command deck.`;
        return;
    }
    note.textContent = 'Guest access selected. Review the systems brief, then continue to the command deck.';
}

function revealSplashOptions() {
    const splash = document.getElementById('entry-splash');
    const loginBtn = document.getElementById('entry-login-btn');
    if (!splash) return;
    splashPendingAction = null;
    splash.classList.remove('phase-intro');
    splash.classList.remove('phase-guide');
    splash.classList.add('phase-options');
    document.getElementById('entry-guide-panel')?.setAttribute('aria-hidden', 'true');
    if (loginBtn) setTimeout(() => loginBtn.focus(), 120);
}

function showSplashGuide(action) {
    const splash = document.getElementById('entry-splash');
    const guidePanel = document.getElementById('entry-guide-panel');
    const cta = document.getElementById('entry-guide-cta');
    if (!splash) return;
    splashPendingAction = action;
    updateSplashGuideRoute(action);
    splash.classList.remove('phase-intro', 'phase-options');
    splash.classList.add('phase-guide');
    if (guidePanel) guidePanel.setAttribute('aria-hidden', 'false');
    if (cta) setTimeout(() => cta.focus(), 120);
}

function runSplashPendingAction() {
    const action = splashPendingAction;
    splashPendingAction = null;
    if (action === 'login') {
        playUiCue(SFX.ding);
        showSplashPrompt();
        openLoginModal();
        return;
    }
    if (action === 'signup') {
        playUiCue(SFX.ding);
        showSplashPrompt();
        openSignupModal();
        return;
    }
    if (action === 'continue-user') {
        hideSplashScreen();
        playUiCue(SFX.logon);
        setAuthNote(`Continuing as ${currentUser && currentUser.username ? currentUser.username : 'pilot'}.`);
        hiddenInput.blur();
        return;
    }
    if (action === 'guest') {
        hideSplashScreen();
        playUiCue(SFX.logon);
        setAuthNote('Continuing as guest.');
        hiddenInput.blur();
    }
}

function continueFromSplashGuide() {
    if (!isSplashScreenOpen() || !isSplashGuideVisible() || !splashPendingAction) return;
    runSplashPendingAction();
}

function handleSplashScreenClick(event) {
    if (!isSplashScreenOpen() || isSplashOptionsVisible() || isSplashGuideVisible()) return;
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    playUiCue(SFX.ding);
    revealSplashOptions();
}

function showSplashPrompt() {
    const splash = document.getElementById('entry-splash');
    const guidePanel = document.getElementById('entry-guide-panel');
    if (!splash) return;
    splashPendingAction = null;
    splash.classList.remove('phase-guide');
    splash.classList.remove('phase-options');
    splash.classList.add('phase-intro');
    if (guidePanel) guidePanel.setAttribute('aria-hidden', 'true');
}

function initEntrySplashStars() {
    const starsLayer = document.getElementById('entry-splash-stars');
    if (!starsLayer || starsLayer.dataset.ready === '1') return;
    starsLayer.innerHTML = '';
    const starCount = 100 + Math.floor(Math.random() * 51);
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
}

function openLoginFromSplash() {
    playUiCue(SFX.ding);
    showSplashGuide(currentUser && currentUser.username ? 'continue-user' : 'login');
}

function openSignupFromSplash() {
    playUiCue(SFX.ding);
    showSplashGuide('signup');
}

function continueAsGuestFromSplash() {
    playUiCue(SFX.ding);
    showSplashGuide('guest');
}

function initializeEntrySplash() {
    const splash = document.getElementById('entry-splash');
    if (!splash) return;
    initEntrySplashStars();
    document.body.classList.add('splash-active');
    showSplashPrompt();
    splash.classList.remove('hidden');
    splash.setAttribute('aria-hidden', 'false');
    hiddenInput.blur();
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
