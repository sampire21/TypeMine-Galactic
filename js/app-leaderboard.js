// ── Leaderboard: cloud/local detection, board cache, level tiers, player tooltip ──
const LB_BOARD_CACHE_TTL_MS = 30000;
const lbBoardCache = new Map(); // "tab|mode" -> { ts, data }
let lbActiveMode = 'all';
let socialCloudModeCache = null; // null = not probed yet
let socialCloudModeProbe = null;
let lbTooltipAnchorEl = null;
let lbTooltipHandlersBound = false;

// Level tiers: one colour and title for every 10 levels. Names for the first five
// match getLevelName() in the progression code.
const LB_LEVEL_TIERS = [
    { max: 10, name: 'Scribe' },
    { max: 20, name: 'Calligrapher' },
    { max: 30, name: 'Typist' },
    { max: 40, name: 'Operator' },
    { max: 50, name: 'Cyber-Runner' },
    { max: 60, name: 'Pilot' },
    { max: 70, name: 'Navigator' },
    { max: 80, name: 'Commander' },
    { max: 90, name: 'Admiral' },
    { max: Infinity, name: 'Legend' },
];

function getLeaderboardLevelTier(level) {
    const lv = Math.max(1, Math.floor(Number(level) || 1));
    const idx = Math.min(LB_LEVEL_TIERS.length - 1, Math.floor((lv - 1) / 10));
    const tier = LB_LEVEL_TIERS[idx];
    return { index: idx + 1, name: tier.name, cssClass: `lb-tier-${idx + 1}`, level: lv };
}

function lbLevelTitle(level) {
    const tier = getLeaderboardLevelTier(level);
    return `Level ${tier.level}, ${tier.name}`;
}

// Cloud vs local mode. The backend exposes window.isCloudMode() once it boots; until then
// we probe /api/health once and treat a 404 as "no backend here".
function socialIsCloudMode() {
    if (typeof window.isCloudMode === 'function') {
        try { return !!window.isCloudMode(); } catch (e) {}
    }
    if (socialCloudModeCache !== null) return socialCloudModeCache;
    return !localApiFallbackActive;
}

async function socialDetectCloudMode() {
    if (typeof window.isCloudMode === 'function') {
        try { return !!window.isCloudMode(); } catch (e) {}
    }
    if (socialCloudModeCache !== null) return socialCloudModeCache;
    if (socialCloudModeProbe) return socialCloudModeProbe;
    socialCloudModeProbe = (async () => {
        const isWebContext = location.protocol === 'http:' || location.protocol === 'https:';
        if (!isWebContext) {
            socialCloudModeCache = false;
            return false;
        }
        try {
            const res = await fetchWithTimeout('/api/health', { method: 'GET' }, 5000);
            socialCloudModeCache = res.status !== 404;
            return socialCloudModeCache;
        } catch (e) {
            // Network trouble is not proof that there is no backend; keep trying cloud.
            return !localApiFallbackActive;
        } finally {
            socialCloudModeProbe = null;
        }
    })();
    return socialCloudModeProbe;
}

function invalidateLeaderboardBoardCache() {
    lbBoardCache.clear();
}

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
        lbTooltipAnchorEl = null;
    };
    if (immediate) doHide();
    else lbTooltipHideTimer = setTimeout(doHide, 120);
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

// Anchor the tooltip under an element (keyboard focus and touch taps have no useful pointer position).
function positionLeaderboardUserTooltipAt(anchorEl) {
    if (!anchorEl || typeof anchorEl.getBoundingClientRect !== 'function') return;
    const rect = anchorEl.getBoundingClientRect();
    positionLeaderboardUserTooltip(rect.left, rect.bottom - 4);
}

function repositionLeaderboardUserTooltip() {
    if (lbTooltipAnchorEl) positionLeaderboardUserTooltipAt(lbTooltipAnchorEl);
}

function badgeDisplayNameById(id) {
    const def = BADGE_DEFS.find((badge) => badge.id === id);
    return def ? `${def.icon} ${def.name}` : id;
}

function lbStatOrDash(value, suffix = '') {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return `${Math.round(Number(value)).toLocaleString()}${suffix}`;
}

function renderLeaderboardUserTooltip(summary) {
    const tooltip = document.getElementById('lb-user-tooltip');
    if (!tooltip) return;
    const username = String(summary && summary.username || 'Unknown');
    const badges = Array.isArray(summary && summary.badgeIds) ? summary.badgeIds : [];
    const badgeNames = badges.map(badgeDisplayNameById);
    const badgesText = badgeNames.length ? badgeNames.join(', ') : 'None yet';
    const level = Math.max(1, Number(summary && summary.level) || 1);
    const tier = getLeaderboardLevelTier(level);
    const pbWpm = Math.max(0, Number(summary && summary.personalBestWpm) || 0);
    const weeklyBest = Number(summary && summary.weeklyBestWpm);
    const wordsThisWeek = Number(summary && summary.wordsThisWeek);
    const isSelf = !!(currentUser && normalizeSummaryUsername(currentUser.username) === normalizeSummaryUsername(username));
    const compareHtml = (!isSelf)
        ? `<button type="button" class="lb-tooltip-compare" data-username="${escapeHtml(username)}">Compare with me</button>`
        : '';
    tooltip.innerHTML = `
        <div class="lb-user-tooltip-title ${tier.cssClass}">${escapeHtml(username)}</div>
        <div class="lb-user-tooltip-line"><strong>Level:</strong> ${level} (${escapeHtml(tier.name)})</div>
        <div class="lb-user-tooltip-line"><strong>Best:</strong> ${pbWpm} WPM${Number.isFinite(weeklyBest) && weeklyBest > 0 ? ` <strong>This week:</strong> ${Math.round(weeklyBest)} WPM` : ''}</div>
        ${Number.isFinite(wordsThisWeek) ? `<div class="lb-user-tooltip-line"><strong>Words this week:</strong> ${Math.round(wordsThisWeek).toLocaleString()}</div>` : ''}
        <div class="lb-user-tooltip-line"><strong>Badges:</strong> ${escapeHtml(badgesText)}</div>
        ${compareHtml}
    `;
}

function lbNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
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
        const url = `/api/user-summary?username=${encodeURIComponent(key)}`;
        if (socialIsCloudMode()) {
            try {
                out = await apiFetchCloudFirst(url);
            } catch (e) {
                if (!shouldAllowLocalFallback(e)) throw e;
                out = await localApiFetch(url, {}, buildAuthHeaders({}));
            }
        } else {
            out = await localApiFetch(url, {}, buildAuthHeaders({}));
        }
        const data = {
            username: String(out && out.username ? out.username : username),
            badgeIds: Array.isArray(out && out.badgeIds) ? out.badgeIds : [],
            level: Math.max(1, Number(out && out.level) || 1),
            personalBestWpm: Math.max(0, Number(out && out.personalBestWpm) || 0),
            communityContributionTotal: Math.max(0, Number(out && out.communityContributionTotal) || 0),
            // Head-to-head fields. The backend may not send all of them yet; missing ones show as a dash.
            weeklyBestWpm: lbNumberOrNull(out && out.weeklyBestWpm),
            averageWpm: lbNumberOrNull(out && (out.averageWpm ?? out.avgWpm)),
            runs: lbNumberOrNull(out && (out.runs ?? out.tests ?? out.totalTests)),
            averageAccuracy: lbNumberOrNull(out && (out.averageAccuracy ?? out.avgAccuracy ?? out.accuracy)),
            streak: lbNumberOrNull(out && (out.streak ?? out.streakDays)),
            wordsThisWeek: lbNumberOrNull(out && (out.wordsThisWeek ?? out.weeklyWords)),
        };
        // For the logged-in player, merge local badge state so fresh unlocks show at once.
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
        <div class="lb-user-tooltip-line">Loading stats...</div>
    `;
    tooltip.classList.add('show');
    tooltip.setAttribute('aria-hidden', 'false');
}

// Show the tooltip for a username element. `point` is {x, y} for mouse hover; omit it to anchor under the element.
function showLeaderboardUserTooltipFor(userEl, point = null) {
    if (!userEl) return;
    const username = String(userEl.dataset.username || '').trim();
    if (!username) return;
    if (lbTooltipHideTimer) {
        clearTimeout(lbTooltipHideTimer);
        lbTooltipHideTimer = null;
    }
    lbTooltipActiveUsername = username;
    lbTooltipAnchorEl = point ? null : userEl;
    const token = ++lbTooltipRequestToken;
    const place = () => {
        if (point) positionLeaderboardUserTooltip(point.x, point.y);
        else positionLeaderboardUserTooltipAt(userEl);
    };
    showLeaderboardUserTooltipLoading(username);
    place();
    fetchLeaderboardUserSummary(username).then((summary) => {
        if (token !== lbTooltipRequestToken || lbTooltipActiveUsername !== username) return;
        renderLeaderboardUserTooltip(summary);
        place();
    }).catch(() => {
        if (token !== lbTooltipRequestToken || lbTooltipActiveUsername !== username) return;
        const tooltip = document.getElementById('lb-user-tooltip');
        if (!tooltip) return;
        tooltip.innerHTML = `
            <div class="lb-user-tooltip-title">${escapeHtml(username)}</div>
            <div class="lb-user-tooltip-line">Stats are not available right now.</div>
        `;
        place();
    });
}

function lbIsCoarsePointer() {
    try { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; }
}

function setupLeaderboardHoverHandlers() {
    if (leaderboardHoverBound) return;
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    const findTarget = (eventTarget) => {
        if (!eventTarget || typeof eventTarget.closest !== 'function') return null;
        return eventTarget.closest('.lb-user-hover[data-username]');
    };
    // Mouse hover follows the pointer.
    listEl.addEventListener('mouseover', (event) => {
        const userEl = findTarget(event.target);
        if (!userEl || !listEl.contains(userEl)) return;
        if (lbIsCoarsePointer()) return;
        showLeaderboardUserTooltipFor(userEl, { x: event.clientX, y: event.clientY });
    });
    listEl.addEventListener('mousemove', (event) => {
        if (!lbTooltipActiveUsername || lbTooltipAnchorEl) return;
        positionLeaderboardUserTooltip(event.clientX, event.clientY);
    });
    listEl.addEventListener('mouseout', (event) => {
        const fromEl = findTarget(event.target);
        if (!fromEl) return;
        const toEl = findTarget(event.relatedTarget);
        if (toEl && toEl !== fromEl) return;
        if (lbTooltipAnchorEl === fromEl && document.activeElement === fromEl) return; // keep for keyboard focus
        hideLeaderboardUserTooltip(false);
    });
    // Keyboard focus anchors the tooltip under the name.
    listEl.addEventListener('focusin', (event) => {
        const userEl = findTarget(event.target);
        if (!userEl) return;
        showLeaderboardUserTooltipFor(userEl);
    });
    listEl.addEventListener('focusout', (event) => {
        const userEl = findTarget(event.target);
        if (!userEl) return;
        const next = event.relatedTarget;
        if (next && typeof next.closest === 'function' && next.closest('#lb-user-tooltip')) return;
        hideLeaderboardUserTooltip(false);
    });
    // Click or tap: on touch screens a tap shows the card (with a Compare button);
    // with a mouse the card is already showing, so a click opens the head-to-head view.
    listEl.addEventListener('click', (event) => {
        const userEl = findTarget(event.target);
        if (!userEl) return;
        event.preventDefault();
        const username = String(userEl.dataset.username || '').trim();
        if (!username) return;
        const showing = lbTooltipActiveUsername === username && document.getElementById('lb-user-tooltip')?.classList.contains('show');
        if (lbIsCoarsePointer() || !showing) {
            showLeaderboardUserTooltipFor(userEl);
            return;
        }
        if (typeof openHeadToHead === 'function') openHeadToHead(username);
    });
    listEl.addEventListener('keydown', (event) => {
        const userEl = findTarget(event.target);
        if (!userEl) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (typeof openHeadToHead === 'function') openHeadToHead(String(userEl.dataset.username || '').trim());
        } else if (event.key === 'Escape') {
            hideLeaderboardUserTooltip(true);
        }
    });
    window.addEventListener('scroll', () => {
        if (lbTooltipAnchorEl) repositionLeaderboardUserTooltip();
        else hideLeaderboardUserTooltip(true);
    }, true);
    window.addEventListener('resize', repositionLeaderboardUserTooltip);
    setupLeaderboardTooltipElementHandlers();
    leaderboardHoverBound = true;
}

function setupLeaderboardTooltipElementHandlers() {
    if (lbTooltipHandlersBound) return;
    const tooltip = document.getElementById('lb-user-tooltip');
    if (!tooltip) return;
    tooltip.addEventListener('mouseenter', () => {
        if (lbTooltipHideTimer) {
            clearTimeout(lbTooltipHideTimer);
            lbTooltipHideTimer = null;
        }
    });
    tooltip.addEventListener('mouseleave', () => hideLeaderboardUserTooltip(false));
    tooltip.addEventListener('click', (event) => {
        const btn = event.target && typeof event.target.closest === 'function'
            ? event.target.closest('.lb-tooltip-compare[data-username]')
            : null;
        if (!btn) return;
        const username = String(btn.dataset.username || '').trim();
        hideLeaderboardUserTooltip(true);
        if (username && typeof openHeadToHead === 'function') openHeadToHead(username);
    });
    lbTooltipHandlersBound = true;
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
            showUiMessage('App installed.', 'success', 2200, 'top-left');
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
        b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false');
    });
    refreshLeaderboard();
}

function setLbMode(mode) {
    const safe = ['all', 'quotes', 'words', 'words30'].includes(mode) ? mode : 'all';
    lbActiveMode = safe;
    updateLeaderboardModeFilterUi();
    refreshLeaderboard();
}
window.setLbMode = setLbMode;

function updateLeaderboardModeFilterUi() {
    const wrap = document.getElementById('lb-mode-filter');
    if (!wrap) return;
    // The mode filter only applies to score boards (not the team goal list).
    wrap.style.display = lbActiveTab === 'community' ? 'none' : '';
    wrap.querySelectorAll('.lb-mode-btn').forEach((btn) => {
        const on = btn.dataset.mode === lbActiveMode;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
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
