function normalizeSummaryUsername(value) {
    return String(value || '').trim().toLowerCase();
}

function invalidateLeaderboardUserSummaryCache(username) {
    const key = normalizeSummaryUsername(username);
    if (!key) return;
    lbUserSummaryCache.delete(key);
    lbUserSummaryInFlight.delete(key);
}

function hideLeaderboardUserTooltip(immediate = false) {
    const tooltip = document.getElementById('lb-user-tooltip');
    if (!tooltip) return;
    if (lbTooltipHideTimer) {
        clearTimeout(lbTooltipHideTimer);
        lbTooltipHideTimer = null;
    }
    const doHide = () => {
        tooltip.classList.remove('show');
        tooltip.setAttribute('aria-hidden', 'true');
        tooltip.innerHTML = '';
        lbTooltipActiveUsername = '';
    };
    if (immediate) doHide();
    else lbTooltipHideTimer = setTimeout(doHide, 70);
}

function positionLeaderboardUserTooltip(clientX, clientY) {
    const tooltip = document.getElementById('lb-user-tooltip');
    if (!tooltip || !tooltip.classList.contains('show')) return;
    const pad = 10;
    const offset = 12;
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    const rect = tooltip.getBoundingClientRect();
    let left = Math.round((clientX || 0) + offset);
    let top = Math.round((clientY || 0) + offset);
    if (left + rect.width > vw - pad) left = Math.max(pad, Math.round((clientX || 0) - rect.width - offset));
    if (top + rect.height > vh - pad) top = Math.max(pad, vh - rect.height - pad);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

function badgeDisplayNameById(id) {
    const def = BADGE_DEFS.find((badge) => badge.id === id);
    return def ? `${def.icon} ${def.name}` : id;
}

function renderLeaderboardUserTooltip(summary) {
    const tooltip = document.getElementById('lb-user-tooltip');
    if (!tooltip) return;
    const badges = Array.isArray(summary && summary.badgeIds) ? summary.badgeIds : [];
    const badgeNames = badges.map(badgeDisplayNameById);
    const badgesText = badgeNames.length ? badgeNames.join(', ') : 'None yet';
    const level = Math.max(1, Number(summary && summary.level) || 1);
    const pbWpm = Math.max(0, Number(summary && summary.personalBestWpm) || 0);
    const communityTotal = Math.max(0, Number(summary && summary.communityContributionTotal) || 0);
    tooltip.innerHTML = `
        <div class="lb-user-tooltip-title">${escapeHtml(String(summary && summary.username || 'Unknown'))}</div>
        <div class="lb-user-tooltip-line"><strong>Level:</strong> ${level}</div>
        <div class="lb-user-tooltip-line"><strong>Achievements:</strong> ${escapeHtml(badgesText)}</div>
        <div class="lb-user-tooltip-line"><strong>Total Community Damage:</strong> ${communityTotal.toLocaleString()}</div>
        <div class="lb-user-tooltip-line"><strong>Personal Best WPM:</strong> ${pbWpm}</div>
    `;
}

async function fetchLeaderboardUserSummary(username) {
    const key = normalizeSummaryUsername(username);
    if (!key) throw new Error('username is required');
    const now = Date.now();
    const cached = lbUserSummaryCache.get(key);
    if (cached && (now - cached.ts) < 120000) return cached.data;
    if (lbUserSummaryInFlight.has(key)) return lbUserSummaryInFlight.get(key);
    const req = (async () => {
        let out = null;
        try {
            out = await apiFetchCloudFirst(`/api/user-summary?username=${encodeURIComponent(key)}`);
        } catch (e) {
            if (!shouldAllowLocalFallback(e)) throw e;
            out = await localApiFetch(`/api/user-summary?username=${encodeURIComponent(key)}`, {}, buildAuthHeaders({}));
        }
        const data = {
            username: String(out && out.username ? out.username : username),
            badgeIds: Array.isArray(out && out.badgeIds) ? out.badgeIds : [],
            level: Math.max(1, Number(out && out.level) || 1),
            personalBestWpm: Math.max(0, Number(out && out.personalBestWpm) || 0),
            communityContributionTotal: Math.max(0, Number(out && out.communityContributionTotal) || 0),
        };
        // For the currently logged-in user, prefer the local badge state immediately
        // so newly unlocked achievements appear in hover without waiting for cache TTL.
        const currentUsernameKey = normalizeSummaryUsername(currentUser && currentUser.username);
        if (currentUsernameKey && currentUsernameKey === key) {
            const localBadgeIds = getEarnedBadges()
                .map((b) => (typeof b === 'string' ? b : String(b && b.id || '')))
                .filter(Boolean);
            data.badgeIds = [...new Set([...(Array.isArray(data.badgeIds) ? data.badgeIds : []), ...localBadgeIds])];
        }
        lbUserSummaryCache.set(key, { ts: Date.now(), data });
        return data;
    })();
    lbUserSummaryInFlight.set(key, req);
    try {
        return await req;
    } finally {
        lbUserSummaryInFlight.delete(key);
    }
}

function showLeaderboardUserTooltipLoading(username) {
    const tooltip = document.getElementById('lb-user-tooltip');
    if (!tooltip) return;
    tooltip.innerHTML = `
        <div class="lb-user-tooltip-title">${escapeHtml(username)}</div>
        <div class="lb-user-tooltip-line">Loading profile...</div>
    `;
    tooltip.classList.add('show');
    tooltip.setAttribute('aria-hidden', 'false');
}

function setupLeaderboardHoverHandlers() {
    if (leaderboardHoverBound) return;
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    const findTarget = (eventTarget) => {
        if (!eventTarget || typeof eventTarget.closest !== 'function') return null;
        return eventTarget.closest('.lb-user-hover[data-username]');
    };
    listEl.addEventListener('mouseover', (event) => {
        const userEl = findTarget(event.target);
        if (!userEl || !listEl.contains(userEl)) return;
        const username = String(userEl.dataset.username || '').trim();
        if (!username) return;
        if (lbTooltipHideTimer) {
            clearTimeout(lbTooltipHideTimer);
            lbTooltipHideTimer = null;
        }
        lbTooltipActiveUsername = username;
        const token = ++lbTooltipRequestToken;
        showLeaderboardUserTooltipLoading(username);
        positionLeaderboardUserTooltip(event.clientX, event.clientY);
        fetchLeaderboardUserSummary(username).then((summary) => {
            if (token !== lbTooltipRequestToken || lbTooltipActiveUsername !== username) return;
            renderLeaderboardUserTooltip(summary);
            positionLeaderboardUserTooltip(event.clientX, event.clientY);
        }).catch(() => {
            if (token !== lbTooltipRequestToken || lbTooltipActiveUsername !== username) return;
            const tooltip = document.getElementById('lb-user-tooltip');
            if (!tooltip) return;
            tooltip.innerHTML = `
                <div class="lb-user-tooltip-title">${escapeHtml(username)}</div>
                <div class="lb-user-tooltip-line">Profile details unavailable right now.</div>
            `;
            positionLeaderboardUserTooltip(event.clientX, event.clientY);
        });
    });
    listEl.addEventListener('mousemove', (event) => {
        if (!lbTooltipActiveUsername) return;
        positionLeaderboardUserTooltip(event.clientX, event.clientY);
    });
    listEl.addEventListener('mouseout', (event) => {
        const fromEl = findTarget(event.target);
        if (!fromEl) return;
        const toEl = findTarget(event.relatedTarget);
        if (toEl && toEl !== fromEl) return;
        hideLeaderboardUserTooltip(false);
    });
    window.addEventListener('scroll', () => hideLeaderboardUserTooltip(true), true);
    leaderboardHoverBound = true;
}

function updateInstallAppButtonVisibility() {
    const btn = document.getElementById('install-app-btn');
    if (!btn) return;
    const show = !!deferredInstallPrompt;
    btn.classList.toggle('show', show);
}

async function handleInstallAppClick() {
    if (!deferredInstallPrompt) return;
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    updateInstallAppButtonVisibility();
    try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice && choice.outcome === 'accepted') {
            showUiMessage('App installed successfully!', 'success', 2200, 'top-left');
        }
    } catch (e) {
        // Ignore: install prompt is browser-controlled and may be canceled.
    } finally {
        updateInstallAppButtonVisibility();
    }
}

function setupPwaInstallPrompt() {
    const btn = document.getElementById('install-app-btn');
    if (btn) btn.addEventListener('click', handleInstallAppClick);

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;
        updateInstallAppButtonVisibility();
    });

    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        updateInstallAppButtonVisibility();
    });

    updateInstallAppButtonVisibility();
}

function getWeekStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay()); // rewind to Sunday
    return d.getTime();
}

function setLbTab(tab) {
    lbActiveTab = tab;
    document.querySelectorAll('.lb-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
    });
    refreshLeaderboard();
}

const LYRA_WORDS_PER_ASTEROID = 30;
const LYRA_ASTEROIDS_TO_CLEAR = 15;
const LYRA_VISIBLE_WORD_WINDOW = 18;
let lyraStatsInterval = null;
let lyraSetupGeneration = 0;
let lyraSetupInFlight = false;
let lyraAsteroidCycleTimer = null;
let lyraShipFlyAwayTimer = null;
let lyraHudFrame = 0;
let lyraSceneAnchorCache = null;
let lyraLastAsteroidDisplaySize = 0;
let lyraPanelHtmlCache = {};
let lyraCommunityFlushInterval = null;
const lyraPendingTimeouts = new Set();
const LYRA_COMMUNITY_FLUSH_MS = 60000;
const LYRA_COMMUNITY_MAX_WORDS_PER_CALL = 2000;
const LYRA_DAMAGE_POPUP_POOL_SIZE = 100;
let lyraGateState = {
    words: [],
    storyBaseIndex: 0,
    typed: '',
    totalCompleted: 0,
    cycleBusy: false,
    asteroidSeed: 0,
    startTime: null,
    totalChars: 0,
    correctChars: 0,
    comboStreak: 0,
    bestCombo: 0,
    recentDamageBursts: [],
};
let lyraMiningState = null;
let lyraDamagePopupPool = [];
let lyraDamagePopupFrame = 0;
let lyraDamagePopupLastTs = 0;
let lyraDroneOrbitState = [];
let lyraDroneOrbitFrame = 0;
let lyraDroneOrbitLastTs = 0;
let lyraCharSpans = [];
let lyraWordSlots = [];
let lyraSidebarTab = 'systems';
let lyraSelectedUpgradeId = 'automated_drones';
let lyraOverloadHintInterval = null;
let lyraOverloadHintFrame = 0;
let lyraStoryLibraryCache = new Map();
let lyraStoryLoadPromise = null;
let lyraStoryResetMenuOpen = false;
let lyraStoryLoadingState = {
    active: false,
    progress: 0,
    label: 'Downloading Data...',
    meta: '0%',
};
