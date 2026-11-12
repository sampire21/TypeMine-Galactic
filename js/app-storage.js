function loadLocalJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return parsed == null ? fallback : parsed;
    } catch (e) {
        return fallback;
    }
}

function saveLocalJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

function isProgressSyncKey(key) {
    return SYNC_PROGRESS_KEYS.includes(String(key || ''));
}

function getProgressOwner() {
    try { return localStorage.getItem(PROGRESS_OWNER_KEY) || ''; } catch (e) { return ''; }
}

function setProgressOwner(userId) {
    try { localStorage.setItem(PROGRESS_OWNER_KEY, String(userId || '')); } catch (e) {}
}

function clearSyncedLocalProgress() {
    suppressProgressSync = true;
    try {
        for (const key of SYNC_PROGRESS_KEYS) localStorage.removeItem(key);
    } catch (e) {}
    try { skillStateCache = null; } catch (e) {}
    suppressProgressSync = false;
}

function getProgressSnapshotFromLocal() {
    const progress = {};
    try {
        for (const key of SYNC_PROGRESS_KEYS) {
            const raw = localStorage.getItem(key);
            if (raw != null) progress[key] = raw;
        }
    } catch (e) {}
    return progress;
}

function parseProgressJsonSafe(raw, fallback) {
    try {
        const parsed = JSON.parse(raw || '');
        return parsed == null ? fallback : parsed;
    } catch (e) {
        return fallback;
    }
}

function normalizeBadgeIdList(raw) {
    const rows = Array.isArray(raw) ? raw : [];
    return rows
        .map((entry) => {
            if (typeof entry === 'string') return { id: entry, earnedAt: null };
            const id = String(entry && entry.id || '');
            if (!id) return null;
            const earnedAt = Number(entry && entry.earnedAt);
            return { id, earnedAt: Number.isFinite(earnedAt) ? earnedAt : null };
        })
        .filter(Boolean);
}

function getShopKeySoundPackIds() {
    return ['cherrymx-blue-abs', 'Buckling Springs', 'Cherry MX Blacks', 'Cherry MX Browns', 'Cherry MX Reds'];
}

function mergeProgressSnapshotsForSameOwner(remoteProgress = {}, localProgress = {}) {
    const merged = { ...(remoteProgress || {}) };
    let changed = false;

    const preserveIfMissing = [
        'sampire-skills',
        'sampire-reward-settings',
        'sampire-badges',
        'sampire-active-soundscape',
        'sampire-music-muted',
        'sampire-music-volume',
        'sampire-key-sound-volume',
        LIFETIME_TESTS_KEY,
        LIFETIME_WORDS_TYPED_KEY,
        LIFETIME_TIME_SECONDS_KEY,
        LIFETIME_BEST_WPM_KEY,
        LIFETIME_BIBLE_TESTS_KEY,
    ];
    for (const key of preserveIfMissing) {
        if (merged[key] == null && localProgress[key] != null) {
            merged[key] = localProgress[key];
            changed = true;
        }
    }

    const remoteSkills = parseProgressJsonSafe(merged['sampire-skills'] || '{}', {});
    const localSkills = parseProgressJsonSafe(localProgress['sampire-skills'] || '{}', {});
    const skillKeys = ['aura', 'soundscapes', 'nebulaTrail'];
    const mergedSkills = {};
    for (const key of skillKeys) mergedSkills[key] = !!remoteSkills[key] || !!localSkills[key];
    const mergedPackUnlocks = {};
    for (const id of getShopKeySoundPackIds()) {
        mergedPackUnlocks[id] = !!(remoteSkills.keySoundPacks && remoteSkills.keySoundPacks[id])
            || !!(localSkills.keySoundPacks && localSkills.keySoundPacks[id]);
    }
    mergedSkills.keySoundPacks = mergedPackUnlocks;
    const mergedSkillsRaw = JSON.stringify(mergedSkills);
    if (String(merged['sampire-skills'] || '') !== mergedSkillsRaw) {
        merged['sampire-skills'] = mergedSkillsRaw;
        changed = true;
    }

    const remoteBadges = normalizeBadgeIdList(parseProgressJsonSafe(merged['sampire-badges'] || '[]', []));
    const localBadges = normalizeBadgeIdList(parseProgressJsonSafe(localProgress['sampire-badges'] || '[]', []));
    const badgeById = new Map();
    for (const b of [...remoteBadges, ...localBadges]) {
        const prev = badgeById.get(b.id);
        if (!prev) {
            badgeById.set(b.id, b);
            continue;
        }
        const prevTs = Number(prev.earnedAt) || 0;
        const nextTs = Number(b.earnedAt) || 0;
        if (nextTs > prevTs) badgeById.set(b.id, b);
    }
    const mergedBadges = [...badgeById.values()];
    const mergedBadgesRaw = JSON.stringify(mergedBadges);
    if (String(merged['sampire-badges'] || '') !== mergedBadgesRaw) {
        merged['sampire-badges'] = mergedBadgesRaw;
        changed = true;
    }

    return { progress: merged, changed };
}

function applyProgressSnapshotToLocal(progress) {
    if (!progress || typeof progress !== 'object') return;
    suppressProgressSync = true;
    try {
        for (const key of SYNC_PROGRESS_KEYS) localStorage.removeItem(key);
        for (const [key, raw] of Object.entries(progress)) {
            if (!isProgressSyncKey(key)) continue;
            if (raw == null) continue;
            localStorage.setItem(key, String(raw));
        }
    } catch (e) {}
    try { skillStateCache = null; } catch (e) {}
    suppressProgressSync = false;
}

async function pushCloudProgressSnapshot() {
    if (!currentUser || progressSyncInFlight || suppressProgressSync) return;
    progressSyncInFlight = true;
    try {
        const out = await apiFetch('/api/progress', {
            method: 'PUT',
            body: JSON.stringify({
                progress: getProgressSnapshotFromLocal(),
                baseUpdatedAt: progressCloudUpdatedAt,
            }),
        });
        progressCloudUpdatedAt = Number(out && out.updatedAt) || progressCloudUpdatedAt;
    } catch (e) {
        // Keep remote source of truth if another device has newer progress.
        if (e && e.status === 409 && e.payload && typeof e.payload.progress === 'object') {
            applyProgressSnapshotToLocal(e.payload.progress);
            progressCloudUpdatedAt = Number(e.payload.updatedAt) || progressCloudUpdatedAt;
            setProgressOwner(String(currentUser && currentUser.id || ''));
            updateXPDisplay();
            renderHistory();
            updateProfileToggleHoverInfo();
            if (currentMode === 'daily') renderDailyChallenges();
        }
    } finally {
        progressSyncInFlight = false;
    }
}

function scheduleProgressSync(delayMs = 800) {
    if (!currentUser || suppressProgressSync) return;
    if (progressSyncTimer) clearTimeout(progressSyncTimer);
    progressSyncTimer = setTimeout(() => {
        progressSyncTimer = null;
        pushCloudProgressSnapshot();
    }, delayMs);
}

function flushProgressSyncNow() {
    if (!currentUser || suppressProgressSync) return;
    if (progressSyncTimer) {
        clearTimeout(progressSyncTimer);
        progressSyncTimer = null;
    }
    pushCloudProgressSnapshot();
}

async function hydrateProgressForCurrentUser() {
    if (!currentUser) return;
    const uid = String(currentUser.id || '');
    if (!uid) return;
    const owner = getProgressOwner();
    let remote = null;
    try {
        remote = await apiFetch('/api/progress');
    } catch (e) {}
    const remoteProgress = remote && remote.progress && typeof remote.progress === 'object' ? remote.progress : null;
    const remoteUpdatedAt = Number(remote && remote.updatedAt) || 0;
    const hasRemoteProgress = !!(remoteProgress && Object.keys(remoteProgress).length > 0);
    const hasRemoteRecord = hasRemoteProgress || remoteUpdatedAt > 0;

    if (hasRemoteRecord) {
        const localProgressBefore = owner === uid ? getProgressSnapshotFromLocal() : {};
        const merged = owner === uid
            ? mergeProgressSnapshotsForSameOwner(remoteProgress || {}, localProgressBefore || {})
            : { progress: remoteProgress || {}, changed: false };
        applyProgressSnapshotToLocal(merged.progress || {});
        setProgressOwner(uid);
        progressCloudUpdatedAt = remoteUpdatedAt;
        if (merged.changed) {
            // Push merged state so cloud snapshot catches up with local unlocks/preferences.
            await pushCloudProgressSnapshot();
        }
    } else {
        if (owner && owner !== uid) {
            clearSyncedLocalProgress();
            setProgressOwner(uid);
            progressCloudUpdatedAt = 0;
            await pushCloudProgressSnapshot();
        } else {
            setProgressOwner(uid);
            progressCloudUpdatedAt = 0;
            await pushCloudProgressSnapshot();
        }
    }

    updateXPDisplay();
    renderHistory();
    updateProfileToggleHoverInfo();
    if (currentMode === 'daily') renderDailyChallenges();
}

// Patch storage writes so progress sync stays automatic across all existing code paths.
try {
    const _rawSetItem = localStorage.setItem.bind(localStorage);
    const _rawRemoveItem = localStorage.removeItem.bind(localStorage);
    localStorage.setItem = function patchedSetItem(key, value) {
        const result = _rawSetItem(String(key), String(value));
        if (isProgressSyncKey(key)) scheduleProgressSync();
        return result;
    };
    localStorage.removeItem = function patchedRemoveItem(key) {
        const result = _rawRemoveItem(String(key));
        if (isProgressSyncKey(key)) scheduleProgressSync();
        return result;
    };
} catch (e) {
    // Storage can be blocked in strict browser privacy modes. Keep app bootable.
}

function snapshotCriticalStorageOnce() {
    try {
        if (localStorage.getItem(STORAGE_SAFETY_SNAPSHOT_KEY)) return;
        const keys = {};
        for (const key of CRITICAL_STORAGE_KEYS) {
            const raw = localStorage.getItem(key);
            if (raw != null) keys[key] = raw;
        }
        localStorage.setItem(STORAGE_SAFETY_SNAPSHOT_KEY, JSON.stringify({
            createdAt: Date.now(),
            keys,
        }));
    } catch (e) {}
}

function isBetterScore(candidate, baseline) {
    if (!baseline) return true;
    if ((candidate.wpm || 0) > (baseline.wpm || 0)) return true;
    if ((candidate.wpm || 0) < (baseline.wpm || 0)) return false;
    if ((candidate.accuracy || 0) > (baseline.accuracy || 0)) return true;
    if ((candidate.accuracy || 0) < (baseline.accuracy || 0)) return false;
    return (candidate.date || 0) > (baseline.date || 0);
}

function getGuestSessionId() {
    try {
        let id = sessionStorage.getItem(GUEST_SESSION_ID_KEY);
        if (!id) {
            id = crypto.randomUUID();
            sessionStorage.setItem(GUEST_SESSION_ID_KEY, id);
        }
        return id;
    } catch (e) {
        return 'guest-session';
    }
}

const GUEST_LOCATION_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
let guestLocationResolvePromise = null;

function sanitizeGuestLocationValue(value = '') {
    return String(value || '')
        .trim()
        .replace(/[<>]/g, '')
        .slice(0, 64);
}

function getCachedGuestLocation(allowStale = false) {
    try {
        const raw = localStorage.getItem(GUEST_LOCATION_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        const updatedAt = Number(parsed.updatedAt) || 0;
        const city = sanitizeGuestLocationValue(parsed.city || '');
        const country = sanitizeGuestLocationValue(parsed.country || '');
        if (!city && !country) return null;
        if (!allowStale && updatedAt > 0 && (Date.now() - updatedAt) > GUEST_LOCATION_CACHE_TTL_MS) return null;
        return { city, country, updatedAt };
    } catch (e) {
        return null;
    }
}

function cacheGuestLocation(city = '', country = '') {
    const safeCity = sanitizeGuestLocationValue(city);
    const safeCountry = sanitizeGuestLocationValue(country);
    if (!safeCity && !safeCountry) return;
    try {
        localStorage.setItem(GUEST_LOCATION_CACHE_KEY, JSON.stringify({
            city: safeCity,
            country: safeCountry,
            updatedAt: Date.now(),
        }));
    } catch (e) {}
}

function getGuestDisplayNameFromLocation(location = null) {
    const city = sanitizeGuestLocationValue(location && location.city);
    const country = sanitizeGuestLocationValue(location && location.country);
    if (city && country) return `Guest from ${city}, ${country}`;
    if (country) return `Guest from ${country}`;
    if (city) return `Guest from ${city}`;
    return 'Guest';
}

async function resolveGuestLocation() {
    if (currentUser) return null;
    const cached = getCachedGuestLocation(false);
    if (cached) return cached;
    if (guestLocationResolvePromise) return guestLocationResolvePromise;
    guestLocationResolvePromise = (async () => {
        try {
            const res = await fetchWithTimeout('https://ipapi.co/json/', {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
            }, 4200);
            if (!res || !res.ok) return getCachedGuestLocation(true);
            const data = await res.json().catch(() => ({}));
            const city = sanitizeGuestLocationValue(data && (data.city || data.region_city || data.town || ''));
            const country = sanitizeGuestLocationValue(data && (data.country_name || data.country || ''));
            if (!city && !country) return getCachedGuestLocation(true);
            cacheGuestLocation(city, country);
            const loc = getCachedGuestLocation(true);
            if (loc) updateGuestScoresLocation(loc);
            return loc;
        } catch (e) {
            return getCachedGuestLocation(true);
        } finally {
            guestLocationResolvePromise = null;
        }
    })();
    return guestLocationResolvePromise;
}

function updateGuestScoresLocation(location = null) {
    const loc = location || getCachedGuestLocation(true);
    if (!loc) return;
    const guestId = `guest:${getGuestSessionId()}`;
    const guestScores = loadLocalJson(LOCAL_GUEST_SCORES_KEY, []);
    let mutated = false;
    for (const row of guestScores) {
        if (!row || String(row.userId || '') !== guestId) continue;
        if (row.city !== loc.city || row.country !== loc.country) {
            row.city = loc.city || '';
            row.country = loc.country || '';
            row.username = getGuestDisplayNameFromLocation(loc);
            mutated = true;
        }
    }
    if (mutated) {
        saveLocalJson(LOCAL_GUEST_SCORES_KEY, guestScores);
        if (lbActiveTab === 'alltime' || lbActiveTab === 'weekly') refreshLeaderboard();
    }
}

function makeLocalToken(userId) {
    return `local-token:${userId}`;
}

function getLocalUserFromAuth(headers = {}) {
    const auth = headers.Authorization || headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7);
    if (!token.startsWith('local-token:')) return null;
    const userId = token.slice('local-token:'.length);
    const users = loadLocalJson(LOCAL_AUTH_USERS_KEY, []);
    const user = users.find(u => u.id === userId);
    if (!user) return null;
    return { id: user.id, username: user.username };
}

function localApiError(status, error, payload = null) {
    const err = new Error(error || `Request failed (${status})`);
    err.status = status;
    err.payload = payload && typeof payload === 'object' ? payload : { error };
    throw err;
}

// SHA-256 hash with salt for local-storage credential storage.
async function localHashPassword(password, salt) {
    const data = new TextEncoder().encode(salt + password);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function localApiFetch(url, options = {}, headers = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const parsed = new URL(url, 'https://local.app');
    const pathname = parsed.pathname;
    const params = parsed.searchParams;
    let body = {};
    if (options.body) {
        try { body = JSON.parse(options.body); } catch (e) {}
    }

    const users = loadLocalJson(LOCAL_AUTH_USERS_KEY, []);
    const scores = loadLocalJson(LOCAL_AUTH_SCORES_KEY, []);
    const guestScores = loadLocalJson(LOCAL_GUEST_SCORES_KEY, []);

    if (method === 'POST' && pathname === '/api/signup') {
        const usernameRaw = String(body.username || '').trim();
        const usernameNorm = usernameRaw.toLowerCase();
        const password = String(body.password || '');
        if (!usernameNorm || usernameNorm.length < 3 || usernameNorm.length > 24 || !/^[a-z0-9_]+$/.test(usernameNorm)) {
            localApiError(400, 'Username must be 3-24 chars: a-z, 0-9, _');
        }
        if (password.length < 6) localApiError(400, 'Password must be at least 6 characters');
        if (users.some(u => u.usernameNorm === usernameNorm)) localApiError(409, 'Username already exists');
        // Hash password with SHA-256 + a random salt for local storage.
        // Not as strong as scrypt/bcrypt but far better than plaintext.
        const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(16).padStart(2, '0')).join('');
        const pwHash = await localHashPassword(password, salt);
        const user = {
            id: crypto.randomUUID(),
            username: usernameRaw,
            usernameNorm,
            passwordHash: pwHash,
            passwordSalt: salt,
            createdAt: Date.now(),
            lastLoginAt: Date.now(),
            lastSeenAt: Date.now(),
        };
        users.push(user);
        saveLocalJson(LOCAL_AUTH_USERS_KEY, users);
        return { user: { id: user.id, username: user.username }, token: makeLocalToken(user.id) };
    }

    if (method === 'POST' && pathname === '/api/login') {
        const usernameNorm = String(body.username || '').trim().toLowerCase();
        const password = String(body.password || '');
        const userIdx = users.findIndex(u => u.usernameNorm === usernameNorm);
        const user = userIdx >= 0 ? users[userIdx] : null;
        if (!user) localApiError(401, 'Invalid username or password');
        // Support legacy plaintext entries created before this fix.
        const isValid = user.passwordHash
            ? (await localHashPassword(password, user.passwordSalt)) === user.passwordHash
            : user.password === password;
        if (!isValid) localApiError(401, 'Invalid username or password');
        const now = Date.now();
        users[userIdx].lastLoginAt = now;
        users[userIdx].lastSeenAt = now;
        saveLocalJson(LOCAL_AUTH_USERS_KEY, users);
        return { user: { id: user.id, username: user.username }, token: makeLocalToken(user.id) };
    }

    if (method === 'GET' && pathname === '/api/me') {
        const user = getLocalUserFromAuth(headers);
        if (!user) localApiError(401, 'Unauthorized');
        return { user };
    }

    if (method === 'POST' && pathname === '/api/logout') {
        return { ok: true };
    }

    if (method === 'POST' && pathname === '/api/refresh') {
        const user = getLocalUserFromAuth(headers);
        if (!user) localApiError(401, 'Unauthorized');
        return { ok: true, user };
    }

    if (pathname === '/api/progress' && method === 'GET') {
        const user = getLocalUserFromAuth(headers);
        if (!user) localApiError(401, 'Unauthorized');
        const full = users.find(u => u.id === user.id);
        if (!full) localApiError(401, 'Unauthorized');
        return {
            progress: (full.progress && typeof full.progress === 'object') ? full.progress : {},
            updatedAt: Number(full.progressUpdatedAt) || 0,
        };
    }

    if (pathname === '/api/progress' && method === 'PUT') {
        const user = getLocalUserFromAuth(headers);
        if (!user) localApiError(401, 'Unauthorized');
        const userIdx = users.findIndex(u => u.id === user.id);
        if (userIdx < 0) localApiError(401, 'Unauthorized');
        const currentUpdatedAt = Number(users[userIdx].progressUpdatedAt) || 0;
        const baseUpdatedAtRaw = Number(body && body.baseUpdatedAt);
        const baseUpdatedAt = Number.isFinite(baseUpdatedAtRaw)
            ? Math.max(0, Math.floor(baseUpdatedAtRaw))
            : 0;
        if (baseUpdatedAt < currentUpdatedAt) {
            localApiError(409, 'Progress conflict: newer progress exists on another session.', {
                error: 'Progress conflict: newer progress exists on another session.',
                progress: (users[userIdx].progress && typeof users[userIdx].progress === 'object') ? users[userIdx].progress : {},
                updatedAt: currentUpdatedAt,
            });
        }
        const progress = (body && body.progress && typeof body.progress === 'object' && !Array.isArray(body.progress))
            ? body.progress
            : {};
        users[userIdx].progress = progress;
        users[userIdx].progressUpdatedAt = Date.now();
        users[userIdx].lastSeenAt = Date.now();
        saveLocalJson(LOCAL_AUTH_USERS_KEY, users);
        return { ok: true, updatedAt: users[userIdx].progressUpdatedAt };
    }

    if (method === 'POST' && pathname === '/api/scores') {
        const user = getLocalUserFromAuth(headers);
        if (!user) localApiError(401, 'Unauthorized');
        const score = {
            id: crypto.randomUUID(),
            userId: user.id,
            username: user.username,
            wpm: Number(body.wpm) || 0,
            accuracy: Number(body.accuracy) || 0,
            rawWpm: Number(body.rawWpm) || 0,
            consistency: Number(body.consistency) || 0,
            time: Number(body.time) || 0,
            mode: String(body.mode || 'quotes'),
            date: Number(body.date) || Date.now(),
            createdAt: Date.now(),
        };
        if (score.wpm < 0 || score.wpm > 400) localApiError(400, 'Invalid score payload');
        const existingIdx = scores.findIndex(s => s.userId === user.id && s.mode === score.mode);
        const existing = existingIdx >= 0 ? scores[existingIdx] : null;
        if (!isBetterScore(score, existing)) {
            localApiError(409, 'Only your best run for this mode can be submitted.');
        }
        if (existingIdx >= 0) scores[existingIdx] = score;
        else scores.push(score);
        if (scores.length > 5000) scores.splice(0, scores.length - 5000);
        saveLocalJson(LOCAL_AUTH_SCORES_KEY, scores);
        const ownerIdx = users.findIndex(u => u.id === user.id);
        if (ownerIdx >= 0) {
            users[ownerIdx].lastSeenAt = Date.now();
            saveLocalJson(LOCAL_AUTH_USERS_KEY, users);
        }
        return { ok: true, score };
    }

    if (method === 'GET' && pathname === '/api/scores/me') {
        const user = getLocalUserFromAuth(headers);
        if (!user) localApiError(401, 'Unauthorized');
        const limit = Math.max(1, Math.min(200, Number(params.get('limit') || 50)));
        const mode = (params.get('mode') || '').trim();
        const list = scores
            .filter(s => s.userId === user.id && (!mode || s.mode === mode))
            .sort((a, b) => b.date - a.date)
            .slice(0, limit);
        return { scores: list };
    }

    if (method === 'GET' && pathname === '/api/leaderboard') {
        const limit = Math.max(1, Math.min(1000, Number(params.get('limit') || 20)));
        const community = params.get('community') === '1' || (params.get('tab') || '').trim() === 'community';
        if (community) {
            const state = getCommunityWeeklyContributionState();
            const contributions = Object.values(state.entries || {})
                .map(entry => ({
                    id: String(entry.id || ''),
                    username: String(entry.name || 'Unknown'),
                    damage: Math.max(0, Math.floor(Number(entry.words) || 0)),
                }))
                .filter(row => row.damage > 0)
                .sort((a, b) => b.damage - a.damage || a.username.localeCompare(b.username))
                .slice(0, limit);
            return { week: getWeekKeyUtc(), contributions };
        }
        const mode = (params.get('mode') || '').trim();
        const bestByUserMode = new Map();
        for (const score of [...scores, ...guestScores]) {
            if (mode && score.mode !== mode) continue;
            const key = `${score.userId}::${score.mode}`;
            const prev = bestByUserMode.get(key);
            if (isBetterScore(score, prev)) bestByUserMode.set(key, score);
        }
        const leaderboard = [...bestByUserMode.values()]
            .sort((a, b) => b.wpm - a.wpm || b.accuracy - a.accuracy || b.date - a.date)
            .slice(0, limit)
            .map(s => ({
                userId: s.userId,
                username: s.username,
                city: String(s.city || ''),
                country: String(s.country || ''),
                mode: s.mode,
                wpm: s.wpm,
                accuracy: s.accuracy,
                rawWpm: s.rawWpm,
                time: s.time,
                date: s.date,
            }));
        return { leaderboard };
    }

    if (method === 'GET' && pathname === '/api/user-summary') {
        const usernameRaw = String(params.get('username') || '').trim();
        if (!usernameRaw) localApiError(400, 'username is required');
        const usernameNorm = usernameRaw.toLowerCase();
        const target = users.find(u => String(u.usernameNorm || '').toLowerCase() === usernameNorm);
        if (!target) localApiError(404, 'User not found');
        const progress = (target.progress && typeof target.progress === 'object') ? target.progress : {};
        const parseJsonSafe = (raw, fallback) => {
            try { const p = JSON.parse(raw || ''); return p == null ? fallback : p; } catch (e) { return fallback; }
        };
        const badgesRaw = parseJsonSafe(progress['sampire-badges'] || '[]', []);
        const badgeIds = (Array.isArray(badgesRaw) ? badgesRaw : [])
            .map((b) => (typeof b === 'string' ? b : String(b && b.id || '')))
            .filter(Boolean);
        const badgeUnique = [...new Set(badgeIds)];
        const dailyObj = parseJsonSafe(progress['sampire-daily-v2'] || '{}', {});
        const weeklyObj = parseJsonSafe(progress['sampire-weekly'] || '{}', {});
        let dailyTotal = 0;
        if (dailyObj && typeof dailyObj === 'object') {
            if (Array.isArray(dailyObj.completions)) dailyTotal = dailyObj.completions.length;
            else if (dailyObj.days && typeof dailyObj.days === 'object') {
                dailyTotal = Object.values(dailyObj.days).reduce((sum, row) => {
                    const completions = Array.isArray(row)
                        ? row
                        : ((row && Array.isArray(row.completions)) ? row.completions : []);
                    return sum + completions.length;
                }, 0);
            }
        }
        const weeklyCount = (weeklyObj && Array.isArray(weeklyObj.completions)) ? weeklyObj.completions.length : 0;
        const lifetimeStored = Math.max(0, parseInt(progress['sampire-lifetime-challenges-completed'] || '0', 10) || 0);
        const xp = Math.max(0, parseInt(progress['sampire-xp'] || '0', 10) || 0);
        const level = Math.max(1, Math.floor(xp / 500) + 1);
        const personalBestWpm = scores
            .filter((s) => s.userId === target.id)
            .reduce((best, s) => Math.max(best, Math.max(0, Number(s && s.wpm) || 0)), 0);
        const contribState = getCommunityWeeklyContributionState();
        const contribRow = (contribState && contribState.entries && contribState.entries[`user:${target.id}`]) || null;
        const communityContributionTotal = Math.max(0, Math.floor(Number(contribRow && contribRow.words) || 0));
        return {
            username: target.username,
            badgeIds: badgeUnique,
            lifetimeChallengesCompleted: Math.max(lifetimeStored, dailyTotal + weeklyCount),
            level,
            personalBestWpm,
            communityContributionTotal,
        };
    }

    if (pathname === '/api/account' && method === 'PATCH') {
        const localUser = getLocalUserFromAuth(headers);
        if (!localUser) localApiError(401, 'Unauthorized');
        const userIdx = users.findIndex(u => u.id === localUser.id);
        if (userIdx < 0) localApiError(401, 'Unauthorized');
        const user = users[userIdx];

        const nextUsernameRaw = body.username != null ? String(body.username).trim() : '';
        const nextPassword = body.newPassword != null ? String(body.newPassword) : '';
        const currentPassword = body.currentPassword != null ? String(body.currentPassword) : '';

        if (!nextUsernameRaw && !nextPassword) {
            localApiError(400, 'No account changes provided');
        }

        if (nextUsernameRaw) {
            const usernameNorm = nextUsernameRaw.toLowerCase();
            if (!usernameNorm || usernameNorm.length < 3 || usernameNorm.length > 24 || !/^[a-z0-9_]+$/.test(usernameNorm)) {
                localApiError(400, 'Username must be 3-24 chars: a-z, 0-9, _');
            }
            const taken = users.some(u => u.usernameNorm === usernameNorm && u.id !== user.id);
            if (taken) localApiError(409, 'Username already exists');
            user.username = nextUsernameRaw;
            user.usernameNorm = usernameNorm;
            for (const row of scores) {
                if (row.userId === user.id) row.username = nextUsernameRaw;
            }
            for (const row of guestScores) {
                if (row.userId === user.id) row.username = nextUsernameRaw;
            }
            saveLocalJson(LOCAL_AUTH_SCORES_KEY, scores);
            saveLocalJson(LOCAL_GUEST_SCORES_KEY, guestScores);
        }

        if (nextPassword) {
            if (nextPassword.length < 6) localApiError(400, 'Password must be at least 6 characters');
            const valid = user.passwordHash
                ? (await localHashPassword(currentPassword, user.passwordSalt)) === user.passwordHash
                : user.password === currentPassword;
            if (!valid) localApiError(401, 'Current password is incorrect');
            const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
                .map(b => b.toString(16).padStart(2, '0')).join('');
            const pwHash = await localHashPassword(nextPassword, salt);
            user.passwordSalt = salt;
            user.passwordHash = pwHash;
            delete user.password;
        }

        users[userIdx] = user;
        saveLocalJson(LOCAL_AUTH_USERS_KEY, users);
        return { ok: true, user: { id: user.id, username: user.username } };
    }

    if (pathname === '/api/account' && method === 'DELETE') {
        const localUser = getLocalUserFromAuth(headers);
        if (!localUser) localApiError(401, 'Unauthorized');
        const userIdx = users.findIndex(u => u.id === localUser.id);
        if (userIdx < 0) localApiError(401, 'Unauthorized');
        const user = users[userIdx];
        const usernameConfirm = String(body.usernameConfirm || '').trim();
        if (usernameConfirm !== user.username) localApiError(400, 'Username confirmation does not match');
        const currentPassword = body.currentPassword != null ? String(body.currentPassword) : '';
        const validPassword = user.passwordHash
            ? (await localHashPassword(currentPassword, user.passwordSalt)) === user.passwordHash
            : user.password === currentPassword;
        if (!validPassword) localApiError(401, 'Current password is incorrect');

        users.splice(userIdx, 1);
        saveLocalJson(LOCAL_AUTH_USERS_KEY, users);
        const nextScores = scores.filter(s => s.userId !== user.id);
        saveLocalJson(LOCAL_AUTH_SCORES_KEY, nextScores);
        return { ok: true };
    }

    if (method === 'POST' && pathname === '/api/community/contribute') {
        const add = Math.max(0, Math.floor(Number(body.words) || 0));
        if (add <= 0) return { ok: true };
        const state = getCommunityWeeklyContributionState();
        const localUser = getLocalUserFromAuth(headers);
        if (localUser) {
            const key = `user:${localUser.id}`;
            const prev = state.entries[key] || { id: key, name: localUser.username, words: 0 };
            state.entries[key] = {
                id: key,
                name: localUser.username,
                words: Math.max(0, Math.floor(Number(prev.words) || 0) + add),
            };
        } else {
            const id = String(body.guestId || getGuestSessionId());
            const username = String(body.guestName || `Guest-${id.slice(0, 4)}`);
            const key = `guest:${id}`;
            const prev = state.entries[key] || { id: key, name: username, words: 0 };
            state.entries[key] = {
                id: key,
                name: username,
                words: Math.max(0, Math.floor(Number(prev.words) || 0) + add),
            };
        }
        setCommunityWeeklyContributionState(state);
        return { ok: true };
    }

    if (method === 'GET' && pathname === '/api/admin/users') {
        const admin = getLocalUserFromAuth(headers);
        if (!admin || String(admin.username || '').trim().toLowerCase() !== 'sampire') localApiError(403, 'Forbidden');
        const summarize = (u) => {
            const dailyCompletionCount = (dailyObj) => {
                if (!dailyObj || typeof dailyObj !== 'object') return 0;
                if (Array.isArray(dailyObj.completions)) return dailyObj.completions.length;
                const days = dailyObj.days && typeof dailyObj.days === 'object' ? dailyObj.days : {};
                const keys = Object.keys(days);
                if (!keys.length) return 0;
                keys.sort();
                const latest = days[keys[keys.length - 1]] || {};
                return Array.isArray(latest.completions) ? latest.completions.length : 0;
            };
            const progress = (u.progress && typeof u.progress === 'object') ? u.progress : {};
            const xp = Math.max(0, parseInt(progress['sampire-xp'] || '0', 10) || 0);
            const level = Math.min(100, Math.floor(xp / 500) + 1);
            const skillPoints = Math.max(0, parseInt(progress['sampire-skill-points'] || '0', 10) || 0);
            let skills = {};
            let badges = [];
            let daily = { completions: [] };
            let weekly = { completions: [] };
            let streak = { streak: 0 };
            try { skills = JSON.parse(progress['sampire-skills'] || '{}') || {}; } catch (e) {}
            try { badges = JSON.parse(progress['sampire-badges'] || '[]') || []; } catch (e) {}
            try { daily = JSON.parse(progress['sampire-daily-v2'] || '{}') || {}; } catch (e) {}
            try { weekly = JSON.parse(progress['sampire-weekly'] || '{}') || {}; } catch (e) {}
            try { streak = JSON.parse(progress['sampire-streak'] || '{}') || {}; } catch (e) {}
            const testsSaved = scores.filter(s => s.userId === u.id).length;
            return {
                id: u.id,
                username: u.username,
                createdAt: Number(u.createdAt) || 0,
                lastLoginAt: Number(u.lastLoginAt) || 0,
                lastSeenAt: Number(u.lastSeenAt) || 0,
                level,
                xp,
                skillPoints,
                badges: Array.isArray(badges) ? badges.length : 0,
                dailyCompleted: dailyCompletionCount(daily),
                weeklyCompleted: Array.isArray(weekly.completions) ? weekly.completions.length : 0,
                streakDays: Math.max(0, Number(streak.streak) || 0),
                skillsUnlocked: ['aura', 'soundscapes', 'nebulaTrail'].filter((k) => !!skills[k]),
                testsSaved,
                isActive: ((Date.now() - (Number(u.lastSeenAt) || 0)) <= 15 * 60 * 1000),
            };
        };
        const out = users.map(summarize).sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
        return { users: out };
    }

    const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (adminUserMatch) {
        const admin = getLocalUserFromAuth(headers);
        if (!admin || String(admin.username || '').trim().toLowerCase() !== 'sampire') localApiError(403, 'Forbidden');
        const userId = decodeURIComponent(adminUserMatch[1] || '');
        const userIdx = users.findIndex(u => u.id === userId);
        if (userIdx < 0) localApiError(404, 'User not found');
        const user = users[userIdx];
        const progress = (user.progress && typeof user.progress === 'object') ? user.progress : {};
        const parseJsonSafe = (raw, fallback) => {
            try { const p = JSON.parse(raw || ''); return p == null ? fallback : p; } catch (e) { return fallback; }
        };
        if (method === 'GET') {
            const dailyCompletionCount = (dailyObj) => {
                if (!dailyObj || typeof dailyObj !== 'object') return 0;
                if (Array.isArray(dailyObj.completions)) return dailyObj.completions.length;
                const days = dailyObj.days && typeof dailyObj.days === 'object' ? dailyObj.days : {};
                const keys = Object.keys(days);
                if (!keys.length) return 0;
                keys.sort();
                const latest = days[keys[keys.length - 1]] || {};
                return Array.isArray(latest.completions) ? latest.completions.length : 0;
            };
            const xp = Math.max(0, parseInt(progress['sampire-xp'] || '0', 10) || 0);
            const skills = parseJsonSafe(progress['sampire-skills'] || '{}', {});
            const badges = parseJsonSafe(progress['sampire-badges'] || '[]', []);
            const daily = parseJsonSafe(progress['sampire-daily-v2'] || '{}', {});
            const weekly = parseJsonSafe(progress['sampire-weekly'] || '{}', {});
            const streak = parseJsonSafe(progress['sampire-streak'] || '{}', {});
            return {
                user: {
                    id: user.id,
                    username: user.username,
                    createdAt: Number(user.createdAt) || 0,
                    lastLoginAt: Number(user.lastLoginAt) || 0,
                    lastSeenAt: Number(user.lastSeenAt) || 0,
                    level: Math.min(100, Math.floor(xp / 500) + 1),
                    xp,
                    skillPoints: Math.max(0, parseInt(progress['sampire-skill-points'] || '0', 10) || 0),
                    badges: Array.isArray(badges) ? badges.length : 0,
                    dailyCompleted: dailyCompletionCount(daily),
                    weeklyCompleted: Array.isArray(weekly.completions) ? weekly.completions.length : 0,
                    streakDays: Math.max(0, Number(streak.streak) || 0),
                    testsSaved: scores.filter(s => s.userId === user.id).length,
                    skillsUnlocked: ['aura', 'soundscapes', 'nebulaTrail'].filter((k) => !!skills[k]),
                },
            };
        }
        if (method === 'PATCH') {
            const DAILY_IDS = ['nobackspace', 'sprint', 'perfectionist', 'daily_quotes_5', 'daily_words_5', 'daily_words30_5'];
            const WEEKLY_IDS = ['marathon', 'consistent_climber', 'rival_week', 'above_average'];
            const ACHIEVEMENT_IDS = BADGE_DEFS.map((def) => def.id);
            const clampInt = (value, min, max = Infinity) => {
                const n = Math.floor(Number(value));
                if (!Number.isFinite(n)) return null;
                return Math.min(max, Math.max(min, n));
            };
            const todayKeyLocal = () => {
                const d = new Date();
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            };
            const weekKeyLocal = () => {
                const d = new Date();
                d.setHours(0, 0, 0, 0);
                d.setDate(d.getDate() - d.getDay());
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            };
            const idsForCount = (ids, count) => ids.slice(0, Math.min(ids.length, Math.max(0, Math.floor(Number(count) || 0))));
            const addXp = Math.max(0, Math.floor(Number(body.addXp) || 0));
            const addSkillPoints = Math.max(0, Math.floor(Number(body.addSkillPoints) || 0));
            const unlockRewards = Array.isArray(body.unlockRewards) ? body.unlockRewards : [];
            const setLevel = clampInt(body.setLevel, 1, 100);
            const setXp = clampInt(body.setXp, 0);
            const setSkillPoints = clampInt(body.setSkillPoints, 0);
            const setStreakDays = clampInt(body.setStreakDays, 0);
            const setDailyCompleted = clampInt(body.setDailyCompleted, 0, DAILY_IDS.length);
            const setWeeklyCompleted = clampInt(body.setWeeklyCompleted, 0, WEEKLY_IDS.length);
            const setAchievements = clampInt(body.setAchievements, 0, ACHIEVEMENT_IDS.length);
            const setRewards = (body && typeof body.setRewards === 'object' && body.setRewards && !Array.isArray(body.setRewards))
                ? body.setRewards
                : null;
            const resetUsernameRaw = body.resetUsername != null ? String(body.resetUsername).trim() : '';
            const resetPassword = body.resetPassword != null ? String(body.resetPassword) : '';
            const hasSetOps = (
                setLevel !== null || setXp !== null || setSkillPoints !== null ||
                setStreakDays !== null || setDailyCompleted !== null ||
                setWeeklyCompleted !== null || setAchievements !== null || !!setRewards
            );
            if (addXp <= 0 && addSkillPoints <= 0 && unlockRewards.length === 0 && !hasSetOps && !resetUsernameRaw && !resetPassword) {
                localApiError(400, 'No grant changes provided');
            }
            let xp = Math.max(0, parseInt(progress['sampire-xp'] || '0', 10) || 0);
            let sp = Math.max(0, parseInt(progress['sampire-skill-points'] || '0', 10) || 0);
            const skills = parseJsonSafe(progress['sampire-skills'] || '{}', {});
            if (setLevel !== null) xp += (setLevel - 1) * 500;
            if (setXp !== null) xp += setXp;
            if (setSkillPoints !== null) sp += setSkillPoints;
            xp += addXp;
            sp += addSkillPoints;
            if (setRewards) {
                for (const key of ['aura', 'soundscapes', 'nebulaTrail']) {
                    if (Object.prototype.hasOwnProperty.call(setRewards, key)) skills[key] = !!setRewards[key];
                }
            }
            for (const reward of unlockRewards) {
                if (['aura', 'soundscapes', 'nebulaTrail'].includes(String(reward))) skills[String(reward)] = true;
            }
            if (setStreakDays !== null) {
                progress['sampire-streak'] = JSON.stringify({ lastPlayDate: todayKeyLocal(), streak: setStreakDays });
            }
            if (setDailyCompleted !== null) {
                const key = todayKeyLocal();
                progress['sampire-daily-v2'] = JSON.stringify({ days: { [key]: { completions: idsForCount(DAILY_IDS, setDailyCompleted) } } });
            }
            if (setWeeklyCompleted !== null) {
                progress['sampire-weekly'] = JSON.stringify({ week: weekKeyLocal(), completions: idsForCount(WEEKLY_IDS, setWeeklyCompleted) });
            }
            if (setAchievements !== null) {
                const now = Date.now();
                progress['sampire-badges'] = JSON.stringify(idsForCount(ACHIEVEMENT_IDS, setAchievements).map((id) => ({ id, earnedAt: now })));
            }
            progress['sampire-xp'] = String(Math.max(0, xp));
            progress['sampire-skill-points'] = String(Math.max(0, sp));
            progress['sampire-skills'] = JSON.stringify({
                aura: !!skills.aura,
                soundscapes: !!skills.soundscapes,
                nebulaTrail: !!skills.nebulaTrail,
            });
            if (resetUsernameRaw) {
                const usernameNorm = resetUsernameRaw.toLowerCase();
                if (!usernameNorm || usernameNorm.length < 3 || usernameNorm.length > 24 || !/^[a-z0-9_]+$/.test(usernameNorm)) {
                    localApiError(400, 'Username must be 3-24 chars: a-z, 0-9, _');
                }
                const taken = users.some(u => u.usernameNorm === usernameNorm && u.id !== user.id);
                if (taken) localApiError(409, 'Username already exists');
                user.username = resetUsernameRaw;
                user.usernameNorm = usernameNorm;
                for (const row of scores) {
                    if (row.userId === user.id) row.username = resetUsernameRaw;
                }
                saveLocalJson(LOCAL_AUTH_SCORES_KEY, scores);
            }
            if (resetPassword) {
                if (resetPassword.length < 6) localApiError(400, 'Password must be at least 6 characters');
                const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
                    .map(b => b.toString(16).padStart(2, '0')).join('');
                const pwHash = await localHashPassword(resetPassword, salt);
                user.passwordSalt = salt;
                user.passwordHash = pwHash;
                delete user.password;
            }
            user.progress = progress;
            user.progressUpdatedAt = Date.now();
            users[userIdx] = user;
            saveLocalJson(LOCAL_AUTH_USERS_KEY, users);
            return { ok: true };
        }
        if (method === 'DELETE') {
            const filteredUsers = users.filter(u => u.id !== user.id);
            const filteredScores = scores.filter(s => s.userId !== user.id);
            saveLocalJson(LOCAL_AUTH_USERS_KEY, filteredUsers);
            saveLocalJson(LOCAL_AUTH_SCORES_KEY, filteredScores);
            const state = getCommunityWeeklyContributionState();
            if (state && state.entries && typeof state.entries === 'object') {
                delete state.entries[`user:${user.id}`];
                setCommunityWeeklyContributionState(state);
            }
            return { ok: true };
        }
        localApiError(405, 'Method not allowed');
    }

    localApiError(404, 'Not found');
}

function buildAuthHeaders(options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (isLocalAuthToken(authToken)) headers.Authorization = `Bearer ${authToken}`;
    return headers;
}

function shouldAttemptCloudSessionRefresh(url) {
    const path = String(url || '').split('?')[0];
    if (!path.startsWith('/api/')) return false;
    if (path === '/api/login' || path === '/api/signup' || path === '/api/refresh' || path === '/api/logout') return false;
    return true;
}

async function tryRefreshCloudSession() {
    if (cloudRefreshPromise) return cloudRefreshPromise;
    cloudRefreshPromise = (async () => {
        try {
            const res = await fetchWithTimeout('/api/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            let data = {};
            try { data = await res.json(); } catch (e) {}
            if (!res.ok) {
                if (res.status === 401) {
                    currentUser = null;
                    updateAuthUi();
                }
                return false;
            }
            if (data && data.user) currentUser = data.user;
            updateAuthUi();
            return true;
        } catch (e) {
            return false;
        } finally {
            cloudRefreshPromise = null;
        }
    })();
    return cloudRefreshPromise;
}

async function fetchWithTimeout(url, opts, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(url, { credentials: 'same-origin', ...opts, signal: ctrl.signal });
    } finally {
        clearTimeout(tid);
    }
}

async function apiFetch(url, options = {}) {
    const headers = buildAuthHeaders(options);
    const isWebContext = location.protocol === 'http:' || location.protocol === 'https:';
    if (!isWebContext || localApiFallbackActive) {
        localApiFallbackActive = true;
        return localApiFetch(url, options, headers);
    }

    try {
        let res = await fetchWithTimeout(url, { ...options, headers });
        let data = {};
        try { data = await res.json(); } catch (e) {}
        const isApiRoute = typeof url === 'string' && url.startsWith('/api/');
        if (isApiRoute && res.status === 404 && !localApiFallbackActive) {
            localApiFallbackActive = true;
            setAuthNote('Cloud API routes not found. Using local browser storage mode.', false);
            return localApiFetch(url, options, headers);
        }
        if (isApiRoute && res.status === 401 && !isLocalAuthToken(authToken) && shouldAttemptCloudSessionRefresh(url)) {
            const refreshed = await tryRefreshCloudSession();
            if (refreshed) {
                res = await fetchWithTimeout(url, { ...options, headers });
                data = {};
                try { data = await res.json(); } catch (e) {}
            }
        }
        if (!res.ok) {
            const msg = data && data.error ? data.error : `Request failed (${res.status})`;
            const err = new Error(msg);
            err.status = res.status;
            err.payload = data;
            throw err;
        }
        return data;
    } catch (e) {
        throw e;
    }
}

async function apiFetchCloudFirst(url, options = {}) {
    const isWebContext = location.protocol === 'http:' || location.protocol === 'https:';
    if (!isWebContext) return null;
    const headers = buildAuthHeaders(options);
    try {
        let res = await fetchWithTimeout(url, { ...options, headers });
        let data = {};
        try { data = await res.json(); } catch (e) {}
        if (res.status === 401 && !isLocalAuthToken(authToken) && shouldAttemptCloudSessionRefresh(url)) {
            const refreshed = await tryRefreshCloudSession();
            if (refreshed) {
                res = await fetchWithTimeout(url, { ...options, headers });
                data = {};
                try { data = await res.json(); } catch (e) {}
            }
        }
        if (!res.ok) {
            const msg = data && data.error ? data.error : `Request failed (${res.status})`;
            const err = new Error(msg);
            err.status = res.status;
            err.payload = data;
            throw err;
        }
        localApiFallbackActive = false;
        return data;
    } catch (e) {
        throw e;
    }
}

function isLocalAuthToken(token = authToken) {
    return typeof token === 'string' && token.startsWith('local-token:');
}

function isNetworkLikeError(error) {
    if (!error) return false;
    if (error.name === 'AbortError') return true;
    const message = String(error.message || '');
    return /failed to fetch|network|aborted|timeout|load failed/i.test(message);
}

function shouldAllowLocalFallback(error) {
    if (!error) return false;
    if (isNetworkLikeError(error)) return true;
    const status = Number(error.status) || 0;
    return status === 404 || status >= 500;
}

function shouldAllowAuthLocalFallback(error) {
    const status = Number(error && error.status) || 0;
    return status === 404;
}

async function apiFetchCloudThenLocal(url, options = {}, fallbackMessage = '', fallbackRule = shouldAllowLocalFallback) {
    try {
        return await apiFetchCloudFirst(url, options);
    } catch (e) {
        const allowFallback = typeof fallbackRule === 'function' ? fallbackRule(e) : !!fallbackRule;
        if (!allowFallback) throw e;
        const status = Number(e && e.status) || 0;
        if (status === 404) localApiFallbackActive = true;
        if (fallbackMessage) setAuthNote(fallbackMessage, false);
        const headers = buildAuthHeaders(options);
        return localApiFetch(url, options, headers);
    }
}

function setAuthNote(message, isError = false) {
    const note = document.getElementById('auth-note');
    if (!note) return;
    note.textContent = message || '';
    note.style.color = isError ? '#ff8ab8' : '#8fd3ff';
    if (isError && message) note.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setSignupNote(message, isError = false) {
    const note = document.getElementById('signup-note');
    if (!note) return;
    note.textContent = message || '';
    note.style.color = isError ? '#ff8ab8' : '#8fd3ff';
}

function updateProfileToggleHoverInfo() {
    const title = document.getElementById('profile-hover-title');
    const line1 = document.getElementById('profile-hover-line-1');
    const line2 = document.getElementById('profile-hover-line-2');
    const line3 = document.getElementById('profile-hover-line-3');
    const icon = document.getElementById('profile-user-icon');
    if (!title || !line1 || !line2 || !line3 || !icon) return;

    if (!currentUser) {
        icon.classList.remove('visible');
        title.textContent = 'Not logged in';
        line1.textContent = 'Log in to view your progress snapshot.';
        line2.textContent = '';
        line3.textContent = '';
        return;
    }

    icon.classList.add('visible');
    const xp = getTotalXP();
    const level = getLevel(xp);
    const skillPoints = getSkillPoints();
    const dailyLeft = Math.max(0, CHALLENGES.length - getDailyCompletions().length);
    const weeklyLeft = Math.max(0, WEEKLY_CHALLENGES.length - getWeeklyCompletions().length);

    title.textContent = `Logged in as ${currentUser.username}`;
    line1.textContent = `Level: ${level} · Aether Crystals: ${skillPoints}`;
    line2.textContent = `Daily challenges left: ${dailyLeft}`;
    line3.textContent = `Weekly challenges left: ${weeklyLeft}`;
}

function refreshSignupCaptcha() {
    const a = Math.floor(Math.random() * 8) + 1;
    const b = Math.floor(Math.random() * 8) + 1;
    signupCaptchaAnswer = a + b;
    const label = document.getElementById('signup-captcha-label');
    const input = document.getElementById('signup-captcha-input');
    if (label) label.textContent = `Solve: ${a} + ${b} =`;
    if (input) input.value = '';
}

function getModalFocusableElements(modal) {
    if (!modal) return [];
    return Array.from(modal.querySelectorAll('a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])'))
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
}

function triggerMenuModalEntrance(modal, duration = 700) {
    if (!modal) return;
    if (modal._menuModalIntroTimer) {
        clearTimeout(modal._menuModalIntroTimer);
        modal._menuModalIntroTimer = null;
    }
    modal.classList.remove('menu-modal-opening');
    void modal.offsetWidth;
    modal.classList.add('menu-modal-opening');
    modal._menuModalIntroTimer = setTimeout(() => {
        modal.classList.remove('menu-modal-opening');
        modal._menuModalIntroTimer = null;
    }, duration);
}

function openModal(modal) {
    if (!modal) return;
    if (activeModalEl === modal) return;
    if (!activeModalEl) {
        previousFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        modalStack = [];
    } else {
        activeModalEl.classList.remove('show');
        activeModalEl.setAttribute('aria-hidden', 'true');
        modalStack.push(activeModalEl);
    }
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    triggerMenuModalEntrance(modal);
    activeModalEl = modal;
    const focusables = getModalFocusableElements(modal);
    if (focusables.length > 0) focusables[0].focus();
}

function closeModal(modal) {
    if (!modal) return;
    if (modal._menuModalIntroTimer) {
        clearTimeout(modal._menuModalIntroTimer);
        modal._menuModalIntroTimer = null;
    }
    modal.classList.remove('menu-modal-opening');
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    if (activeModalEl !== modal) {
        const idx = modalStack.lastIndexOf(modal);
        if (idx >= 0) modalStack.splice(idx, 1);
        return;
    }
    if (modalStack.length > 0) {
        const prior = modalStack.pop();
        prior.classList.add('show');
        prior.setAttribute('aria-hidden', 'false');
        activeModalEl = prior;
        const focusables = getModalFocusableElements(prior);
        if (focusables.length > 0) focusables[0].focus();
        return;
    }
    activeModalEl = null;
    const restoreTarget = previousFocusEl;
    previousFocusEl = null;
    if (restoreTarget && typeof restoreTarget.focus === 'function') {
        setTimeout(() => restoreTarget.focus(), 0);
    }
}

function handleModalFocusTrap(event) {
    if (event.key !== 'Tab' || !activeModalEl || !activeModalEl.classList.contains('show')) return;
    const focusables = getModalFocusableElements(activeModalEl);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !activeModalEl.contains(current))) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && (current === last || !activeModalEl.contains(current))) {
        event.preventDefault();
        first.focus();
    }
}

function openSignupModal() {
    const modal = document.getElementById('signup-modal');
    if (!modal) return;
    openModal(modal);
    setSignupNote('');
    const userInput = document.getElementById('signup-username');
    const passInput = document.getElementById('signup-password');
    const confirmInput = document.getElementById('signup-password-confirm');
    if (userInput) userInput.value = '';
    if (passInput) passInput.value = '';
    if (confirmInput) confirmInput.value = '';
    refreshSignupCaptcha();
    if (userInput) userInput.focus();
}

function closeSignupModal() {
    const modal = document.getElementById('signup-modal');
    if (!modal) return;
    closeModal(modal);
}

function handleSignupModalBackdrop(event) {
    if (event && event.target === document.getElementById('signup-modal')) closeSignupModal();
}
