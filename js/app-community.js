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
        const damage = Math.max(0, Math.floor(Number(row.damage) || 0));
        if (damage <= 0) return;
        const key = id || `name:${username.toLowerCase()}`;
        const prev = merged.get(key);
        if (!prev || damage > prev.damage) merged.set(key, { id, username, damage });
    };
    (Array.isArray(serverRows) ? serverRows : []).forEach(upsert);
    (Array.isArray(localRows) ? localRows : []).forEach(upsert);
    return [...merged.values()].sort((a, b) => b.damage - a.damage || a.username.localeCompare(b.username));
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
    if (kind === 'fighter') {
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

function getCommunityHubCardHtml() {
    const weekStart = getWeekStartDate();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekRangeLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    const rows = Array.isArray(_communityRowsCache) ? _communityRowsCache : [];
    const communityDamage = rows.reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row.damage) || 0)), 0);
    const fleet = getCommunityFleetProgress(communityDamage);
    const communityPct = Math.min(100, (communityDamage / COMMUNITY_FLEET_TOTAL_HEALTH) * 100);
    return `
        <div class="community-goal-card">
            <div class="community-goal-top">
                <span class="community-goal-title-wrap">
                    <span class="community-goal-icon" aria-hidden="true">🛸</span>
                    <span class="community-goal-title">Current Stage: ${fleet.allCleared ? 'Alien Fleet Destroyed' : escapeHtml(fleet.current.name)}</span>
                    <span class="community-info-wrap" tabindex="0" aria-label="Community goal reward info">
                        <span class="skill-info-icon" aria-hidden="true">i</span>
                        <span class="skill-info-tooltip">If you are able to defeat the invading alien fleet together, you will receive a mystery reward!</span>
                    </span>
                </span>
                <span class="community-goal-words">${communityDamage.toLocaleString()} damage / ${COMMUNITY_FLEET_TOTAL_HEALTH.toLocaleString()} total · ${escapeHtml(weekRangeLabel)}</span>
            </div>
            <div class="community-goal-sub">THREAT DETECTED: Long-range sensors have confirmed an incoming hostile fleet. All units are authorized to engage! Every keystroke delivers a direct kinetic strike to the hull. All typed words for guests and logged in members contribute to the total destruction of the invading force.</div>
            <div class="community-battle-scene" aria-hidden="true">
                <span class="community-starfield layer-a"></span>
                <span class="community-starfield layer-b"></span>
                <span class="community-player-ship">${getCommunityShipSprite('player')}</span>
                <span class="community-laser l1"></span>
                <span class="community-laser l2"></span>
                <span class="community-laser l3"></span>
                <span class="community-enemy-row">
                    ${fleet.levels.map(level => {
                        const shipKind = level.id === 'fighter' ? 'fighter' : (level.id === 'mothership' ? 'mothership' : 'scout');
                        const shipClass = level.cleared
                            ? 'community-enemy-ship cleared'
                            : (fleet.current.id === level.id ? 'community-enemy-ship active' : 'community-enemy-ship');
                        return `<span class="${shipClass}" title="${escapeHtml(level.name)}">${getCommunityShipSprite(shipKind)}</span>`;
                    }).join('')}
                </span>
            </div>
            <div class="community-goal-bar">
                <div class="community-goal-fill" style="width:${communityPct.toFixed(2)}%"></div>
            </div>
            <div class="community-fleet-levels">
                ${fleet.levels.map(level => {
                    const className = level.cleared ? 'community-fleet-level cleared' : (fleet.current.id === level.id ? 'community-fleet-level active' : 'community-fleet-level');
                    const hpLabel = level.cleared ? 'Current HP: Destroyed' : `Current HP: ${level.remainingHealth.toLocaleString()}`;
                    return `<div class="${className}">
                        <div class="community-fleet-level-top">
                            <span>${escapeHtml(level.name)} (${level.health.toLocaleString()} health)</span>
                            <span>${hpLabel}</span>
                        </div>
                        <div class="community-fleet-health">
                            <div class="community-fleet-health-fill" style="width:${Math.max(0, Math.min(100, level.remainingPercent)).toFixed(2)}%"></div>
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
    const activeMode = getCommunityBoostDefinition();
    const boardHtml = rows.length === 0
        ? '<div class="history-empty">No damage yet this week. Be the first to strike!</div>'
        : `<div class="community-hub-list">${rows.map((row, idx) => `
            <div class="community-hub-row">
                <span class="community-hub-rank">#${idx + 1}</span>
                <span class="community-hub-user">${escapeHtml(row.username)}</span>
                <span class="community-hub-dmg">${Number(row.damage || 0).toLocaleString()}</span>
            </div>
        `).join('')}</div>`;
    const modesHtml = Object.values(COMMUNITY_BOOST_MODES).map((mode) => {
        const isActive = activeMode && activeMode.id === mode.id;
        return `
            <div class="community-mode-card${isActive ? ' active' : ''}">
                <div class="community-mode-title">${escapeHtml(mode.name)}${isActive ? '<span class="community-mode-badge">Active</span>' : ''}</div>
                <div class="community-mode-desc">${escapeHtml(mode.desc)}</div>
                <div class="community-mode-actions">
                    <button class="community-mode-btn" onclick="startCommunityBoostMode('${escapeHtml(mode.id)}')">${isActive ? 'Restart Mode' : 'Start Mode'}</button>
                </div>
            </div>
        `;
    }).join('');
    wrap.innerHTML = `
        <div class="community-hub-grid">
            <div>${getCommunityHubCardHtml()}</div>
            <div class="community-hub-right">
                <div class="community-modes">
                    <div class="community-modes-title">Fleet Boost Game Modes</div>
                    ${modesHtml}
                    ${activeMode ? `<div class="community-mode-actions"><button class="community-mode-btn" onclick="clearCommunityBoostMode()">Disable Boost Mode</button></div>` : ''}
                </div>
                <div class="community-hub-title">Top Fleet Damage</div>
                ${boardHtml}
            </div>
        </div>
    `;
}

async function openCommunityHub() {
    const modal = document.getElementById('community-hub-modal');
    if (!modal) return;
    openModal(modal);
    renderCommunityHub();
    const reqId = ++communityHubReqId;
    const localRows = getCommunityContributionRows();
    try {
        const cloudOut = await apiFetchCloudFirst('/api/leaderboard?community=1&limit=1000');
        if (reqId !== communityHubReqId) return;
        const serverRows = Array.isArray(cloudOut && cloudOut.contributions) ? cloudOut.contributions : [];
        _communityRowsCache = mergeCommunityContributionRows(serverRows, localRows);
    } catch (e) {
        if (reqId !== communityHubReqId) return;
        _communityRowsCache = localRows;
    }
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

function renderScoreLeaderboardRows(rows) {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    hideLeaderboardUserTooltip(true);
    let visible = rows;
    if (lbActiveTab === 'weekly') {
        const ws = getWeekStart();
        visible = rows.filter(r => (r.date || 0) >= ws);
    }
    if (visible.length === 0) {
        listEl.innerHTML = `<div class="history-empty">${lbActiveTab === 'weekly' ? 'No scores this week yet — be the first!' : 'No records yet... be the first, and carve your name into the Hall of Champions!'}</div>`;
        return;
    }
    const crownCutoff = Math.max(1, Math.ceil(visible.length * 0.1));
    const header = `
        <div class="leaderboard-row lb-head">
            <span class="lb-rank">#</span>
            <span class="lb-user">Username</span>
            <span class="lb-mode">Test Type</span>
            <span class="lb-wpm">WPM</span>
            <span class="lb-acc">Acc</span>
            <span class="lb-time">Time</span>
            <span class="lb-err">Err/min</span>
        </div>
    `;
    listEl.innerHTML = header;
    visible.forEach((row, idx) => {
        const userId = String(row.userId || '');
        const isGuest = userId.startsWith('guest:') || /^guest\b/i.test(String(row.username || ''));
        const location = {
            city: String(row.city || ''),
            country: String(row.country || ''),
        };
        const username = isGuest
            ? getGuestDisplayNameFromLocation(location)
            : (String(row.username || 'Unknown').trim() || 'Unknown');
        const safeUsername = escapeHtml(username);
        const userClass = isGuest ? 'lb-user' : 'lb-user lb-user-hover';
        const el = document.createElement('div');
        el.className = 'leaderboard-row';
        if (lbActiveTab === 'weekly' && idx < crownCutoff) el.classList.add('lb-crown-row');
        const modeLabel = row.mode === 'words30'
            ? 'words 30s'
            : (row.mode === 'words' ? 'random words' : 'quotes');
        const time = row.time ? `${Math.round(row.time)}s` : '—';
        const errPerMin = (row.rawWpm != null && row.wpm != null)
            ? Math.max(0, Math.round(row.rawWpm - row.wpm))
            : '—';
        const crownBadge = (lbActiveTab === 'weekly' && idx < crownCutoff)
            ? '<span class="lb-crown" title="Top 10% this week">&#128081;</span>' : '';
        el.innerHTML = `
            <span class="lb-rank">#${idx + 1} ${crownBadge}</span>
            <span class="${userClass}" data-username="${safeUsername}">${safeUsername}</span>
            <span class="lb-mode">${escapeHtml(modeLabel)}</span>
            <span class="lb-wpm">${Math.round(row.wpm || 0)}</span>
            <span class="lb-acc">${Math.round(row.accuracy || 0)}%</span>
            <span class="lb-time">${time}</span>
            <span class="lb-err">${errPerMin}</span>
        `;
        listEl.appendChild(el);
    });
}

function renderCommunityLeaderboardRows(rowsOverride = null) {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    hideLeaderboardUserTooltip(true);
    const rows = Array.isArray(rowsOverride) ? rowsOverride : _communityRowsCache;
    if (rows.length === 0) {
        listEl.innerHTML = '<div class="history-empty">No community damage this week yet — be the first to strike the fleet!</div>';
        return;
    }
    const totalDamage = rows.reduce((sum, row) => sum + row.damage, 0);
    listEl.innerHTML = `
        <div class="leaderboard-row lb-head lb-contrib-row">
            <span class="lb-rank">#</span>
            <span class="lb-user">Username</span>
            <span class="lb-wpm">Damage</span>
            <span class="lb-acc">Share</span>
        </div>
    `;
    rows.forEach((row, idx) => {
        const username = String(row.username || 'Unknown').trim() || 'Unknown';
        const safeUsername = escapeHtml(username);
        const share = totalDamage > 0 ? (row.damage / totalDamage) * 100 : 0;
        const el = document.createElement('div');
        el.className = 'leaderboard-row lb-contrib-row';
        el.innerHTML = `
            <span class="lb-rank">#${idx + 1}</span>
            <span class="lb-user lb-user-hover" data-username="${safeUsername}">${safeUsername}</span>
            <span class="lb-wpm">${row.damage.toLocaleString()}</span>
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

async function refreshLeaderboard() {
    const reqId = ++leaderboardReqId;
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="history-empty">Loading leaderboard...</div>';
    if (lbActiveTab === 'community') {
        const localRows = getCommunityContributionRows();
        try {
            const cloudOut = await apiFetchCloudFirst('/api/leaderboard?community=1&limit=1000');
            if (reqId !== leaderboardReqId) return;
            const serverRows = Array.isArray(cloudOut && cloudOut.contributions) ? cloudOut.contributions : [];
            _communityRowsCache = mergeCommunityContributionRows(serverRows, localRows);
            renderCommunityLeaderboardRows(_communityRowsCache);
            if (document.getElementById('community-hub-modal')?.classList.contains('show')) renderCommunityHub();
            return;
        } catch (e) {
            // Fall through to existing fallback path.
        }
        try {
            const out = await localApiFetch('/api/leaderboard?community=1&limit=1000', {}, buildAuthHeaders({}));
            if (reqId !== leaderboardReqId) return;
            const serverRows = Array.isArray(out.contributions) ? out.contributions : [];
            _communityRowsCache = mergeCommunityContributionRows(serverRows, localRows);
            renderCommunityLeaderboardRows(_communityRowsCache);
            if (document.getElementById('community-hub-modal')?.classList.contains('show')) renderCommunityHub();
            return;
        } catch (e) {
            if (reqId !== leaderboardReqId) return;
            _communityRowsCache = localRows;
            renderCommunityLeaderboardRows(_communityRowsCache);
            if (document.getElementById('community-hub-modal')?.classList.contains('show')) renderCommunityHub();
            return;
        }
    }
    try {
        const out = await apiFetchCloudFirst('/api/leaderboard?limit=100');
        if (reqId !== leaderboardReqId) return;
        const rows = Array.isArray(out.leaderboard) ? out.leaderboard : [];
        renderLeaderboardRows(rows);
    } catch (e) {
        if (!shouldAllowLocalFallback(e)) {
            if (reqId !== leaderboardReqId) return;
            const safeMessage = escapeHtml(e && e.message ? e.message : 'unknown error');
            listEl.innerHTML = `<div class="history-empty">Leaderboard unavailable (${safeMessage}).</div>`;
            return;
        }
        try {
            const out = await localApiFetch('/api/leaderboard?limit=100', {}, buildAuthHeaders({}));
            if (reqId !== leaderboardReqId) return;
            const rows = Array.isArray(out.leaderboard) ? out.leaderboard : [];
            renderLeaderboardRows(rows);
        } catch (innerErr) {
            if (reqId !== leaderboardReqId) return;
            const safeMessage = escapeHtml(innerErr && innerErr.message ? innerErr.message : 'unknown error');
            listEl.innerHTML = `<div class="history-empty">Leaderboard unavailable (${safeMessage}).</div>`;
        }
    }
}

function openLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    if (!modal) return;
    openModal(modal);
    refreshLeaderboard();
}

function closeLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    if (!modal) return;
    hideLeaderboardUserTooltip(true);
    closeModal(modal);
}

function handleLeaderboardBackdrop(event) {
    const modal = document.getElementById('leaderboard-modal');
    if (event && event.target === modal) closeLeaderboard();
}

// ── Profile ─────────────────────────────────────────────────────────────────
