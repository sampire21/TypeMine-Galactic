function openProfile() {
    if (!currentUser) {
        openLoginModal();
        return;
    }
    const modal = document.getElementById('profile-modal');
    if (!modal) return;
    openModal(modal);
    loadProfileData();
}

function closeProfile() {
    const modal = document.getElementById('profile-modal');
    if (!modal) return;
    closeModal(modal);
}

function handleProfileBackdrop(event) {
    if (event && event.target === document.getElementById('profile-modal')) closeProfile();
}

function openMissionBriefing() {
    const modal = document.getElementById('mission-briefing-modal');
    if (!modal) return;
    openModal(modal);
}

function closeMissionBriefing() {
    const modal = document.getElementById('mission-briefing-modal');
    if (!modal) return;
    closeModal(modal);
}

function handleMissionBriefingBackdrop(event) {
    if (event && event.target === document.getElementById('mission-briefing-modal')) closeMissionBriefing();
}

function renderLifetimeStatsModal() {
    const content = document.getElementById('lifetime-stats-content');
    if (!content) return;
    const lifetime = getLifetimeStatsSummary();
    const streakCount = Math.max(0, Number(getStreakData().streak || 0) || 0);
    const xp = getTotalXP();
    const level = getLevel(xp);
    const achievements = getEarnedBadges().length;
    const lifetimeChallenges = getLifetimeChallengesCompleted();
    const avgWordsPerTest = lifetime.tests > 0 ? Math.round(lifetime.words / lifetime.tests) : 0;
    content.innerHTML = `
        <div class="profile-section-title">Your All-Time Totals</div>
        <div class="profile-stats-grid">
            <div class="profile-stat">
                <div class="profile-stat-label">Tests</div>
                <div class="profile-stat-value">${lifetime.tests.toLocaleString()}</div>
            </div>
            <div class="profile-stat">
                <div class="profile-stat-label">Words Typed</div>
                <div class="profile-stat-value">${lifetime.words.toLocaleString()}</div>
            </div>
            <div class="profile-stat">
                <div class="profile-stat-label">Time Typed</div>
                <div class="profile-stat-value profile-stat-value--sm">${escapeHtml(formatLifetimeDuration(lifetime.seconds))}</div>
            </div>
            <div class="profile-stat">
                <div class="profile-stat-label">Best WPM</div>
                <div class="profile-stat-value">${lifetime.bestWpm.toLocaleString()}</div>
            </div>
            <div class="profile-stat">
                <div class="profile-stat-label">Bible Tests</div>
                <div class="profile-stat-value">${lifetime.bibleTests.toLocaleString()}</div>
            </div>
            <div class="profile-stat">
                <div class="profile-stat-label">Level</div>
                <div class="profile-stat-value">${level}</div>
            </div>
            <div class="profile-stat">
                <div class="profile-stat-label">Current Streak</div>
                <div class="profile-stat-value">${streakCount.toLocaleString()}</div>
            </div>
            <div class="profile-stat">
                <div class="profile-stat-label">Challenges</div>
                <div class="profile-stat-value">${lifetimeChallenges.toLocaleString()}</div>
            </div>
            <div class="profile-stat">
                <div class="profile-stat-label">Achievements</div>
                <div class="profile-stat-value">${achievements.toLocaleString()}</div>
            </div>
            <div class="profile-stat">
                <div class="profile-stat-label">Avg Words/Test</div>
                <div class="profile-stat-value">${avgWordsPerTest.toLocaleString()}</div>
            </div>
        </div>
    `;
}

function openLifetimeStatsModal() {
    if (!currentUser) return;
    const modal = document.getElementById('lifetime-stats-modal');
    if (!modal) return;
    renderLifetimeStatsModal();
    openModal(modal);
}

function closeLifetimeStatsModal() {
    const modal = document.getElementById('lifetime-stats-modal');
    if (!modal) return;
    closeModal(modal);
}

function handleLifetimeStatsBackdrop(event) {
    if (event && event.target === document.getElementById('lifetime-stats-modal')) closeLifetimeStatsModal();
}

function setAdminNote(message, isError = false) {
    const note = document.getElementById('admin-note');
    if (!note) return;
    note.textContent = message || '';
    note.style.color = isError ? '#ff8ab8' : '#93c5fd';
}

function formatAdminTime(ms) {
    const t = Number(ms) || 0;
    if (!t) return 'Never';
    try {
        return new Date(t).toLocaleString();
    } catch (e) {
        return 'Never';
    }
}

function renderAdminUsersList() {
    const el = document.getElementById('admin-users-list');
    if (!el) return;
    if (!adminUsersCache.length) {
        el.innerHTML = '<div class="profile-loading">No players found.</div>';
        return;
    }
    el.innerHTML = adminUsersCache.map((u) => {
        const activeClass = (adminSelectedUserId && adminSelectedUserId === u.id) ? ' active' : '';
        const statusClass = u.isActive ? 'active' : 'offline';
        const statusText = u.isActive ? 'Active' : 'Offline';
        return `<button type="button" class="admin-user-row${activeClass}" data-user-id="${escapeHtml(u.id)}">
            <div class="admin-user-main">
                <span>${escapeHtml(u.username || 'Unknown')}</span>
                <span class="admin-user-status ${statusClass}">${statusText}</span>
            </div>
            <div class="admin-user-meta">Last login: ${escapeHtml(formatAdminTime(u.lastLoginAt))}</div>
        </button>`;
    }).join('');
    el.querySelectorAll('.admin-user-row').forEach((btn) => {
        btn.addEventListener('click', () => selectAdminUser(btn.dataset.userId));
    });
}

function renderAdminUserDetail(user) {
    const el = document.getElementById('admin-user-detail');
    if (!el) return;
    if (!user) {
        el.innerHTML = '<div class="profile-loading">Select a player to view details.</div>';
        return;
    }
    const rewards = (user.skillsUnlocked || []).join(', ') || 'None';
    el.innerHTML = `
        <div>
            <div class="admin-detail-title">${escapeHtml(user.username || 'Unknown')}</div>
            <div class="admin-detail-sub">Created: ${escapeHtml(formatAdminTime(user.createdAt))} · Last seen: ${escapeHtml(formatAdminTime(user.lastSeenAt))}</div>
        </div>
        <div class="admin-stat-grid">
            <div class="admin-stat"><div class="admin-stat-label">Level</div><div class="admin-stat-value">${Math.max(1, Number(user.level) || 1)}</div></div>
            <div class="admin-stat"><div class="admin-stat-label">XP</div><div class="admin-stat-value">${Math.max(0, Number(user.xp) || 0)}</div></div>
            <div class="admin-stat"><div class="admin-stat-label">Aether Crystals</div><div class="admin-stat-value">${Math.max(0, Number(user.skillPoints) || 0)}</div></div>
            <div class="admin-stat"><div class="admin-stat-label">Daily Streak</div><div class="admin-stat-value">${Math.max(0, Number(user.streakDays) || 0)}</div></div>
            <div class="admin-stat"><div class="admin-stat-label">Daily Done</div><div class="admin-stat-value">${Math.max(0, Number(user.dailyCompleted) || 0)}</div></div>
            <div class="admin-stat"><div class="admin-stat-label">Weekly Done</div><div class="admin-stat-value">${Math.max(0, Number(user.weeklyCompleted) || 0)}</div></div>
            <div class="admin-stat"><div class="admin-stat-label">Achievements</div><div class="admin-stat-value">${Math.max(0, Number(user.badges) || 0)}</div></div>
            <div class="admin-stat"><div class="admin-stat-label">Saved Tests</div><div class="admin-stat-value">${Math.max(0, Number(user.testsSaved) || 0)}</div></div>
        </div>
        <div class="admin-detail-sub">Rewards unlocked: ${escapeHtml(rewards)}</div>
        <div class="admin-actions">
            <input id="admin-set-level" type="number" min="1" step="1" placeholder="Set Level">
            <input id="admin-set-xp" type="number" min="0" step="1" placeholder="Set XP">
            <input id="admin-set-sp" type="number" min="0" step="1" placeholder="Set Aether Crystals">
            <input id="admin-set-streak" type="number" min="0" step="1" placeholder="Set Daily Streak">
            <input id="admin-set-daily" type="number" min="0" step="1" placeholder="Set Daily Completed">
            <input id="admin-set-weekly" type="number" min="0" step="1" placeholder="Set Weekly Completed">
            <input id="admin-set-achievements" type="number" min="0" step="1" placeholder="Set Achievements">
            <input id="admin-add-xp" type="number" min="0" step="1" placeholder="Add XP">
            <input id="admin-add-sp" type="number" min="0" step="1" placeholder="Add Aether Crystals">
            <input id="admin-reset-username" type="text" maxlength="24" placeholder="Reset Username">
            <input id="admin-reset-password" type="password" maxlength="72" placeholder="Reset Password">
        </div>
        <div class="admin-reward-toggles">
            <label><input type="checkbox" id="admin-unlock-aura" ${user.skillsUnlocked?.includes('aura') ? 'checked' : ''}> Aura Unlocked</label>
            <label><input type="checkbox" id="admin-unlock-soundscapes" ${user.skillsUnlocked?.includes('soundscapes') ? 'checked' : ''}> Soundscapes Unlocked</label>
            <label><input type="checkbox" id="admin-unlock-nebula" ${user.skillsUnlocked?.includes('nebulaTrail') ? 'checked' : ''}> Nebula Trail Unlocked</label>
        </div>
        <div>
            <button type="button" class="secondary" onclick="applyAdminGrant()">Apply Changes</button>
            <button type="button" class="secondary danger-btn" onclick="adminDeleteSelectedUser()" style="margin-left:0.5rem;">Delete User</button>
        </div>
    `;
}

async function loadAdminUsers() {
    if (!isAdminCurrentUser()) return;
    const usersPane = document.getElementById('admin-users-list');
    if (usersPane) usersPane.innerHTML = '<div class="profile-loading">Loading players...</div>';
    setAdminNote('');
    try {
        const out = await apiFetch('/api/admin/users');
        adminUsersCache = Array.isArray(out.users) ? out.users : [];
        if (!adminUsersCache.length) {
            adminSelectedUserId = '';
            renderAdminUsersList();
            renderAdminUserDetail(null);
            return;
        }
        if (!adminSelectedUserId || !adminUsersCache.some(u => u.id === adminSelectedUserId)) {
            adminSelectedUserId = adminUsersCache[0].id;
        }
        renderAdminUsersList();
        await selectAdminUser(adminSelectedUserId, false);
    } catch (e) {
        adminUsersCache = [];
        adminSelectedUserId = '';
        renderAdminUsersList();
        renderAdminUserDetail(null);
        setAdminNote(e.message || 'Failed to load users.', true);
    }
}

async function selectAdminUser(userId, updateList = true) {
    if (!isAdminCurrentUser()) return;
    adminSelectedUserId = String(userId || '');
    if (updateList) renderAdminUsersList();
    try {
        const out = await apiFetch(`/api/admin/users/${encodeURIComponent(adminSelectedUserId)}`);
        renderAdminUserDetail(out && out.user ? out.user : null);
    } catch (e) {
        renderAdminUserDetail(null);
        setAdminNote(e.message || 'Failed to load player details.', true);
    }
}

function openAdminPanel() {
    if (!isAdminCurrentUser()) {
        showUiMessage('Admin access denied.', 'error');
        return;
    }
    const modal = document.getElementById('admin-modal');
    if (!modal) return;
    openModal(modal);
    loadAdminUsers();
}

function closeAdminPanel() {
    const modal = document.getElementById('admin-modal');
    if (!modal) return;
    closeModal(modal);
}

function handleAdminBackdrop(event) {
    if (event && event.target === document.getElementById('admin-modal')) closeAdminPanel();
}

async function applyAdminGrant() {
    if (!isAdminCurrentUser() || !adminSelectedUserId) return;
    const parseOptionalInt = (id, min = 0) => {
        const raw = String(document.getElementById(id)?.value || '').trim();
        if (!raw) return null;
        const n = Math.floor(Number(raw));
        if (!Number.isFinite(n)) return null;
        return Math.max(min, n);
    };
    const addXp = Math.max(0, Math.floor(Number(document.getElementById('admin-add-xp')?.value || 0)));
    const addSkillPoints = Math.max(0, Math.floor(Number(document.getElementById('admin-add-sp')?.value || 0)));
    const setLevel = parseOptionalInt('admin-set-level', 1);
    const setXp = parseOptionalInt('admin-set-xp', 0);
    const setSkillPoints = parseOptionalInt('admin-set-sp', 0);
    const setStreakDays = parseOptionalInt('admin-set-streak', 0);
    const setDailyCompleted = parseOptionalInt('admin-set-daily', 0);
    const setWeeklyCompleted = parseOptionalInt('admin-set-weekly', 0);
    const setAchievements = parseOptionalInt('admin-set-achievements', 0);
    const resetUsername = String(document.getElementById('admin-reset-username')?.value || '').trim();
    const resetPassword = String(document.getElementById('admin-reset-password')?.value || '');
    const unlockRewards = [];
    if (document.getElementById('admin-unlock-aura')?.checked) unlockRewards.push('aura');
    if (document.getElementById('admin-unlock-soundscapes')?.checked) unlockRewards.push('soundscapes');
    if (document.getElementById('admin-unlock-nebula')?.checked) unlockRewards.push('nebulaTrail');
    const hasSetOps = (
        setLevel !== null || setXp !== null || setSkillPoints !== null ||
        setStreakDays !== null || setDailyCompleted !== null ||
        setWeeklyCompleted !== null || setAchievements !== null
    );
    if (addXp <= 0 && addSkillPoints <= 0 && unlockRewards.length === 0 && !hasSetOps && !resetUsername && !resetPassword) {
        setAdminNote('Enter at least one value to set/add, or adjust rewards.', true);
        return;
    }
    const setRewards = {
        aura: !!document.getElementById('admin-unlock-aura')?.checked,
        soundscapes: !!document.getElementById('admin-unlock-soundscapes')?.checked,
        nebulaTrail: !!document.getElementById('admin-unlock-nebula')?.checked,
    };
    try {
        await apiFetch(`/api/admin/users/${encodeURIComponent(adminSelectedUserId)}`, {
            method: 'PATCH',
            body: JSON.stringify({
                addXp,
                addSkillPoints,
                setLevel,
                setXp,
                setSkillPoints,
                setStreakDays,
                setDailyCompleted,
                setWeeklyCompleted,
                setAchievements,
                setRewards,
                unlockRewards,
                resetUsername: resetUsername || null,
                resetPassword: resetPassword || null,
            }),
        });
        setAdminNote('Admin changes applied successfully.');
        if (currentUser && String(currentUser.id || '') === String(adminSelectedUserId)) {
            await hydrateProgressForCurrentUser();
            await refreshCloudProgress();
            if (currentMode === 'daily') renderDailyChallenges();
            const me = await apiFetch('/api/me');
            currentUser = me && me.user ? me.user : currentUser;
            updateAuthUi();
        }
        await loadAdminUsers();
    } catch (e) {
        setAdminNote(e.message || 'Unable to apply grant.', true);
    }
}

async function adminDeleteSelectedUser() {
    if (!isAdminCurrentUser() || !adminSelectedUserId) return;
    const target = adminUsersCache.find((u) => String(u.id) === String(adminSelectedUserId));
    const uname = target && target.username ? String(target.username) : 'this user';
    const ok = window.confirm(`Delete account "${uname}" permanently? This cannot be undone.`);
    if (!ok) return;
    try {
        await apiFetch(`/api/admin/users/${encodeURIComponent(adminSelectedUserId)}`, { method: 'DELETE' });
        setAdminNote('User account deleted.');
        if (currentUser && String(currentUser.id || '') === String(adminSelectedUserId)) {
            logoutUser();
            closeAdminPanel();
            setAuthNote('Your account was deleted by admin.');
            return;
        }
        adminSelectedUserId = '';
        await loadAdminUsers();
    } catch (e) {
        setAdminNote(e.message || 'Unable to delete user account.', true);
    }
}

function openSkills() {
    const modal = document.getElementById('skills-modal');
    if (!modal) return;
    openModal(modal);
    renderSkillsModal();
}

function closeSkills() {
    const modal = document.getElementById('skills-modal');
    if (!modal) return;
    stopSoundscapesPreview();
    auraPreviewVisible = false;
    nebulaPreviewVisible = false;
    closeModal(modal);
}

function handleSkillsBackdrop(event) {
    if (event && event.target === document.getElementById('skills-modal')) closeSkills();
}

function openInventory() {
    const modal = document.getElementById('inventory-modal');
    if (!modal) return;
    openModal(modal);
    renderInventoryModal();
}

function closeInventory() {
    const modal = document.getElementById('inventory-modal');
    if (!modal) return;
    closeModal(modal);
}

function handleInventoryBackdrop(event) {
    if (event && event.target === document.getElementById('inventory-modal')) closeInventory();
}

function setAccountManageNote(message, isError = false) {
    const note = document.getElementById('account-manage-note');
    if (!note) return;
    note.textContent = message || '';
    note.style.color = isError ? '#ff8ab8' : '#8fd3ff';
}

function setDeleteAccountNote(message, isError = false) {
    const note = document.getElementById('delete-account-note');
    if (!note) return;
    note.textContent = message || '';
    note.style.color = isError ? '#ff8ab8' : '#8fd3ff';
}

function openAccountManagement() {
    const modal = document.getElementById('account-modal');
    if (!modal) return;
    openModal(modal);
    const canManage = !!currentUser;
    modal.querySelectorAll('.account-manage-card input, .account-manage-card button').forEach((el) => {
        el.disabled = !canManage;
    });
    if (!canManage) {
        setAccountManageNote('Log in to manage username, password, and account deletion.', true);
    } else {
        setAccountManageNote('');
    }
    const uname = document.getElementById('account-new-username');
    const cur = document.getElementById('account-current-password');
    const next = document.getElementById('account-new-password');
    const confirm = document.getElementById('account-new-password-confirm');
    if (uname) uname.value = '';
    if (cur) cur.value = '';
    if (next) next.value = '';
    if (confirm) confirm.value = '';
    if (canManage && uname) uname.focus();
}

function closeAccountManagement() {
    const modal = document.getElementById('account-modal');
    if (!modal) return;
    closeModal(modal);
}

function handleAccountModalBackdrop(event) {
    if (event && event.target === document.getElementById('account-modal')) closeAccountManagement();
}

function openDeleteAccountConfirm() {
    if (!currentUser) return;
    const modal = document.getElementById('delete-account-modal');
    const input = document.getElementById('delete-account-username-confirm');
    const desc = document.getElementById('delete-account-desc');
    if (!modal || !input || !desc) return;
    openModal(modal);
    input.value = '';
    const pwInput = document.getElementById('delete-account-password-confirm');
    if (pwInput) pwInput.value = '';
    setDeleteAccountNote('');
    desc.textContent = `Type "${currentUser.username}" and your password to confirm account deletion. This cannot be undone.`;
    input.focus();
}

function closeDeleteAccountConfirm() {
    const modal = document.getElementById('delete-account-modal');
    if (!modal) return;
    closeModal(modal);
}

function handleDeleteAccountBackdrop(event) {
    if (event && event.target === document.getElementById('delete-account-modal')) closeDeleteAccountConfirm();
}

async function updateAccountUsername() {
    if (!currentUser) return;
    const input = document.getElementById('account-new-username');
    const username = (input?.value || '').trim();
    if (!username) {
        setAccountManageNote('Enter a new username.', true);
        return;
    }
    try {
        const out = await apiFetch('/api/account', {
            method: 'PATCH',
            body: JSON.stringify({ username }),
        });
        currentUser = out.user;
        updateAuthUi();
        setAccountManageNote('Username updated successfully.');
        if (input) input.value = '';
    } catch (e) {
        setAccountManageNote(e.message || 'Unable to update username.', true);
    }
}

async function updateAccountPassword() {
    if (!currentUser) return;
    const currentPassword = (document.getElementById('account-current-password')?.value || '');
    const newPassword = (document.getElementById('account-new-password')?.value || '');
    const confirmPassword = (document.getElementById('account-new-password-confirm')?.value || '');
    if (!currentPassword || !newPassword || !confirmPassword) {
        setAccountManageNote('Fill in all password fields.', true);
        return;
    }
    if (newPassword !== confirmPassword) {
        setAccountManageNote('New passwords do not match.', true);
        return;
    }
    try {
        await apiFetch('/api/account', {
            method: 'PATCH',
            body: JSON.stringify({ currentPassword, newPassword }),
        });
        setAccountManageNote('Password updated successfully.');
        const cur = document.getElementById('account-current-password');
        const next = document.getElementById('account-new-password');
        const confirm = document.getElementById('account-new-password-confirm');
        if (cur) cur.value = '';
        if (next) next.value = '';
        if (confirm) confirm.value = '';
    } catch (e) {
        setAccountManageNote(e.message || 'Unable to update password.', true);
    }
}

async function deleteAccountConfirmed() {
    if (!currentUser) return;
    const input = document.getElementById('delete-account-username-confirm');
    const typed = (input?.value || '').trim();
    if (typed !== currentUser.username) {
        setDeleteAccountNote('Username does not match.', true);
        return;
    }
    const currentPassword = document.getElementById('delete-account-password-confirm')?.value || '';
    if (!currentPassword) {
        setDeleteAccountNote('Enter your current password.', true);
        return;
    }
    try {
        await apiFetch('/api/account', {
            method: 'DELETE',
            body: JSON.stringify({ usernameConfirm: typed, currentPassword }),
        });
        if (getProgressOwner() === String(currentUser.id || '')) {
            clearSyncedLocalProgress();
            setProgressOwner('');
        }
        closeDeleteAccountConfirm();
        closeAccountManagement();
        logoutUser();
        setAuthNote('Account deleted successfully.');
        refreshLeaderboard();
    } catch (e) {
        setDeleteAccountNote(e.message || 'Unable to delete account.', true);
    }
}

async function loadProfileData() {
    const content = document.getElementById('profile-content');
    if (!content) return;
    content.innerHTML = '<div class="profile-loading">Loading...</div>';
    if (!currentUser) {
        renderProfile(loadHistory());
        return;
    }
    try {
        const out = await apiFetch('/api/scores/me?limit=200');
        const cloudScores = Array.isArray(out.scores) ? out.scores : [];
        const localScores = loadHistory();
        const mergedScores = mergeProfileScores(localScores, cloudScores);
        renderProfile(mergedScores);
    } catch (e) {
        renderProfile(loadHistory());
    }
}

function mergeProfileScores(localScores = [], cloudScores = []) {
    const all = [];
    const seen = new Set();
    for (const row of [...(Array.isArray(cloudScores) ? cloudScores : []), ...(Array.isArray(localScores) ? localScores : [])]) {
        if (!row || typeof row !== 'object') continue;
        const key = `${Number(row.date) || 0}|${String(row.mode || '')}|${Number(row.wpm) || 0}|${Number(row.accuracy) || 0}|${Number(row.time) || 0}`;
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(row);
    }
    all.sort((a, b) => (a.date || 0) - (b.date || 0));
    return all;
}

function renderProfile(scores) {
    const content = document.getElementById('profile-content');
    if (!content) return;

    const displayName = currentUser ? currentUser.username : 'Guest';
    const isGuest = !currentUser;

    const totalTests = scores.length;
    const bestWpm   = totalTests > 0 ? Math.max(...scores.map(s => s.wpm || 0)) : 0;
    const avgWpm    = totalTests > 0 ? Math.round(scores.reduce((a, s) => a + (s.wpm || 0), 0) / totalTests) : 0;
    const avgAcc    = totalTests > 0 ? Math.round(scores.reduce((a, s) => a + (s.accuracy || 0), 0) / totalTests) : 0;
    const totalSec  = Math.round(scores.reduce((a, s) => a + (s.time || 0), 0));
    const hrs  = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const timeStr = `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;

    const oldestDate = totalTests > 0 ? new Date(Math.min(...scores.map(s => s.date || Date.now()))) : null;
    const joinStr = oldestDate
        ? oldestDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'No tests yet';

    const modes = ['quotes', 'words', 'words30'];
    const modeLabels = { quotes: 'Quotes', words: 'Random Words', words30: 'Words 30s' };
    const bestByMode = {};
    for (const m of modes) {
        const ms = scores.filter(s => s.mode === m);
        if (ms.length) bestByMode[m] = ms.reduce((b, s) => (s.wpm || 0) > (b?.wpm || 0) ? s : b, null);
    }

    const safeDisplayName = (String(displayName || '').trim() || 'Guest');
    const initial = safeDisplayName.charAt(0).toUpperCase();
    const streakCount = Math.max(0, Number(getStreakData().streak || 0) || 0);
    const streakMultiplier = getXPMultiplier(streakCount);
    const streakText = `${streakCount}-day streak${streakCount >= 3 ? ' 🔥' : ''}`;
    const xpBoostText = streakMultiplier > 1
        ? ` · ${streakMultiplier.toFixed(1).replace('.0', '')}x XP boost`
        : '';

    content.innerHTML = `
        <div class="profile-header">
            <div class="profile-avatar">${escapeHtml(initial)}</div>
            <div>
                <div class="profile-name-row">
                    <div class="profile-name">${escapeHtml(safeDisplayName)}</div>
                    <div class="profile-streak-inline">${escapeHtml(streakText + xpBoostText)}</div>
                </div>
                <div class="profile-meta">${isGuest ? 'Local session (not synced)' : `Member since ${escapeHtml(joinStr)}`}</div>
            </div>
        </div>

        <div class="profile-stats-grid">
            <div class="profile-stat">
                <div class="profile-stat-label">Tests</div>
                <div class="profile-stat-value">${totalTests}</div>
            </div>
            <div class="profile-stat">
                <div class="profile-stat-label">Best WPM</div>
                <div class="profile-stat-value">${bestWpm}</div>
            </div>
            <div class="profile-stat">
                <div class="profile-stat-label">Avg WPM</div>
                <div class="profile-stat-value">${avgWpm}</div>
            </div>
            <div class="profile-stat">
                <div class="profile-stat-label">Avg Acc</div>
                <div class="profile-stat-value">${avgAcc}%</div>
            </div>
            <div class="profile-stat">
                <div class="profile-stat-label">Time Typing</div>
                <div class="profile-stat-value profile-stat-value--sm">${escapeHtml(timeStr)}</div>
            </div>
        </div>

        <div class="profile-section-title">Best by mode</div>
        <div class="profile-best-grid">
            ${modes.map(m => {
                const b = bestByMode[m];
                const errStr = (b && b.rawWpm != null) ? ` &nbsp;·&nbsp; ${Math.max(0, Math.round((b.rawWpm||0) - (b.wpm||0)))} err/min` : '';
                return `<div class="profile-best-card">
                    <div class="profile-best-mode">${modeLabels[m]}</div>
                    ${b
                        ? `<div class="profile-best-wpm">${Number(b.wpm) || 0} WPM</div>
                           <div class="profile-best-acc">${Number(b.accuracy) || 0}% acc${errStr}</div>`
                        : `<div class="profile-best-empty">—</div>`}
                </div>`;
            }).join('')}
        </div>

        <div class="profile-section-title">Activity <span class="profile-section-sub">(last month)</span></div>
        <div class="profile-heatmap-wrap">
            <div id="profile-heatmap" class="profile-heatmap"></div>
            <div class="heatmap-legend">
                <span>less</span>
                <div class="heatmap-cell" data-level="0"></div>
                <div class="heatmap-cell" data-level="1"></div>
                <div class="heatmap-cell" data-level="2"></div>
                <div class="heatmap-cell" data-level="3"></div>
                <div class="heatmap-cell" data-level="4"></div>
                <span>more</span>
            </div>
        </div>

        ${totalTests >= 2 ? `
        <div class="profile-section-title">WPM Progress <span class="profile-section-sub">(raw + rolling avg, last ${Math.min(totalTests, 50)} tests)</span></div>
        <canvas id="profile-trend-chart" class="profile-chart-canvas" aria-hidden="true"></canvas>
        ` : ''}

        ${totalTests >= 5 ? `
        <div class="profile-section-title">WPM distribution</div>
        <canvas id="profile-hist-chart" class="profile-chart-canvas" aria-hidden="true"></canvas>
        ` : ''}
    `;

    renderProfileHeatmap(scores);
    renderProfileExtra();

    requestAnimationFrame(() => {
        if (totalTests >= 2) {
            const tc = document.getElementById('profile-trend-chart');
            if (tc) drawProfileTrendChart(tc, scores);
        }
        if (totalTests >= 5) {
            const hc = document.getElementById('profile-hist-chart');
            if (hc) drawProfileHistogram(hc, scores);
        }
    });
}

function renderProfileExtra() {
    const container = document.getElementById('profile-content');
    if (!container) return;
    const xp = getTotalXP();
    const level = getLevel(xp);
    const xpInLevel = Math.round(getLevelProgress(xp) * XP_PER_LEVEL);
    const skillPoints = getSkillPoints();
    const streak = getStreakData().streak || 0;
    const earnedBadges = getEarnedBadges(); // [{id, earnedAt}]

    // Level tier progression display
    const TIERS = [
        { max: 10, name: 'Scribe',        sub: 'Stone & Chisel' },
        { max: 20, name: 'Calligrapher',  sub: 'Ink & Quill' },
        { max: 30, name: 'Typist',        sub: 'Mechanical Typewriter' },
        { max: 40, name: 'Operator',      sub: 'Mainframe Terminal' },
        { max: Infinity, name: 'Cyber-Runner', sub: 'Neural Link' },
    ];
    const tierHtml = TIERS.map(t => {
        const isActive = getLevelName(level) === t.name;
        return `<div class="level-tier${isActive ? ' active' : ''}">
            <span class="level-tier-name">${t.name}</span>
            <span class="level-tier-sub">${t.sub}</span>
        </div>`;
    }).join('');

    const levelHtml =
        '<div class="profile-level-row">' +
            `<span class="profile-level-badge">Lv ${level}</span>` +
            '<div class="profile-level-details">' +
                `<div class="profile-level-name">${getLevelName(level)}</div>` +
                `<div class="profile-xp-bar-wrap"><div class="profile-xp-bar-fill" style="width:${(getLevelProgress(xp)*100).toFixed(1)}%"></div></div>` +
                `<div class="profile-xp-label">${xpInLevel} / ${XP_PER_LEVEL} XP &nbsp;·&nbsp; ${streak}-day streak${streak >= 3 ? ' 🔥' : ''}</div>` +
                '<div class="skill-points-row">' +
                    `<span class="skill-point-badge" id="skill-point-badge">Aether Crystals: ${skillPoints}</span>` +
                    '<span class="skill-info-wrap">' +
                        '<span class="skill-info-icon" aria-hidden="true">i</span>' +
                        '<span class="skill-info-tooltip">Earn Aether Crystals by levelling up! You can cash them in at the shop for fun rewards!</span>' +
                    '</span>' +
                '</div>' +
            '</div>' +
        '</div>' +
        `<div class="level-tier-list">${tierHtml}</div>` +
        '<div class="profile-shop-row"><button class="profile-shop-btn" onclick="openSkills()"><span class="profile-shop-icon" aria-hidden="true">🛒</span><span>Shop</span></button></div>' +
        '<div class="profile-shop-row"><button class="profile-inventory-btn" onclick="openInventory()"><span class="profile-shop-icon" aria-hidden="true">🎒</span><span>Inventory</span></button></div>' +
        '<div class="profile-shop-row"><button class="profile-briefing-btn" onclick="openMissionBriefing()">Mission Briefing</button></div>';

    // Achievements — show all, earned = bright, unearned = dimmed with requirement
    const allBadgesHtml = BADGE_DEFS.map(def => {
        const earnedEntry = earnedBadges.find(b => b.id === def.id);
        const isEarned = !!earnedEntry;
        let earnedLine = '';
        if (isEarned) {
            const dateStr = earnedEntry.earnedAt
                ? new Date(earnedEntry.earnedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : null;
            earnedLine = `<div class="profile-badge-earned-label">Earned${dateStr ? ' · ' + escapeHtml(dateStr) : ''}</div>`;
        }
        return `<div class="profile-badge-card${isEarned ? ' earned' : ' locked'}" title="${escapeHtml(def.desc)}">` +
            `<span class="profile-badge-icon">${isEarned ? def.icon : '🔒'}</span>` +
            `<div class="profile-badge-info">` +
                `<div class="profile-badge-name">${escapeHtml(def.name)}</div>` +
                `<div class="profile-badge-desc">${escapeHtml(def.desc)}</div>` +
                earnedLine +
            `</div>` +
        `</div>`;
    }).join('');

    const section = document.createElement('div');
    section.className = 'profile-extra-section';
    section.innerHTML =
        '<div class="profile-section-title">Level &amp; Progress</div>' +
        '<div class="profile-level-badges-row">' +
            `<div class="profile-level-col">${levelHtml}</div>` +
            '<div class="profile-badges-col">' +
                `<div class="profile-badges-title">Achievements <span class="profile-section-sub">(${earnedBadges.length} / ${BADGE_DEFS.length})</span></div>` +
                `<div class="profile-badges-grid">${allBadgesHtml}</div>` +
            '</div>' +
        '</div>';

    container.appendChild(section);
}

function renderProfileHeatmap(scores) {
    const el = document.getElementById('profile-heatmap');
    if (!el) return;

    const countMap = new Map();
    for (const s of scores) {
        const d = new Date(s.date || 0);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        countMap.set(key, (countMap.get(key) || 0) + 1);
    }

    const DAYS = 30;
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const start = new Date(today);
    start.setDate(start.getDate() - (DAYS - 1));
    start.setHours(0, 0, 0, 0);
    const leadPad = start.getDay();
    const totalCells = leadPad + DAYS;
    const weeks = Math.ceil(totalCells / 7);

    let html = '';
    for (let w = 0; w < weeks; w++) {
        for (let d = 0; d < 7; d++) {
            const idx = w * 7 + d;
            if (idx < leadPad) {
                html += '<div class="heatmap-cell" style="opacity:0"></div>';
                continue;
            }
            const dayOffset = idx - leadPad;
            const cell = new Date(start);
            cell.setDate(start.getDate() + dayOffset);
            if (cell > today) {
                html += '<div class="heatmap-cell" style="opacity:0"></div>';
                continue;
            }
            const key = `${cell.getFullYear()}-${cell.getMonth()}-${cell.getDate()}`;
            const count = countMap.get(key) || 0;
            const level = count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4;
            const label = cell.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            html += `<div class="heatmap-cell" data-level="${level}" title="${label}: ${count} test${count !== 1 ? 's' : ''}"></div>`;
        }
    }
    el.innerHTML = html;
}

function drawProfileTrendChart(canvas, allScores) {
    const scores = [...allScores].sort((a, b) => (a.date || 0) - (b.date || 0)).slice(-50);
    if (scores.length < 2) return;

    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width, cssH = rect.height;
    if (!cssW || !cssH) return;
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const PAD = { top: 14, right: 16, bottom: 24, left: 38 };
    const W = cssW - PAD.left - PAD.right;
    const H = cssH - PAD.top  - PAD.bottom;

    const maxWpm = Math.max(...scores.map(s => s.wpm || 0), 10);
    const yMax   = Math.ceil(maxWpm / 10) * 10;
    const n      = scores.length;
    const rollingWindow = Math.max(4, Math.min(10, Math.round(n / 6)));
    const rollingWpm = scores.map((_, idx) => {
        const from = Math.max(0, idx - rollingWindow + 1);
        const slice = scores.slice(from, idx + 1);
        const avg = slice.reduce((sum, row) => sum + (Number(row.wpm) || 0), 0) / Math.max(1, slice.length);
        return avg;
    });

    const toX = i   => PAD.left + (i / (n - 1)) * W;
    const toY = wpm => PAD.top  + (1 - wpm / yMax) * H;

    const gridColor  = '#2a2a45';
    const labelColor = '#4b5568';
    const lineColor  = '#6aa8ff';
    const avgLineColor = '#f59e0b';
    const fillTop    = 'rgba(124,111,247,0.3)';
    const fillBot    = 'rgba(124,111,247,0)';
    const dotColor   = '#9ec5ff';

    ctx.strokeStyle = gridColor;
    ctx.fillStyle   = labelColor;
    ctx.font        = '10px system-ui,sans-serif';
    ctx.textAlign   = 'right';
    ctx.lineWidth   = 1;
    const step = yMax <= 40 ? 10 : yMax <= 80 ? 20 : 30;
    for (let w = 0; w <= yMax; w += step) {
        const y = toY(w);
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + W, y); ctx.stroke();
        ctx.fillText(w, PAD.left - 5, y + 3.5);
    }

    // Gradient fill
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + H);
    grad.addColorStop(0, fillTop);
    grad.addColorStop(1, fillBot);
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(scores[0].wpm || 0));
    for (let i = 1; i < n; i++) {
        const p0 = scores[Math.max(i-2,0)], p1 = scores[i-1], p2 = scores[i], p3 = scores[Math.min(i+1,n-1)];
        ctx.bezierCurveTo(
            toX(i-1) + (toX(i)   - toX(Math.max(i-2,0))) / 6,   toY(p1.wpm||0) + (toY(p2.wpm||0) - toY(p0.wpm||0)) / 6,
            toX(i)   - (toX(Math.min(i+1,n-1)) - toX(i-1)) / 6, toY(p2.wpm||0) - (toY(p3.wpm||0) - toY(p1.wpm||0)) / 6,
            toX(i), toY(p2.wpm||0)
        );
    }
    ctx.lineTo(toX(n-1), toY(0)); ctx.lineTo(toX(0), toY(0)); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // Raw line
    ctx.strokeStyle = lineColor; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(toX(0), toY(scores[0].wpm || 0));
    for (let i = 1; i < n; i++) {
        const p0 = scores[Math.max(i-2,0)], p1 = scores[i-1], p2 = scores[i], p3 = scores[Math.min(i+1,n-1)];
        ctx.bezierCurveTo(
            toX(i-1) + (toX(i)   - toX(Math.max(i-2,0))) / 6,   toY(p1.wpm||0) + (toY(p2.wpm||0) - toY(p0.wpm||0)) / 6,
            toX(i)   - (toX(Math.min(i+1,n-1)) - toX(i-1)) / 6, toY(p2.wpm||0) - (toY(p3.wpm||0) - toY(p1.wpm||0)) / 6,
            toX(i), toY(p2.wpm||0)
        );
    }
    ctx.stroke();

    // Rolling average line
    ctx.strokeStyle = avgLineColor;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(rollingWpm[0] || 0));
    for (let i = 1; i < n; i++) {
        ctx.lineTo(toX(i), toY(rollingWpm[i] || 0));
    }
    ctx.stroke();

    // Dots
    ctx.fillStyle = dotColor;
    for (let i = 0; i < n; i++) {
        ctx.beginPath(); ctx.arc(toX(i), toY(scores[i].wpm || 0), n > 30 ? 1.5 : 3, 0, Math.PI * 2); ctx.fill();
    }

    // Legend
    ctx.textAlign = 'left';
    ctx.font = '10px system-ui,sans-serif';
    ctx.fillStyle = '#93c5fd';
    ctx.fillText('Raw', PAD.left + 6, PAD.top + 12);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`Rolling Avg (${rollingWindow})`, PAD.left + 42, PAD.top + 12);
}

function drawProfileHistogram(canvas, allScores) {
    if (allScores.length < 3) return;

    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width, cssH = rect.height;
    if (!cssW || !cssH) return;
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // Bucket into 10-WPM ranges
    const buckets = new Map();
    for (const s of allScores) {
        const b = Math.floor((s.wpm || 0) / 10) * 10;
        buckets.set(b, (buckets.get(b) || 0) + 1);
    }
    const keys = [...buckets.keys()].sort((a, b) => a - b);
    const maxCount = Math.max(...buckets.values(), 1);

    const PAD = { top: 14, right: 16, bottom: 28, left: 38 };
    const W = cssW - PAD.left - PAD.right;
    const H = cssH - PAD.top  - PAD.bottom;
    const barW = W / keys.length;

    const gridColor  = '#2a2a45';
    const labelColor = '#4b5568';
    const barColor   = '#7c6ff7';

    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
    ctx.fillStyle = labelColor; ctx.font = '10px system-ui,sans-serif';

    // Y grid
    const yStep = maxCount <= 5 ? 1 : maxCount <= 10 ? 2 : maxCount <= 20 ? 5 : 10;
    ctx.textAlign = 'right';
    for (let c = 0; c <= maxCount; c += yStep) {
        const y = PAD.top + (1 - c / maxCount) * H;
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + W, y); ctx.stroke();
        ctx.fillText(c, PAD.left - 5, y + 3.5);
    }

    // Bars + X labels
    ctx.textAlign = 'center';
    keys.forEach((key, i) => {
        const count = buckets.get(key) || 0;
        const barH = (count / maxCount) * H;
        const x = PAD.left + i * barW;
        const y = PAD.top + H - barH;
        ctx.fillStyle = barColor;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x + 2, y, barW - 4, barH);
        ctx.globalAlpha = 1;
        ctx.fillStyle = labelColor;
        ctx.fillText(key, x + barW / 2, PAD.top + H + 18);
    });
}

function saveToHistory(entry) {
    const history = loadHistory();
    history.unshift(entry);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (e) {}
}

function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; }
}

function getStoredInt(key, fallback = 0) {
    const n = parseInt(localStorage.getItem(key) || '', 10);
    return Number.isFinite(n) ? Math.max(0, n) : Math.max(0, Number(fallback) || 0);
}

function getHistoryDerivedLifetimeStats() {
    const history = loadHistory();
    const bibleLookup = getBibleModeLookupSet();
    let words = 0;
    let seconds = 0;
    let bestWpm = 0;
    let bibleTests = 0;
    for (const entry of history) {
        if (!entry || typeof entry !== 'object') continue;
        words += Math.max(0, Math.floor(Number(entry.typedWords) || 0));
        seconds += Math.max(0, Math.floor(Number(entry.time) || 0));
        bestWpm = Math.max(bestWpm, Math.floor(Number(entry.wpm) || 0));
        if (entry.bibleMode === true) {
            bibleTests += 1;
            continue;
        }
        if (entry.mode === 'quotes') {
            const text = String(entry.text || '').trim();
            if (text && bibleLookup.has(text)) bibleTests += 1;
        }
    }
    return {
        tests: history.length,
        words,
        seconds,
        bestWpm,
        bibleTests,
    };
}

function getLifetimeStatsSummary() {
    const fromHistory = getHistoryDerivedLifetimeStats();
    const tests = Math.max(getStoredInt(LIFETIME_TESTS_KEY), fromHistory.tests);
    const words = Math.max(getStoredInt(LIFETIME_WORDS_TYPED_KEY), fromHistory.words);
    const seconds = Math.max(getStoredInt(LIFETIME_TIME_SECONDS_KEY), fromHistory.seconds);
    const bestWpm = Math.max(getStoredInt(LIFETIME_BEST_WPM_KEY), fromHistory.bestWpm);
    const bibleTests = Math.max(getStoredInt(LIFETIME_BIBLE_TESTS_KEY), fromHistory.bibleTests);
    return { tests, words, seconds, bestWpm, bibleTests };
}

function recordLifetimeRunStats({ wpm = 0, typedWords = 0, timeSeconds = 0, bibleMode = false } = {}) {
    const current = getLifetimeStatsSummary();
    const nextTests = current.tests + 1;
    const nextWords = current.words + Math.max(0, Math.floor(Number(typedWords) || 0));
    const nextSeconds = current.seconds + Math.max(0, Math.floor(Number(timeSeconds) || 0));
    const nextBest = Math.max(current.bestWpm, Math.floor(Number(wpm) || 0));
    const nextBibleTests = current.bibleTests + (bibleMode ? 1 : 0);
    try {
        localStorage.setItem(LIFETIME_TESTS_KEY, String(nextTests));
        localStorage.setItem(LIFETIME_WORDS_TYPED_KEY, String(nextWords));
        localStorage.setItem(LIFETIME_TIME_SECONDS_KEY, String(nextSeconds));
        localStorage.setItem(LIFETIME_BEST_WPM_KEY, String(nextBest));
        localStorage.setItem(LIFETIME_BIBLE_TESTS_KEY, String(nextBibleTests));
    } catch (e) {}
    scheduleProgressSync(300);
}

function formatLifetimeDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || parts.length) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
    return parts.join(' ');
}

function clearHistory() {
    if (!confirm('Clear all history?')) return;
    playSound(SFX.clearHistory);
    try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
    const section = document.getElementById('history-section');
    const listEl  = document.getElementById('history-list');
    const bestEl  = document.getElementById('history-best');
    if (listEl) listEl.replaceChildren();
    if (bestEl) bestEl.textContent = '';
    if (section) section.style.display = 'none';
    renderHistory();
}

function closeResults() {
    resultOverlay.classList.remove('show');
    updateMiningLaserAtActiveWord();
    if (returnToDailyAfterResult) {
        returnToDailyAfterResult = false;
        setMode('daily');
    }
}

function renderHistory() {
    const history = loadHistory();
    const section = document.getElementById('history-section');
    const listEl  = document.getElementById('history-list');
    const bestEl  = document.getElementById('history-best');

    if (history.length === 0) {
        if (listEl) listEl.replaceChildren();
        if (bestEl) bestEl.textContent = '';
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    const bestWpm = Math.max(...history.map(h => h.wpm));
    bestEl.innerHTML = `<span class="history-best-icon" aria-hidden="true">🏆</span><span class="history-best-label">Personal Best</span><span class="history-best-value">${bestWpm} WPM</span>`;

    listEl.innerHTML = '';
    history.slice(0, 10).forEach(entry => {
        const isBest = entry.wpm === bestWpm;
        const date   = new Date(entry.date);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const snip   = entry.text.length > 45 ? entry.text.slice(0, 45) + '…' : entry.text;

        const row = document.createElement('div');
        row.className = 'history-row' + (isBest ? ' is-best' : '');
        row.innerHTML = `
            <span class="h-date">${escapeHtml(dateStr)}</span>
            <span class="h-mode">${escapeHtml(entry.mode)}</span>
            <span class="h-wpm">${Number(entry.wpm)} WPM</span>
            <span class="h-acc">${Number(entry.accuracy)}%</span>
            <span class="h-text" title="${escapeHtml(entry.text)}">${escapeHtml(snip)}</span>
        `;
        listEl.appendChild(row);
    });
}

// ── Completion ─────────────────────────────────────────────────────────────
