function isAdminCurrentUser() {
    return !!(currentUser && String(currentUser.username || '').trim().toLowerCase() === 'sampire');
}

function updateAuthUi() {
    const logoutBtn = document.getElementById('logout-btn');
    const metrics = document.getElementById('cloud-metrics');
    const authGrid = document.getElementById('auth-grid');
    const signupCta = document.getElementById('signup-cta');
    const profileToggle = document.getElementById('profile-toggle');
    const profileToggleLabel = document.getElementById('profile-toggle-label');
    const profileUserIcon = document.getElementById('profile-user-icon');
    const adminBtn = document.getElementById('profile-admin-btn');
    const splashLoginBtn = document.getElementById('entry-login-btn');
    if (logoutBtn) logoutBtn.style.display = currentUser ? 'inline-block' : 'none';
    if (authGrid) authGrid.style.display = currentUser ? 'none' : 'grid';
    if (signupCta) signupCta.style.display = currentUser ? 'none' : 'flex';
    if (metrics && !currentUser) metrics.style.display = 'none';
    if (profileToggle) profileToggle.style.display = 'flex';
    if (profileToggleLabel) profileToggleLabel.textContent = currentUser ? 'Profile' : 'Login';
    if (profileUserIcon) profileUserIcon.textContent = currentUser ? '👤' : '🔐';
    if (adminBtn) adminBtn.style.display = isAdminCurrentUser() ? 'inline-flex' : 'none';
    if (splashLoginBtn) {
        splashLoginBtn.textContent = currentUser && currentUser.username
            ? `Continue as ${currentUser.username}`
            : 'Login';
    }
    updateProfileToggleHoverInfo();
}

async function signupUser(usernameOverride = null, passwordOverride = null) {
    const username = usernameOverride !== null
        ? String(usernameOverride).trim()
        : document.getElementById('auth-username').value.trim();
    const password = passwordOverride !== null
        ? String(passwordOverride)
        : document.getElementById('auth-password').value;
    const usingModal = usernameOverride !== null || passwordOverride !== null;
    try {
        const out = await apiFetchCloudThenLocal('/api/signup', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        }, 'Cloud API routes not found. Using local browser storage mode.', shouldAllowAuthLocalFallback);
        authToken = isLocalAuthToken(out && out.token) ? out.token : null;
        currentUser = out.user;
        if (authToken) localStorage.setItem(LOCAL_AUTH_TOKEN_KEY, authToken);
        else localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_TOKEN_KEY);
        await hydrateProgressForCurrentUser();
        ensureFounderBadgeForBeta();
        updateAuthUi();
        closeLoginModal();
        hideSplashScreen();
        playUiCue(SFX.logon);
        setAuthNote('Account created and logged in.');
        if (usingModal) {
            setSignupNote('Account created and logged in.');
            closeSignupModal();
        }
        openMissionBriefing();
        await refreshCloudProgress();
        await refreshLeaderboard();
    } catch (e) {
        if (usingModal) setSignupNote(e.message, true);
        else setAuthNote(e.message, true);
    }
}

async function signupUserFromModal() {
    const username = (document.getElementById('signup-username')?.value || '').trim();
    const password = (document.getElementById('signup-password')?.value || '');
    const confirm = (document.getElementById('signup-password-confirm')?.value || '');
    const captchaRaw = (document.getElementById('signup-captcha-input')?.value || '').trim();
    const captchaValue = parseInt(captchaRaw, 10);
    if (password !== confirm) {
        setSignupNote('Passwords do not match.', true);
        return;
    }
    if (!Number.isFinite(captchaValue) || signupCaptchaAnswer == null || captchaValue !== signupCaptchaAnswer) {
        setSignupNote('Captcha incorrect. Please solve the challenge to continue.', true);
        refreshSignupCaptcha();
        const captchaInput = document.getElementById('signup-captcha-input');
        if (captchaInput) captchaInput.focus();
        return;
    }
    await signupUser(username, password);
}

async function loginUser() {
    const _loginBtn = document.getElementById('login-btn');
    if (_loginBtn) {
        _loginBtn.textContent = 'Logging in...';
        _loginBtn.disabled = true;
    }
    try {
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value;
        const out = await apiFetchCloudThenLocal('/api/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        }, 'Cloud API routes not found. Using local browser storage mode.', shouldAllowAuthLocalFallback);
        if (!out || !out.user) throw new Error('Login failed');
        authToken = isLocalAuthToken(out && out.token) ? out.token : null;
        currentUser = out.user;
        if (authToken) localStorage.setItem(LOCAL_AUTH_TOKEN_KEY, authToken);
        else localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_TOKEN_KEY);
        await hydrateProgressForCurrentUser();
        ensureFounderBadgeForBeta();
        updateAuthUi();
        closeLoginModal();
        hideSplashScreen();
        playUiCue(SFX.logon);
        setAuthNote('Logged in successfully.');
        await refreshCloudProgress();
        await refreshLeaderboard();
    } catch (e) {
        setAuthNote(e.message || 'Login failed. Please try again.', true);
    } finally {
        if (_loginBtn) {
            _loginBtn.textContent = 'Login';
            _loginBtn.disabled = false;
        }
    }
}

async function logoutUser() {
    // Try to flush pending progress before token/session teardown.
    flushProgressSyncNow();
    try {
        if (isLocalAuthToken(authToken)) {
            await localApiFetch('/api/logout', { method: 'POST' }, buildAuthHeaders({}));
        } else {
            await apiFetchCloudFirst('/api/logout', { method: 'POST' });
        }
    } catch (e) {}
    authToken = null;
    currentUser = null;
    localApiFallbackActive = false;
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY);
    updateAuthUi();
    setAuthNote('Logged out.');
}

async function restoreSession() {
    // Legacy cleanup: cloud sessions now use HttpOnly cookies, not localStorage token.
    localStorage.removeItem(AUTH_TOKEN_KEY);
    authToken = localStorage.getItem(LOCAL_AUTH_TOKEN_KEY) || null;
    currentUser = null;

    if (isLocalAuthToken(authToken)) {
        try {
            localApiFallbackActive = true;
            const out = await localApiFetch('/api/me', {}, buildAuthHeaders({}));
            currentUser = out.user;
        } catch (e) {
            authToken = null;
            localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY);
            localApiFallbackActive = false;
        }
    }

    if (!currentUser) {
        try {
            const out = await apiFetchCloudFirst('/api/me');
            currentUser = out.user;
            authToken = null;
            localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY);
            localApiFallbackActive = false;
        } catch (e) {
            if (shouldAllowLocalFallback(e) && isLocalAuthToken(authToken)) {
                updateAuthUi();
                setAuthNote('Cloud session check failed. Local browser mode remains available.', true);
                return;
            }
            authToken = null;
            currentUser = null;
            localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY);
            localApiFallbackActive = false;
            updateAuthUi();
            return;
        }
    }

    await hydrateProgressForCurrentUser();
    ensureFounderBadgeForBeta();
    updateAuthUi();
    setAuthNote('');
}

async function saveScoreToCloud(score) {
    if (!currentUser) return { ok: false, error: 'Not logged in' };
    try {
        if (isLocalAuthToken(authToken)) {
            await apiFetch('/api/scores', {
                method: 'POST',
                body: JSON.stringify(score),
            });
        } else {
            await apiFetchCloudFirst('/api/scores', {
                method: 'POST',
                body: JSON.stringify(score),
            });
        }
        await refreshCloudProgress();
        await refreshLeaderboard();
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message || 'Unknown error' };
    }
}

async function submitCommunityContribution(wordCount) {
    const words = Math.max(0, Math.floor(Number(wordCount) || 0));
    if (words <= 0) return { ok: false, error: 'No words to contribute.' };
    const payload = {
        words,
        date: Date.now(),
        guestId: getGuestSessionId(),
        guestName: `Guest-${String(getGuestSessionId()).slice(0, 4)}`,
    };
    // Prefer cloud contribution so the community leaderboard remains global
    // even if local fallback was enabled earlier in the session.
    try {
        await apiFetchCloudFirst('/api/community/contribute', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        if (lbActiveTab === 'community') refreshLeaderboard();
        if (document.getElementById('community-hub-modal')?.classList.contains('show')) openCommunityHub();
        return { ok: true };
    } catch (cloudErr) {
        // Fall through to existing resilient API behavior below.
    }
    try {
        await apiFetch('/api/community/contribute', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        if (lbActiveTab === 'community') refreshLeaderboard();
        if (document.getElementById('community-hub-modal')?.classList.contains('show')) openCommunityHub();
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message || 'Contribution sync failed' };
    }
}

function saveGuestScoreToLeaderboard(score, isSessionPB) {
    if (!score || Number(score.wpm) < 100) {
        return { ok: false, error: 'Guest submissions require at least 100 WPM.' };
    }
    if (!isSessionPB) {
        return { ok: false, error: 'Only session personal best runs can be submitted by guests.' };
    }
    const cachedLocation = getCachedGuestLocation(true);
    if (!cachedLocation) {
        // Resolve asynchronously for future guest submissions.
        void resolveGuestLocation();
    }
    const guestUserId = `guest:${getGuestSessionId()}`;
    const guestEntry = {
        id: crypto.randomUUID(),
        userId: guestUserId,
        username: getGuestDisplayNameFromLocation(cachedLocation),
        city: String(cachedLocation && cachedLocation.city || ''),
        country: String(cachedLocation && cachedLocation.country || ''),
        wpm: Number(score.wpm) || 0,
        accuracy: Number(score.accuracy) || 0,
        rawWpm: Number(score.rawWpm) || 0,
        consistency: Number(score.consistency) || 0,
        time: Number(score.time) || 0,
        mode: String(score.mode || 'quotes'),
        date: Number(score.date) || Date.now(),
        createdAt: Date.now(),
    };
    const guestScores = loadLocalJson(LOCAL_GUEST_SCORES_KEY, []);
    const existingIdx = guestScores.findIndex(s => s.userId === guestUserId && s.mode === guestEntry.mode);
    const existing = existingIdx >= 0 ? guestScores[existingIdx] : null;
    if (!isBetterScore(guestEntry, existing)) {
        return { ok: false, error: 'Only your best run for this mode can be submitted.' };
    }
    if (existingIdx >= 0) guestScores[existingIdx] = guestEntry;
    else guestScores.push(guestEntry);
    if (guestScores.length > 1000) guestScores.splice(0, guestScores.length - 1000);
    saveLocalJson(LOCAL_GUEST_SCORES_KEY, guestScores);
    refreshLeaderboard();
    return { ok: true };
}

async function refreshCloudProgress() {
    if (!currentUser) return;
    try {
        const out = isLocalAuthToken(authToken)
            ? await apiFetch('/api/scores/me?limit=50')
            : await apiFetchCloudFirst('/api/scores/me?limit=50');
        const scores = Array.isArray(out.scores) ? out.scores : [];
        const metrics = document.getElementById('cloud-metrics');
        if (!metrics) return;
        if (scores.length === 0) {
            document.getElementById('cloud-best').textContent = '0';
            document.getElementById('cloud-avg').textContent = '0';
            document.getElementById('cloud-tests').textContent = '0';
            metrics.style.display = 'grid';
            return;
        }
        const best = Math.max(...scores.map(s => s.wpm || 0));
        const avg = Math.round(scores.reduce((acc, s) => acc + (s.wpm || 0), 0) / scores.length);
        document.getElementById('cloud-best').textContent = String(best);
        document.getElementById('cloud-avg').textContent = String(avg);
        document.getElementById('cloud-tests').textContent = String(scores.length);
        metrics.style.display = 'grid';
    } catch (e) {
        setAuthNote(`Failed to load cloud stats: ${e.message}`, true);
    }
}

let _lbRowsCache = [];
let _communityRowsCache = [];
let lbActiveTab = 'alltime';
let leaderboardReqId = 0;
let communityHubReqId = 0;
let adminUsersCache = [];
let adminSelectedUserId = '';
const lbUserSummaryCache = new Map();
const lbUserSummaryInFlight = new Map();
let leaderboardHoverBound = false;
let lbTooltipHideTimer = null;
let lbTooltipActiveUsername = '';
let lbTooltipRequestToken = 0;
let deferredInstallPrompt = null;
