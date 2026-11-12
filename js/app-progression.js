function formatDateKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getTodayStr() { return formatDateKey(new Date()); }

function getWeekStartDate(baseDate = new Date()) {
    const d = new Date(baseDate);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay()); // Sunday
    return d;
}

function getWeekKey(baseDate = new Date()) {
    return formatDateKey(getWeekStartDate(baseDate));
}

function getWeekStartDateUtc(baseDate = new Date()) {
    const d = new Date(baseDate);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // Sunday
    return d;
}

function getWeekKeyUtc(baseDate = new Date()) {
    return formatDateKey(getWeekStartDateUtc(baseDate));
}

function normalizeCompletionList(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(v => String(v)).filter(Boolean))];
}

function parseLegacyDailyDateToKey(value) {
    if (!value || typeof value !== 'string') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return formatDateKey(parsed);
}

function getDailyStoreV2Days() {
    try {
        const raw = JSON.parse(localStorage.getItem(DAILY_V2_KEY) || '{}');
        return (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.days && typeof raw.days === 'object')
            ? raw.days
            : {};
    } catch (e) {
        return {};
    }
}

function saveDailyStoreV2Days(days) {
    try { localStorage.setItem(DAILY_V2_KEY, JSON.stringify({ days })); } catch (e) {}
}

function migrateLegacyDailyRecord(days) {
    let changed = false;
    try {
        const legacy = JSON.parse(localStorage.getItem(DAILY_KEY) || '{}');
        const key = parseLegacyDailyDateToKey(legacy && legacy.date);
        const completions = normalizeCompletionList(legacy && legacy.completions);
        if (key && completions.length > 0 && !Array.isArray(days[key])) {
            days[key] = completions;
            changed = true;
        }
    } catch (e) {}
    if (changed) saveDailyStoreV2Days(days);
    return days;
}

function getDailyCompletions() {
    const todayKey = getTodayStr();
    const days = migrateLegacyDailyRecord(getDailyStoreV2Days());
    return normalizeCompletionList(days[todayKey]);
}

function getLifetimeChallengesCompleted() {
    return Math.max(0, parseInt(localStorage.getItem(LIFETIME_CHALLENGES_KEY) || '0', 10) || 0);
}

function incrementLifetimeChallengesCompleted(delta = 1) {
    const inc = Math.max(0, Math.floor(Number(delta) || 0));
    if (inc <= 0) return getLifetimeChallengesCompleted();
    const nextValue = getLifetimeChallengesCompleted() + inc;
    try { localStorage.setItem(LIFETIME_CHALLENGES_KEY, String(nextValue)); } catch (e) {}
    return nextValue;
}

function markChallengeComplete(id) {
    const todayKey = getTodayStr();
    const days = migrateLegacyDailyRecord(getDailyStoreV2Days());
    const existing = normalizeCompletionList(days[todayKey]);
    const alreadyCompleted = existing.includes(id);
    const completions = [...new Set([...existing, id])];
    days[todayKey] = completions;
    saveDailyStoreV2Days(days);
    if (!alreadyCompleted && completions.includes(id)) incrementLifetimeChallengesCompleted(1);
    // Keep writing legacy key for backward compatibility.
    try { localStorage.setItem(DAILY_KEY, JSON.stringify({ date: todayKey, completions })); } catch (e) {}
}

function getWeeklyState() {
    const currentWeek = getWeekKey();
    try {
        const raw = JSON.parse(localStorage.getItem(WEEKLY_KEY) || '{}');
        if (raw.week === currentWeek) {
            return { week: currentWeek, completions: Array.isArray(raw.completions) ? raw.completions : [] };
        }
    } catch (e) {}
    return { week: currentWeek, completions: [] };
}

function getWeeklyCompletions() {
    return getWeeklyState().completions;
}

function markWeeklyChallengeComplete(id) {
    const state = getWeeklyState();
    const existing = normalizeCompletionList(state.completions || []);
    const alreadyCompleted = existing.includes(id);
    const completions = [...new Set([...(state.completions || []), id])];
    try { localStorage.setItem(WEEKLY_KEY, JSON.stringify({ week: state.week, completions })); } catch (e) {}
    if (!alreadyCompleted && completions.includes(id)) incrementLifetimeChallengesCompleted(1);
}

function getCommunityWeeklyGoalState() {
    const currentWeek = getWeekKeyUtc();
    try {
        const raw = JSON.parse(localStorage.getItem(COMMUNITY_WEEKLY_GOAL_KEY) || '{}');
        if (raw.week === currentWeek && Number.isFinite(raw.words) && raw.words >= 0) {
            return { week: currentWeek, words: Math.floor(raw.words) };
        }
    } catch (e) {}
    const seededWords = getWeeklyWordTotal();
    const seeded = { week: currentWeek, words: Math.max(0, Math.floor(seededWords || 0)) };
    setCommunityWeeklyGoalState(seeded);
    return seeded;
}

function setCommunityWeeklyGoalState(state) {
    const safeState = {
        week: String(state && state.week ? state.week : getWeekKeyUtc()),
        words: Math.max(0, Math.floor(Number(state && state.words) || 0)),
    };
    try { localStorage.setItem(COMMUNITY_WEEKLY_GOAL_KEY, JSON.stringify(safeState)); } catch (e) {}
}

function getCommunityWeeklyContributionState() {
    const currentWeek = getWeekKeyUtc();
    try {
        const raw = JSON.parse(localStorage.getItem(COMMUNITY_WEEKLY_CONTRIB_KEY) || '{}');
        if (raw.week === currentWeek && raw.entries && typeof raw.entries === 'object' && !Array.isArray(raw.entries)) {
            return { week: currentWeek, entries: raw.entries };
        }
    } catch (e) {}
    return { week: currentWeek, entries: {} };
}

function setCommunityWeeklyContributionState(state) {
    const safeState = {
        week: String(state && state.week ? state.week : getWeekKeyUtc()),
        entries: (state && state.entries && typeof state.entries === 'object' && !Array.isArray(state.entries)) ? state.entries : {},
    };
    try { localStorage.setItem(COMMUNITY_WEEKLY_CONTRIB_KEY, JSON.stringify(safeState)); } catch (e) {}
}

function getCommunityContributorInfo() {
    if (currentUser && currentUser.id) {
        return { id: `user:${currentUser.id}`, name: currentUser.username || 'User' };
    }
    const guestId = getGuestSessionId();
    return { id: `guest:${guestId}`, name: `Guest-${String(guestId).slice(0, 4)}` };
}

function addCommunityWeeklyWords(wordCount) {
    const add = Math.max(0, Math.floor(Number(wordCount) || 0));
    const state = getCommunityWeeklyGoalState();
    if (add <= 0) return state;
    const next = { week: state.week, words: state.words + add };
    setCommunityWeeklyGoalState(next);
    const contribState = getCommunityWeeklyContributionState();
    const who = getCommunityContributorInfo();
    const prev = contribState.entries[who.id] || { id: who.id, name: who.name, words: 0 };
    contribState.entries[who.id] = {
        id: who.id,
        name: who.name,
        words: Math.max(0, Math.floor(Number(prev.words) || 0) + add),
    };
    setCommunityWeeklyContributionState(contribState);
    return next;
}

function getCommunityFleetProgress(totalDamage) {
    const damage = Math.max(0, Math.floor(Number(totalDamage) || 0));
    let remainingDamage = damage;
    const levels = COMMUNITY_FLEET_LEVELS.map((level, idx) => {
        const dealt = Math.max(0, Math.min(level.health, remainingDamage));
        remainingDamage = Math.max(0, remainingDamage - level.health);
        const remainingHealth = Math.max(0, level.health - dealt);
        return {
            ...level,
            index: idx,
            dealt,
            remainingHealth,
            remainingPercent: (remainingHealth / level.health) * 100,
            percent: (dealt / level.health) * 100,
            cleared: dealt >= level.health,
        };
    });
    const current = levels.find(l => !l.cleared) || levels[levels.length - 1];
    const allCleared = levels.every(l => l.cleared);
    return { levels, current, allCleared, totalDamage: damage };
}

function getTypedWordCountForEntry(entry) {
    if (entry && Number.isFinite(entry.typedWords) && entry.typedWords > 0) return Math.round(entry.typedWords);
    const wpm = Number(entry && entry.wpm) || 0;
    const time = Number(entry && entry.time) || 0;
    if (wpm > 0 && time > 0) return Math.max(0, Math.round((wpm * time) / 60));
    return 0;
}

function getHistoryForCurrentWeek() {
    const all = loadHistory();
    const weekStart = getWeekStartDate();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const startTs = weekStart.getTime();
    const endTs = weekEnd.getTime();
    return all.filter(h => (h.date || 0) >= startTs && (h.date || 0) < endTs);
}

function getHistoryForToday() {
    const all = loadHistory();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const startTs = start.getTime();
    const endTs = end.getTime();
    return all.filter(h => (h.date || 0) >= startTs && (h.date || 0) < endTs);
}

function getDailyModeCount(mode) {
    const m = String(mode || '');
    return getHistoryForToday().reduce((count, row) => count + (row.mode === m ? 1 : 0), 0);
}

function getDailyPassiveProgress(challengeId) {
    const def = CHALLENGES.find(c => c.id === challengeId && c.passive);
    if (!def) return { count: 0, target: 0 };
    const count = getDailyModeCount(def.mode);
    return { count, target: def.target || 0 };
}

function completePassiveDailyChallengesIfEligible() {
    const completions = new Set(getDailyCompletions());
    const newlyCompleted = [];
    const passiveDefs = CHALLENGES.filter(c => c.passive);
    for (const def of passiveDefs) {
        if (completions.has(def.id)) continue;
        const progress = getDailyPassiveProgress(def.id);
        if ((progress.count || 0) < (def.target || 0)) continue;
        markChallengeComplete(def.id);
        completions.add(def.id);
        const earnedXp = Math.round((def.xp || 0) * getXPMultiplier());
        if (earnedXp > 0) {
            addXP(earnedXp);
            updateStreak();
        }
        newlyCompleted.push({ id: def.id, name: def.name, xpGained: earnedXp });
    }
    return newlyCompleted;
}

function getWeeklyWordTotal() {
    return getHistoryForCurrentWeek().reduce((sum, entry) => sum + getTypedWordCountForEntry(entry), 0);
}

function completePassiveWeeklyChallengesIfEligible() {
    const weeklyCompletions = new Set(getWeeklyCompletions());
    const newlyCompleted = [];
    const passiveRules = [
        { id: 'marathon', ok: () => getWeeklyWordTotal() >= 10000 },
        { id: 'consistent_climber', ok: () => getWeeklyConsistentClimberStreak() >= 10 },
        { id: 'above_average', ok: () => getWeeklyAboveAverageCount() >= 5 },
    ];
    for (const rule of passiveRules) {
        if (weeklyCompletions.has(rule.id)) continue;
        if (!rule.ok()) continue;
        markWeeklyChallengeComplete(rule.id);
        weeklyCompletions.add(rule.id);
        const def = WEEKLY_CHALLENGES.find(c => c.id === rule.id);
        const earnedXp = def ? Math.round(def.xp * getXPMultiplier()) : 0;
        if (earnedXp > 0) {
            addXP(earnedXp);
            updateStreak();
        }
        newlyCompleted.push({ id: rule.id, name: def ? def.name : rule.id, xpGained: earnedXp });
    }
    return newlyCompleted;
}

function getWeeklyConsistentClimberStreak() {
    const weekHistory = [...getHistoryForCurrentWeek()].sort((a, b) => (a.date || 0) - (b.date || 0));
    if (weekHistory.length === 0) return 0;
    const pb = weekHistory.reduce((best, row) => Math.max(best, Number(row.wpm) || 0), 0);
    if (pb <= 0) return 0;
    const threshold = pb * 0.95;
    let bestRun = 0;
    let run = 0;
    for (const row of weekHistory) {
        const wpm = Number(row.wpm) || 0;
        if (wpm >= threshold) {
            run++;
            if (run > bestRun) bestRun = run;
        } else {
            run = 0;
        }
    }
    return bestRun;
}

function getAverageWpmBaseline() {
    const all = loadHistory();
    if (all.length === 0) return 0;
    const weekHistory = getHistoryForCurrentWeek();
    const weekSet = new Set(weekHistory.map(h => h.date || 0));
    const prior = all.filter(h => !weekSet.has(h.date || 0));
    const source = prior.length > 0 ? prior : all;
    if (source.length === 0) return 0;
    return source.reduce((sum, row) => sum + (Number(row.wpm) || 0), 0) / source.length;
}

function getWeeklyAboveAverageCount() {
    const weekHistory = getHistoryForCurrentWeek();
    const baseline = getAverageWpmBaseline();
    if (weekHistory.length === 0 || baseline <= 0) return 0;
    const threshold = baseline * 1.05;
    return weekHistory.reduce((count, row) => count + ((Number(row.wpm) || 0) >= threshold ? 1 : 0), 0);
}

function computeMedian(values) {
    const list = values.map(v => Number(v) || 0).filter(v => v > 0).sort((a, b) => a - b);
    if (list.length === 0) return null;
    const mid = Math.floor(list.length / 2);
    if (list.length % 2 === 1) return list[mid];
    return (list[mid - 1] + list[mid]) / 2;
}

function getPreviousWeekRange() {
    const thisWeekStart = getWeekStartDate();
    const prevStart = new Date(thisWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevEnd = new Date(thisWeekStart);
    return { startTs: prevStart.getTime(), endTs: prevEnd.getTime(), key: formatDateKey(prevStart) };
}

function getCachedWeeklyRivalTarget() {
    const currentWeek = getWeekKey();
    try {
        const raw = JSON.parse(localStorage.getItem(WEEKLY_RIVAL_KEY) || '{}');
        if (raw.week === currentWeek && Number.isFinite(raw.target)) return Number(raw.target);
    } catch (e) {}
    return null;
}

function setCachedWeeklyRivalTarget(target) {
    const currentWeek = getWeekKey();
    const safeTarget = Number(target);
    if (!Number.isFinite(safeTarget) || safeTarget <= 0) return;
    try { localStorage.setItem(WEEKLY_RIVAL_KEY, JSON.stringify({ week: currentWeek, target: Math.round(safeTarget) })); } catch (e) {}
}

function estimateWeeklyRivalTargetFromLocalHistory() {
    const { startTs, endTs } = getPreviousWeekRange();
    const values = loadHistory()
        .filter(h => (h.date || 0) >= startTs && (h.date || 0) < endTs)
        .map(h => Number(h.wpm) || 0)
        .filter(v => v > 0);
    return computeMedian(values);
}

async function refreshWeeklyRivalTarget() {
    if (getCachedWeeklyRivalTarget() !== null) return;
    if (rivalTargetRefreshInFlight) return;
    rivalTargetRefreshInFlight = true;
    try {
        const { startTs, endTs } = getPreviousWeekRange();
        const out = await apiFetch('/api/leaderboard?limit=100');
        const rows = Array.isArray(out.leaderboard) ? out.leaderboard : [];
        const prevWeekValues = rows
            .filter(r => (r.date || 0) >= startTs && (r.date || 0) < endTs)
            .map(r => Number(r.wpm) || 0)
            .filter(v => v > 0);
        let median = computeMedian(prevWeekValues);
        if (median === null) {
            const fallback = rows.map(r => Number(r.wpm) || 0).filter(v => v > 0);
            median = computeMedian(fallback);
        }
        if (median === null) median = estimateWeeklyRivalTargetFromLocalHistory();
        if (median !== null) {
            setCachedWeeklyRivalTarget(median);
            if (currentMode === 'daily') renderDailyChallenges();
        }
    } catch (e) {
        const localFallback = estimateWeeklyRivalTargetFromLocalHistory();
        if (localFallback !== null) setCachedWeeklyRivalTarget(localFallback);
    } finally {
        rivalTargetRefreshInFlight = false;
    }
}

const STREAK_KEY = 'sampire-streak';
const BADGES_KEY = 'sampire-badges';
// Founder is closed to new signups: only accounts created before this cutoff qualify.
const FOUNDER_SIGNUP_CUTOFF_MS = Date.UTC(2026, 10, 7); // 2026-11-07T00:00:00Z

const BADGE_DEFS = [
    { id: 'sonic_boom',    name: 'Sonic Boom',       desc: 'Hit 100+ WPM for the first time',           icon: '⚡' },
    { id: 'speed_demon',   name: 'Speed Demon',      desc: 'Achieve 120+ WPM',                          icon: '🔥' },
    { id: 'flawless',      name: 'Flawless',         desc: 'Complete The Perfectionist challenge',       icon: '✨' },
    { id: 'midnight_oil',  name: 'The Midnight Oil', desc: 'Complete a run between midnight and 4 AM',   icon: '🌙' },
    { id: 'streak_master', name: 'Streak Master',    desc: 'Maintain a 7-day streak',                   icon: '🔗' },
    { id: 'triple_crown',  name: 'Triple Crown',     desc: 'Complete all 3 daily challenges in one day', icon: '👑' },
    { id: 'founder',       name: 'Founder',          desc: 'Created an account during the beta period',  icon: '🏛️' },
    { id: 'human_lectionary', name: 'The Human Lectionary', desc: 'Complete 100 Bible Mode typing tests', icon: '📖' },
];

function getStreakData() {
    try { return JSON.parse(localStorage.getItem(STREAK_KEY) || 'null') || { lastPlayDate: '', streak: 0 }; }
    catch(e) { return { lastPlayDate: '', streak: 0 }; }
}

function updateStreak() {
    const today = getTodayStr();
    const data = getStreakData();
    const yd = new Date(); yd.setDate(yd.getDate() - 1);
    const yStr = formatDateKey(yd);
    let streak = data.streak || 0;
    if (data.lastPlayDate === today) { /* already counted today */ }
    else if (data.lastPlayDate === yStr) { streak += 1; }
    else { streak = 1; }
    try { localStorage.setItem(STREAK_KEY, JSON.stringify({ lastPlayDate: today, streak })); } catch(e) {}
    return streak;
}

function getXPMultiplier(streakOverride = null) {
    const streak = Math.max(0, Number(streakOverride != null ? streakOverride : (getStreakData().streak || 0)) || 0);
    if (streak <= 1) return 1;
    return Math.min(2, 1 + (0.5 * (streak - 1)));
}

function getEarnedBadges() {
    try {
        const raw = JSON.parse(localStorage.getItem(BADGES_KEY) || '[]');
        // Normalise old format (plain string array) to object array
        return raw.map(b => typeof b === 'string' ? { id: b, earnedAt: null } : b);
    } catch(e) { return []; }
}

function awardBadge(id) {
    const badges = getEarnedBadges();
    if (badges.some(b => b.id === id)) return false;
    badges.push({ id, earnedAt: Date.now() });
    try { localStorage.setItem(BADGES_KEY, JSON.stringify(badges)); } catch(e) {}
    invalidateLeaderboardUserSummaryCache(currentUser && currentUser.username);
    // Badge unlocks are high-value progress; flush immediately so redeploy refreshes
    // do not race and lose unsynced achievements.
    flushProgressSyncNow();
    addXP(200);
    return true;
}

function ensureFounderBadgeForBeta() {
    if (!currentUser) return;
    // The server sends createdAt: null for legacy accounts that predate the field; those are old enough to qualify.
    const createdAt = Number(currentUser.createdAt) || 0;
    const isLegacyCloudAccount = currentUser.createdAt === null;
    if (isLegacyCloudAccount || (createdAt > 0 && createdAt < FOUNDER_SIGNUP_CUTOFF_MS)) awardBadge('founder');
    awardRetroactiveBadges();
}

// One-time check after hydration: grant badges whose conditions are already met, with a single summary toast.
function awardRetroactiveBadges() {
    if (!currentUser) return;
    const granted = [];
    if ((getStreakData().streak || 0) >= 7 && awardBadge('streak_master')) granted.push('streak_master');
    if (getDailyCompletions().length >= CHALLENGES.length && awardBadge('triple_crown')) granted.push('triple_crown');
    if (!granted.length) return;
    const names = granted.map(id => (BADGE_DEFS.find(b => b.id === id) || { name: id }).name).join(', ');
    showUiMessage(`Achievement${granted.length > 1 ? 's' : ''} unlocked: ${names}`, 'success', 3600);
}

function getBibleModeLookupSet() {
    const pool = getBibleQuotePool();
    const out = new Set();
    for (const item of pool) {
        out.add(String(item && item.text || '').trim());
    }
    return out;
}

function getBibleModeTestCount() {
    return getLifetimeStatsSummary().bibleTests;
}

function checkBadges(wpm, passed, challengeId) {
    const newBadges = [];
    if (wpm >= 100 && awardBadge('sonic_boom'))  newBadges.push('sonic_boom');
    if (wpm >= 120 && awardBadge('speed_demon')) newBadges.push('speed_demon');
    if (passed && challengeId === 'perfectionist' && awardBadge('flawless')) newBadges.push('flawless');
    if (passed) {
        const h = new Date().getHours();
        if (h >= 0 && h < 4 && awardBadge('midnight_oil')) newBadges.push('midnight_oil');
    }
    if ((getStreakData().streak || 0) >= 7 && awardBadge('streak_master')) newBadges.push('streak_master');
    if (getDailyCompletions().length >= CHALLENGES.length && awardBadge('triple_crown')) newBadges.push('triple_crown');
    if (getBibleModeTestCount() >= 100 && awardBadge('human_lectionary')) newBadges.push('human_lectionary');
    return newBadges;
}

function showNewBadges(badgeIds) {
    const el = document.getElementById('result-new-badges');
    if (!el) return;
    if (!badgeIds || badgeIds.length === 0) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.innerHTML = badgeIds.map(id => {
        const def = BADGE_DEFS.find(b => b.id === id);
        if (!def) return '';
        return `<div class="new-badge-item"><span class="new-badge-icon">${def.icon}</span><div><div class="new-badge-name">Achievement Unlocked: ${escapeHtml(def.name)} (+200 XP)</div><div class="new-badge-desc">${escapeHtml(def.desc)}</div></div></div>`;
    }).join('');
}

function getTotalXP()  { return parseInt(localStorage.getItem(XP_KEY) || '0', 10); }
function getLevel(xp)  { return Math.min(100, Math.floor(xp / XP_PER_LEVEL) + 1); }
function getLevelProgress(xp) { return (xp % XP_PER_LEVEL) / XP_PER_LEVEL; }

function getLevelName(level) {
    if (level <= 10) return 'Scribe';
    if (level <= 20) return 'Calligrapher';
    if (level <= 30) return 'Typist';
    if (level <= 40) return 'Operator';
    return 'Cyber-Runner';
}

function getSkillPoints() {
    return Math.max(0, parseInt(localStorage.getItem(SKILL_POINTS_KEY) || '0', 10) || 0);
}

function setSkillPoints(points) {
    const safe = Math.max(0, Math.floor(points || 0));
    try { localStorage.setItem(SKILL_POINTS_KEY, String(safe)); } catch (e) {}
}

function getSkillsState() {
    const fallback = { aura: false, soundscapes: false, nebulaTrail: false, keySoundPacks: {} };
    if (skillStateCache) return skillStateCache;
    try {
        const raw = JSON.parse(localStorage.getItem('sampire-skills') || '{}');
        const unlockedPacks = {};
        for (const packId of getShopKeySoundPackIds()) {
            unlockedPacks[packId] = !!(raw.keySoundPacks && raw.keySoundPacks[packId]);
        }
        skillStateCache = {
            aura: !!raw.aura,
            soundscapes: !!raw.soundscapes,
            nebulaTrail: !!raw.nebulaTrail,
            keySoundPacks: unlockedPacks,
        };
        return skillStateCache;
    } catch (e) {
        skillStateCache = fallback;
        return fallback;
    }
}

function saveSkillsState(nextState) {
    const nextPacks = {};
    for (const packId of getShopKeySoundPackIds()) {
        nextPacks[packId] = !!(nextState && nextState.keySoundPacks && nextState.keySoundPacks[packId]);
    }
    skillStateCache = {
        aura: !!(nextState && nextState.aura),
        soundscapes: !!(nextState && nextState.soundscapes),
        nebulaTrail: !!(nextState && nextState.nebulaTrail),
        keySoundPacks: nextPacks,
    };
    try { localStorage.setItem('sampire-skills', JSON.stringify(skillStateCache)); } catch (e) {}
    flushProgressSyncNow();
}

function isSkillUnlocked(skillId) {
    const state = getSkillsState();
    return !!state[skillId];
}

function isKeySoundPackUnlocked(packName) {
    const safe = String(packName || '').trim();
    if (!safe) return false;
    if (safe === KEY_SOUND_DEFAULT_PACK) return true;
    const state = getSkillsState();
    return !!(state.keySoundPacks && state.keySoundPacks[safe]);
}

function triggerShopPurchaseFx(key) {
    const safeKey = String(key || '').trim();
    if (!safeKey) return;
    shopPurchaseFxKey = safeKey;
    shopPurchaseFxExpiresAt = Date.now() + 980;
    playSound(SFX.purchase1);
    setTimeout(() => {
        if (shopPurchaseFxKey !== safeKey) return;
        if (Date.now() < shopPurchaseFxExpiresAt) return;
        shopPurchaseFxKey = '';
        if (document.getElementById('skills-modal')?.classList.contains('show')) renderSkillsModal();
    }, 1020);
}

function getShopPurchaseFxClass(key) {
    const safeKey = String(key || '').trim();
    if (!safeKey) return '';
    if (shopPurchaseFxKey !== safeKey) return '';
    if (Date.now() >= shopPurchaseFxExpiresAt) return '';
    return ' purchase-fx';
}

function getShopPurchaseFxMarkup(key) {
    const safeKey = String(key || '').trim();
    if (!safeKey) return '';
    if (shopPurchaseFxKey !== safeKey) return '';
    if (Date.now() >= shopPurchaseFxExpiresAt) return '';
    return `<span class="shop-purchase-burst" aria-hidden="true">
        <span class="burst-flare"></span>
        <span class="burst-ring"></span>
        <span class="burst-unlocked">Unlocked</span>
        <span class="burst-spark s1"></span>
        <span class="burst-spark s2"></span>
        <span class="burst-spark s3"></span>
        <span class="burst-spark s4"></span>
        <span class="burst-spark s5"></span>
        <span class="burst-spark s6"></span>
        <span class="burst-spark s7"></span>
    </span>`;
}

function unlockShopKeySoundPack(packName) {
    const safe = String(packName || '').trim();
    const def = SHOP_KEY_SOUND_PACKS.find((pack) => pack.id === safe);
    if (!def) return;
    if (isKeySoundPackUnlocked(safe)) return;
    const points = getSkillPoints();
    if (points < def.cost) {
        playSound(SFX.below50);
        showUiMessage('Not enough Aether Crystals.');
        return;
    }
    const state = getSkillsState();
    if (!state.keySoundPacks || typeof state.keySoundPacks !== 'object') state.keySoundPacks = {};
    state.keySoundPacks[safe] = true;
    setSkillPoints(points - def.cost);
    saveSkillsState(state);
    triggerShopPurchaseFx(`pack:${safe}`);
    updateSkillDisplay();
    renderSkillsModal();
    updateKeySoundPackMenuUI();
    showUiMessage(`${def.label} unlocked!`, 'success', 1800, 'top-left');
    flushProgressSyncNow();
}

function getRewardSettings() {
    const fallback = { aura: true, soundscapes: true, nebulaTrail: true };
    try {
        const raw = JSON.parse(localStorage.getItem(REWARD_SETTINGS_KEY) || '{}');
        return {
            aura: raw.aura !== false,
            soundscapes: raw.soundscapes !== false,
            nebulaTrail: raw.nebulaTrail !== false,
        };
    } catch (e) {
        return fallback;
    }
}

function saveRewardSettings(next) {
    const safe = {
        aura: !!(next && next.aura),
        soundscapes: !!(next && next.soundscapes),
        nebulaTrail: !!(next && next.nebulaTrail),
    };
    try { localStorage.setItem(REWARD_SETTINGS_KEY, JSON.stringify(safe)); } catch (e) {}
    flushProgressSyncNow();
}

function isRewardActive(skillId) {
    if (!isSkillUnlocked(skillId)) return false;
    const settings = getRewardSettings();
    return settings[skillId] !== false;
}

function setRewardActive(skillId, active) {
    if (!['aura', 'soundscapes', 'nebulaTrail'].includes(skillId)) return;
    if (!isSkillUnlocked(skillId)) return;
    const settings = getRewardSettings();
    settings[skillId] = !!active;
    saveRewardSettings(settings);
    if (skillId === 'soundscapes' && !settings.soundscapes && activeMusicTheme === 'universe') {
        setActiveMusicTheme('dark');
        stopSoundscapesPreview();
    } else if (skillId === 'soundscapes' && settings.soundscapes) {
        setActiveMusicTheme('universe');
    }
    applyAuraStyles();
    updateMusicMenuUI();
    if (document.getElementById('skills-modal')?.classList.contains('show')) renderSkillsModal();
    if (document.getElementById('inventory-modal')?.classList.contains('show')) renderInventoryModal();
    flushProgressSyncNow();
}

function updateSkillDisplay() {
    const badge = document.getElementById('skill-point-badge');
    const points = getSkillPoints();
    if (badge) badge.textContent = `Aether Crystals: ${points}`;
}

function spendSkillPoint(skillId) {
    const defs = {
        aura: { label: 'Word Glow', levelReq: 1, cost: 1 },
        soundscapes: { label: 'Your Own Personal Universe', levelReq: 3, cost: 1 },
        nebulaTrail: { label: 'Nebula Trail', levelReq: 1, cost: 1 },
    };
    const def = defs[skillId];
    if (!def) return;

    const level = getLevel(getTotalXP());
    if (level < def.levelReq) {
        playSound(SFX.below50);
        showUiMessage(`${def.label} unlocks at level ${def.levelReq}.`);
        return;
    }
    const points = getSkillPoints();
    if (points < def.cost) {
        playSound(SFX.below50);
        showUiMessage('Not enough Aether Crystals.');
        return;
    }
    const state = getSkillsState();
    if (state[skillId]) {
        playSound(SFX.below50);
        return;
    }

    state[skillId] = true;
    setSkillPoints(points - def.cost);
    saveSkillsState(state);
    triggerShopPurchaseFx(skillId);
    const rewardSettings = getRewardSettings();
    rewardSettings[skillId] = true;
    saveRewardSettings(rewardSettings);

    if (skillId === 'soundscapes') {
        setActiveMusicTheme('universe');
    }
    updateMusicMenuUI();
    updateSkillDisplay();
    renderSkillsModal();
    applyAuraStyles();
    flushProgressSyncNow();
}

function renderSkillsModal() {
    const content = document.getElementById('skills-content');
    if (!content) return;
    const points = getSkillPoints();
    const level = getLevel(getTotalXP());
    const state = getSkillsState();
    const soundscapesLockedByLevel = level < 3;

    const crystal = '<span class="aether-crystal-icon" role="img" aria-label="Aether Crystal" title="Aether Crystal"></span>';

    content.innerHTML = `
        <div class="skills-modal-header-row">
            <span class="daily-xp-level">Lv ${level} <span class="daily-level-name">${getLevelName(level)}</span></span>
            <span class="shop-banner-title">Shop</span>
            <span class="skill-point-badge">Aether Crystals: ${points}</span>
        </div>
        <div class="skills-modal-grid">
            <div class="skill-card${state.aura ? ' purchased' : ''}${getShopPurchaseFxClass('aura')}">
                ${getShopPurchaseFxMarkup('aura')}
                <div class="skill-card-title">Word Glow</div>
                <div class="skill-card-desc">A subtle glow around your current word that shifts color as your speed rises.</div>
                <div class="skill-card-meta">
                    <span class="skill-cost-row"><span class="skill-cost-label">Cost</span><span class="skill-cost-current">1 ${crystal}</span></span>
                </div>
                <div class="skill-status ${state.aura ? 'unlocked' : 'locked'}">${state.aura ? 'Owned' : 'Locked'}</div>
                <button class="secondary shop-buy-btn" ${state.aura ? 'disabled' : ''} onclick="spendSkillPoint('aura')">
                    ${state.aura ? 'Owned' : 'Unlock Reward'}
                </button>
                <div class="skill-card-controls">
                    ${auraPreviewVisible
                        ? `<div class="reward-preview-stage" id="aura-preview-stage" onclick="previewAuraReward()" title="Click to replay preview">
                            <span class="reward-preview-word" id="aura-preview-word">cosmic</span>
                            <span class="reward-preview-word">typing</span>
                           </div>`
                        : `<button class="reward-preview-btn" onclick="toggleAuraPreview()">Preview</button>`}
                </div>
            </div>
            <div class="skill-card${state.soundscapes ? ' purchased' : ''}${getShopPurchaseFxClass('soundscapes')}">
                ${getShopPurchaseFxMarkup('soundscapes')}
                <div class="skill-card-title">Your Own Personal Universe</div>
                <div class="skill-card-desc">Unlock the menu music theme "Your Own Personal Universe" at level 3.</div>
                <div class="skill-card-meta">
                    <span class="skill-cost-row"><span class="skill-cost-label">Cost</span><span class="skill-cost-current">1 ${crystal}</span><span class="skill-cost-label">· Requires Lv 3</span></span>
                </div>
                <div class="skill-status ${state.soundscapes ? 'unlocked' : 'locked'}">${state.soundscapes ? 'Owned' : 'Locked'}</div>
                <button class="secondary shop-buy-btn" ${(state.soundscapes || soundscapesLockedByLevel) ? 'disabled' : ''} onclick="spendSkillPoint('soundscapes')">
                    ${state.soundscapes ? 'Owned' : (soundscapesLockedByLevel ? 'Reach Lv 3' : 'Unlock Reward')}
                </button>
                <div class="skill-card-controls">
                    <button
                        class="soundscape-preview-icon-btn"
                        onclick="toggleSoundscapesPreview()"
                        aria-label="${rewardSoundPreviewPlaying ? 'Pause sound preview' : 'Play sound preview'}"
                        title="${rewardSoundPreviewPlaying ? 'Pause preview' : 'Play preview'}"
                    >${rewardSoundPreviewPlaying ? '❚❚' : '▶'}</button>
                </div>
            </div>
            <div class="skill-card${state.nebulaTrail ? ' purchased' : ''}${getShopPurchaseFxClass('nebulaTrail')}">
                ${getShopPurchaseFxMarkup('nebulaTrail')}
                <div class="skill-card-title">Nebula Trail</div>
                <div class="skill-card-desc">Your cursor leaves a colorful, swirling gas trail as you type across the screen.</div>
                <div class="skill-card-meta">
                    <span class="skill-cost-row">
                        <span class="skill-cost-label">Cost</span>
                        <span class="skill-cost-old">9999 ${crystal}</span>
                        <span class="skill-cost-current">3 ${crystal}</span>
                        <span class="flash-sale-badge">Flash Sale!</span>
                    </span>
                </div>
                <div class="skill-status ${state.nebulaTrail ? 'unlocked' : 'locked'}">${state.nebulaTrail ? 'Owned' : 'Locked'}</div>
                <button class="secondary shop-buy-btn" ${state.nebulaTrail ? 'disabled' : ''} onclick="spendSkillPoint('nebulaTrail')">
                    ${state.nebulaTrail ? 'Owned' : 'Unlock Reward'}
                </button>
                <div class="skill-card-controls">
                    ${nebulaPreviewVisible
                        ? `<div class="reward-preview-stage" id="nebula-preview-stage" onclick="previewNebulaTrailReward()" title="Click to replay preview">
                            <span class="reward-preview-word">type</span>
                            <span class="reward-preview-word">faster</span>
                            <span class="reward-preview-cursor" aria-hidden="true"></span>
                           </div>`
                        : `<button class="reward-preview-btn" onclick="toggleNebulaPreview()">Preview</button>`}
                </div>
            </div>
        </div>
        <div class="profile-section-title">Keyboard Sound Packs</div>
        <div class="skills-modal-grid">
            ${SHOP_KEY_SOUND_PACKS.map((pack) => {
                const owned = isKeySoundPackUnlocked(pack.id);
                return `<div class="skill-card${owned ? ' purchased' : ''}${getShopPurchaseFxClass(`pack:${pack.id}`)}">
                    ${getShopPurchaseFxMarkup(`pack:${pack.id}`)}
                    <div class="skill-card-title">${escapeHtml(pack.label)}</div>
                    <div class="skill-card-desc">${escapeHtml(pack.desc)}</div>
                    <div class="skill-card-meta">
                        <span class="skill-cost-row"><span class="skill-cost-label">Cost</span><span class="skill-cost-current">${pack.cost} ${crystal}</span></span>
                    </div>
                    <div class="skill-status ${owned ? 'unlocked' : 'locked'}">${owned ? 'Owned' : 'Locked'}</div>
                    <button class="secondary shop-buy-btn" ${owned ? 'disabled' : ''} onclick="unlockShopKeySoundPack('${escapeHtml(pack.id)}')">
                        ${owned ? 'Owned' : 'Unlock Pack'}
                    </button>
                    <div class="skill-card-controls">
                        <input type="text" class="shop-preview-input" maxlength="42" placeholder="Type here to preview this pack" onkeydown="handleShopKeySoundPreviewKeydown(event, '${escapeHtml(pack.id)}')">
                        <div class="shop-preview-note">Preview typing sounds without equipping.</div>
                    </div>
                </div>`;
            }).join('')}
        </div>
    `;
}

function toggleAuraPreview() {
    auraPreviewVisible = true;
    renderSkillsModal();
    requestAnimationFrame(previewAuraReward);
}

function toggleNebulaPreview() {
    nebulaPreviewVisible = true;
    renderSkillsModal();
    requestAnimationFrame(previewNebulaTrailReward);
}

function toggleRewardFromInventory(skillId) {
    const next = !isRewardActive(skillId);
    setRewardActive(skillId, next);
}

const inventorySectionsOpen = {
    soundscapes: false,
    cosmetics: false,
    keypacks: false,
};

function isInventorySectionOpen(section) {
    return !!inventorySectionsOpen[section];
}

function toggleInventorySection(section) {
    if (!Object.prototype.hasOwnProperty.call(inventorySectionsOpen, section)) return;
    inventorySectionsOpen[section] = !inventorySectionsOpen[section];
    renderInventoryModal();
}
window.toggleInventorySection = toggleInventorySection;

function equipKeySoundPackFromInventory(packName) {
    const safe = String(packName || '').trim();
    if (!safe || !isKeySoundPackUnlocked(safe)) return;
    setKeySoundPack(safe);
    keySoundsEnabled = true;
    setKeySoundToggleUI();
    updateKeySoundPackMenuUI();
    try { localStorage.setItem('sampire-key-sounds-enabled', '1'); } catch (e) {}
    renderInventoryModal();
    showUiMessage(`${safe} equipped.`, 'success', 1400, 'top-left');
}

function renderInventoryModal() {
    const content = document.getElementById('inventory-content');
    if (!content) return;
    const owned = getSkillsState();
    const settings = getRewardSettings();
    const soundscapesItems = [
        { id: 'soundscapes', name: 'Your Own Personal Universe', desc: 'Unlocks and enables the universe menu soundtrack.' },
    ].filter(item => !!owned[item.id]);
    const cosmeticsItems = [
        { id: 'aura', name: 'Word Glow', desc: 'Glow effect around your current word.' },
        { id: 'nebulaTrail', name: 'Nebula Trail', desc: 'Colorful trail effect while typing.' },
    ].filter(item => !!owned[item.id]);
    const keyboardPackItems = SHOP_KEY_SOUND_PACKS
        .filter((pack) => isKeySoundPackUnlocked(pack.id))
        .map((pack) => ({
            id: pack.id,
            icon: pack.icon,
            name: pack.label,
            desc: pack.desc,
            equipped: keySoundPackName === pack.id,
        }));

    const anyOwned = soundscapesItems.length > 0 || cosmeticsItems.length > 0 || keyboardPackItems.length > 0;
    if (!anyOwned) {
        content.innerHTML = '<div class="inventory-empty">No rewards earned yet. Visit the Shop to unlock rewards.</div>';
        return;
    }

    const renderRewardCards = (items) => items.map((item) => {
        const on = settings[item.id] !== false;
        const previewHtml = item.id === 'aura'
            ? `<div class="reward-preview-stage" onclick="previewAuraRewardAt('inventory-aura-preview-word')" title="Click to replay preview">
                    <span class="reward-preview-word" id="inventory-aura-preview-word">cosmic</span>
                    <span class="reward-preview-word">typing</span>
               </div>`
            : item.id === 'nebulaTrail'
                ? `<div class="reward-preview-stage" id="inventory-nebula-preview-stage" onclick="previewNebulaTrailRewardAt('inventory-nebula-preview-stage')" title="Click to replay preview">
                        <span class="reward-preview-word">type</span>
                        <span class="reward-preview-word">faster</span>
                        <span class="reward-preview-cursor" aria-hidden="true"></span>
                   </div>`
                : `<button type="button" class="soundscape-preview-icon-btn" onclick="toggleSoundscapesPreview()" aria-label="${rewardSoundPreviewPlaying ? 'Pause sound preview' : 'Play sound preview'}" title="${rewardSoundPreviewPlaying ? 'Pause preview' : 'Play preview'}">${rewardSoundPreviewPlaying ? '❚❚' : '▶'}</button>`;
        return `<div class="inventory-item reward-item">
            <div class="inventory-item-main">
                <div class="inventory-item-top">
                    <span class="inventory-item-name">${escapeHtml(item.name)}</span>
                    <button class="inventory-toggle ${on ? 'on' : ''}" onclick="toggleRewardFromInventory('${item.id}')">${on ? 'On' : 'Off'}</button>
                </div>
                <div class="inventory-preview-panel">${previewHtml}</div>
                <div class="inventory-item-desc">${escapeHtml(item.desc)}</div>
            </div>
        </div>`;
    }).join('');

    const renderPackCards = (items) => items.map((item) => `
        <div class="inventory-item">
            <div class="inventory-item-top">
                <span class="inventory-item-name">${escapeHtml(item.name)}</span>
                <button class="inventory-toggle ${item.equipped ? 'on' : ''}" onclick="equipKeySoundPackFromInventory('${escapeHtml(item.id)}')">${item.equipped ? 'Equipped' : 'Equip'}</button>
            </div>
            <div class="inventory-item-desc">${escapeHtml(item.desc)}</div>
            <div class="inventory-pack-preview">
                <span class="inventory-pack-preview-label">Try Now</span>
                <input type="text" class="shop-preview-input" maxlength="42" placeholder="Type here to preview this pack" onkeydown="handleShopKeySoundPreviewKeydown(event, '${escapeHtml(item.id)}')">
            </div>
            <div class="inventory-item-meta">${item.equipped ? '<span class="equipped">Currently active key sound pack.</span>' : 'Click Equip to make this your active key sound pack.'}</div>
        </div>
    `).join('');

    const renderInventorySection = (sectionId, title, itemCount, bodyHtml) => {
        const open = isInventorySectionOpen(sectionId);
        return `<div class="inventory-section">
            <div class="inventory-section-header">
                <span class="inventory-section-title">${title}</span>
                <span class="inventory-section-controls">
                    <span class="weekly-reset">${itemCount} unlocked</span>
                    <button type="button" class="challenge-section-toggle" aria-label="${open ? `Collapse ${title}` : `Expand ${title}`}" aria-expanded="${open ? 'true' : 'false'}" onclick="toggleInventorySection('${sectionId}')"><span class="chevron">▾</span></button>
                </span>
            </div>
            ${open ? bodyHtml : ''}
        </div>`;
    };

    content.innerHTML = `
        <div class="inventory-grid">
            ${renderInventorySection(
                'soundscapes',
                'Soundscapes',
                soundscapesItems.length,
                (soundscapesItems.length > 0 ? renderRewardCards(soundscapesItems) : '<div class="inventory-section-empty">No Soundscapes rewards unlocked yet.</div>')
            )}
            ${renderInventorySection(
                'cosmetics',
                'Cosmetics',
                cosmeticsItems.length,
                (cosmeticsItems.length > 0 ? renderRewardCards(cosmeticsItems) : '<div class="inventory-section-empty">No cosmetic rewards unlocked yet.</div>')
            )}
            ${renderInventorySection(
                'keypacks',
                'Keyboard Sound Packs',
                keyboardPackItems.length,
                (keyboardPackItems.length > 0 ? renderPackCards(keyboardPackItems) : '<div class="inventory-section-empty">No keyboard sound packs unlocked yet.</div>')
            )}
        </div>
    `;
}

function previewSoundscapesReward() {
    if (rewardPreviewTimer) {
        clearTimeout(rewardPreviewTimer);
        rewardPreviewTimer = null;
    }

    stopThemeSoundtracks();
    const previewTrack = soundscapePreviewAudio;
    previewTrack.currentTime = 0;
    previewTrack.play()
        .then(() => {
            rewardSoundPreviewPlaying = true;
            renderSkillsModal();
        })
        .catch(() => {});

    rewardPreviewTimer = setTimeout(() => {
        stopSoundscapesPreview();
        renderSkillsModal();
    }, 20000);
}

function stopSoundscapesPreview() {
    if (rewardPreviewTimer) {
        clearTimeout(rewardPreviewTimer);
        rewardPreviewTimer = null;
    }
    const previewTrack = soundscapePreviewAudio;
    previewTrack.pause();
    previewTrack.currentTime = 0;
    rewardSoundPreviewPlaying = false;
    if (!musicMuted) {
        stopThemeSoundtracks();
        playThemeSoundtrack();
    }
}

function toggleSoundscapesPreview() {
    if (rewardSoundPreviewPlaying) {
        stopSoundscapesPreview();
        renderSkillsModal();
        return;
    }
    previewSoundscapesReward();
}

function updateScrollHeaderState() {
    document.body.classList.toggle('scrolled', (window.scrollY || 0) > 16);
}

// Looping is handled by `audio.loop = true`; avoid manual ended restarts to
// reduce unintended mid-track restarts in some browsers.

function addXP(amount) {
    const prev = getTotalXP();
    const newTotal = prev + amount;
    const prevLevel = getLevel(prev);
    const newLevel  = getLevel(newTotal);
    try { localStorage.setItem(XP_KEY, String(newTotal)); } catch (e) {}
    if (newLevel > prevLevel) {
        setSkillPoints(getSkillPoints() + (newLevel - prevLevel));
    }
    updateXPDisplay();
    return { total: newTotal, level: newLevel, levelUp: newLevel > prevLevel };
}

function updateXPDisplay() {
    const xp = getTotalXP();
    const badge = document.getElementById('level-badge');
    const fill  = document.getElementById('xp-bar-fill');
    const counter = document.getElementById('xp-counter');
    const streakIndicator = document.getElementById('xp-streak-indicator');
    const streakTooltip = document.getElementById('xp-streak-tooltip');
    const lvl = getLevel(xp);
    const xpInLevel = Math.round(getLevelProgress(xp) * XP_PER_LEVEL);
    const streakCount = Math.max(0, Number(getStreakData().streak || 0) || 0);
    const streakMultiplier = getXPMultiplier(streakCount);
    if (badge) { badge.textContent = `Lv ${lvl}`; badge.title = getLevelName(lvl); }
    if (counter) counter.textContent = `${xpInLevel} / ${XP_PER_LEVEL} XP`;
    if (fill)  fill.style.width  = (getLevelProgress(xp) * 100).toFixed(1) + '%';
    if (streakIndicator && streakTooltip) {
        if (streakMultiplier > 1) {
            const currentLabel = streakMultiplier.toFixed(1).replace('.0', '');
            const tomorrowStreak = streakCount + 1;
            const tomorrowMultiplier = getXPMultiplier(tomorrowStreak);
            const tomorrowLabel = tomorrowMultiplier.toFixed(1).replace('.0', '');
            streakTooltip.textContent = `${streakCount}-day streak active (${currentLabel}x XP)! Login tomorrow to reach ${tomorrowStreak} days (${tomorrowLabel}x XP)!`;
            streakIndicator.classList.add('show');
        } else {
            streakTooltip.textContent = '';
            streakIndicator.classList.remove('show');
        }
    }
    updateSkillDisplay();
    updateProfileToggleHoverInfo();
    const skillsModal = document.getElementById('skills-modal');
    if (skillsModal && skillsModal.classList.contains('show')) renderSkillsModal();
}

function jumpToChallengeFromProgress(challengeId) {
    const id = String(challengeId || '').trim();
    if (!id) return;
    if (id === 'community_goal') {
        closeResults();
        openCommunityHub();
        return;
    }
    if (CHALLENGES.some(c => c.id === id)) challengeSectionsOpen.daily = true;
    if (WEEKLY_CHALLENGES.some(c => c.id === id)) challengeSectionsOpen.weekly = true;
    closeResults();
    setMode('daily');
    requestAnimationFrame(() => {
        setTimeout(() => {
            const target = document.getElementById(`challenge-card-${id}`);
            if (!target) return;
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.remove('progress-focus');
            void target.offsetWidth;
            target.classList.add('progress-focus');
            setTimeout(() => target.classList.remove('progress-focus'), 1300);
        }, 60);
    });
}

const challengeSectionsOpen = {
    daily: false,
    weekly: false,
};

function isChallengeSectionOpen(section) {
    return !!challengeSectionsOpen[section];
}

function toggleChallengeSection(section) {
    if (!Object.prototype.hasOwnProperty.call(challengeSectionsOpen, section)) return;
    challengeSectionsOpen[section] = !challengeSectionsOpen[section];
    renderDailyChallenges();
}
window.toggleChallengeSection = toggleChallengeSection;

function renderDailyChallenges() {
    const panel = document.getElementById('challenge-panel');
    if (!panel) return;
    completePassiveDailyChallengesIfEligible();
    const dailyCompletions = getDailyCompletions();
    completePassiveWeeklyChallengesIfEligible();
    const weeklyCompletions = getWeeklyCompletions();
    const xp = getTotalXP();
    const level = getLevel(xp);
    const xpInLevel = Math.round(getLevelProgress(xp) * XP_PER_LEVEL);
    const streakCount = getStreakData().streak || 0;
    const streakMultiplier = getXPMultiplier(streakCount);
    const weeklyWords = getWeeklyWordTotal();
    const weeklyStreak = getWeeklyConsistentClimberStreak();
    const weeklyAboveAvgCount = getWeeklyAboveAverageCount();
    const avgBaseline = getAverageWpmBaseline();
    const rivalTarget = getCachedWeeklyRivalTarget();
    const weekStart = getWeekStartDate();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekRangeLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    const dailyOpen = isChallengeSectionOpen('daily');
    const weeklyOpen = isChallengeSectionOpen('weekly');

    refreshWeeklyRivalTarget();
    panel.innerHTML = `
        <div class="daily-header category-header daily">
            <span class="daily-title-wrap"><span class="daily-title-icon" aria-hidden="true">⚡</span><span class="daily-title">Daily Challenges</span><button type="button" class="challenge-section-toggle challenge-title-toggle" aria-label="${dailyOpen ? 'Collapse daily challenges' : 'Expand daily challenges'}" aria-expanded="${dailyOpen ? 'true' : 'false'}" onclick="toggleChallengeSection('daily')"><span class="chevron">▾</span></button></span>
            <span class="challenge-section-controls">
                <span class="daily-reset">${dailyCompletions.length}/${CHALLENGES.length} completed today &nbsp;·&nbsp; resets at midnight</span>
            </span>
        </div>
        ${dailyOpen ? `
            <div class="challenge-cards">
                ${CHALLENGES.map(c => {
                    const done = dailyCompletions.includes(c.id);
                    const isPassive = !!c.passive;
                    const progress = isPassive ? getDailyPassiveProgress(c.id) : null;
                    const progressText = isPassive
                        ? `${Math.min(progress.count, progress.target)} / ${progress.target} completed today`
                        : '';
                    return `<div id="challenge-card-${escapeHtml(c.id)}" data-challenge-id="${escapeHtml(c.id)}" class="challenge-card${done ? ' completed' : ''}">
                        <div class="challenge-card-left">
                            <div class="challenge-name">${escapeHtml(c.name)}
                                <span class="challenge-difficulty ${c.diffClass}">${c.difficulty}</span>
                                <span class="challenge-xp">+${c.xp} XP</span>
                            </div>
                            <div class="challenge-desc">${escapeHtml(c.desc)}</div>
                            ${isPassive ? `<div class="weekly-progress">${escapeHtml(progressText)}</div>` : ''}
                        </div>
                        <div class="challenge-card-right">
                            ${done
                                ? `<span class="challenge-done-badge">&#10003; Done</span>`
                                : isPassive
                                    ? `<span class="challenge-locked-badge">In Progress</span>`
                                    : `<button class="challenge-start-btn" onclick="startChallenge('${c.id}')">Start</button>`}
                        </div>
                    </div>`;
                }).join('')}
            </div>
            <div class="daily-xp-row">
                <span class="daily-xp-level">Lv ${level} <span class="daily-level-name">${getLevelName(level)}</span></span>
                <div class="daily-xp-bar-wrap">
                    <div class="daily-xp-bar-fill" style="width:${(getLevelProgress(xp)*100).toFixed(1)}%"></div>
                </div>
                <span class="daily-xp-label">${xpInLevel} / ${XP_PER_LEVEL} XP</span>
            </div>
            ${streakCount >= 1 ? `<div class="daily-streak-row">
                <span class="daily-streak-badge">${streakCount >= 3 ? '🔥' : '⚡'} ${streakCount}-day streak</span>
                ${streakMultiplier > 1 ? `<span class="daily-multiplier">${streakMultiplier.toFixed(1).replace('.0', '')}x XP active${streakMultiplier >= 2 ? ' (max)' : ''}</span>` : ''}
                <span class="skill-info-wrap" tabindex="0" aria-label="How streak XP works">
                    <span class="skill-info-icon" aria-hidden="true">i</span>
                    <span class="skill-info-tooltip">Gain a 0.5x increase in your XP gain with each consecutive day you log on! This stacks to a maximum of 2x XP.</span>
                </span>
            </div>` : ''}
        ` : ''}

        <div class="weekly-section">
            <div class="daily-header category-header weekly">
                <span class="daily-title-wrap"><span class="daily-title-icon" aria-hidden="true">📅</span><span class="daily-title">Weekly Challenges</span><button type="button" class="challenge-section-toggle challenge-title-toggle" aria-label="${weeklyOpen ? 'Collapse weekly challenges' : 'Expand weekly challenges'}" aria-expanded="${weeklyOpen ? 'true' : 'false'}" onclick="toggleChallengeSection('weekly')"><span class="chevron">▾</span></button></span>
                <span class="challenge-section-controls">
                    <span class="weekly-reset">${weeklyCompletions.length}/${WEEKLY_CHALLENGES.length} completed &nbsp;·&nbsp; ${escapeHtml(weekRangeLabel)}</span>
                </span>
            </div>
            ${weeklyOpen ? `
                <div class="challenge-cards">
                    ${WEEKLY_CHALLENGES.map(c => {
                        const done = weeklyCompletions.includes(c.id);
                        const progressText = c.id === 'marathon'
                            ? `${Math.min(weeklyWords, 10000)} / 10,000 words this week`
                            : c.id === 'consistent_climber'
                                ? `${Math.min(weeklyStreak, 10)} / 10 consecutive tests near PB`
                                : c.id === 'above_average'
                                    ? `${Math.min(weeklyAboveAvgCount, 5)} / 5 tests above ${Math.round(avgBaseline * 1.05 || 0)} WPM`
                                : (rivalTarget ? `Target to beat: ${Math.round(rivalTarget)} WPM` : 'Target loading...');
                        const canStart = c.id !== 'rival_week' || !!rivalTarget;
                        return `<div id="challenge-card-${escapeHtml(c.id)}" data-challenge-id="${escapeHtml(c.id)}" class="challenge-card${done ? ' completed' : ''}">
                            <div class="challenge-card-left">
                                <div class="challenge-name">${escapeHtml(c.name)}
                                    <span class="challenge-difficulty ${c.diffClass}">${c.difficulty}</span>
                                    <span class="challenge-xp">+${c.xp} XP</span>
                                </div>
                                <div class="challenge-desc">${escapeHtml(c.desc)}</div>
                                <div class="weekly-progress">${escapeHtml(progressText)}</div>
                            </div>
                            <div class="challenge-card-right">
                                ${done
                                    ? `<span class="challenge-done-badge">&#10003; Done</span>`
                                    : (c.id === 'marathon' || c.id === 'consistent_climber' || c.id === 'above_average')
                                        ? `<span class="challenge-locked-badge">Locked</span>`
                                        : `<button class="challenge-start-btn" ${canStart ? '' : 'disabled'} onclick="startChallenge('${c.id}')">${canStart ? 'Start' : 'Loading'}</button>`}
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            ` : ''}
            <div class="community-goal-section" id="community-goal-section">
                <div class="daily-header category-header community">
                    <span class="daily-title-wrap"><span class="daily-title-icon" aria-hidden="true">🛸</span><span class="daily-title">Community Goal</span><button type="button" class="challenge-section-toggle challenge-title-toggle challenge-title-openhub" aria-label="Open community hub" onclick="openCommunityHub()"><span>Open Hub</span></button></span>
                    <span class="challenge-section-controls">
                        <span class="weekly-reset">Work together as a community to defend humanity!</span>
                    </span>
                </div>
            </div>
        </div>`;
    updateProfileToggleHoverInfo();
}

function startChallenge(id) {
    activeChallengeId = id;
    document.getElementById('challenge-panel').style.display = 'none';
    document.getElementById('typing-area').style.display = '';
    // Map challenge to underlying mode
    if (id === 'sprint')       currentMode = 'words30';
    else if (id === 'nobackspace') currentMode = 'words';
    else if (id === 'marathon') currentMode = 'words';
    else if (id === 'consistent_climber') currentMode = 'quotes';
    else if (id === 'rival_week') currentMode = 'words30';
    else if (id === 'above_average') currentMode = 'words';
    else                       currentMode = 'quotes';
    updateChallengeHint();
    newTest();
}

function abandonChallenge() {
    activeChallengeId = null;
    setMode('daily');
}

function showChallengeFail() {
    isComplete = true;
    const overlay = document.getElementById('challenge-fail-overlay');
    if (overlay) overlay.style.display = 'flex';
}

function retryChallengeAfterFail() {
    document.getElementById('challenge-fail-overlay').style.display = 'none';
    const id = activeChallengeId; // still set
    startChallenge(id);
}

function dismissChallengeFail() {
    document.getElementById('challenge-fail-overlay').style.display = 'none';
    activeChallengeId = null;
    setMode('daily');
}

function updateChallengeHint() {
    const hint = document.getElementById('hint');
    if (!hint) return;
    if (activeChallengeId === 'nobackspace')
        hint.textContent = `Backspace is disabled \u00b7 Tab to restart \u00b7 ${NO_BACKSPACE_MIN_ACC}% accuracy required`;
    else if (activeChallengeId === 'perfectionist')
        hint.textContent = 'Any mistake fails immediately \u00b7 Tab to restart';
    else if (activeChallengeId === 'sprint')
        hint.textContent = '30 seconds \u00b7 100 WPM \u00b7 Tab to restart';
    else if (activeChallengeId === 'marathon')
        hint.textContent = 'Weekly challenge \u00b7 keep typing to build toward 10,000 words \u00b7 Tab to restart';
    else if (activeChallengeId === 'consistent_climber')
        hint.textContent = 'Weekly challenge \u00b7 stay within 5% of your PB for 10 tests \u00b7 Tab to restart';
    else if (activeChallengeId === 'rival_week')
        hint.textContent = 'Weekly challenge \u00b7 beat last week\'s community median \u00b7 Tab to restart';
    else if (activeChallengeId === 'above_average')
        hint.textContent = 'Weekly challenge \u00b7 hit 5% above your average WPM in 5 tests \u00b7 Tab to restart';
    else
        hint.textContent = 'Click the text above to begin \u00b7 Tab to restart \u00b7 Backspace to correct';
}

function setupSpaceDecoField() {
    const starsHost = document.getElementById('cin-stars');
    const dustLeft = document.getElementById('dust-left');
    const dustRight = document.getElementById('dust-right');
    if (!starsHost || !dustLeft || !dustRight) return;
    if (starsHost.dataset.ready === '1' && dustLeft.dataset.ready === '1' && dustRight.dataset.ready === '1') return;

    starsHost.innerHTML = '';
    dustLeft.innerHTML = '';
    dustRight.innerHTML = '';

    const starColors = ['#ffffff', '#e0f2fe', '#bae6fd', '#67e8f9'];
    const starCount = 200;
    for (let i = 0; i < starCount; i++) {
        const star = document.createElement('span');
        star.className = 'space-star';
        star.style.setProperty('--x', `${(Math.random() * 100).toFixed(2)}%`);
        star.style.setProperty('--y', `${(Math.random() * 100).toFixed(2)}%`);
        star.style.setProperty('--size', `${(1 + Math.random()).toFixed(2)}px`);
        star.style.setProperty('--color', starColors[Math.floor(Math.random() * starColors.length)]);
        star.style.setProperty('--twinkle-dur', `${(4 + Math.random() * 8).toFixed(2)}s`);
        star.style.setProperty('--twinkle-delay', `${(-Math.random() * 12).toFixed(2)}s`);
        starsHost.appendChild(star);
    }
    starsHost.dataset.ready = '1';

    const makeDust = (host, count) => {
        for (let i = 0; i < count; i++) {
            const dot = document.createElement('span');
            dot.style.setProperty('--x', `${(8 + Math.random() * 84).toFixed(2)}%`);
            dot.style.setProperty('--y', `${(8 + Math.random() * 84).toFixed(2)}%`);
            dot.style.setProperty('--s', `${(1 + Math.random() * 2).toFixed(2)}px`);
            dot.style.setProperty('--t', `${(3 + Math.random() * 7).toFixed(2)}s`);
            dot.style.setProperty('--d', `${(-Math.random() * 12).toFixed(2)}s`);
            dot.style.setProperty('--c', Math.random() < 0.25 ? '#ffffff' : '#bff4ff');
            host.appendChild(dot);
        }
        host.dataset.ready = '1';
    };
    makeDust(dustLeft, 42);
    makeDust(dustRight, 42);
}

function setupAetherShards() {
    const deco = document.getElementById('space-deco');
    if (!deco || deco.dataset.shardsReady === '1') return;
    const shardCount = 12;
    for (let i = 0; i < shardCount; i++) {
        const shard = document.createElement('span');
        shard.className = 'space-shard';
        shard.style.setProperty('--x', `${(Math.random() * 100).toFixed(2)}%`);
        shard.style.setProperty('--size', `${(4 + Math.random() * 4).toFixed(2)}px`);
        shard.style.setProperty('--dur', `${(18 + Math.random() * 28).toFixed(2)}s`);
        shard.style.setProperty('--delay', `${(-Math.random() * 24).toFixed(2)}s`);
        shard.style.setProperty('--drift', `${((Math.random() * 30) - 15).toFixed(1)}px`);
        deco.appendChild(shard);
    }
    deco.dataset.shardsReady = '1';
}

function bindAuthInputEvents() {
    const loginUserInput = document.getElementById('auth-username');
    const loginPassInput = document.getElementById('auth-password');
    const signupUserInput = document.getElementById('signup-username');
    const signupPassInput = document.getElementById('signup-password');
    const signupConfirmInput = document.getElementById('signup-password-confirm');
    const signupCaptchaInput = document.getElementById('signup-captcha-input');
    const accountUsernameInput = document.getElementById('account-new-username');
    const accountCurrentPasswordInput = document.getElementById('account-current-password');
    const accountNewPasswordInput = document.getElementById('account-new-password');
    const accountNewPasswordConfirmInput = document.getElementById('account-new-password-confirm');
    const deleteAccountUsernameInput = document.getElementById('delete-account-username-confirm');
    const onEnterLogin = (e) => { if (e.key === 'Enter') loginUser(); };
    const onEnterSignup = (e) => { if (e.key === 'Enter') signupUserFromModal(); };
    const onEnterAccountUsername = (e) => { if (e.key === 'Enter') updateAccountUsername(); };
    const onEnterAccountPassword = (e) => { if (e.key === 'Enter') updateAccountPassword(); };
    const onEnterDeleteAccount = (e) => { if (e.key === 'Enter') deleteAccountConfirmed(); };
    if (loginUserInput) loginUserInput.addEventListener('keydown', onEnterLogin);
    if (loginPassInput) loginPassInput.addEventListener('keydown', onEnterLogin);
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.addEventListener('click', loginUser);
    const openSignupBtn = document.getElementById('open-signup-btn');
    if (openSignupBtn) openSignupBtn.addEventListener('click', openSignupModal);
    if (signupUserInput) signupUserInput.addEventListener('keydown', onEnterSignup);
    if (signupPassInput) signupPassInput.addEventListener('keydown', onEnterSignup);
    if (signupConfirmInput) signupConfirmInput.addEventListener('keydown', onEnterSignup);
    if (signupCaptchaInput) signupCaptchaInput.addEventListener('keydown', onEnterSignup);
    if (accountUsernameInput) accountUsernameInput.addEventListener('keydown', onEnterAccountUsername);
    if (accountCurrentPasswordInput) accountCurrentPasswordInput.addEventListener('keydown', onEnterAccountPassword);
    if (accountNewPasswordInput) accountNewPasswordInput.addEventListener('keydown', onEnterAccountPassword);
    if (accountNewPasswordConfirmInput) accountNewPasswordConfirmInput.addEventListener('keydown', onEnterAccountPassword);
    if (deleteAccountUsernameInput) deleteAccountUsernameInput.addEventListener('keydown', onEnterDeleteAccount);
}
