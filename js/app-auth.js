function isAdminCurrentUser() {
    return !!(currentUser && currentUser.isAdmin === true);
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
    if (adminBtn) adminBtn.style.display = (currentUser && currentUser.isAdmin === true) ? 'inline-flex' : 'none';
    if (splashLoginBtn) {
        splashLoginBtn.textContent = currentUser && currentUser.username
            ? `Continue as ${currentUser.username}`
            : 'Login';
    }
    updateProfileToggleHoverInfo();
    try { renderBackendModeBadge(); } catch (e) {}
}

function applyLoginResult(out) {
    // Local-only accounts carry a token; cloud accounts use HttpOnly cookies and send none.
    authToken = isLocalAuthToken(out && out.token) ? out.token : null;
    currentUser = out.user;
    if (authToken) localStorage.setItem(LOCAL_AUTH_TOKEN_KEY, authToken);
    else localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
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
        await decideBackendMode();
        const out = await apiFetch('/api/signup', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
        if (!out || !out.user) throw new Error('Signup failed');
        applyLoginResult(out);
        await hydrateProgressForCurrentUser();
        ensureFounderBadgeForBeta();
        updateAuthUi();
        closeLoginModal();
        hideSplashScreen();
        playUiCue(SFX.logon);
        const note = isCloudMode()
            ? 'Account created and logged in.'
            : 'Account created on this device only (the online service could not be reached).';
        setAuthNote(note);
        if (usingModal) {
            setSignupNote(note);
            closeSignupModal();
        }
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
        await decideBackendMode();
        const out = await apiFetch('/api/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
        if (!out || !out.user) throw new Error('Login failed');
        applyLoginResult(out);
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
    // Save any unsaved progress first, then clear this browser's copy so the next person starts clean.
    const leavingUserId = String(currentUser && currentUser.id || '');
    try { await flushProgressSyncNow(); } catch (e) {}
    try {
        await apiFetch('/api/logout', { method: 'POST' });
    } catch (e) {}
    if (leavingUserId && getProgressOwner() === leavingUserId) {
        clearSyncedLocalProgress();
        setProgressOwner('');
    }
    authToken = null;
    currentUser = null;
    progressCloudUpdatedAt = 0;
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY);
    updateAuthUi();
    try { updateXPDisplay(); } catch (e) {}
    try { renderHistory(); } catch (e) {}
    try { refreshLeaderboard(); } catch (e) {}
    setAuthNote('Logged out.');
}

async function restoreSession() {
    // Legacy cleanup: cloud sessions now use HttpOnly cookies, not localStorage token.
    localStorage.removeItem(AUTH_TOKEN_KEY);
    await decideBackendMode();
    currentUser = null;

    if (isCloudMode()) {
        authToken = null;
        localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY);
        try {
            const out = await apiFetch('/api/me');
            currentUser = out.user;
        } catch (e) {
            currentUser = null;
            updateAuthUi();
            return;
        }
    } else {
        authToken = localStorage.getItem(LOCAL_AUTH_TOKEN_KEY) || null;
        if (isLocalAuthToken(authToken)) {
            try {
                const out = await apiFetch('/api/me');
                currentUser = out.user;
            } catch (e) {
                authToken = null;
                localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY);
            }
        }
        if (!currentUser) {
            updateAuthUi();
            return;
        }
    }

    await hydrateProgressForCurrentUser();
    ensureFounderBadgeForBeta();
    updateAuthUi();
    setAuthNote('');
}

// Only the fields the server checks are sent; the quote text and client date stay on this device.
function buildScoreSubmission(score) {
    const src = score && typeof score === 'object' ? score : {};
    const summary = (typeof window !== 'undefined' && window.lastRunSummary && typeof window.lastRunSummary === 'object') ? window.lastRunSummary : {};
    const pick = (key, fallback = undefined) => (src[key] != null ? src[key] : (summary[key] != null ? summary[key] : fallback));
    const typedWords = Math.max(0, Math.floor(Number(pick('typedWords', 0)) || 0));
    let typedChars = Math.max(0, Math.floor(Number(pick('typedChars', 0)) || 0));
    if (!typedChars) {
        // Older result code does not count characters: five letters per word is the WPM standard.
        const time = Number(pick('time', 0)) || 0;
        const wpm = Number(pick('wpm', 0)) || 0;
        typedChars = Math.max(1, Math.round(wpm * 5 * (time / 60)));
    }
    return {
        wpm: Number(pick('wpm', 0)) || 0,
        rawWpm: Number(pick('rawWpm', 0)) || 0,
        accuracy: Number(pick('accuracy', 0)) || 0,
        consistency: Number(pick('consistency', 0)) || 0,
        time: Number(pick('time', 0)) || 0,
        mode: String(pick('mode', 'quotes') || 'quotes'),
        typedWords,
        typedChars,
        keystrokes: pick('keystrokes', null),
        mistakes: pick('mistakes', null),
        backspaces: pick('backspaces', null),
    };
}

async function saveScoreToCloud(score) {
    if (!currentUser) return { ok: false, error: 'Not logged in' };
    try {
        const out = await apiFetch('/api/scores', {
            method: 'POST',
            body: JSON.stringify(buildScoreSubmission(score)),
        });
        await refreshCloudProgress();
        await refreshLeaderboard();
        return { ok: true, ranked: !!(out && out.ranked), flagged: !!(out && out.flagged), score: out && out.score };
    } catch (e) {
        return { ok: false, error: e.message || 'Unknown error' };
    }
}

async function submitCommunityContribution(wordCount) {
    const words = Math.max(0, Math.floor(Number(wordCount) || 0));
    if (words <= 0) return { ok: false, error: 'No words to contribute.' };
    // Guests are pooled by the server into one "Guests" row; no name or id is sent.
    const payload = { words };
    try {
        const out = await apiFetch('/api/community/contribute', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        if (lbActiveTab === 'community') refreshLeaderboard();
        if (document.getElementById('community-hub-modal')?.classList.contains('show')) openCommunityHub();
        return { ok: true, words: Number(out && out.words) || words };
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
    const guestUserId = `guest:${getGuestSessionId()}`;
    const guestEntry = {
        id: crypto.randomUUID(),
        userId: guestUserId,
        username: 'Guest',
        wpm: Number(score.wpm) || 0,
        accuracy: Number(score.accuracy) || 0,
        rawWpm: Number(score.rawWpm) || 0,
        consistency: Number(score.consistency) || 0,
        time: Number(score.time) || 0,
        mode: String(score.mode || 'quotes'),
        date: Number(score.date) || Date.now(),
        createdAt: Date.now(),
        level: 1,
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
        const out = await apiFetch('/api/scores/me?limit=50');
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
