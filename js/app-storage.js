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

// Keep the sync key list current (README item 4). SYNC_PROGRESS_KEYS is declared in app-core.js;
// this adjusts the same array in place so every file sees the same list.
(function adjustSyncKeys() {
    try {
        const add = ['sampire-key-sound-pack', 'sampire-mining-state-v1', 'sampire-weekly-words', 'sampire-friends-cache'];
        const drop = ['sampire-community-weekly-goal', 'sampire-community-weekly-contrib'];
        for (const key of drop) {
            const idx = SYNC_PROGRESS_KEYS.indexOf(key);
            if (idx >= 0) SYNC_PROGRESS_KEYS.splice(idx, 1);
        }
        for (const key of add) if (!SYNC_PROGRESS_KEYS.includes(key)) SYNC_PROGRESS_KEYS.push(key);
    } catch (e) {}
})();

function isProgressSyncKey(key) {
    return SYNC_PROGRESS_KEYS.includes(String(key || ''));
}

function getProgressOwner() {
    try { return localStorage.getItem(PROGRESS_OWNER_KEY) || ''; } catch (e) { return ''; }
}

function setProgressOwner(userId) {
    try {
        if (userId) localStorage.setItem(PROGRESS_OWNER_KEY, String(userId));
        else localStorage.removeItem(PROGRESS_OWNER_KEY);
    } catch (e) {}
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

function hasAnyLocalProgress() {
    const snapshot = getProgressSnapshotFromLocal();
    const meaningful = [HISTORY_KEY, 'sampire-xp', 'sampire-badges', 'sampire-daily-v2', 'sampire-weekly', 'sampire-streak',
        LIFETIME_TESTS_KEY, LIFETIME_WORDS_TYPED_KEY, 'sampire-skills', 'sampire-skill-points'];
    return meaningful.some((key) => snapshot[key] != null);
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

// ── Field-by-field merge of two progress snapshots that belong to the same player ──
// Numbers take the larger value, lists are joined, and dated records keep the later date.

function mergeMaxInt(a, b) {
    const x = parseInt(a == null ? '' : a, 10);
    const y = parseInt(b == null ? '' : b, 10);
    const hasX = Number.isFinite(x);
    const hasY = Number.isFinite(y);
    if (!hasX && !hasY) return null;
    if (!hasX) return String(y);
    if (!hasY) return String(x);
    return String(Math.max(x, y));
}

function mergeHistoryLists(remoteRaw, localRaw) {
    const remote = parseProgressJsonSafe(remoteRaw || '[]', []);
    const local = parseProgressJsonSafe(localRaw || '[]', []);
    const byKey = new Map();
    for (const entry of [...(Array.isArray(remote) ? remote : []), ...(Array.isArray(local) ? local : [])]) {
        if (!entry || typeof entry !== 'object') continue;
        const key = `${Number(entry.date) || 0}|${String(entry.text || '').slice(0, 80)}|${String(entry.mode || '')}`;
        if (!byKey.has(key)) byKey.set(key, entry);
    }
    const merged = [...byKey.values()].sort((a, b) => (Number(b.date) || 0) - (Number(a.date) || 0));
    const cap = typeof MAX_HISTORY === 'number' ? MAX_HISTORY : 50;
    if (merged.length > cap) merged.length = cap;
    return JSON.stringify(merged);
}

function readDailyDays(raw) {
    const parsed = parseProgressJsonSafe(raw || '{}', {});
    const days = parsed && typeof parsed.days === 'object' && parsed.days ? parsed.days : {};
    const out = {};
    for (const [day, row] of Object.entries(days)) {
        const list = Array.isArray(row) ? row : (row && Array.isArray(row.completions) ? row.completions : []);
        out[day] = [...new Set(list.map(String).filter(Boolean))];
    }
    return out;
}

function mergeDailyV2(remoteRaw, localRaw) {
    const remote = readDailyDays(remoteRaw);
    const local = readDailyDays(localRaw);
    const days = { ...remote };
    for (const [day, list] of Object.entries(local)) {
        days[day] = [...new Set([...(days[day] || []), ...list])];
    }
    return JSON.stringify({ days });
}

function mergeLegacyDaily(remoteRaw, localRaw) {
    const remote = parseProgressJsonSafe(remoteRaw || 'null', null);
    const local = parseProgressJsonSafe(localRaw || 'null', null);
    if (!remote) return localRaw;
    if (!local) return remoteRaw;
    const rd = String(remote.date || '');
    const ld = String(local.date || '');
    if (rd === ld) {
        return JSON.stringify({ date: rd, completions: [...new Set([...(remote.completions || []), ...(local.completions || [])].map(String))] });
    }
    return ld > rd ? localRaw : remoteRaw;
}

function mergeWeekly(remoteRaw, localRaw) {
    const remote = parseProgressJsonSafe(remoteRaw || 'null', null);
    const local = parseProgressJsonSafe(localRaw || 'null', null);
    if (!remote) return localRaw;
    if (!local) return remoteRaw;
    const rw = String(remote.week || '');
    const lw = String(local.week || '');
    if (rw === lw) {
        return JSON.stringify({ week: rw, completions: [...new Set([...(remote.completions || []), ...(local.completions || [])].map(String))] });
    }
    return lw > rw ? localRaw : remoteRaw;
}

function mergeWeeklyWords(remoteRaw, localRaw) {
    const remote = parseProgressJsonSafe(remoteRaw || 'null', null);
    const local = parseProgressJsonSafe(localRaw || 'null', null);
    if (!remote || typeof remote !== 'object') return localRaw;
    if (!local || typeof local !== 'object') return remoteRaw;
    const rw = String(remote.week || '');
    const lw = String(local.week || '');
    if (rw === lw) {
        const merged = { ...remote, ...local, week: rw };
        for (const key of Object.keys(merged)) {
            if (typeof remote[key] === 'number' && typeof local[key] === 'number') merged[key] = Math.max(remote[key], local[key]);
        }
        return JSON.stringify(merged);
    }
    return lw > rw ? localRaw : remoteRaw;
}

function mergeStreak(remoteRaw, localRaw) {
    const remote = parseProgressJsonSafe(remoteRaw || 'null', null);
    const local = parseProgressJsonSafe(localRaw || 'null', null);
    if (!remote) return localRaw;
    if (!local) return remoteRaw;
    const rd = String(remote.lastPlayDate || '');
    const ld = String(local.lastPlayDate || '');
    if (rd === ld) {
        return JSON.stringify({ ...remote, ...local, lastPlayDate: rd, streak: Math.max(Number(remote.streak) || 0, Number(local.streak) || 0) });
    }
    return ld > rd ? localRaw : remoteRaw;
}

function mergeDatedRecord(remoteRaw, localRaw, dateField) {
    const remote = parseProgressJsonSafe(remoteRaw || 'null', null);
    const local = parseProgressJsonSafe(localRaw || 'null', null);
    if (!remote) return localRaw;
    if (!local) return remoteRaw;
    return String(local[dateField] || '') > String(remote[dateField] || '') ? localRaw : remoteRaw;
}

function mergeSkills(remoteRaw, localRaw) {
    const remoteSkills = parseProgressJsonSafe(remoteRaw || '{}', {});
    const localSkills = parseProgressJsonSafe(localRaw || '{}', {});
    const merged = { ...remoteSkills, ...localSkills };
    for (const key of new Set([...Object.keys(remoteSkills), ...Object.keys(localSkills)])) {
        if (key === 'keySoundPacks') continue;
        const r = remoteSkills[key];
        const l = localSkills[key];
        if (typeof r === 'boolean' || typeof l === 'boolean') merged[key] = !!r || !!l;
        else if (typeof r === 'number' && typeof l === 'number') merged[key] = Math.max(r, l);
    }
    const packs = {};
    for (const id of new Set([...getShopKeySoundPackIds(), ...Object.keys(remoteSkills.keySoundPacks || {}), ...Object.keys(localSkills.keySoundPacks || {})])) {
        packs[id] = !!(remoteSkills.keySoundPacks && remoteSkills.keySoundPacks[id]) || !!(localSkills.keySoundPacks && localSkills.keySoundPacks[id]);
    }
    merged.keySoundPacks = packs;
    return JSON.stringify(merged);
}

// Cost of everything the player has bought, read from whatever shop table the progression code exposes.
function getSpentSkillPointsFromSkills(skillsRaw) {
    const skills = parseProgressJsonSafe(skillsRaw || '{}', {});
    let spent = 0;
    const costOf = (id) => {
        try {
            const tables = [
                typeof SHOP_ITEMS !== 'undefined' ? SHOP_ITEMS : null,
                typeof SHOP_CATALOG !== 'undefined' ? SHOP_CATALOG : null,
                typeof KEY_SOUND_PACK_SHOP !== 'undefined' ? KEY_SOUND_PACK_SHOP : null,
                typeof KEY_SOUND_PACKS !== 'undefined' ? KEY_SOUND_PACKS : null,
            ];
            for (const table of tables) {
                if (!Array.isArray(table)) continue;
                const def = table.find((item) => item && item.id === id);
                if (def && Number.isFinite(Number(def.cost))) return Number(def.cost);
            }
        } catch (e) {}
        return 1;
    };
    for (const [key, value] of Object.entries(skills)) {
        if (key === 'keySoundPacks') continue;
        if (value === true) spent += costOf(key);
        else if (typeof value === 'number' && value > 0 && /count|owned|qty/i.test(key)) spent += value * costOf(key.replace(/(Count|Owned|Qty)$/i, ''));
    }
    for (const [id, owned] of Object.entries(skills.keySoundPacks || {})) if (owned) spent += costOf(id);
    return spent;
}

function recomputeSkillPoints(xpRaw, skillsRaw, fallbackRaw) {
    const xp = Math.max(0, parseInt(xpRaw || '0', 10) || 0);
    const perLevel = typeof XP_PER_LEVEL === 'number' ? XP_PER_LEVEL : 500;
    const levelsEarned = Math.min(99, Math.floor(xp / perLevel));
    const spent = getSpentSkillPointsFromSkills(skillsRaw);
    const recomputed = Math.max(0, levelsEarned - spent);
    const fallback = parseInt(fallbackRaw == null ? '' : fallbackRaw, 10);
    // Never hand out more than the levels justify; never take away points the player already had below that line.
    if (Number.isFinite(fallback)) return String(Math.max(0, Math.min(levelsEarned, Math.max(recomputed, Math.min(fallback, levelsEarned)))));
    return String(recomputed);
}

function mergeProgressSnapshotsForSameOwner(remoteProgress = {}, localProgress = {}) {
    const remote = remoteProgress && typeof remoteProgress === 'object' ? remoteProgress : {};
    const local = localProgress && typeof localProgress === 'object' ? localProgress : {};
    const merged = {};
    const keys = new Set([...Object.keys(remote), ...Object.keys(local)]);

    const maxIntKeys = new Set([
        'sampire-xp',
        'sampire-lifetime-challenges-completed',
        LIFETIME_TESTS_KEY,
        LIFETIME_WORDS_TYPED_KEY,
        LIFETIME_TIME_SECONDS_KEY,
        LIFETIME_BEST_WPM_KEY,
        LIFETIME_BIBLE_TESTS_KEY,
    ]);
    // Device preferences: the device you are on wins when it has a value.
    const localFirstKeys = new Set([
        'sampire-reward-settings',
        'sampire-active-soundscape',
        'sampire-music-muted',
        'sampire-music-volume',
        'sampire-key-sounds-enabled',
        'sampire-key-sound-volume',
        'sampire-key-sound-pack',
        MINING_VISUALS_ENABLED_KEY,
        MINING_LASER_SOUND_ENABLED_KEY,
        BIBLE_MODE_KEY,
        'sampire-mining-state-v1',
        'sampire-friends-cache',
    ]);

    for (const key of keys) {
        if (!isProgressSyncKey(key)) continue;
        const r = remote[key] == null ? null : String(remote[key]);
        const l = local[key] == null ? null : String(local[key]);
        let value;
        if (r == null) value = l;
        else if (l == null) value = r;
        else if (maxIntKeys.has(key)) value = mergeMaxInt(r, l);
        else if (key === HISTORY_KEY) value = mergeHistoryLists(r, l);
        else if (key === 'sampire-daily-v2') value = mergeDailyV2(r, l);
        else if (key === 'sampire-daily') value = mergeLegacyDaily(r, l);
        else if (key === 'sampire-weekly') value = mergeWeekly(r, l);
        else if (key === 'sampire-weekly-words') value = mergeWeeklyWords(r, l);
        else if (key === 'sampire-weekly-rival-target') value = mergeDatedRecord(r, l, 'week');
        else if (key === 'sampire-streak') value = mergeStreak(r, l);
        else if (key === 'sampire-skills') value = mergeSkills(r, l);
        else if (key === 'sampire-badges') value = null; // handled below
        else if (key === 'sampire-skill-points') value = null; // recomputed below
        else if (localFirstKeys.has(key)) value = l;
        else value = r;
        if (value != null) merged[key] = value;
    }

    const remoteBadges = normalizeBadgeIdList(parseProgressJsonSafe(remote['sampire-badges'] || '[]', []));
    const localBadges = normalizeBadgeIdList(parseProgressJsonSafe(local['sampire-badges'] || '[]', []));
    const badgeById = new Map();
    for (const b of [...remoteBadges, ...localBadges]) {
        const prev = badgeById.get(b.id);
        if (!prev) { badgeById.set(b.id, b); continue; }
        const prevTs = Number(prev.earnedAt) || 0;
        const nextTs = Number(b.earnedAt) || 0;
        if (!prevTs || (nextTs && nextTs < prevTs)) badgeById.set(b.id, b);
    }
    if (badgeById.size > 0 || remote['sampire-badges'] != null || local['sampire-badges'] != null) {
        merged['sampire-badges'] = JSON.stringify([...badgeById.values()]);
    }

    if (merged['sampire-xp'] != null || remote['sampire-skill-points'] != null || local['sampire-skill-points'] != null) {
        merged['sampire-skill-points'] = recomputeSkillPoints(
            merged['sampire-xp'],
            merged['sampire-skills'],
            mergeMaxInt(remote['sampire-skill-points'], local['sampire-skill-points'])
        );
    }

    let changed = false;
    for (const key of new Set([...Object.keys(merged), ...Object.keys(remote)])) {
        if (String(merged[key] == null ? '' : merged[key]) !== String(remote[key] == null ? '' : remote[key])) { changed = true; break; }
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

function refreshProgressDrivenUi() {
    try { updateXPDisplay(); } catch (e) {}
    try { renderHistory(); } catch (e) {}
    try { updateProfileToggleHoverInfo(); } catch (e) {}
    try { if (currentMode === 'daily') renderDailyChallenges(); } catch (e) {}
}

// ── Cloud progress push with owner guard and throttle ──
const PROGRESS_SYNC_MIN_INTERVAL_MS = 30 * 1000;
let progressLastPushAt = 0;
let progressOwnerRecovering = false;
let progressSyncQueuedAfterFlight = false;

function progressOwnerMatchesCurrentUser() {
    if (!currentUser) return false;
    return getProgressOwner() === String(currentUser.id || '');
}

async function recoverFromOwnerMismatch() {
    if (progressOwnerRecovering) return;
    progressOwnerRecovering = true;
    try {
        await restoreSession();
    } catch (e) {} finally {
        progressOwnerRecovering = false;
    }
}

async function pushCloudProgressSnapshot(options = {}) {
    if (!currentUser || suppressProgressSync) return false;
    if (progressSyncInFlight) { progressSyncQueuedAfterFlight = true; return false; }
    if (!progressOwnerMatchesCurrentUser()) {
        // This browser's progress belongs to someone else (or nobody). Do not upload it.
        void recoverFromOwnerMismatch();
        return false;
    }
    progressSyncInFlight = true;
    progressLastPushAt = Date.now();
    const pushingFor = String(currentUser.id || '');
    try {
        const fetchOptions = {
            method: 'PUT',
            body: JSON.stringify({
                progress: getProgressSnapshotFromLocal(),
                baseUpdatedAt: progressCloudUpdatedAt,
            }),
        };
        if (options.keepalive) fetchOptions.keepalive = true;
        const out = await apiFetch('/api/progress', fetchOptions);
        progressCloudUpdatedAt = Number(out && out.updatedAt) || progressCloudUpdatedAt;
        if (out && out.progress && typeof out.progress === 'object' && Array.isArray(out.clamped) && out.clamped.length) {
            // The server trimmed something (for example an XP jump); take its version.
            if (currentUser && String(currentUser.id || '') === pushingFor && progressOwnerMatchesCurrentUser()) {
                applyProgressSnapshotToLocal(out.progress);
                refreshProgressDrivenUi();
            }
        }
        return true;
    } catch (e) {
        if (e && e.status === 409 && e.payload && typeof e.payload.progress === 'object') {
            if (!currentUser || String(currentUser.id || '') !== pushingFor || !progressOwnerMatchesCurrentUser()) {
                void recoverFromOwnerMismatch();
                return false;
            }
            // Another device saved first: merge their snapshot with ours field by field, then save the result.
            const merged = mergeProgressSnapshotsForSameOwner(e.payload.progress, getProgressSnapshotFromLocal());
            applyProgressSnapshotToLocal(merged.progress || {});
            progressCloudUpdatedAt = Number(e.payload.updatedAt) || progressCloudUpdatedAt;
            refreshProgressDrivenUi();
            if (merged.changed) progressSyncQueuedAfterFlight = true;
        }
        return false;
    } finally {
        progressSyncInFlight = false;
        if (progressSyncQueuedAfterFlight) {
            progressSyncQueuedAfterFlight = false;
            scheduleProgressSync(1500);
        }
    }
}

// Saves at most once every 30 seconds; flushProgressSyncNow() bypasses the wait.
function scheduleProgressSync(delayMs = 800) {
    if (!currentUser || suppressProgressSync) return;
    const sinceLast = Date.now() - progressLastPushAt;
    const wait = Math.max(Number(delayMs) || 0, PROGRESS_SYNC_MIN_INTERVAL_MS - sinceLast);
    if (progressSyncTimer) clearTimeout(progressSyncTimer);
    progressSyncTimer = setTimeout(() => {
        progressSyncTimer = null;
        pushCloudProgressSnapshot();
    }, wait);
}

function flushProgressSyncNow() {
    if (!currentUser || suppressProgressSync) return Promise.resolve(false);
    if (progressSyncTimer) {
        clearTimeout(progressSyncTimer);
        progressSyncTimer = null;
    }
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    return pushCloudProgressSnapshot({ keepalive: hidden });
}

// Every finished run saves right away (README interface item 1).
try {
    document.addEventListener('typemine:run-finished', () => { if (currentUser) flushProgressSyncNow(); });
} catch (e) {}

async function hydrateProgressForCurrentUser() {
    if (!currentUser) return;
    const uid = String(currentUser.id || '');
    if (!uid) return;
    const owner = getProgressOwner();
    let remote = null;
    try {
        remote = await apiFetch('/api/progress');
    } catch (e) {
        // Could not reach the account's saved progress: leave local data alone and try again later.
        return;
    }
    if (!currentUser || String(currentUser.id || '') !== uid) return;
    const remoteProgress = remote && remote.progress && typeof remote.progress === 'object' ? remote.progress : null;
    const remoteUpdatedAt = Number(remote && remote.updatedAt) || 0;
    const hasRemoteProgress = !!(remoteProgress && Object.keys(remoteProgress).length > 0);
    const hasRemoteRecord = hasRemoteProgress || remoteUpdatedAt > 0;

    // Whose data is in this browser right now?
    const localIsMine = owner === uid;
    const localIsGuest = !owner && hasAnyLocalProgress();
    const localIsSomeoneElse = !!owner && owner !== uid;

    if (hasRemoteRecord) {
        let next;
        if (localIsMine || localIsGuest) {
            // Same player (or guest play on this device): keep the best of both.
            next = mergeProgressSnapshotsForSameOwner(remoteProgress || {}, getProgressSnapshotFromLocal());
        } else {
            next = { progress: remoteProgress || {}, changed: false };
        }
        applyProgressSnapshotToLocal(next.progress || {});
        setProgressOwner(uid);
        progressCloudUpdatedAt = remoteUpdatedAt;
        if (next.changed) await pushCloudProgressSnapshot();
    } else {
        if (localIsSomeoneElse) clearSyncedLocalProgress();
        setProgressOwner(uid);
        progressCloudUpdatedAt = 0;
        await pushCloudProgressSnapshot();
    }

    refreshProgressDrivenUi();
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

// Another tab logged in or out: follow it.
try {
    window.addEventListener('storage', (event) => {
        if (!event || event.key !== PROGRESS_OWNER_KEY) return;
        const nextOwner = String(event.newValue || '');
        const mine = String(currentUser && currentUser.id || '');
        if (nextOwner === mine && nextOwner) {
            // Same account saved in another tab: pull its changes.
            if (!progressSyncInFlight) hydrateProgressForCurrentUser();
            return;
        }
        void recoverFromOwnerMismatch();
    });
} catch (e) {}

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

// Guest location lookups were removed (they sent every guest's IP to an outside service).
// Guests are simply "Guest". These names stay so older callers keep working.
try { localStorage.removeItem(GUEST_LOCATION_CACHE_KEY); } catch (e) {}

function getCachedGuestLocation() {
    return null;
}

function getGuestDisplayNameFromLocation() {
    return 'Guest';
}

async function resolveGuestLocation() {
    return null;
}

function updateGuestScoresLocation() {}

// ── Cloud or local: decided once at boot ──
let backendMode = 'unknown'; // 'cloud' | 'local'
let backendModePromise = null;

function isCloudMode() {
    return backendMode === 'cloud';
}

function renderBackendModeBadge() {
    const badge = document.getElementById('backend-mode-badge');
    if (!badge) return;
    if (backendMode === 'unknown') {
        badge.textContent = 'Checking connection';
        badge.title = 'Checking whether the online account service is available.';
        badge.dataset.mode = 'unknown';
        return;
    }
    if (backendMode === 'cloud') {
        badge.textContent = 'Cloud account';
        badge.title = currentUser
            ? 'Your scores and progress are saved to your online account.'
            : 'Online accounts are available. Log in to save your progress across devices.';
    } else {
        badge.textContent = 'Saved on this device only';
        badge.title = 'The online account service could not be reached when the page loaded. Everything is saved in this browser only. Reload the page to try again.';
    }
    badge.dataset.mode = backendMode;
}

async function decideBackendMode() {
    if (backendMode !== 'unknown') return backendMode;
    if (backendModePromise) return backendModePromise;
    backendModePromise = (async () => {
        const isWebContext = location.protocol === 'http:' || location.protocol === 'https:';
        let mode = 'local';
        if (isWebContext) {
            try {
                const res = await fetchWithTimeout('/api/health', { method: 'GET', headers: { 'Accept': 'application/json' } }, 5000);
                let data = {};
                try { data = await res.json(); } catch (e) {}
                if (res.ok && data && data.ok === true) mode = 'cloud';
            } catch (e) {
                mode = 'local';
            }
        }
        backendMode = mode;
        localApiFallbackActive = mode === 'local';
        renderBackendModeBadge();
        return mode;
    })();
    return backendModePromise;
}

// ── Local-only account shim (used when the online service is unavailable) ──
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
    return { id: user.id, username: user.username, createdAt: Number(user.createdAt) || null, isAdmin: !!user.isAdmin };
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

function localWeekKey() {
    try { return getWeekKeyUtc(); } catch (e) {
        const d = new Date();
        d.setUTCHours(0, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() - d.getUTCDay());
        return d.toISOString().slice(0, 10);
    }
}

function localLevelFromProgress(progress) {
    const xp = Math.max(0, parseInt((progress && progress['sampire-xp']) || '0', 10) || 0);
    const perLevel = typeof XP_PER_LEVEL === 'number' ? XP_PER_LEVEL : 500;
    return Math.min(100, Math.floor(xp / perLevel) + 1);
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
    const publicLocalUser = (u) => ({ id: u.id, username: u.username, createdAt: Number(u.createdAt) || null, isAdmin: !!u.isAdmin });

    if (method === 'GET' && pathname === '/api/health') {
        return { ok: true, local: true };
    }

    if (method === 'POST' && pathname === '/api/signup') {
        const usernameRaw = String(body.username || '').trim();
        const usernameNorm = usernameRaw.toLowerCase();
        const password = String(body.password || '');
        if (!usernameNorm || usernameNorm.length < 3 || usernameNorm.length > 24 || !/^[a-z0-9_]+$/.test(usernameNorm)) {
            localApiError(400, 'Username must be 3-24 chars: a-z, 0-9, _');
        }
        if (password.length < 6) localApiError(400, 'Password must be at least 6 characters');
        if (password.length > 128) localApiError(400, 'Password must be at most 128 characters');
        if (users.some(u => u.usernameNorm === usernameNorm)) localApiError(409, 'Username already exists');
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
            // The first account made on this device gets the admin panel for local use.
            isAdmin: users.length === 0,
        };
        users.push(user);
        saveLocalJson(LOCAL_AUTH_USERS_KEY, users);
        return { user: publicLocalUser(user), token: makeLocalToken(user.id) };
    }

    if (method === 'POST' && pathname === '/api/login') {
        const usernameNorm = String(body.username || '').trim().toLowerCase();
        const password = String(body.password || '');
        const userIdx = users.findIndex(u => u.usernameNorm === usernameNorm);
        const user = userIdx >= 0 ? users[userIdx] : null;
        if (!user) localApiError(401, 'Invalid username or password');
        const isValid = user.passwordHash
            ? (await localHashPassword(password, user.passwordSalt)) === user.passwordHash
            : user.password === password;
        if (!isValid) localApiError(401, 'Invalid username or password');
        const now = Date.now();
        users[userIdx].lastLoginAt = now;
        users[userIdx].lastSeenAt = now;
        saveLocalJson(LOCAL_AUTH_USERS_KEY, users);
        return { user: publicLocalUser(user), token: makeLocalToken(user.id) };
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
        const full = users.find(u => u.id === user.id) || {};
        const time = Number(body.time) || 0;
        const typedWords = Math.floor(Number(body.typedWords) || 0);
        const wpm = Number(body.wpm) || 0;
        if (typedWords < 1 || time < 10 && !/^words(15|30|60|120)$/.test(String(body.mode || ''))) localApiError(400, 'Run too short to count');
        if (wpm < 0 || wpm > 300 || wpm > (typedWords / (time / 60)) * 2.5 + 10) localApiError(400, 'Implausible score');
        const score = {
            id: crypto.randomUUID(),
            userId: user.id,
            username: user.username,
            wpm,
            accuracy: Number(body.accuracy) || 0,
            rawWpm: Number(body.rawWpm) || 0,
            consistency: Number(body.consistency) || 0,
            time,
            typedWords,
            mode: String(body.mode || 'quotes'),
            date: Date.now(),
            createdAt: Date.now(),
            level: localLevelFromProgress(full.progress),
            weekKey: localWeekKey(),
            flagged: wpm > 200,
        };
        scores.push(score);
        if (scores.length > 2000) scores.splice(0, scores.length - 2000);
        saveLocalJson(LOCAL_AUTH_SCORES_KEY, scores);
        const ownerIdx = users.findIndex(u => u.id === user.id);
        if (ownerIdx >= 0) {
            users[ownerIdx].lastSeenAt = Date.now();
            saveLocalJson(LOCAL_AUTH_USERS_KEY, users);
        }
        const bestBefore = scores
            .filter(s => s.userId === user.id && s.mode === score.mode && s.id !== score.id && !s.flagged)
            .reduce((best, s) => Math.max(best, Number(s.wpm) || 0), 0);
        return { ok: true, ranked: !score.flagged && wpm >= bestBefore, flagged: score.flagged, score };
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
        const limit = Math.max(1, Math.min(1000, Number(params.get('limit') || 100)));
        const tab = (params.get('tab') || '').trim().toLowerCase();
        const community = params.get('community') === '1' || tab === 'community';
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
            return { week: localWeekKey(), weekKey: localWeekKey(), contributions };
        }
        const modeParam = (params.get('mode') || '').trim();
        const mode = modeParam && modeParam !== 'all' ? modeParam : '';
        const weekKey = localWeekKey();
        const me = getLocalUserFromAuth(headers);
        let pool = [...scores, ...guestScores].filter(s => !s.flagged);
        if (tab === 'weekly') pool = pool.filter(s => (s.weekKey || '') === weekKey);
        if (tab === 'friends') {
            if (!me) localApiError(401, 'Log in to see your friends board');
            const full = users.find(u => u.id === me.id) || {};
            const allowed = new Set([me.id, ...((full.friends || []).map(String))]);
            pool = pool.filter(s => allowed.has(String(s.userId)));
        }
        const bestByUser = new Map();
        for (const score of pool) {
            if (mode && score.mode !== mode) continue;
            const prev = bestByUser.get(score.userId);
            if (isBetterScore(score, prev)) bestByUser.set(score.userId, score);
        }
        const rows = [...bestByUser.values()]
            .sort((a, b) => b.wpm - a.wpm || b.accuracy - a.accuracy || a.date - b.date)
            .map(s => ({
                userId: s.userId,
                username: s.username,
                mode: s.mode,
                wpm: s.wpm,
                accuracy: s.accuracy,
                rawWpm: s.rawWpm,
                consistency: s.consistency || 0,
                time: s.time,
                date: s.date,
                level: s.level || 1,
            }));
        let yourRank = null;
        if (me) {
            const idx = rows.findIndex(r => r.userId === me.id);
            if (idx >= 0) yourRank = { rank: idx + 1, wpm: rows[idx].wpm, total: rows.length };
        }
        const out = rows.slice(0, limit);
        return { rows: out, leaderboard: out, tab: tab || 'alltime', mode: mode || 'all', weekKey, total: rows.length, yourRank };
    }

    if (pathname === '/api/friends' && method === 'GET') {
        const me = getLocalUserFromAuth(headers);
        if (!me) localApiError(401, 'Unauthorized');
        const full = users.find(u => u.id === me.id) || {};
        const friends = (full.friends || []).map((id) => users.find(u => u.id === id)).filter(Boolean).map((u) => ({
            id: u.id,
            username: u.username,
            bestWpm: scores.filter(s => s.userId === u.id && !s.flagged).reduce((b, s) => Math.max(b, Number(s.wpm) || 0), 0),
            weeklyBestWpm: scores.filter(s => s.userId === u.id && !s.flagged && s.weekKey === localWeekKey()).reduce((b, s) => Math.max(b, Number(s.wpm) || 0), 0),
            level: localLevelFromProgress(u.progress),
            streak: Number((parseProgressJsonSafe((u.progress || {})['sampire-streak'] || '{}', {}) || {}).streak) || 0,
            lastSeenAt: Number(u.lastSeenAt) || 0,
        }));
        return { friends };
    }

    if (pathname === '/api/friends' && method === 'POST') {
        const me = getLocalUserFromAuth(headers);
        if (!me) localApiError(401, 'Unauthorized');
        const usernameNorm = String(body.username || '').trim().toLowerCase();
        if (!usernameNorm) localApiError(400, 'username is required');
        const target = users.find(u => u.usernameNorm === usernameNorm);
        if (!target) localApiError(404, 'No player with that username');
        if (target.id === me.id) localApiError(400, 'You cannot add yourself');
        const idx = users.findIndex(u => u.id === me.id);
        const list = Array.isArray(users[idx].friends) ? users[idx].friends : [];
        if (!list.includes(target.id)) {
            if (list.length >= 50) localApiError(400, 'You can follow up to 50 players');
            list.push(target.id);
        }
        users[idx].friends = list;
        saveLocalJson(LOCAL_AUTH_USERS_KEY, users);
        return { ok: true, friend: { id: target.id, username: target.username } };
    }

    const friendDeleteMatch = pathname.match(/^\/api\/friends\/([^/]+)$/);
    if (friendDeleteMatch && method === 'DELETE') {
        const me = getLocalUserFromAuth(headers);
        if (!me) localApiError(401, 'Unauthorized');
        const usernameNorm = decodeURIComponent(friendDeleteMatch[1] || '').trim().toLowerCase();
        const target = users.find(u => u.usernameNorm === usernameNorm);
        const idx = users.findIndex(u => u.id === me.id);
        const before = Array.isArray(users[idx].friends) ? users[idx].friends : [];
        users[idx].friends = before.filter(id => !target || id !== target.id);
        saveLocalJson(LOCAL_AUTH_USERS_KEY, users);
        return { ok: true, removed: before.length !== users[idx].friends.length };
    }

    if (method === 'GET' && pathname === '/api/user-summary') {
        const usernameRaw = String(params.get('username') || '').trim();
        if (!usernameRaw) localApiError(400, 'username is required');
        const usernameNorm = usernameRaw.toLowerCase();
        const target = users.find(u => String(u.usernameNorm || '').toLowerCase() === usernameNorm);
        if (!target) localApiError(404, 'User not found');
        const progress = (target.progress && typeof target.progress === 'object') ? target.progress : {};
        const badgesRaw = parseProgressJsonSafe(progress['sampire-badges'] || '[]', []);
        const badgeIds = (Array.isArray(badgesRaw) ? badgesRaw : [])
            .map((b) => (typeof b === 'string' ? b : String(b && b.id || '')))
            .filter(Boolean);
        const badgeUnique = [...new Set(badgeIds)];
        const days = readDailyDays(progress['sampire-daily-v2']);
        const dailyTotal = Object.values(days).reduce((sum, list) => sum + list.length, 0);
        const weeklyObj = parseProgressJsonSafe(progress['sampire-weekly'] || '{}', {});
        const weeklyCount = (weeklyObj && Array.isArray(weeklyObj.completions)) ? weeklyObj.completions.length : 0;
        const lifetimeStored = Math.max(0, parseInt(progress['sampire-lifetime-challenges-completed'] || '0', 10) || 0);
        const mine = scores.filter((s) => s.userId === target.id && !s.flagged);
        const personalBestWpm = mine.reduce((best, s) => Math.max(best, Number(s.wpm) || 0), 0);
        const weeklyBestWpm = mine.filter(s => s.weekKey === localWeekKey()).reduce((best, s) => Math.max(best, Number(s.wpm) || 0), 0);
        const contribState = getCommunityWeeklyContributionState();
        const contribRow = (contribState && contribState.entries && contribState.entries[`user:${target.id}`]) || null;
        return {
            username: target.username,
            createdAt: Number(target.createdAt) || null,
            badgeIds: badgeUnique,
            lifetimeChallengesCompleted: Math.max(lifetimeStored, dailyTotal + weeklyCount),
            level: localLevelFromProgress(progress),
            streak: Number((parseProgressJsonSafe(progress['sampire-streak'] || '{}', {}) || {}).streak) || 0,
            personalBestWpm,
            weeklyBestWpm,
            communityContributionTotal: Math.max(0, Math.floor(Number(contribRow && contribRow.words) || 0)),
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
            saveLocalJson(LOCAL_AUTH_SCORES_KEY, scores);
            const state = getCommunityWeeklyContributionState();
            if (state && state.entries && state.entries[`user:${user.id}`]) {
                state.entries[`user:${user.id}`].name = nextUsernameRaw;
                setCommunityWeeklyContributionState(state);
            }
        }

        if (nextPassword) {
            if (nextPassword.length < 6) localApiError(400, 'Password must be at least 6 characters');
            if (nextPassword.length > 128) localApiError(400, 'Password must be at most 128 characters');
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
        return { ok: true, user: publicLocalUser(user) };
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
        for (const u of users) if (Array.isArray(u.friends)) u.friends = u.friends.filter(id => id !== user.id);
        saveLocalJson(LOCAL_AUTH_USERS_KEY, users);
        const nextScores = scores.filter(s => s.userId !== user.id);
        saveLocalJson(LOCAL_AUTH_SCORES_KEY, nextScores);
        const state = getCommunityWeeklyContributionState();
        if (state && state.entries && typeof state.entries === 'object') {
            delete state.entries[`user:${user.id}`];
            setCommunityWeeklyContributionState(state);
        }
        return { ok: true };
    }

    if (method === 'POST' && pathname === '/api/community/contribute') {
        const add = Math.max(0, Math.floor(Number(body.words) || 0));
        if (add <= 0) return { ok: true, words: 0 };
        const state = getCommunityWeeklyContributionState();
        const localUser = getLocalUserFromAuth(headers);
        const key = localUser ? `user:${localUser.id}` : 'guests';
        const name = localUser ? localUser.username : 'Guests';
        const prev = state.entries[key] || { id: key, name, words: 0 };
        state.entries[key] = {
            id: key,
            name,
            words: Math.max(0, Math.floor(Number(prev.words) || 0) + add),
        };
        setCommunityWeeklyContributionState(state);
        return { ok: true, words: add, weekTotal: state.entries[key].words };
    }

    const localAdminSummary = (u) => {
        const progress = (u.progress && typeof u.progress === 'object') ? u.progress : {};
        const xp = Math.max(0, parseInt(progress['sampire-xp'] || '0', 10) || 0);
        const skillPoints = Math.max(0, parseInt(progress['sampire-skill-points'] || '0', 10) || 0);
        const skills = parseProgressJsonSafe(progress['sampire-skills'] || '{}', {});
        const badges = parseProgressJsonSafe(progress['sampire-badges'] || '[]', []);
        const days = readDailyDays(progress['sampire-daily-v2']);
        const dayKeys = Object.keys(days).sort();
        const weekly = parseProgressJsonSafe(progress['sampire-weekly'] || '{}', {});
        const streak = parseProgressJsonSafe(progress['sampire-streak'] || '{}', {});
        const mine = scores.filter(s => s.userId === u.id);
        return {
            id: u.id,
            username: u.username,
            createdAt: Number(u.createdAt) || 0,
            lastLoginAt: Number(u.lastLoginAt) || 0,
            lastSeenAt: Number(u.lastSeenAt) || 0,
            level: localLevelFromProgress(progress),
            xp,
            skillPoints,
            badges: Array.isArray(badges) ? badges.length : 0,
            dailyCompleted: dayKeys.length ? days[dayKeys[dayKeys.length - 1]].length : 0,
            weeklyCompleted: Array.isArray(weekly.completions) ? weekly.completions.length : 0,
            streakDays: Math.max(0, Number(streak.streak) || 0),
            skillsUnlocked: ['aura', 'soundscapes', 'nebulaTrail'].filter((k) => !!skills[k]),
            testsSaved: mine.length,
            bestWpm: mine.reduce((b, s) => Math.max(b, Number(s.wpm) || 0), 0),
            flaggedRuns: mine.filter(s => s.flagged).length,
            isActive: ((Date.now() - (Number(u.lastSeenAt) || 0)) <= 15 * 60 * 1000),
        };
    };

    if (method === 'GET' && pathname === '/api/admin/users') {
        const admin = getLocalUserFromAuth(headers);
        if (!admin) localApiError(401, 'Unauthorized');
        if (!admin.isAdmin) localApiError(403, 'Forbidden');
        const out = users.map(localAdminSummary).sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
        return { users: out };
    }

    if (method === 'GET' && pathname === '/api/admin/scores') {
        const admin = getLocalUserFromAuth(headers);
        if (!admin) localApiError(401, 'Unauthorized');
        if (!admin.isAdmin) localApiError(403, 'Forbidden');
        return { scores: scores.filter(s => s.flagged) };
    }

    const adminScoreMatch = pathname.match(/^\/api\/admin\/scores\/([^/]+)$/);
    if (adminScoreMatch && method === 'PATCH') {
        const admin = getLocalUserFromAuth(headers);
        if (!admin) localApiError(401, 'Unauthorized');
        if (!admin.isAdmin) localApiError(403, 'Forbidden');
        const id = decodeURIComponent(adminScoreMatch[1] || '');
        const idx = scores.findIndex(s => s.id === id);
        if (idx < 0) localApiError(404, 'Flagged score not found');
        if (body.approved === true) scores[idx].flagged = false;
        else scores.splice(idx, 1);
        saveLocalJson(LOCAL_AUTH_SCORES_KEY, scores);
        return { ok: true, approved: body.approved === true };
    }

    const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (adminUserMatch) {
        const admin = getLocalUserFromAuth(headers);
        if (!admin) localApiError(401, 'Unauthorized');
        if (!admin.isAdmin) localApiError(403, 'Forbidden');
        const userId = decodeURIComponent(adminUserMatch[1] || '');
        const userIdx = users.findIndex(u => u.id === userId);
        if (userIdx < 0) localApiError(404, 'User not found');
        const user = users[userIdx];
        const progress = (user.progress && typeof user.progress === 'object') ? user.progress : {};
        if (method === 'GET') {
            return { user: localAdminSummary(user) };
        }
        if (method === 'PATCH') {
            const DAILY_IDS = ['nobackspace', 'sprint', 'perfectionist', 'daily_quotes_5', 'daily_words_5', 'daily_words30_5'];
            const WEEKLY_IDS = ['marathon', 'consistent_climber', 'rival_week', 'above_average'];
            const ACHIEVEMENT_IDS = (typeof BADGE_DEFS !== 'undefined' ? BADGE_DEFS : []).map((def) => def.id);
            const clampInt = (value, min, max = Infinity) => {
                if (value == null || value === '') return null;
                const n = Math.floor(Number(value));
                if (!Number.isFinite(n)) return null;
                return Math.min(max, Math.max(min, n));
            };
            const todayKey = (() => {
                const d = new Date();
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            })();
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
            const skills = parseProgressJsonSafe(progress['sampire-skills'] || '{}', {});
            const perLevel = typeof XP_PER_LEVEL === 'number' ? XP_PER_LEVEL : 500;
            if (setLevel !== null) xp = (setLevel - 1) * perLevel;
            if (setXp !== null) xp = setXp;
            if (setSkillPoints !== null) sp = setSkillPoints;
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
                progress['sampire-streak'] = JSON.stringify({ lastPlayDate: todayKey, streak: setStreakDays });
            }
            if (setDailyCompleted !== null) {
                const days = readDailyDays(progress['sampire-daily-v2']);
                days[todayKey] = idsForCount(DAILY_IDS, setDailyCompleted);
                progress['sampire-daily-v2'] = JSON.stringify({ days });
            }
            if (setWeeklyCompleted !== null) {
                progress['sampire-weekly'] = JSON.stringify({ week: (typeof getWeekKey === 'function' ? getWeekKey() : localWeekKey()), completions: idsForCount(WEEKLY_IDS, setWeeklyCompleted) });
            }
            if (setAchievements !== null) {
                const now = Date.now();
                progress['sampire-badges'] = JSON.stringify(idsForCount(ACHIEVEMENT_IDS, setAchievements).map((id) => ({ id, earnedAt: now })));
            }
            progress['sampire-xp'] = String(Math.max(0, xp));
            progress['sampire-skill-points'] = String(Math.max(0, sp));
            progress['sampire-skills'] = JSON.stringify({ ...skills, aura: !!skills.aura, soundscapes: !!skills.soundscapes, nebulaTrail: !!skills.nebulaTrail });
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
            return { ok: true, user: localAdminSummary(user) };
        }
        if (method === 'DELETE') {
            const filteredUsers = users.filter(u => u.id !== user.id);
            for (const u of filteredUsers) if (Array.isArray(u.friends)) u.friends = u.friends.filter(id => id !== user.id);
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
    if (path === '/api/login' || path === '/api/signup' || path === '/api/refresh' || path === '/api/logout' || path === '/api/health') return false;
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

async function cloudFetchJson(url, options = {}) {
    const headers = buildAuthHeaders(options);
    let res = await fetchWithTimeout(url, { ...options, headers });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    const isApiRoute = typeof url === 'string' && url.startsWith('/api/');
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
}

// All three helpers below go to the same place: the online service when the page booted in
// cloud mode, this browser's storage otherwise. The mode never changes mid-session.
async function apiFetch(url, options = {}) {
    await decideBackendMode();
    if (!isCloudMode()) return localApiFetch(url, options, buildAuthHeaders(options));
    return cloudFetchJson(url, options);
}

async function apiFetchCloudFirst(url, options = {}) {
    return apiFetch(url, options);
}

async function apiFetchCloudThenLocal(url, options = {}) {
    return apiFetch(url, options);
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

// Kept for callers that still ask; in cloud mode a failed request is reported, never worked around locally.
function shouldAllowLocalFallback(error) {
    if (!isCloudMode()) return true;
    return false;
}

function shouldAllowAuthLocalFallback(error) {
    return !isCloudMode();
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
        line1.textContent = 'Log in to see your stats.';
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

// Escape closes the login and create-account windows, even when typing in one of their boxes.
try {
    for (const id of ['login-modal', 'signup-modal']) {
        const modal = document.getElementById(id);
        if (!modal) continue;
        modal.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            if (id === 'login-modal') closeLoginModal();
            else closeSignupModal();
        });
    }
} catch (e) {}
