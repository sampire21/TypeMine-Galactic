// ── Team goal (community hub), leaderboard boards, friends, head-to-head ────
const LB_EMPTY_COPY = 'Nobody on the board yet. Finish a run to claim #1.';
const LB_LOADING_COPY = 'Loading the board...';
const TEAM_GOAL_EMPTY_COPY = 'No words counted yet this week. Finish a run to add yours.';
const FRIENDS_CACHE_KEY = 'sampire-friends-cache';
const LB_MODE_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'quotes', label: 'Quotes' },
    { id: 'words', label: 'Random Words' },
    { id: 'words30', label: 'Timed' },
];
let lbFriendsCache = null; // { ts, friends, available }
let lbFriendsReqId = 0;
let lbCompareReqId = 0;

function lbModeLabel(mode) {
    const m = String(mode || '').trim();
    if (m === 'quotes') return 'Quotes';
    if (m === 'words') return 'Random Words';
    if (m === 'words30') return 'Timed 30s';
    if (m === 'adaptive') return 'Weak keys';
    if (m === 'all' || !m) return 'All';
    return m;
}

function lbFormatTime(seconds) {
    const t = Number(seconds) || 0;
    if (t <= 0) return '—';
    return `${Math.round(t)}s`;
}

function lbIsGuestRow(row) {
    const userId = String(row && row.userId || '');
    return userId.startsWith('guest:') || /^guest\b/i.test(String(row && row.username || ''));
}

function lbRowKeyForSelf() {
    if (currentUser && currentUser.id) return String(currentUser.id);
    return `guest:${getGuestSessionId()}`;
}

// ── Team goal (community hub) ───────────────────────────────────────────────
function getCommunityContributionRows() {
    const state = getCommunityWeeklyContributionState();
    return Object.values(state.entries || {})
        .map(entry => ({
            id: String(entry.id || ''),
            username: String(entry.name || 'Unknown'),
            damage: Math.max(0, Math.floor(Number(entry.words) || 0)),
        }))
        .filter(row => row.damage > 0)
        .sort((a, b) => b.damage - a.damage || a.username.localeCompare(b.username));
}

function mergeCommunityContributionRows(serverRows, localRows) {
    const merged = new Map();
    const upsert = (row) => {
        if (!row) return;
        const id = String(row.id || '').trim();
        const username = String(row.username || 'Unknown');
        const damage = Math.max(0, Math.floor(Number(row.damage ?? row.words) || 0));
        if (damage <= 0) return;
        const key = id || `name:${username.toLowerCase()}`;
        const prev = merged.get(key);
        if (!prev || damage > prev.damage) merged.set(key, { id, username, damage });
    };
    (Array.isArray(serverRows) ? serverRows : []).forEach(upsert);
    (Array.isArray(localRows) ? localRows : []).forEach(upsert);
    return [...merged.values()].sort((a, b) => b.damage - a.damage || a.username.localeCompare(b.username));
}

function getMyWordsThisWeek() {
    const state = getCommunityWeeklyContributionState();
    const who = getCommunityContributorInfo();
    const entry = state.entries && state.entries[who.id];
    return Math.max(0, Math.floor(Number(entry && entry.words) || 0));
}

function getCommunityShipSprite(kind = 'scout') {
    if (kind === 'player') {
        return `
            <svg class="community-ship-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M32 4 L38 10 L42 22 L42 45 L36 58 L28 58 L22 45 L22 22 L26 10 Z" fill="#f4f4f0" stroke="#171717" stroke-width="2"/>
                <path d="M28 58 L36 58 L35 62 L29 62 Z" fill="#f59e0b" stroke="#171717" stroke-width="2"/>
                <path d="M32 16 C35 16, 37 17, 38 19 L37 29 L27 29 L26 19 C27 17, 29 16, 32 16 Z" fill="#bfe0f4" stroke="#171717" stroke-width="2"/>
                <path d="M29 30 L35 30 L38 40 L34 58 L30 58 L26 40 Z" fill="#ef4444" stroke="#171717" stroke-width="2"/>
                <path d="M14 23 L22 23 L22 44 L16 52 L8 49 L5 35 Z" fill="#b21f14" stroke="#171717" stroke-width="2"/>
                <path d="M50 23 L42 23 L42 44 L48 52 L56 49 L59 35 Z" fill="#b21f14" stroke="#171717" stroke-width="2"/>
                <path d="M10 49 L16 52 L20 58 L13 57 L8 52 Z" fill="#8b1a12" stroke="#171717" stroke-width="2"/>
                <path d="M54 49 L48 52 L44 58 L51 57 L56 52 Z" fill="#8b1a12" stroke="#171717" stroke-width="2"/>
            </svg>
        `;
    }
    if (kind === 'mothership') {
        return `
            <svg class="community-ship-svg" viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <ellipse cx="33" cy="21" rx="25" ry="12" fill="#1298ae" stroke="#0a4f5c" stroke-width="2"/>
                <ellipse cx="32" cy="14" rx="15" ry="8" fill="#9fe8f2" stroke="#0a4f5c" stroke-width="2"/>
                <ellipse cx="16.5" cy="19" rx="3.5" ry="2.4" fill="#d4f7fd"/>
                <ellipse cx="30.5" cy="16.8" rx="3.5" ry="2.4" fill="#d4f7fd"/>
                <ellipse cx="44.5" cy="19" rx="3.5" ry="2.4" fill="#d4f7fd"/>
                <ellipse cx="22" cy="26.5" rx="3.1" ry="1.9" fill="#f472b6"/>
                <ellipse cx="33" cy="27.2" rx="3.1" ry="1.9" fill="#f472b6"/>
                <ellipse cx="44" cy="26.5" rx="3.1" ry="1.9" fill="#f472b6"/>
                <path d="M54 20 L63 21 L63 19 Z" fill="#a8edf7"/>
            </svg>
        `;
    }
    // scout and fighter share one saucer sprite
    return `
        <svg class="community-ship-svg" viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <ellipse cx="34" cy="20" rx="24" ry="11" fill="#1aa5b8" stroke="#0b5b67" stroke-width="2"/>
            <ellipse cx="33" cy="14" rx="14" ry="7" fill="#7dd6e3" stroke="#0b5b67" stroke-width="2"/>
            <ellipse cx="19" cy="18" rx="3.2" ry="2.2" fill="#c9f3fb"/>
            <ellipse cx="31" cy="16.5" rx="3.2" ry="2.2" fill="#c9f3fb"/>
            <ellipse cx="43" cy="18" rx="3.2" ry="2.2" fill="#c9f3fb"/>
            <ellipse cx="28" cy="25" rx="2.8" ry="1.7" fill="#ec4899"/>
            <ellipse cx="40" cy="25" rx="2.8" ry="1.7" fill="#ec4899"/>
            <path d="M54 20 L62 21 L62 19 Z" fill="#7dd6e3"/>
        </svg>
    `;
}

function getTeamGoalWeekRangeLabel() {
    const weekStart = getWeekStartDateUtc();
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return `${fmt(weekStart)} to ${fmt(weekEnd)}`;
}

function getTeamGoalHeadline(totalWords) {
    const total = Math.max(0, Math.floor(Number(totalWords) || 0));
    return `This week's team goal: type ${COMMUNITY_FLEET_TOTAL_HEALTH.toLocaleString()} words together (${total.toLocaleString()} so far)`;
}

function getCommunityHubCardHtml() {
    const rows = Array.isArray(_communityRowsCache) ? _communityRowsCache : [];
    const totalWords = rows.reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row.damage) || 0)), 0);
    const fleet = getCommunityFleetProgress(totalWords);
    const communityPct = Math.min(100, (totalWords / COMMUNITY_FLEET_TOTAL_HEALTH) * 100);
    const remaining = Math.max(0, COMMUNITY_FLEET_TOTAL_HEALTH - totalWords);
    const statusLine = fleet.allCleared
        ? 'Goal reached. Everyone who typed 1,000 or more words this week gets the Team player badge.'
        : `${remaining.toLocaleString()} words to go. Every word you finish in any run counts, logged in or as a guest.`;
    return `
        <div class="community-goal-card">
            <div class="community-goal-top">
                <span class="community-goal-title-wrap">
                    <span class="community-goal-icon" aria-hidden="true">🛸</span>
                    <span class="community-goal-title" id="team-goal-headline">${escapeHtml(getTeamGoalHeadline(totalWords))}</span>
                </span>
                <span class="community-goal-words">${escapeHtml(getTeamGoalWeekRangeLabel())}</span>
            </div>
            <div class="community-goal-sub">${escapeHtml(statusLine)}</div>
            <div class="community-goal-reward" title="Team player badge: type 1,000 words in a week where the team reaches its goal.">Reward: Team player badge. Type 1,000 words in a week where the team reaches its goal.</div>
            <div class="community-battle-scene" aria-hidden="true">
                <span class="community-starfield layer-a"></span>
                <span class="community-starfield layer-b"></span>
                <span class="community-player-ship">${getCommunityShipSprite('player')}</span>
                <span class="community-laser l1"></span>
                <span class="community-laser l2"></span>
                <span class="community-laser l3"></span>
                <span class="community-enemy-row">
                    ${fleet.levels.map(level => {
                        const shipKind = level.id === 'mothership' ? 'mothership' : 'scout';
                        const shipClass = level.cleared
                            ? 'community-enemy-ship cleared'
                            : (fleet.current.id === level.id ? 'community-enemy-ship active' : 'community-enemy-ship');
                        return `<span class="${shipClass}">${getCommunityShipSprite(shipKind)}</span>`;
                    }).join('')}
                </span>
            </div>
            <div class="community-goal-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${COMMUNITY_FLEET_TOTAL_HEALTH}" aria-valuenow="${totalWords}" aria-label="Team goal progress">
                <div class="community-goal-fill" style="width:${communityPct.toFixed(2)}%"></div>
            </div>
            <div class="community-fleet-levels">
                ${fleet.levels.map((level, idx) => {
                    const className = level.cleared ? 'community-fleet-level cleared' : (fleet.current.id === level.id ? 'community-fleet-level active' : 'community-fleet-level');
                    const stageLabel = level.cleared
                        ? 'Done'
                        : `${level.remainingHealth.toLocaleString()} words to go`;
                    return `<div class="${className}">
                        <div class="community-fleet-level-top">
                            <span>Stage ${idx + 1}: ${escapeHtml(level.name)} (${level.health.toLocaleString()} words)</span>
                            <span>${stageLabel}</span>
                        </div>
                        <div class="community-fleet-health">
                            <div class="community-fleet-health-fill" style="width:${Math.max(0, Math.min(100, 100 - level.remainingPercent)).toFixed(2)}%"></div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>
    `;
}

function renderCommunityHub() {
    const wrap = document.getElementById('community-hub-content');
    if (!wrap) return;
    const rows = Array.isArray(_communityRowsCache) ? _communityRowsCache : [];
    const myWords = getMyWordsThisWeek();
    const boardHtml = rows.length === 0
        ? `<div class="history-empty">${TEAM_GOAL_EMPTY_COPY}</div>`
        : `<div class="community-hub-list">${rows.map((row, idx) => `
            <div class="community-hub-row">
                <span class="community-hub-rank">#${idx + 1}</span>
                <span class="community-hub-user">${escapeHtml(row.username)}</span>
                <span class="community-hub-dmg">${Number(row.damage || 0).toLocaleString()}</span>
            </div>
        `).join('')}</div>`;
    wrap.innerHTML = `
        <div class="community-hub-grid">
            <div>${getCommunityHubCardHtml()}</div>
            <div class="community-hub-right">
                <div class="community-hub-title">Words this week</div>
                <div class="community-hub-you">Your words this week: <strong>${myWords.toLocaleString()}</strong></div>
                ${boardHtml}
            </div>
        </div>
    `;
}

async function fetchTeamGoalRows() {
    const localRows = getCommunityContributionRows();
    const url = '/api/leaderboard?community=1&limit=1000';
    const cloud = await socialDetectCloudMode();
    if (cloud) {
        try {
            const cloudOut = await apiFetchCloudFirst(url);
            const serverRows = Array.isArray(cloudOut && cloudOut.contributions) ? cloudOut.contributions : (Array.isArray(cloudOut && cloudOut.rows) ? cloudOut.rows : []);
            return mergeCommunityContributionRows(serverRows, localRows);
        } catch (e) {
            if (!shouldAllowLocalFallback(e)) return localRows;
        }
    }
    try {
        const out = await localApiFetch(url, {}, buildAuthHeaders({}));
        const serverRows = Array.isArray(out && out.contributions) ? out.contributions : [];
        return mergeCommunityContributionRows(serverRows, localRows);
    } catch (e) {
        return localRows;
    }
}

async function openCommunityHub() {
    const modal = document.getElementById('community-hub-modal');
    if (!modal) return;
    openModal(modal);
    renderCommunityHub();
    const reqId = ++communityHubReqId;
    const rows = await fetchTeamGoalRows();
    if (reqId !== communityHubReqId) return;
    _communityRowsCache = rows;
    renderCommunityHub();
}

function closeCommunityHub() {
    const modal = document.getElementById('community-hub-modal');
    if (!modal) return;
    closeModal(modal);
}

function handleCommunityHubBackdrop(event) {
    if (event && event.target === document.getElementById('community-hub-modal')) closeCommunityHub();
}

// ── Score boards (All time, This week, Friends board) ───────────────────────
// Name colour and title: the logged-in player's come from the local sampire-title record; other
// players' titles come from the board row (the server copies it at submit time). Colour for others
// is the level tier.
function lbUserCellHtml(row, extraClass = '') {
    const username = String(row.username || 'Unknown').trim() || 'Unknown';
    const safeUsername = escapeHtml(username);
    const level = Math.max(1, Number(row.level) || 1);
    const tier = getLeaderboardLevelTier(level);
    const hasLevel = row.level !== undefined && row.level !== null;
    const tierClass = hasLevel ? ` ${tier.cssClass}` : '';
    const titleAttr = hasLevel ? ` title="${escapeHtml(lbLevelTitle(level))}"` : '';
    const isSelf = !!(currentUser && normalizeSummaryUsername(currentUser.username) === normalizeSummaryUsername(username));
    const self = isSelf && typeof lbSelfCosmetics === 'function' ? lbSelfCosmetics() : null;
    const playerTitle = lbRowTitle(row, self);
    const styleAttr = self && self.nameColorValue ? ` style="color:${self.nameColorValue}"` : '';
    const titleHtml = playerTitle ? ` <span class="lb-user-title">${escapeHtml(playerTitle)}</span>` : '';
    const ariaBits = [playerTitle ? escapeHtml(playerTitle) : '', hasLevel ? escapeHtml(lbLevelTitle(level)) : ''].filter(Boolean).map((b) => `, ${b}`).join('');
    return `<span class="lb-user lb-user-hover${tierClass}${extraClass ? ` ${extraClass}` : ''}" data-username="${safeUsername}" tabindex="0" role="button" aria-label="${safeUsername}${ariaBits}. Show stats"${titleAttr}${styleAttr}>${safeUsername}${titleHtml}</span>`;
}

function lbRowTitle(row, self = null) {
    const local = self && self.title ? self.title : '';
    const fromRow = String(row && row.title || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24);
    return local || fromRow;
}

function lbScoreRowHtml(row, idx, { crown = false, self = false } = {}) {
    const crownBadge = crown ? '<span class="lb-crown" title="Top 10% this week" aria-label="Top 10% this week">&#128081;</span>' : '';
    return `
        <span class="lb-rank"><span class="lb-rank-orb">${idx + 1}</span>${crownBadge}</span>
        ${lbUserCellHtml(row, self ? 'lb-user-self' : '')}
        <span class="lb-wpm">${Math.round(Number(row.wpm) || 0)}<span class="lb-unit"> WPM</span></span>
        <span class="lb-acc"><span class="lb-cell-label">Accuracy </span>${Math.round(Number(row.accuracy) || 0)}%</span>
        <span class="lb-mode">${escapeHtml(lbModeLabel(row.mode))}</span>
        <span class="lb-time">${escapeHtml(lbFormatTime(row.time))}</span>
    `;
}

function lbScoreHeaderHtml() {
    return `
        <div class="leaderboard-row lb-head lb-score-row" aria-hidden="true">
            <span class="lb-rank">#</span>
            <span class="lb-user">Name</span>
            <span class="lb-wpm">WPM</span>
            <span class="lb-acc">Accuracy</span>
            <span class="lb-mode">Mode</span>
            <span class="lb-time">Time</span>
        </div>
    `;
}

function lbYourRankHtml(yourRank, { selfOnBoard = false } = {}) {
    if (yourRank && Number(yourRank.rank) > 0) {
        return `<div class="leaderboard-row lb-your-rank" data-testid="lb-your-rank">
            <span class="lb-rank"><span class="lb-rank-orb">${Math.round(Number(yourRank.rank))}</span></span>
            <span class="lb-user">Your rank</span>
            <span class="lb-wpm">${Math.round(Number(yourRank.wpm) || 0)}<span class="lb-unit"> WPM</span></span>
            <span class="lb-your-rank-note">${selfOnBoard ? 'That is you, highlighted above.' : 'Keep going to climb.'}</span>
        </div>`;
    }
    const copy = currentUser
        ? "You're not on this board yet. Finish a run to get ranked."
        : 'Log in to get ranked on the shared board.';
    return `<div class="leaderboard-row lb-your-rank lb-your-rank-empty" data-testid="lb-your-rank"><span class="lb-your-rank-note">${copy}</span></div>`;
}

function renderScoreLeaderboardRows(rows, yourRank = null, meta = {}) {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    hideLeaderboardUserTooltip(true);
    listEl.className = 'leaderboard-list lb-view-scores';
    const visible = Array.isArray(rows) ? rows : [];
    const selfKey = normalizeSummaryUsername(currentUser && currentUser.username);
    const noteHtml = meta && meta.note ? `<div class="lb-board-note">${escapeHtml(meta.note)}</div>` : '';
    if (visible.length === 0) {
        listEl.innerHTML = `${noteHtml}<div class="history-empty">${LB_EMPTY_COPY}</div>${lbYourRankHtml(null)}`;
        return;
    }
    const crownsOn = lbActiveTab === 'weekly' && visible.length >= 10;
    const crownCutoff = crownsOn ? Math.max(1, Math.ceil(visible.length * 0.1)) : 0;
    let selfOnBoard = false;
    const rowsHtml = visible.map((row, idx) => {
        const isSelf = !!(selfKey && normalizeSummaryUsername(row.username) === selfKey);
        if (isSelf) selfOnBoard = true;
        const crown = crownsOn && idx < crownCutoff;
        const classes = ['leaderboard-row', 'lb-score-row'];
        if (crown) classes.push('lb-crown-row');
        if (isSelf) classes.push('lb-row-self');
        return `<div class="${classes.join(' ')}">${lbScoreRowHtml(row, idx, { crown, self: isSelf })}</div>`;
    }).join('');
    listEl.innerHTML = `${noteHtml}${lbScoreHeaderHtml()}${rowsHtml}${lbYourRankHtml(yourRank, { selfOnBoard })}`;
}

function renderCommunityLeaderboardRows(rowsOverride = null) {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    hideLeaderboardUserTooltip(true);
    listEl.className = 'leaderboard-list lb-view-team';
    const rows = Array.isArray(rowsOverride) ? rowsOverride : _communityRowsCache;
    const totalWords = rows.reduce((sum, row) => sum + row.damage, 0);
    const headline = `<div class="lb-board-note lb-team-headline">${escapeHtml(getTeamGoalHeadline(totalWords))} <button type="button" class="lb-link-btn" onclick="openCommunityHub()">Open team goal</button></div>`;
    if (rows.length === 0) {
        listEl.innerHTML = `${headline}<div class="history-empty">${TEAM_GOAL_EMPTY_COPY}</div>`;
        return;
    }
    listEl.innerHTML = `${headline}
        <div class="leaderboard-row lb-head lb-contrib-row" aria-hidden="true">
            <span class="lb-rank">#</span>
            <span class="lb-user">Name</span>
            <span class="lb-wpm">Words this week</span>
            <span class="lb-acc">Share</span>
        </div>
    `;
    rows.forEach((row, idx) => {
        const username = String(row.username || 'Unknown').trim() || 'Unknown';
        const isGuestPool = /^guest/i.test(username);
        const safeUsername = escapeHtml(username);
        const share = totalWords > 0 ? (row.damage / totalWords) * 100 : 0;
        const el = document.createElement('div');
        el.className = 'leaderboard-row lb-contrib-row';
        el.innerHTML = `
            <span class="lb-rank"><span class="lb-rank-orb">${idx + 1}</span></span>
            ${isGuestPool ? `<span class="lb-user">${safeUsername}</span>` : `<span class="lb-user lb-user-hover" data-username="${safeUsername}" tabindex="0" role="button" aria-label="${safeUsername}. Show stats">${safeUsername}</span>`}
            <span class="lb-wpm">${row.damage.toLocaleString()}<span class="lb-unit"> words</span></span>
            <span class="lb-acc">${share.toFixed(1)}%</span>
        `;
        listEl.appendChild(el);
    });
}

function renderLeaderboardRows(rows) {
    _lbRowsCache = rows;
    if (lbActiveTab === 'community') {
        renderCommunityLeaderboardRows(_communityRowsCache);
    } else {
        renderScoreLeaderboardRows(rows);
    }
}

function lbBuildBoardUrl(tab, mode) {
    const safeTab = tab === 'weekly' ? 'weekly' : (tab === 'friends' ? 'friends' : 'alltime');
    const safeMode = ['quotes', 'words', 'words30'].includes(mode) ? mode : 'all';
    return `/api/leaderboard?tab=${safeTab}&mode=${safeMode}&limit=100`;
}

function lbComputeRankFromRows(rows, matchFn) {
    const idx = rows.findIndex(matchFn);
    if (idx < 0) return null;
    return { rank: idx + 1, wpm: Math.round(Number(rows[idx].wpm) || 0) };
}

async function fetchCloudScoreBoard(tab, mode) {
    const out = await apiFetchCloudFirst(lbBuildBoardUrl(tab, mode));
    const raw = Array.isArray(out && out.rows) ? out.rows : (Array.isArray(out && out.leaderboard) ? out.leaderboard : []);
    // Guests never appear on the shared board. The server keeps the sort order; we do not re-sort.
    const rows = raw.filter((row) => row && !lbIsGuestRow(row));
    let yourRank = (out && Object.prototype.hasOwnProperty.call(out, 'yourRank')) ? (out.yourRank || null) : undefined;
    if (yourRank === undefined) {
        // Older API without yourRank: find yourself on the visible rows.
        const selfKey = normalizeSummaryUsername(currentUser && currentUser.username);
        yourRank = selfKey ? lbComputeRankFromRows(rows, (r) => normalizeSummaryUsername(r.username) === selfKey) : null;
    }
    return { rows, yourRank, weekKey: out && out.weekKey ? String(out.weekKey) : '', source: 'cloud' };
}

async function fetchLocalScoreBoard(tab, mode) {
    const safeMode = ['quotes', 'words', 'words30'].includes(mode) ? `&mode=${mode}` : '';
    const out = await localApiFetch(`/api/leaderboard?limit=100${safeMode}`, {}, buildAuthHeaders({}));
    let rows = Array.isArray(out && out.leaderboard) ? out.leaderboard : [];
    if (tab === 'weekly') {
        // No server in local mode, so the week window is applied here (device time).
        const ws = getWeekStart();
        rows = rows.filter((r) => (Number(r.date) || 0) >= ws);
    }
    rows = rows.map((r) => {
        if (!lbIsGuestRow(r)) return r;
        return { ...r, username: getGuestDisplayNameFromLocation({ city: r.city, country: r.country }) };
    });
    const selfId = lbRowKeyForSelf();
    const selfKey = normalizeSummaryUsername(currentUser && currentUser.username);
    const yourRank = lbComputeRankFromRows(rows, (r) => String(r.userId || '') === selfId || (selfKey && normalizeSummaryUsername(r.username) === selfKey));
    return { rows, yourRank, weekKey: '', source: 'local', note: 'Local mode: this board only shows runs saved in this browser.' };
}

async function refreshLeaderboard(force = false) {
    const reqId = ++leaderboardReqId;
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    updateLeaderboardModeFilterUi();
    hideLeaderboardUserTooltip(true);
    closeHeadToHead(false);
    if (lbActiveTab === 'friends') {
        await renderFriendsTab(reqId, force);
        return;
    }
    if (lbActiveTab === 'community') {
        listEl.className = 'leaderboard-list lb-view-team';
        listEl.innerHTML = `<div class="history-empty">${LB_LOADING_COPY}</div>`;
        const rows = await fetchTeamGoalRows();
        if (reqId !== leaderboardReqId) return;
        _communityRowsCache = rows;
        renderCommunityLeaderboardRows(_communityRowsCache);
        if (document.getElementById('community-hub-modal')?.classList.contains('show')) renderCommunityHub();
        return;
    }
    const cacheKey = `${lbActiveTab}|${lbActiveMode}`;
    const cached = lbBoardCache.get(cacheKey);
    if (!force && cached && (Date.now() - cached.ts) < LB_BOARD_CACHE_TTL_MS) {
        renderScoreLeaderboardRows(cached.data.rows, cached.data.yourRank, cached.data);
        return;
    }
    listEl.className = 'leaderboard-list lb-view-scores';
    listEl.innerHTML = `<div class="history-empty">${LB_LOADING_COPY}</div>`;
    const cloud = await socialDetectCloudMode();
    if (reqId !== leaderboardReqId) return;
    let data = null;
    try {
        data = cloud
            ? await fetchCloudScoreBoard(lbActiveTab, lbActiveMode)
            : await fetchLocalScoreBoard(lbActiveTab, lbActiveMode);
    } catch (e) {
        if (reqId !== leaderboardReqId) return;
        if (cloud && shouldAllowLocalFallback(e) && !socialIsCloudMode()) {
            try { data = await fetchLocalScoreBoard(lbActiveTab, lbActiveMode); } catch (inner) { data = null; }
        }
        if (!data) {
            const safeMessage = escapeHtml(e && e.message ? e.message : 'unknown error');
            listEl.innerHTML = `<div class="history-empty">The board could not be loaded (${safeMessage}). Try again in a moment.</div>`;
            return;
        }
    }
    if (reqId !== leaderboardReqId) return;
    lbBoardCache.set(cacheKey, { ts: Date.now(), data });
    _lbRowsCache = data.rows;
    renderScoreLeaderboardRows(data.rows, data.yourRank, data);
}

function openLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    if (!modal) return;
    openModal(modal);
    setupLeaderboardHoverHandlers();
    refreshLeaderboard();
}

function closeLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    if (!modal) return;
    hideLeaderboardUserTooltip(true);
    closeHeadToHead(false);
    closeModal(modal);
}

function handleLeaderboardBackdrop(event) {
    const modal = document.getElementById('leaderboard-modal');
    if (event && event.target === modal) closeLeaderboard();
}

// ── Friends ─────────────────────────────────────────────────────────────────
// myBestWpm is null until we have seen the player's all-time best before a run; the all-time
// overtake toast only fires once it is known, so a first run never fires it for every friend.
function loadFriendsCache() {
    const raw = loadLocalJson(FRIENDS_CACHE_KEY, null);
    if (!raw || typeof raw !== 'object') return { ts: 0, weekKey: '', friends: [], myWeeklyBest: 0, myBestWpm: null };
    const best = raw.myBestWpm === null || raw.myBestWpm === undefined ? null : Math.max(0, Number(raw.myBestWpm) || 0);
    return {
        ts: Number(raw.ts) || 0,
        weekKey: String(raw.weekKey || ''),
        friends: Array.isArray(raw.friends) ? raw.friends : [],
        myWeeklyBest: Math.max(0, Number(raw.myWeeklyBest) || 0),
        myBestWpm: best,
    };
}

function saveFriendsCache(cache) {
    const best = cache.myBestWpm === null || cache.myBestWpm === undefined ? null : Math.max(0, Number(cache.myBestWpm) || 0);
    saveLocalJson(FRIENDS_CACHE_KEY, {
        ts: Number(cache.ts) || Date.now(),
        weekKey: String(cache.weekKey || getWeekKeyUtc()),
        friends: Array.isArray(cache.friends) ? cache.friends.slice(0, 200) : [],
        myWeeklyBest: Math.max(0, Number(cache.myWeeklyBest) || 0),
        myBestWpm: best,
    });
}

function getMyAllTimeBestWpmLocal() {
    try { return Math.max(0, Math.round(Number(getLifetimeStatsSummary().bestWpm) || 0)); } catch (e) { return 0; }
}

function normalizeFriendRow(row) {
    return {
        id: String(row && row.id || ''),
        username: String(row && row.username || '').trim(),
        bestWpm: Math.max(0, Math.round(Number(row && row.bestWpm) || 0)),
        weeklyBestWpm: Math.max(0, Math.round(Number(row && row.weeklyBestWpm) || 0)),
        level: Math.max(1, Math.round(Number(row && row.level) || 1)),
        streak: Math.max(0, Math.round(Number(row && row.streak) || 0)),
        lastSeenAt: Number(row && row.lastSeenAt) || 0,
    };
}

// Returns { friends, available }. available=false means the server has no friends route yet.
async function fetchFriendsList(force = false) {
    if (!currentUser) return { friends: [], available: true };
    if (!force && lbFriendsCache && (Date.now() - lbFriendsCache.ts) < LB_BOARD_CACHE_TTL_MS) return lbFriendsCache;
    let result;
    try {
        const out = await apiFetchCloudFirst('/api/friends');
        const friends = (Array.isArray(out && out.friends) ? out.friends : []).map(normalizeFriendRow).filter((f) => f.username);
        result = { ts: Date.now(), friends, available: true };
        const cache = loadFriendsCache();
        const weekKey = getWeekKeyUtc();
        saveFriendsCache({
            ts: Date.now(),
            weekKey,
            friends,
            myWeeklyBest: cache.weekKey === weekKey ? cache.myWeeklyBest : 0,
            myBestWpm: cache.myBestWpm === null ? getMyAllTimeBestWpmLocal() : Math.max(cache.myBestWpm, getMyAllTimeBestWpmLocal()),
        });
    } catch (e) {
        const status = Number(e && e.status) || 0;
        const cache = loadFriendsCache();
        result = { ts: Date.now(), friends: cache.friends.map(normalizeFriendRow), available: status !== 404, error: e && e.message ? String(e.message) : '' };
        if (status === 404) result.available = false;
    }
    lbFriendsCache = result;
    return result;
}

function getMyWeeklyBestWpmLocal() {
    const ws = getWeekStartDateUtc().getTime();
    return loadHistory().reduce((best, h) => ((Number(h.date) || 0) >= ws ? Math.max(best, Number(h.wpm) || 0) : best), 0);
}

function getMyFriendRow() {
    const streak = typeof getEffectiveStreak === 'function' ? getEffectiveStreak() : (getStreakData().streak || 0);
    const lifetime = getLifetimeStatsSummary();
    return normalizeFriendRow({
        id: currentUser ? currentUser.id : '',
        username: currentUser ? currentUser.username : 'You',
        bestWpm: lifetime.bestWpm,
        weeklyBestWpm: Math.max(getMyWeeklyBestWpmLocal(), loadFriendsCache().myWeeklyBest),
        level: getLevel(getTotalXP()),
        streak,
    });
}

function friendRowHtml(row, { self = false } = {}) {
    const safe = escapeHtml(row.username);
    const mine = self && typeof lbSelfCosmetics === 'function' ? lbSelfCosmetics() : null;
    const nameCell = self
        ? `<span class="lb-user lb-user-self"${mine && mine.nameColorValue ? ` style="color:${mine.nameColorValue}"` : ''}>${safe}${mine && mine.title ? ` <span class="lb-user-title">${escapeHtml(mine.title)}</span>` : ''} <span class="lb-you-tag">you</span></span>`
        : lbUserCellHtml(row);
    const actions = self
        ? ''
        : `<span class="lb-friend-actions">
            <button type="button" class="lb-mini-btn" onclick="openHeadToHead('${safe}')" aria-label="Compare with ${safe}">Compare</button>
            <button type="button" class="lb-mini-btn lb-mini-danger" onclick="removeFriend('${safe}')" aria-label="Remove ${safe} from friends">Remove</button>
        </span>`;
    return `<div class="leaderboard-row lb-friend-row${self ? ' lb-row-self' : ''}" data-friend="${safe}">
        ${nameCell}
        <span class="lb-wpm"><span class="lb-cell-label">Best </span>${row.bestWpm}<span class="lb-unit"> WPM</span></span>
        <span class="lb-acc"><span class="lb-cell-label">This week </span>${row.weeklyBestWpm > 0 ? `${row.weeklyBestWpm} WPM` : '—'}</span>
        <span class="lb-mode"><span class="lb-cell-label">Level </span>${row.level}</span>
        <span class="lb-time"><span class="lb-cell-label">Streak </span>${row.streak} day${row.streak === 1 ? '' : 's'}</span>
        ${actions}
    </div>`;
}

function getFriendInviteLink() {
    if (!currentUser || !currentUser.username) return '';
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('addfriend', String(currentUser.username));
    return url.toString();
}

async function copyTextToClipboard(text) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (e) {}
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return !!ok;
    } catch (e) {
        return false;
    }
}

async function copyFriendInviteLink() {
    const link = getFriendInviteLink();
    if (!link) {
        showUiMessage('Log in to get your invite link.', 'info', 2200, 'top-left');
        return;
    }
    const ok = await copyTextToClipboard(link);
    showUiMessage(ok ? 'Invite link copied. Send it to a friend.' : `Copy this link: ${link}`, ok ? 'success' : 'info', 3200, 'top-left');
}
window.copyFriendInviteLink = copyFriendInviteLink;

function setFriendsNote(message, isError = false) {
    const note = document.getElementById('lb-friends-note');
    if (!note) return;
    note.textContent = message || '';
    note.classList.toggle('error', !!isError);
}

async function renderFriendsTab(reqId, force = false) {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    listEl.className = 'leaderboard-list lb-view-friends';
    if (!currentUser) {
        listEl.innerHTML = `
            <div class="lb-friends">
                <div class="history-empty">Log in to add friends and see how you compare.</div>
                <div class="lb-friend-login-row"><button type="button" class="btn btn-primary" onclick="closeLeaderboard(); openLoginModal();">Log in</button></div>
            </div>`;
        return;
    }
    const myReq = ++lbFriendsReqId;
    listEl.innerHTML = `<div class="history-empty">${LB_LOADING_COPY}</div>`;
    const result = await fetchFriendsList(force);
    if (reqId !== leaderboardReqId || myReq !== lbFriendsReqId) return;
    const me = getMyFriendRow();
    const friends = result.friends.slice().sort((a, b) => b.weeklyBestWpm - a.weeklyBestWpm || b.bestWpm - a.bestWpm || a.username.localeCompare(b.username));
    const unavailableNote = result.available
        ? ''
        : '<div class="lb-board-note">Friends are not available on this server yet. Your saved list is shown.</div>';
    const errorNote = result.available && result.error
        ? `<div class="lb-board-note error">Could not refresh friends (${escapeHtml(result.error)}).</div>`
        : '';
    const listHtml = friends.length === 0
        ? '<div class="history-empty">No friends added yet. Add one by username or send your invite link.</div>'
        : friends.map((f) => friendRowHtml(f)).join('');
    listEl.innerHTML = `
        <div class="lb-friends">
            <form class="lb-friend-add" onsubmit="return submitAddFriend(event)">
                <label class="lb-friend-add-label" for="lb-friend-input">Add a friend by username</label>
                <div class="lb-friend-add-row">
                    <input id="lb-friend-input" type="text" maxlength="24" autocomplete="off" placeholder="username">
                    <button type="submit" class="btn btn-primary" id="lb-friend-add-btn">Add</button>
                    <button type="button" class="btn btn-ghost" onclick="copyFriendInviteLink()">Copy invite link</button>
                </div>
                <div class="lb-friends-note" id="lb-friends-note" aria-live="polite"></div>
            </form>
            ${unavailableNote}${errorNote}
            <div class="leaderboard-row lb-head lb-friend-row" aria-hidden="true">
                <span class="lb-user">Name</span>
                <span class="lb-wpm">Best</span>
                <span class="lb-acc">This week</span>
                <span class="lb-mode">Level</span>
                <span class="lb-time">Streak</span>
                <span class="lb-friend-actions"></span>
            </div>
            ${friendRowHtml(me, { self: true })}
            ${listHtml}
            <div id="lb-friends-board"></div>
        </div>
    `;
    if (friends.length > 0 && result.available) renderFriendsBoardSection(reqId);
}

// Best runs by you and your friends, from GET /api/leaderboard?tab=friends (respects the mode filter).
async function renderFriendsBoardSection(reqId) {
    const wrap = document.getElementById('lb-friends-board');
    if (!wrap) return;
    const cacheKey = `friends|${lbActiveMode}`;
    const cached = lbBoardCache.get(cacheKey);
    let data = null;
    if (cached && (Date.now() - cached.ts) < LB_BOARD_CACHE_TTL_MS) {
        data = cached.data;
    } else {
        try {
            data = await fetchCloudScoreBoard('friends', lbActiveMode);
            lbBoardCache.set(cacheKey, { ts: Date.now(), data });
        } catch (e) {
            return; // older server: no friends board, the list above is enough
        }
    }
    if (reqId !== leaderboardReqId || !document.getElementById('lb-friends-board')) return;
    if (!data || !Array.isArray(data.rows) || data.rows.length === 0) return;
    const selfKey = normalizeSummaryUsername(currentUser && currentUser.username);
    const rowsHtml = data.rows.map((row, idx) => {
        const isSelf = !!(selfKey && normalizeSummaryUsername(row.username) === selfKey);
        return `<div class="leaderboard-row lb-score-row${isSelf ? ' lb-row-self' : ''}">${lbScoreRowHtml(row, idx, { self: isSelf })}</div>`;
    }).join('');
    wrap.innerHTML = `<div class="profile-section-title lb-section-title">Best runs (${escapeHtml(lbModeLabel(lbActiveMode))})</div>${lbScoreHeaderHtml()}${rowsHtml}`;
}

async function submitAddFriend(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    const input = document.getElementById('lb-friend-input');
    const username = String(input && input.value || '').trim();
    if (!username) {
        setFriendsNote('Type a username first.', true);
        return false;
    }
    if (currentUser && normalizeSummaryUsername(username) === normalizeSummaryUsername(currentUser.username)) {
        setFriendsNote("That's you. Add someone else.", true);
        return false;
    }
    const btn = document.getElementById('lb-friend-add-btn');
    if (btn) btn.disabled = true;
    try {
        await addFriend(username);
        if (input) input.value = '';
        lbFriendsCache = null;
        lbBoardCache.delete(`friends|${lbActiveMode}`);
        if (lbActiveTab === 'friends') await refreshLeaderboard(true);
        setFriendsNote(`Added ${username}.`);
    } catch (e) {
        const status = Number(e && e.status) || 0;
        const msg = status === 404
            ? 'Friends are not available on this server yet.'
            : (e && e.message ? String(e.message) : 'Could not add that friend.');
        setFriendsNote(msg, true);
    } finally {
        if (btn) btn.disabled = false;
    }
    return false;
}
window.submitAddFriend = submitAddFriend;

async function addFriend(username) {
    if (!currentUser) throw new Error('Log in to add friends.');
    return apiFetchCloudFirst('/api/friends', {
        method: 'POST',
        body: JSON.stringify({ username: String(username || '').trim() }),
    });
}

async function removeFriend(username) {
    const name = String(username || '').trim();
    if (!name || !currentUser) return;
    try {
        await apiFetchCloudFirst(`/api/friends/${encodeURIComponent(name)}`, { method: 'DELETE' });
        showUiMessage(`Removed ${name} from your friends.`, 'info', 2200, 'top-left');
    } catch (e) {
        const status = Number(e && e.status) || 0;
        showUiMessage(status === 404 ? 'Friends are not available on this server yet.' : `Could not remove ${name}: ${e && e.message ? e.message : 'unknown error'}`, 'error', 3000, 'top-left');
        return;
    }
    const cache = loadFriendsCache();
    cache.friends = cache.friends.filter((f) => normalizeSummaryUsername(f.username) !== normalizeSummaryUsername(name));
    saveFriendsCache(cache);
    lbFriendsCache = null;
    lbBoardCache.delete(`friends|${lbActiveMode}`);
    if (lbActiveTab === 'friends') refreshLeaderboard(true);
}
window.removeFriend = removeFriend;

// Toast when a run beats a friend's weekly best or all-time best. Listens for the shared run-finished event.
function checkFriendOvertake(summary) {
    if (!summary || summary.counted === false) return;
    const wpm = Math.round(Number(summary.wpm) || 0);
    if (wpm <= 0) return;
    const cache = loadFriendsCache();
    const weekKey = getWeekKeyUtc();
    if (cache.weekKey !== weekKey) {
        cache.weekKey = weekKey;
        cache.myWeeklyBest = 0;
    }
    const friends = cache.friends.map(normalizeFriendRow);
    const prevBest = Math.max(cache.myWeeklyBest, 0);
    const passed = friends
        .filter((f) => f.weeklyBestWpm > 0 && prevBest <= f.weeklyBestWpm && wpm > f.weeklyBestWpm)
        .sort((a, b) => b.weeklyBestWpm - a.weeklyBestWpm);
    cache.myWeeklyBest = Math.max(prevBest, wpm);
    // All-time: only when we knew the previous best (lifetime stats already include this run).
    const prevAllTime = cache.myBestWpm;
    const passedAllTime = (prevAllTime !== null && summary.isPB)
        ? friends
            .filter((f) => f.bestWpm > 0 && prevAllTime <= f.bestWpm && wpm > f.bestWpm)
            .sort((a, b) => b.bestWpm - a.bestWpm)
        : [];
    cache.myBestWpm = Math.max(prevAllTime === null ? 0 : prevAllTime, wpm, getMyAllTimeBestWpmLocal());
    saveFriendsCache(cache);
    if (passedAllTime.length > 0) {
        const top = passedAllTime[0];
        const extra = passedAllTime.length > 1 ? ` and ${passedAllTime.length - 1} more` : '';
        showUiMessage(`You passed ${top.username}'s best, ${top.bestWpm} WPM${extra}`, 'success', 3600, 'top-left');
        return;
    }
    if (passed.length === 0) return;
    const top = passed[0];
    const extra = passed.length > 1 ? ` and ${passed.length - 1} more` : '';
    showUiMessage(`You passed ${top.username}'s weekly best, ${top.weeklyBestWpm} WPM${extra}`, 'success', 3600, 'top-left');
}
window.checkFriendOvertake = checkFriendOvertake;

document.addEventListener('typemine:run-finished', (event) => {
    try {
        checkFriendOvertake((event && event.detail) || window.lastRunSummary);
    } catch (e) {}
});

// ── Shared banner (friend invites, shared results) ──────────────────────────
function showSocialBanner({ id = 'social-banner', text = '', actions = [] } = {}) {
    let banner = document.getElementById(id);
    if (!banner) {
        banner = document.createElement('div');
        banner.id = id;
        banner.className = 'social-banner';
        banner.setAttribute('role', 'status');
        document.body.appendChild(banner);
    }
    banner.innerHTML = `<span class="social-banner-text">${escapeHtml(text)}</span><span class="social-banner-actions"></span>`;
    const actionsEl = banner.querySelector('.social-banner-actions');
    actions.forEach((action) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = action.primary ? 'btn btn-primary social-banner-btn primary' : 'btn btn-ghost social-banner-btn';
        btn.textContent = String(action.label || 'OK');
        btn.addEventListener('click', () => {
            try { if (typeof action.onClick === 'function') action.onClick(); } catch (e) {}
            if (action.closes !== false) hideSocialBanner(id);
        });
        actionsEl.appendChild(btn);
    });
    banner.classList.add('show');
    return banner;
}

function hideSocialBanner(id = 'social-banner') {
    const banner = document.getElementById(id);
    if (banner) banner.classList.remove('show');
}

function removeUrlParam(name) {
    try {
        const url = new URL(location.href);
        if (!url.searchParams.has(name)) return;
        url.searchParams.delete(name);
        history.replaceState(null, '', url.pathname + (url.search || '') + (url.hash || ''));
    } catch (e) {}
}

function checkFriendInviteParam() {
    let name = '';
    try { name = String(new URLSearchParams(location.search).get('addfriend') || '').trim(); } catch (e) { return; }
    if (!name || !/^[A-Za-z0-9_.-]{1,24}$/.test(name)) return;
    const renderBanner = () => {
        const loggedIn = !!currentUser;
        if (loggedIn && normalizeSummaryUsername(currentUser.username) === normalizeSummaryUsername(name)) {
            removeUrlParam('addfriend');
            return;
        }
        showSocialBanner({
            id: 'friend-invite-banner',
            text: loggedIn ? `Add ${name} as a friend?` : `${name} wants to be your friend. Log in to add them.`,
            actions: [
                {
                    label: loggedIn ? 'Add friend' : 'Log in',
                    primary: true,
                    closes: loggedIn,
                    onClick: async () => {
                        if (!currentUser) {
                            if (typeof openLoginModal === 'function') openLoginModal();
                            return;
                        }
                        try {
                            await addFriend(name);
                            showUiMessage(`Added ${name} as a friend.`, 'success', 2600, 'top-left');
                            lbFriendsCache = null;
                            removeUrlParam('addfriend');
                        } catch (e) {
                            showUiMessage(`Could not add ${name}: ${e && e.message ? e.message : 'unknown error'}`, 'error', 3200, 'top-left');
                        }
                    },
                },
                { label: 'Not now', onClick: () => removeUrlParam('addfriend') },
            ],
        });
    };
    renderBanner();
    // The session is restored a moment after load; re-render once we know who is logged in.
    let tries = 0;
    const timer = setInterval(() => {
        tries += 1;
        if (currentUser || tries >= 12) {
            clearInterval(timer);
            if (document.getElementById('friend-invite-banner')?.classList.contains('show')) renderBanner();
        }
    }, 500);
}

// Warm the friends cache so the overtake toast works even if the Friends tab was never opened.
function warmFriendsCacheIfLoggedIn() {
    if (!currentUser) return;
    fetchFriendsList(false).catch(() => {});
}

window.addEventListener('DOMContentLoaded', () => {
    try { checkFriendInviteParam(); } catch (e) {}
    setTimeout(warmFriendsCacheIfLoggedIn, 4000);
});

// ── Head-to-head ────────────────────────────────────────────────────────────
function getLocalSelfSummary() {
    const history = loadHistory();
    const lifetime = getLifetimeStatsSummary();
    const runs = Math.max(lifetime.tests, history.length);
    const avgWpm = history.length ? history.reduce((a, h) => a + (Number(h.wpm) || 0), 0) / history.length : null;
    const avgAcc = history.length ? history.reduce((a, h) => a + (Number(h.accuracy) || 0), 0) / history.length : null;
    const streak = typeof getEffectiveStreak === 'function' ? getEffectiveStreak() : (getStreakData().streak || 0);
    return {
        username: currentUser ? String(currentUser.username) : 'You',
        personalBestWpm: lifetime.bestWpm,
        averageWpm: avgWpm,
        runs,
        averageAccuracy: avgAcc,
        streak,
        level: getLevel(getTotalXP()),
    };
}

function headToHeadStat(a, b, suffix = '', higherIsBetter = true) {
    const av = lbNumberOrNull(a);
    const bv = lbNumberOrNull(b);
    const aWins = av !== null && bv !== null && (higherIsBetter ? av > bv : av < bv);
    const bWins = av !== null && bv !== null && (higherIsBetter ? bv > av : bv < av);
    return {
        a: `<span class="h2h-value${aWins ? ' win' : ''}">${lbStatOrDash(av, suffix)}</span>`,
        b: `<span class="h2h-value${bWins ? ' win' : ''}">${lbStatOrDash(bv, suffix)}</span>`,
    };
}

async function openHeadToHead(username) {
    const panel = document.getElementById('lb-compare-panel');
    const name = String(username || '').trim();
    if (!panel || !name) return;
    const reqId = ++lbCompareReqId;
    hideLeaderboardUserTooltip(true);
    panel.hidden = false;
    document.getElementById('leaderboard-list')?.classList.add('lb-hidden');
    panel.innerHTML = `
        <div class="h2h-head">
            <button type="button" class="btn btn-secondary h2h-back" onclick="closeHeadToHead()">Back to board</button>
            <div class="h2h-title">You vs ${escapeHtml(name)}</div>
        </div>
        <div class="history-empty">Loading stats...</div>`;
    const selfLocal = getLocalSelfSummary();
    const selfPromise = (currentUser && socialIsCloudMode())
        ? fetchLeaderboardUserSummary(currentUser.username).catch(() => null)
        : Promise.resolve(null);
    const [mine, theirs] = await Promise.all([
        selfPromise,
        fetchLeaderboardUserSummary(name).catch(() => null),
    ]);
    if (reqId !== lbCompareReqId || panel.hidden) return;
    const me = {
        username: selfLocal.username,
        personalBestWpm: Math.max(selfLocal.personalBestWpm || 0, Number(mine && mine.personalBestWpm) || 0),
        averageWpm: mine && mine.averageWpm !== null ? mine.averageWpm : selfLocal.averageWpm,
        runs: mine && mine.runs !== null ? Math.max(mine.runs, selfLocal.runs || 0) : selfLocal.runs,
        averageAccuracy: mine && mine.averageAccuracy !== null ? mine.averageAccuracy : selfLocal.averageAccuracy,
        streak: mine && mine.streak !== null ? Math.max(mine.streak, selfLocal.streak || 0) : selfLocal.streak,
    };
    if (!theirs) {
        panel.innerHTML = `
            <div class="h2h-head">
                <button type="button" class="btn btn-secondary h2h-back" onclick="closeHeadToHead()">Back to board</button>
                <div class="h2h-title">You vs ${escapeHtml(name)}</div>
            </div>
            <div class="history-empty">Stats for ${escapeHtml(name)} are not available right now.</div>`;
        return;
    }
    const rows = [
        ['Best', headToHeadStat(me.personalBestWpm, theirs.personalBestWpm, ' WPM')],
        ['Average', headToHeadStat(me.averageWpm, theirs.averageWpm, ' WPM')],
        ['Runs', headToHeadStat(me.runs, theirs.runs)],
        ['Accuracy', headToHeadStat(me.averageAccuracy, theirs.averageAccuracy, '%')],
        ['Streak', headToHeadStat(me.streak, theirs.streak, ' days')],
    ];
    const guestNote = currentUser ? '' : '<div class="lb-board-note">Your column uses runs saved in this browser. Log in to keep them.</div>';
    panel.innerHTML = `
        <div class="h2h-head">
            <button type="button" class="btn btn-secondary h2h-back" onclick="closeHeadToHead()">Back to board</button>
            <div class="h2h-title">You vs ${escapeHtml(name)}</div>
        </div>
        ${guestNote}
        <div class="h2h-table" role="table" aria-label="Head to head">
            <div class="h2h-row h2h-row-head" role="row">
                <span role="columnheader"></span>
                <span role="columnheader" class="h2h-col-you">${escapeHtml(me.username)}</span>
                <span role="columnheader" class="h2h-col-them">${escapeHtml(String(theirs.username || name))}</span>
            </div>
            ${rows.map(([label, cells]) => `<div class="h2h-row" role="row"><span class="h2h-label" role="rowheader">${label}</span>${cells.a}${cells.b}</div>`).join('')}
        </div>`;
    const back = panel.querySelector('.h2h-back');
    if (back) back.focus();
}
window.openHeadToHead = openHeadToHead;

function closeHeadToHead(refocus = true) {
    const panel = document.getElementById('lb-compare-panel');
    if (!panel) return;
    const wasOpen = !panel.hidden;
    panel.hidden = true;
    panel.innerHTML = '';
    document.getElementById('leaderboard-list')?.classList.remove('lb-hidden');
    lbCompareReqId += 1;
    if (wasOpen && refocus) {
        const first = document.querySelector('#leaderboard-list .lb-user-hover');
        if (first && typeof first.focus === 'function') first.focus();
    }
}
window.closeHeadToHead = closeHeadToHead;

// ── Profile ─────────────────────────────────────────────────────────────────
