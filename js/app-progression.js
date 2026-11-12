// ── Progression: dates, quests, streak, XP, levels, crystals, badges, shop, goals strip ──
// Storage keys written here (all prefixed sampire-): xp, streak, daily, daily-v2, weekly,
// weekly-words, daily-stats, lifetime-counters, lifetime-challenges-completed, badges, skills,
// skill-points (cache), crystal-ledger, reward-settings, title, goals-strip-open,
// weekly-recap-seen, community-weekly-goal, community-weekly-contrib, ghost-index.

function formatDateKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getTodayStr() { return formatDateKey(new Date()); }

function getDateKeyDaysAgo(days) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return formatDateKey(d);
}

function getYesterdayStr() { return getDateKeyDaysAgo(1); }

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
    return getWeekStartDateUtc(baseDate).toISOString().slice(0, 10);
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

function getDailyCompletions(dayKey = getTodayStr()) {
    const days = migrateLegacyDailyRecord(getDailyStoreV2Days());
    return normalizeCompletionList(days[dayKey]);
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
    // Keep the store small: only the last 14 days matter.
    const keep = Object.keys(days).sort().slice(-14);
    const pruned = {};
    for (const k of keep) pruned[k] = days[k];
    saveDailyStoreV2Days(pruned);
    if (!alreadyCompleted) incrementLifetimeChallengesCompleted(1);
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
    const completions = [...new Set([...existing, id])];
    try { localStorage.setItem(WEEKLY_KEY, JSON.stringify({ week: state.week, completions })); } catch (e) {}
    if (!alreadyCompleted) incrementLifetimeChallengesCompleted(1);
}

// ── Team goal (community) state: kept as before, seeded from the rolling weekly counter ──
function getCommunityWeeklyGoalState() {
    const currentWeek = getWeekKeyUtc();
    try {
        const raw = JSON.parse(localStorage.getItem(COMMUNITY_WEEKLY_GOAL_KEY) || '{}');
        if (raw.week === currentWeek && Number.isFinite(raw.words) && raw.words >= 0) {
            return { week: currentWeek, words: Math.floor(raw.words) };
        }
    } catch (e) {}
    const seeded = { week: currentWeek, words: 0 };
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

// ── History helpers (the 50-entry history is only used for charts and fallbacks) ──
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
    const log = getDayLog(getTodayStr());
    return Math.max(0, Number(log.modes && log.modes[m]) || 0);
}

// ── Day log: one small record per day (last 14 days) ─────────────────────────
const DAY_LOG_KEY = 'sampire-daily-stats';

function emptyDayLog() {
    return { runs: 0, words: 0, sumWpm: 0, bestWpm: 0, bestAcc: 0, runs96: 0, perfect: 0, modes: {} };
}

function loadDayLogStore() {
    const raw = loadLocalJson(DAY_LOG_KEY, null);
    const days = raw && typeof raw === 'object' && raw.days && typeof raw.days === 'object' ? raw.days : {};
    return { days };
}

function saveDayLogStore(store) {
    const keep = Object.keys(store.days).sort().slice(-14);
    const days = {};
    for (const k of keep) days[k] = store.days[k];
    saveLocalJson(DAY_LOG_KEY, { days });
}

function getDayLog(dayKey) {
    const store = loadDayLogStore();
    const log = store.days[dayKey];
    return log && typeof log === 'object' ? { ...emptyDayLog(), ...log, modes: { ...(log.modes || {}) } } : emptyDayLog();
}

function getRecentDayLogs(days, { includeToday = false } = {}) {
    const store = loadDayLogStore();
    const out = [];
    for (let i = includeToday ? 0 : 1; i <= days; i++) {
        const key = getDateKeyDaysAgo(i);
        if (store.days[key]) out.push({ key, ...emptyDayLog(), ...store.days[key] });
    }
    return out;
}

// Average WPM over the last 7 days, not counting today. Falls back to older day logs, then history.
function getSevenDayAverageWpm() {
    const recent = getRecentDayLogs(7);
    const sum = recent.reduce((a, d) => a + (Number(d.sumWpm) || 0), 0);
    const runs = recent.reduce((a, d) => a + (Number(d.runs) || 0), 0);
    if (runs > 0) return sum / runs;
    const older = getRecentDayLogs(14);
    const sum2 = older.reduce((a, d) => a + (Number(d.sumWpm) || 0), 0);
    const runs2 = older.reduce((a, d) => a + (Number(d.runs) || 0), 0);
    if (runs2 > 0) return sum2 / runs2;
    const hist = loadHistory().filter(h => (Number(h.wpm) || 0) > 0);
    if (hist.length > 0) return hist.reduce((a, h) => a + Number(h.wpm), 0) / hist.length;
    return 0;
}

function getYesterdayBestWpm() {
    return Math.max(0, Number(getDayLog(getYesterdayStr()).bestWpm) || 0);
}

function getAllTimeBestWpm() {
    return Math.max(0, Number(getLifetimeStatsSummary().bestWpm) || 0);
}

// ── Weekly rolling counter: sampire-weekly-words = { week, words, runs, bestWpm, runsNearPb, aboveAvg, ... } ──
const WEEKLY_WORDS_KEY = 'sampire-weekly-words';

function emptyWeeklyCounter(week = getWeekKey()) {
    return { week, words: 0, runs: 0, bestWpm: 0, sumWpm: 0, runsNearPb: 0, aboveAvg: 0, runs95: 0, daysPlayed: [], questsDone: 0, bestByMode: {} };
}

function loadWeeklyStore() {
    const raw = loadLocalJson(WEEKLY_WORDS_KEY, null);
    const current = raw && typeof raw === 'object' && raw.week ? { ...emptyWeeklyCounter(raw.week), ...raw } : emptyWeeklyCounter();
    const history = Array.isArray(raw && raw.history) ? raw.history : [];
    delete current.history;
    if (!Array.isArray(current.daysPlayed)) current.daysPlayed = [];
    if (!current.bestByMode || typeof current.bestByMode !== 'object') current.bestByMode = {};
    return { current, history };
}

function saveWeeklyStore(store) {
    saveLocalJson(WEEKLY_WORDS_KEY, { ...store.current, history: store.history.slice(-12) });
}

function summarizeWeek(counter) {
    return {
        week: counter.week,
        words: counter.words,
        runs: counter.runs,
        bestWpm: counter.bestWpm,
        avgWpm: counter.runs > 0 ? counter.sumWpm / counter.runs : 0,
        days: Array.isArray(counter.daysPlayed) ? counter.daysPlayed.length : 0,
        questsDone: counter.questsDone || 0,
        runs95: counter.runs95 || 0,
    };
}

// Current week's counter (read-only; a stale week reads as empty until the next counted run archives it).
function getWeeklyCounter() {
    const store = loadWeeklyStore();
    return store.current.week === getWeekKey() ? store.current : emptyWeeklyCounter();
}

function getWeekHistory() {
    const store = loadWeeklyStore();
    const history = store.history.slice();
    // A finished week that has not been archived yet still counts as history.
    if (store.current.week !== getWeekKey() && store.current.runs > 0) history.push(summarizeWeek(store.current));
    return history;
}

function getLastWeekSummary() {
    const key = getWeekKey(new Date(getWeekStartDate().getTime() - 7 * 86400000));
    return getWeekHistory().find(w => w.week === key) || null;
}

function getWeeklyWordTotal() {
    return Math.max(0, Number(getWeeklyCounter().words) || 0);
}

// Baseline for "Above average": previous weeks only, at least 10 runs, else 0 (quest stays locked).
function getAverageWpmBaseline() {
    const history = getWeekHistory();
    let runs = 0;
    let sum = 0;
    for (const w of history) {
        runs += Number(w.runs) || 0;
        sum += (Number(w.avgWpm) || 0) * (Number(w.runs) || 0);
    }
    if (runs < 10) return 0;
    return sum / runs;
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

let pendingWeeklyRecap = null;
let pendingTeamBadge = false;

// Record one counted run in the day log and the weekly counter. Returns facts about the update.
function recordCountedRun(run) {
    const today = getTodayStr();
    const wpm = Math.max(0, Math.round(Number(run.wpm) || 0));
    const accuracy = Math.max(0, Math.min(100, Number(run.accuracy) || 0));
    const words = Math.max(0, Math.floor(Number(run.typedWords) || 0));
    const mode = String(run.mode || 'words');

    const dayStore = loadDayLogStore();
    const log = { ...emptyDayLog(), ...(dayStore.days[today] || {}) };
    log.modes = { ...(log.modes || {}) };
    log.runs += 1;
    log.words += words;
    log.sumWpm += wpm;
    log.bestWpm = Math.max(log.bestWpm, wpm);
    log.bestAcc = Math.max(log.bestAcc, accuracy);
    if (accuracy >= 96) log.runs96 += 1;
    if (accuracy >= 100) log.perfect += 1;
    log.modes[mode] = (Number(log.modes[mode]) || 0) + 1;
    dayStore.days[today] = log;
    saveDayLogStore(dayStore);

    const store = loadWeeklyStore();
    const currentWeek = getWeekKey();
    let archived = null;
    if (store.current.week !== currentWeek) {
        if (store.current.runs > 0) {
            archived = summarizeWeek(store.current);
            // Team goal for the week that just ended: read the raw state before anything resets it.
            try {
                const rawGoal = JSON.parse(localStorage.getItem(COMMUNITY_WEEKLY_GOAL_KEY) || '{}');
                archived.teamGoalReached = !!(rawGoal && rawGoal.week && rawGoal.week !== getWeekKeyUtc() && Number(rawGoal.words) >= COMMUNITY_FLEET_TOTAL_HEALTH);
            } catch (e) { archived.teamGoalReached = false; }
            if (archived.teamGoalReached && archived.words >= 1000) pendingTeamBadge = true;
            store.history = store.history.filter(w => w.week !== archived.week).concat([archived]);
        }
        store.current = emptyWeeklyCounter(currentWeek);
    }
    const w = store.current;
    const prevWeeklyBestForMode = Number(w.bestByMode[mode]) || 0;
    const baseline = getAverageWpmBaseline();
    const allTimeBest = Math.max(getAllTimeBestWpm(), wpm);
    w.words += words;
    w.runs += 1;
    w.sumWpm += wpm;
    w.bestWpm = Math.max(w.bestWpm, wpm);
    if (accuracy >= 95) w.runs95 += 1;
    if (baseline > 0 && wpm >= baseline * 1.05) w.aboveAvg += 1;
    if (allTimeBest > 0 && wpm >= allTimeBest * 0.9) w.runsNearPb += 1;
    if (!w.daysPlayed.includes(today)) w.daysPlayed.push(today);
    w.bestByMode[mode] = Math.max(prevWeeklyBestForMode, wpm);
    saveWeeklyStore(store);

    const counters = getLifetimeCounters();
    if (accuracy >= 100) counters.perfectRuns += 1;
    counters.countedRuns += 1;
    saveLifetimeCounters(counters);

    if (archived) {
        const seen = localStorage.getItem('sampire-weekly-recap-seen');
        if (seen !== archived.week) {
            const before = store.history.filter(x => x.week < archived.week).sort((a, b) => a.week < b.week ? 1 : -1)[0] || null;
            pendingWeeklyRecap = { ...archived, previous: before, streak: getEffectiveStreak() };
            try { localStorage.setItem('sampire-weekly-recap-seen', archived.week); } catch (e) {}
        }
    }
    return { isWeeklyModeBest: wpm > prevWeeklyBestForMode, dayLog: log, weekly: w };
}

const LIFETIME_COUNTERS_KEY = 'sampire-lifetime-counters';
function getLifetimeCounters() {
    const raw = loadLocalJson(LIFETIME_COUNTERS_KEY, {});
    return {
        daysPlayed: Math.max(0, Math.floor(Number(raw && raw.daysPlayed) || 0)),
        perfectRuns: Math.max(0, Math.floor(Number(raw && raw.perfectRuns) || 0)),
        countedRuns: Math.max(0, Math.floor(Number(raw && raw.countedRuns) || 0)),
    };
}
function saveLifetimeCounters(c) { saveLocalJson(LIFETIME_COUNTERS_KEY, c); }

// ── Streak: a "played today" streak. Any counted run keeps it alive. ──────────
const STREAK_KEY = 'sampire-streak';
const BADGES_KEY = 'sampire-badges';
const MAX_STREAK_FREEZES = 2;
// Founder is closed to new signups: only accounts created before this cutoff qualify.
const FOUNDER_SIGNUP_CUTOFF_MS = Date.UTC(2026, 10, 7); // 2026-11-07T00:00:00Z

function getStreakData() {
    const fallback = { lastPlayDate: '', streak: 0, freezes: 0 };
    try {
        const raw = JSON.parse(localStorage.getItem(STREAK_KEY) || 'null');
        if (!raw || typeof raw !== 'object') return fallback;
        return {
            lastPlayDate: String(raw.lastPlayDate || ''),
            streak: Math.max(0, Math.floor(Number(raw.streak) || 0)),
            freezes: Math.max(0, Math.min(MAX_STREAK_FREEZES, Math.floor(Number(raw.freezes) || 0))),
        };
    } catch (e) { return fallback; }
}

function saveStreakData(data) {
    try { localStorage.setItem(STREAK_KEY, JSON.stringify(data)); } catch (e) {}
}

// The streak that is still alive: last played today or yesterday, or two days ago with a freeze in hand.
function getEffectiveStreak() {
    const data = getStreakData();
    if (!data.streak) return 0;
    if (data.lastPlayDate === getTodayStr() || data.lastPlayDate === getYesterdayStr()) return data.streak;
    if (data.lastPlayDate === getDateKeyDaysAgo(2) && data.freezes > 0) return data.streak;
    return 0;
}

function hasPlayedToday() { return getStreakData().lastPlayDate === getTodayStr(); }

// Called once per counted run. Returns { streak, isNewDay, freezeUsed }.
function updateStreak() {
    const today = getTodayStr();
    const data = getStreakData();
    let streak = data.streak || 0;
    let freezes = data.freezes || 0;
    let freezeUsed = false;
    let isNewDay = false;
    if (data.lastPlayDate === today) {
        // already counted today
    } else if (data.lastPlayDate === getYesterdayStr()) {
        streak += 1; isNewDay = true;
    } else if (data.lastPlayDate === getDateKeyDaysAgo(2) && freezes > 0) {
        freezes -= 1; streak += 1; isNewDay = true; freezeUsed = true;
    } else {
        streak = 1; isNewDay = true;
    }
    saveStreakData({ lastPlayDate: today, streak, freezes });
    if (isNewDay) {
        const counters = getLifetimeCounters();
        counters.daysPlayed = Math.max(counters.daysPlayed + 1, streak);
        saveLifetimeCounters(counters);
    }
    return { streak, isNewDay, freezeUsed };
}

function getStreakFreezeCount() { return getStreakData().freezes || 0; }

// Day 1: 1x, day 2: 1.25x, day 3: 1.5x, day 4: 1.75x, day 5 and up: 2x.
function getXPMultiplier(streakOverride = null) {
    const streak = Math.max(0, Number(streakOverride != null ? streakOverride : getEffectiveStreak()) || 0);
    if (streak <= 1) return 1;
    return Math.min(2, 1 + 0.25 * (streak - 1));
}

function formatMultiplier(m) { return `${Number(m).toFixed(2).replace(/\.?0+$/, '')}x`; }

// One line for the goals strip and the results card.
function getStreakLine() {
    const streak = getEffectiveStreak();
    const playedToday = hasPlayedToday();
    if (streak <= 0) return 'No streak yet. Finish one counted run today to start a streak.';
    if (!playedToday) return `Play one counted run today to keep your ${streak}-day streak.`;
    const tomorrow = getXPMultiplier(streak + 1);
    if (tomorrow > getXPMultiplier(streak)) return `Day ${streak} · come back tomorrow for ${formatMultiplier(tomorrow)} XP`;
    return `Day ${streak} · ${formatMultiplier(getXPMultiplier(streak))} XP (max)`;
}

// ── XP and levels ────────────────────────────────────────────────────────────
const MAX_LEVEL = 100;
function getTotalXP()  { return Math.max(0, parseInt(localStorage.getItem(XP_KEY) || '0', 10) || 0); }
function getLevel(xp)  { return Math.min(MAX_LEVEL, Math.floor(xp / XP_PER_LEVEL) + 1); }
function getLevelProgress(xp) {
    if (getLevel(xp) >= MAX_LEVEL) return 1;
    return (xp % XP_PER_LEVEL) / XP_PER_LEVEL;
}
function getXpInLevel(xp) { return getLevel(xp) >= MAX_LEVEL ? XP_PER_LEVEL : Math.round(getLevelProgress(xp) * XP_PER_LEVEL); }

const LEVEL_NAMES = [
    { min: 1, name: 'Beginner' },
    { min: 10, name: 'Learner' },
    { min: 20, name: 'Typist' },
    { min: 30, name: 'Quick typist' },
    { min: 40, name: 'Fast typist' },
    { min: 50, name: 'Expert' },
    { min: 60, name: 'Master' },
    { min: 70, name: 'Grandmaster' },
    { min: 80, name: 'Legend' },
    { min: 90, name: 'Champion' },
    { min: 100, name: 'Galactic champion' },
];

function getLevelName(level) {
    const lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(level) || 1)));
    let name = LEVEL_NAMES[0].name;
    for (const tier of LEVEL_NAMES) if (lv >= tier.min) name = tier.name;
    return name;
}

// What each level unlocks. Titles are free; shop items become buyable at that level.
const LEVEL_UNLOCKS = [
    { level: 3,  kind: 'shop',  id: 'soundscapes',   label: 'Second music theme (shop)' },
    { level: 5,  kind: 'title', id: 'Rookie',        label: 'Title: Rookie' },
    { level: 5,  kind: 'shop',  id: 'name_sky',      label: 'Sky blue name on the leaderboard (shop)' },
    { level: 10, kind: 'title', id: 'Regular',       label: 'Title: Regular' },
    { level: 10, kind: 'shop',  id: 'caret_orange',  label: 'Orange cursor (shop)' },
    { level: 15, kind: 'title', id: 'Steady hand',   label: 'Title: Steady hand' },
    { level: 15, kind: 'shop',  id: 'trail_green',   label: 'Green trail (shop)' },
    { level: 20, kind: 'title', id: 'Speedster',     label: 'Title: Speedster' },
    { level: 20, kind: 'shop',  id: 'name_purple',   label: 'Purple name on the leaderboard (shop)' },
    { level: 25, kind: 'title', id: 'Sharpshooter',  label: 'Title: Sharpshooter' },
    { level: 25, kind: 'shop',  id: 'caret_pink',    label: 'Pink cursor (shop)' },
    { level: 30, kind: 'title', id: 'Veteran',       label: 'Title: Veteran' },
    { level: 30, kind: 'shop',  id: 'trail_gold',    label: 'Gold trail (shop)' },
    { level: 35, kind: 'title', id: 'Ace',           label: 'Title: Ace' },
    { level: 35, kind: 'shop',  id: 'name_gold',     label: 'Gold name on the leaderboard (shop)' },
    { level: 40, kind: 'title', id: 'Elite',         label: 'Title: Elite' },
    { level: 40, kind: 'shop',  id: 'caret_rainbow', label: 'Rainbow cursor (shop)' },
];

function getUnlocksAtLevel(level) {
    return LEVEL_UNLOCKS.filter(u => u.level === level);
}

function getUnlockedTitles(level = getLevel(getTotalXP())) {
    return LEVEL_UNLOCKS.filter(u => u.kind === 'title' && u.level <= level).map(u => u.id);
}

function getNextUnlock(level = getLevel(getTotalXP())) {
    return LEVEL_UNLOCKS.find(u => u.level > level) || null;
}

// Adds XP and returns { total, level, levelUp, prevLevel }. Crystals are derived from levels, so nothing else to do here.
function addXP(amount) {
    const add = Math.max(0, Math.round(Number(amount) || 0));
    const prev = getTotalXP();
    const newTotal = Math.min(prev + add, MAX_LEVEL * XP_PER_LEVEL);
    const prevLevel = getLevel(prev);
    const newLevel  = getLevel(newTotal);
    try { localStorage.setItem(XP_KEY, String(newTotal)); } catch (e) {}
    updateXPDisplay();
    return { total: newTotal, level: newLevel, prevLevel, levelUp: newLevel > prevLevel, added: add };
}

// XP for one counted run: 10 base, plus 1 per 5 WPM, times accuracy, plus 15 on an all-time best
// and 5 on a mode best, times the streak multiplier, rounded.
function computeRunXP({ wpm = 0, accuracy = 0, isPB = false, isModePB = false, multiplier = 1 } = {}) {
    const base = (10 + Math.floor(Math.max(0, wpm) / 5)) * (Math.max(0, Math.min(100, accuracy)) / 100);
    const bonus = (isPB ? 15 : 0) + (isModePB ? 5 : 0);
    return Math.max(0, Math.round((base + bonus) * Math.max(1, multiplier)));
}

// ── Crystals: balance = levels earned + 1 per 250 counted words + bonus - spent ──
const CRYSTAL_LEDGER_KEY = 'sampire-crystal-ledger';
const CRYSTALS_PER_WORDS = 250;

function getCrystalLedger() {
    const raw = loadLocalJson(CRYSTAL_LEDGER_KEY, null);
    if (!raw || typeof raw !== 'object') return null;
    return { spent: Math.max(0, Math.floor(Number(raw.spent) || 0)), bonus: Math.max(0, Math.floor(Number(raw.bonus) || 0)) };
}

function saveCrystalLedger(ledger) { saveLocalJson(CRYSTAL_LEDGER_KEY, ledger); }

function getCrystalsEarnedGross() {
    const levels = Math.max(0, getLevel(getTotalXP()) - 1);
    const words = Math.max(0, Number(getLifetimeStatsSummary().words) || 0);
    return { levels, fromWords: Math.floor(words / CRYSTALS_PER_WORDS) };
}

function ensureCrystalLedger() {
    let ledger = getCrystalLedger();
    if (ledger) return ledger;
    // First run on this scheme: keep the balance the player already had.
    const gross = getCrystalsEarnedGross();
    const cached = Math.max(0, parseInt(localStorage.getItem(SKILL_POINTS_KEY) || '0', 10) || 0);
    const total = gross.levels + gross.fromWords;
    ledger = total >= cached ? { spent: total - cached, bonus: 0 } : { spent: 0, bonus: cached - total };
    saveCrystalLedger(ledger);
    return ledger;
}

function getSkillPoints() {
    const ledger = ensureCrystalLedger();
    const gross = getCrystalsEarnedGross();
    const balance = Math.max(0, gross.levels + gross.fromWords + ledger.bonus - ledger.spent);
    try { localStorage.setItem(SKILL_POINTS_KEY, String(balance)); } catch (e) {}
    return balance;
}

// Compatibility for code that sets the wallet directly (story mode): the difference goes into the ledger.
function setSkillPoints(points) {
    const target = Math.max(0, Math.floor(Number(points) || 0));
    const current = getSkillPoints();
    const ledger = ensureCrystalLedger();
    if (target < current) ledger.spent += current - target;
    else if (target > current) ledger.bonus += target - current;
    saveCrystalLedger(ledger);
    try { localStorage.setItem(SKILL_POINTS_KEY, String(target)); } catch (e) {}
}

function spendCrystals(amount) {
    const cost = Math.max(0, Math.floor(Number(amount) || 0));
    if (getSkillPoints() < cost) return false;
    const ledger = ensureCrystalLedger();
    ledger.spent += cost;
    saveCrystalLedger(ledger);
    getSkillPoints();
    return true;
}

function grantCrystals(amount) {
    const add = Math.max(0, Math.floor(Number(amount) || 0));
    if (!add) return;
    const ledger = ensureCrystalLedger();
    ledger.bonus += add;
    saveCrystalLedger(ledger);
    getSkillPoints();
}

// ── Quests ───────────────────────────────────────────────────────────────────
// Daily pool. Three are picked per day (one from each group) so the mix changes day to day.
const DAILY_QUEST_POOL = [
    { id: 'runs_5', group: 'volume', name: 'Five runs', xp: 50, mode: 'words', passive: true, target: 5,
      desc: () => 'Finish 5 counted runs today.',
      progress: (d) => ({ value: d.runs, target: 5 }) },
    { id: 'daily_quotes_5', group: 'volume', name: 'Three quotes', xp: 50, mode: 'quotes', passive: true, target: 3,
      desc: () => 'Finish 3 Quotes runs today.',
      progress: (d) => ({ value: Number(d.modes.quotes) || 0, target: 3 }) },
    { id: 'words_500', group: 'volume', name: '500 words', xp: 60, mode: 'words', passive: true, target: 500,
      desc: () => 'Type 500 words today (any mode).',
      progress: (d) => ({ value: d.words, target: 500 }) },
    { id: 'acc_96', group: 'quality', name: 'Clean run', xp: 60, mode: 'quotes', passive: true, target: 1,
      desc: () => 'One run at 96% accuracy or better.',
      progress: (d) => ({ value: Math.min(1, d.runs96), target: 1, note: d.runs > 0 ? `Best accuracy today: ${d.bestAcc}%` : '' }) },
    { id: 'drills_3', group: 'quality', name: 'Weak-key drills', xp: 75, mode: 'adaptive', passive: true, target: 3,
      desc: () => 'Finish 3 Weak keys runs (the Adaptive tab).',
      progress: (d) => ({ value: Number(d.modes.adaptive) || 0, target: 3 }) },
    { id: 'nobackspace', group: 'quality', name: 'No backspace', xp: 100, mode: 'words', passive: false, target: 1,
      desc: () => `Type 100 words at ${NO_BACKSPACE_MIN_ACC}% accuracy or better with backspace turned off. Start it from the Challenges tab.`,
      progress: () => ({ value: 0, target: 1 }) },
    { id: 'beat_avg', group: 'personal', name: 'Beat your average', xp: 75, mode: 'words', passive: true, target: 1,
      targetWpm: () => { const avg = getSevenDayAverageWpm(); return avg > 0 ? Math.round(avg) + 2 : 20; },
      desc: (q) => { const avg = getSevenDayAverageWpm(); return avg > 0 ? `One run at ${q.targetWpm()} WPM or better (your 7-day average is ${Math.round(avg)}, plus 2).` : `One run at ${q.targetWpm()} WPM or better. You have no 7-day average yet.`; },
      progress: (d, q) => ({ value: d.bestWpm >= q.targetWpm() ? 1 : 0, target: 1, note: d.runs > 0 ? `Best today: ${d.bestWpm} WPM of ${q.targetWpm()}` : `Target: ${q.targetWpm()} WPM` }) },
    { id: 'beat_yesterday', group: 'personal', name: 'Beat yesterday', xp: 75, mode: 'words', passive: true, target: 1,
      targetWpm: () => { const y = getYesterdayBestWpm(); if (y > 0) return y + 1; const avg = getSevenDayAverageWpm(); return avg > 0 ? Math.round(avg) : 20; },
      desc: (q) => { const y = getYesterdayBestWpm(); return y > 0 ? `Beat yesterday's best of ${y} WPM.` : `No run yesterday, so one run at ${q.targetWpm()} WPM or better counts.`; },
      progress: (d, q) => ({ value: d.bestWpm >= q.targetWpm() ? 1 : 0, target: 1, note: d.runs > 0 ? `Best today: ${d.bestWpm} WPM of ${q.targetWpm()}` : `Target: ${q.targetWpm()} WPM` }) },
];

function hashDateKey(key) {
    let h = 7;
    for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
}

function getTodaysDailyQuests(dayKey = getTodayStr()) {
    const h = hashDateKey(dayKey);
    const pick = (group, shift) => {
        const pool = DAILY_QUEST_POOL.filter(q => q.group === group);
        return pool[(h >>> shift) % pool.length];
    };
    return [pick('volume', 0), pick('quality', 3), pick('personal', 6)];
}

const WEEKLY_QUESTS = [
    { id: 'marathon', name: 'Marathon', xp: 250, target: 3000,
      desc: () => 'Type 3,000 words this week (any mode).',
      progress: (w) => ({ value: w.words, target: 3000 }) },
    { id: 'days_5', name: 'Five days', xp: 200, target: 5,
      desc: () => 'Play on 5 different days this week.',
      progress: (w) => ({ value: w.daysPlayed.length, target: 5 }) },
    { id: 'beat_last_week', name: 'Beat last week', xp: 250, target: 1,
      desc: () => { const lw = getLastWeekSummary(); return lw && lw.bestWpm > 0 ? `Beat last week's best of ${lw.bestWpm} WPM.` : 'Needs a score from last week. Your runs this week set the target for next week.'; },
      locked: () => { const lw = getLastWeekSummary(); return !(lw && lw.bestWpm > 0); },
      progress: (w) => { const lw = getLastWeekSummary(); const t = lw ? lw.bestWpm + 1 : 0; return { value: t > 0 && w.bestWpm >= t ? 1 : 0, target: 1, note: t > 0 ? `Best this week: ${w.bestWpm} WPM of ${t}` : '' }; } },
    { id: 'runs95_10', name: 'Ten clean runs', xp: 250, target: 10,
      desc: () => '10 runs at 95% accuracy or better this week.',
      progress: (w) => ({ value: w.runs95, target: 10 }) },
    { id: 'above_average', name: 'Above average', xp: 250, target: 5,
      desc: () => { const b = getAverageWpmBaseline(); return b > 0 ? `5 runs at ${Math.round(b * 1.05)} WPM or better (5% above your average from earlier weeks, ${Math.round(b)}).` : 'Needs at least 10 runs from earlier weeks to set your average. Keep playing and it unlocks next week.'; },
      locked: () => getAverageWpmBaseline() <= 0,
      progress: (w) => ({ value: w.aboveAvg, target: 5 }) },
    { id: 'consistent_climber', name: 'Steady week', xp: 300, target: 5,
      desc: () => { const best = getAllTimeBestWpm(); return best > 0 ? `5 runs this week within 90% of your all-time best (${Math.ceil(best * 0.9)} WPM or better).` : 'Needs an all-time best first. Finish one counted run.'; },
      locked: () => getAllTimeBestWpm() <= 0,
      progress: (w) => ({ value: w.runsNearPb, target: 5 }) },
];

function findQuestDef(id) {
    return DAILY_QUEST_POOL.find(q => q.id === id) || WEEKLY_QUESTS.find(q => q.id === id) || null;
}

function isWeeklyQuestId(id) { return WEEKLY_QUESTS.some(q => q.id === id); }

// Progress for a quest: { value, target, done, locked, note, pct }
function getQuestStatus(quest) {
    const weekly = isWeeklyQuestId(quest.id);
    const completions = weekly ? getWeeklyCompletions() : getDailyCompletions();
    const done = completions.includes(quest.id);
    const locked = typeof quest.locked === 'function' ? quest.locked() : false;
    const p = weekly ? quest.progress(getWeeklyCounter(), quest) : quest.progress(getDayLog(getTodayStr()), quest);
    const value = done ? p.target : Math.min(p.target, Math.max(0, Number(p.value) || 0));
    return { value, target: p.target, done, locked, note: p.note || '', pct: p.target > 0 ? Math.round((value / p.target) * 100) : 0 };
}

function formatQuestProgress(quest, status) {
    if (status.done) return 'Done';
    if (status.locked) return 'Not available yet';
    if (status.target === 1) return status.note || 'Not done yet';
    const fmt = (n) => Number(n).toLocaleString();
    return `${fmt(status.value)} of ${fmt(status.target)}`;
}

// Legacy arrays defined in app-audio.js are mutated in place so other files see today's quests.
function syncLegacyChallengeArrays() {
    try {
        const daily = getTodaysDailyQuests().map(q => ({ id: q.id, name: q.name, desc: q.desc(q), xp: q.xp, passive: q.passive, target: q.target, mode: q.mode, difficulty: '', diffClass: '' }));
        if (Array.isArray(CHALLENGES)) CHALLENGES.splice(0, CHALLENGES.length, ...daily);
        const weekly = WEEKLY_QUESTS.map(q => ({ id: q.id, name: q.name, desc: q.desc(q), xp: q.xp, difficulty: '', diffClass: '' }));
        if (Array.isArray(WEEKLY_CHALLENGES)) WEEKLY_CHALLENGES.splice(0, WEEKLY_CHALLENGES.length, ...weekly);
    } catch (e) {}
}

// Marks any newly met quests complete and pays XP. Returns [{ id, name, xpGained, weekly }].
function completeEligibleQuests(multiplier = getXPMultiplier()) {
    const out = [];
    const dailyDone = new Set(getDailyCompletions());
    for (const q of getTodaysDailyQuests()) {
        if (dailyDone.has(q.id) || !q.passive) continue;
        const s = getQuestStatus(q);
        if (s.locked || s.value < s.target) continue;
        markChallengeComplete(q.id);
        const xp = Math.round(q.xp * multiplier);
        addXP(xp);
        out.push({ id: q.id, name: q.name, xpGained: xp, weekly: false });
    }
    const weeklyDone = new Set(getWeeklyCompletions());
    for (const q of WEEKLY_QUESTS) {
        if (weeklyDone.has(q.id)) continue;
        const s = getQuestStatus(q);
        if (s.locked || s.value < s.target) continue;
        markWeeklyChallengeComplete(q.id);
        const xp = Math.round(q.xp * multiplier);
        addXP(xp);
        out.push({ id: q.id, name: q.name, xpGained: xp, weekly: true });
    }
    if (out.length) {
        const store = loadWeeklyStore();
        if (store.current.week === getWeekKey()) { store.current.questsDone = (store.current.questsDone || 0) + out.length; saveWeeklyStore(store); }
    }
    return out;
}

// Kept for older callers; the per-run path uses completeEligibleQuests.
function completePassiveDailyChallengesIfEligible() { return completeEligibleQuests().filter(x => !x.weekly); }
function completePassiveWeeklyChallengesIfEligible() { return completeEligibleQuests().filter(x => x.weekly); }

const MODE_RUN_LABELS = { quotes: 'Quotes', words: 'Random words', words30: 'Words 30s', adaptive: 'Weak keys' };

// The nearest unfinished quest, with the words for the results card button.
function getNearestIncompleteQuest() {
    const daily = getTodaysDailyQuests().map(q => ({ q, s: getQuestStatus(q), weekly: false }));
    const weekly = WEEKLY_QUESTS.map(q => ({ q, s: getQuestStatus(q), weekly: true }));
    const candidates = [...daily, ...weekly].filter(x => !x.s.done && !x.s.locked);
    if (!candidates.length) return null;
    candidates.sort((a, b) => (b.s.pct - a.s.pct) || (a.weekly === b.weekly ? 0 : (a.weekly ? 1 : -1)));
    const best = candidates[0];
    const remaining = best.s.target - best.s.value;
    const q = best.q;
    let text;
    let action;
    if (q.id === 'nobackspace') { text = `Try the No backspace challenge, +${q.xp} XP`; action = () => jumpToChallengeFromProgress(q.id); }
    else if (q.id === 'daily_quotes_5') { text = `${remaining} more Quotes ${remaining === 1 ? 'run' : 'runs'} finishes Three quotes, +${q.xp} XP`; action = () => startQuestMode('quotes'); }
    else if (q.id === 'drills_3') { text = `${remaining} more weak-key ${remaining === 1 ? 'drill' : 'drills'} finishes Weak-key drills, +${q.xp} XP`; action = () => startQuestMode('adaptive'); }
    else if (q.id === 'runs_5') { text = `${remaining} more ${remaining === 1 ? 'run' : 'runs'} finishes Five runs, +${q.xp} XP`; action = () => startQuestMode(); }
    else if (q.id === 'words_500' || q.id === 'marathon') { text = `${remaining.toLocaleString()} more words finishes ${q.name}, +${q.xp} XP`; action = () => startQuestMode(); }
    else if (q.id === 'beat_avg' || q.id === 'beat_yesterday') { text = `One run at ${q.targetWpm()} WPM finishes ${q.name}, +${q.xp} XP`; action = () => startQuestMode(); }
    else if (q.id === 'acc_96') { text = `One run at 96% accuracy finishes Clean run, +${q.xp} XP`; action = () => startQuestMode(); }
    else if (q.id === 'runs95_10') { text = `${remaining} more clean ${remaining === 1 ? 'run' : 'runs'} finishes Ten clean runs, +${q.xp} XP`; action = () => startQuestMode(); }
    else if (q.id === 'days_5') { text = `Weekly: play ${remaining} more ${remaining === 1 ? 'day' : 'days'} for Five days, +${q.xp} XP`; action = () => startQuestMode(); }
    else { text = `${remaining} more for ${q.name}, +${q.xp} XP`; action = () => startQuestMode(); }
    return { quest: q, status: best.s, text, action, weekly: best.weekly };
}

function startQuestMode(mode) {
    closeResults();
    if (mode && mode !== currentMode) setMode(mode);
    else if (currentMode === 'daily') setMode('words');
    else newTest();
}

// ── Badges: tiered, with progress ────────────────────────────────────────────
const BADGE_DEFS = [
    { id: 'runs_50',    family: 'runs',    tier: 1, target: 50,     name: 'Regular',       desc: 'Finish 50 counted runs',          icon: '🎯' },
    { id: 'runs_250',   family: 'runs',    tier: 2, target: 250,    name: 'Dedicated',     desc: 'Finish 250 counted runs',         icon: '🎯' },
    { id: 'runs_1000',  family: 'runs',    tier: 3, target: 1000,   name: 'Relentless',    desc: 'Finish 1,000 counted runs',       icon: '🎯' },
    { id: 'words_10k',  family: 'words',   tier: 1, target: 10000,  name: 'Wordsmith',     desc: 'Type 10,000 words',               icon: '📝' },
    { id: 'words_50k',  family: 'words',   tier: 2, target: 50000,  name: 'Author',        desc: 'Type 50,000 words',               icon: '📝' },
    { id: 'words_250k', family: 'words',   tier: 3, target: 250000, name: 'Encyclopedia',  desc: 'Type 250,000 words',              icon: '📝' },
    { id: 'days_7',     family: 'days',    tier: 1, target: 7,      name: 'One week',      desc: 'Play on 7 different days',        icon: '📅' },
    { id: 'days_30',    family: 'days',    tier: 2, target: 30,     name: 'One month',     desc: 'Play on 30 different days',       icon: '📅' },
    { id: 'days_100',   family: 'days',    tier: 3, target: 100,    name: 'Hundred days',  desc: 'Play on 100 different days',      icon: '📅' },
    { id: 'quests_10',  family: 'quests',  tier: 1, target: 10,     name: 'Goal getter',   desc: 'Finish 10 quests',                icon: '✅' },
    { id: 'quests_50',  family: 'quests',  tier: 2, target: 50,     name: 'Goal crusher',  desc: 'Finish 50 quests',                icon: '✅' },
    { id: 'quests_200', family: 'quests',  tier: 3, target: 200,    name: 'Goal machine',  desc: 'Finish 200 quests',               icon: '✅' },
    { id: 'perfect_10', family: 'perfect', tier: 1, target: 10,     name: 'Spotless',      desc: '10 runs at 100% accuracy',        icon: '✨' },
    { id: 'perfect_50', family: 'perfect', tier: 2, target: 50,     name: 'Flawless',      desc: '50 runs at 100% accuracy',        icon: '✨' },
    { id: 'speed_60',   family: 'speed',   tier: 1, target: 60,     name: 'Sixty',         desc: 'Reach 60 WPM in a counted run',   icon: '⚡' },
    { id: 'speed_80',   family: 'speed',   tier: 2, target: 80,     name: 'Eighty',        desc: 'Reach 80 WPM in a counted run',   icon: '⚡' },
    { id: 'speed_100',  family: 'speed',   tier: 3, target: 100,    name: 'Sonic boom',    desc: 'Reach 100 WPM in a counted run',  icon: '⚡' },
    { id: 'speed_120',  family: 'speed',   tier: 4, target: 120,    name: 'Speed demon',   desc: 'Reach 120 WPM in a counted run',  icon: '🔥' },
    { id: 'triple_crown',     name: 'Triple crown',   desc: 'Finish all three daily quests in one day',                        icon: '👑' },
    { id: 'fleet_defender',   name: 'Team player',    desc: 'Type 1,000 words in a week where the team reached its goal',     icon: '🛸' },
    { id: 'founder',          name: 'Founder',        desc: 'Created an account during the beta period',                       icon: '🏛️' },
    { id: 'human_lectionary', name: 'The Human Lectionary', desc: 'Complete 100 Bible Mode typing tests',                    icon: '📖' },
];
const BADGE_XP = 200;
const LEGACY_BADGE_IDS = { sonic_boom: 'speed_100', speed_demon: 'speed_120', streak_master: 'days_7' };
const BADGE_FAMILY_LABELS = { runs: 'Counted runs', words: 'Words typed', days: 'Days played', quests: 'Quests finished', perfect: 'Runs at 100%', speed: 'Best speed' };

function getBadgeMetricValue(family) {
    const counters = getLifetimeCounters();
    const lifetime = getLifetimeStatsSummary();
    if (family === 'runs') return Math.max(counters.countedRuns, 0);
    if (family === 'words') return lifetime.words;
    if (family === 'days') return Math.max(counters.daysPlayed, getEffectiveStreak());
    if (family === 'quests') return getLifetimeChallengesCompleted();
    if (family === 'perfect') return counters.perfectRuns;
    if (family === 'speed') return lifetime.bestWpm;
    return 0;
}

// Progress toward a badge: { value, target, pct }. Non-tiered badges report 0 or 1.
function getBadgeProgress(id) {
    const def = BADGE_DEFS.find(b => b.id === id);
    if (!def) return { value: 0, target: 1, pct: 0 };
    const earned = getEarnedBadges().some(b => b.id === id);
    if (!def.family) return { value: earned ? 1 : 0, target: 1, pct: earned ? 100 : 0 };
    const value = Math.min(def.target, getBadgeMetricValue(def.family));
    return { value, target: def.target, pct: Math.round((value / def.target) * 100) };
}

// For each family: the next tier not yet earned (or the top tier when all are earned).
function getBadgeFamilies() {
    const earned = new Set(getEarnedBadges().map(b => b.id));
    const families = [];
    for (const family of Object.keys(BADGE_FAMILY_LABELS)) {
        const tiers = BADGE_DEFS.filter(b => b.family === family).sort((a, b) => a.tier - b.tier);
        const next = tiers.find(t => !earned.has(t.id)) || tiers[tiers.length - 1];
        families.push({ family, label: BADGE_FAMILY_LABELS[family], tiers, next, earnedCount: tiers.filter(t => earned.has(t.id)).length, progress: getBadgeProgress(next.id), allEarned: tiers.every(t => earned.has(t.id)) });
    }
    return families;
}

function getEarnedBadges() {
    try {
        const raw = JSON.parse(localStorage.getItem(BADGES_KEY) || '[]');
        if (!Array.isArray(raw)) return [];
        const out = [];
        const seen = new Set();
        for (const b of raw) {
            const entry = typeof b === 'string' ? { id: b, earnedAt: null } : (b && typeof b === 'object' ? b : null);
            if (!entry) continue;
            const id = LEGACY_BADGE_IDS[entry.id] || entry.id;
            if (!BADGE_DEFS.some(d => d.id === id) || seen.has(id)) continue;
            seen.add(id);
            out.push({ id, earnedAt: entry.earnedAt || null });
        }
        return out;
    } catch(e) { return []; }
}

// Awards a badge. Badge XP goes through addXP (with the streak multiplier) and then the sync flushes.
function awardBadge(id, { multiplier = getXPMultiplier() } = {}) {
    const badges = getEarnedBadges();
    if (badges.some(b => b.id === id)) return false;
    if (!BADGE_DEFS.some(d => d.id === id)) return false;
    badges.push({ id, earnedAt: Date.now() });
    try { localStorage.setItem(BADGES_KEY, JSON.stringify(badges)); } catch(e) {}
    invalidateLeaderboardUserSummaryCache(currentUser && currentUser.username);
    const xp = Math.round(BADGE_XP * multiplier);
    addXP(xp);
    lastBadgeXpById[id] = xp;
    flushProgressSyncNow();
    return true;
}
const lastBadgeXpById = {};

function ensureFounderBadgeForBeta() {
    if (!currentUser) return;
    // The server sends createdAt: null for legacy accounts that predate the field; those are old enough to qualify.
    const createdAt = Number(currentUser.createdAt) || 0;
    const isLegacyCloudAccount = currentUser.createdAt === null;
    if (isLegacyCloudAccount || (createdAt > 0 && createdAt < FOUNDER_SIGNUP_CUTOFF_MS)) awardBadge('founder');
    awardRetroactiveBadges();
}

// One-time check after hydration: grant tiered badges whose numbers are already met, with one toast.
function awardRetroactiveBadges() {
    const granted = checkTieredBadges();
    if (!granted.length) return;
    const names = granted.map(id => (BADGE_DEFS.find(b => b.id === id) || { name: id }).name).join(', ');
    showUiMessage(`Badge${granted.length > 1 ? 's' : ''} earned: ${names}`, 'success', 3600);
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

function checkTieredBadges(multiplier = getXPMultiplier()) {
    const out = [];
    for (const def of BADGE_DEFS) {
        if (!def.family) continue;
        if (getBadgeMetricValue(def.family) >= def.target && awardBadge(def.id, { multiplier })) out.push(def.id);
    }
    return out;
}

// Called after a counted run has been recorded. Returns the ids of badges earned just now.
function checkBadges(run = {}, multiplier = getXPMultiplier()) {
    const newBadges = checkTieredBadges(multiplier);
    const todays = getTodaysDailyQuests().map(q => q.id);
    const done = getDailyCompletions();
    if (todays.length === 3 && todays.every(id => done.includes(id)) && awardBadge('triple_crown', { multiplier })) newBadges.push('triple_crown');
    if (pendingTeamBadge) {
        pendingTeamBadge = false;
        if (awardBadge('fleet_defender', { multiplier })) newBadges.push('fleet_defender');
    }
    if (getBibleModeTestCount() >= 100 && awardBadge('human_lectionary', { multiplier })) newBadges.push('human_lectionary');
    return newBadges;
}

function showNewBadges(badgeIds) {
    const el = document.getElementById('result-new-badges');
    if (!el) return;
    // The "Rewards this run" list already names every badge, so this block stays hidden on the card.
    el.innerHTML = '';
    el.style.display = 'none';
    if (!badgeIds || badgeIds.length === 0) return;
    el.innerHTML = badgeIds.map(id => {
        const def = BADGE_DEFS.find(b => b.id === id);
        if (!def) return '';
        const xp = lastBadgeXpById[id] || BADGE_XP;
        return `<div class="new-badge-item"><span class="new-badge-icon">${def.icon}</span><div><div class="new-badge-name">Badge earned: ${escapeHtml(def.name)} (+${xp} XP)</div><div class="new-badge-desc">${escapeHtml(def.desc)}</div></div></div>`;
    }).join('');
}

// ── Owned items, equipped cosmetics ──────────────────────────────────────────
const TITLE_KEY = 'sampire-title';
const COSMETIC_COLORS = {
    name_sky: '#5ac8fa', name_purple: '#bf5af2', name_gold: '#f5c242',
    caret_orange: '#e95420', caret_pink: '#ff5fd2', caret_rainbow: 'rainbow',
    trail_green: 'hsla(140, 85%, 60%, 0.6)', trail_gold: 'hsla(45, 95%, 62%, 0.6)',
};

const SHOP_ITEMS = [
    { id: 'aura',          kind: 'effect',     name: 'Word glow',          desc: 'A soft glow around the word you are typing that changes colour as you speed up.', cost: 1, levelReq: 1 },
    { id: 'soundscapes',   kind: 'effect',     name: 'Second music theme', desc: 'Adds the menu music theme "Your Own Personal Universe".', cost: 1, levelReq: 3 },
    { id: 'nebulaTrail',   kind: 'effect',     name: 'Nebula trail',       desc: 'Your cursor leaves a colourful trail as you type.', cost: 3, levelReq: 1 },
    { id: 'streak_freeze', kind: 'consumable', name: 'Streak freeze',      desc: 'Protects your streak for one missed day. Used automatically. You can hold up to 2.', cost: 3, levelReq: 1 },
    { id: 'name_sky',      kind: 'nameColor',  name: 'Sky blue name',      desc: 'Your name shows in sky blue on the leaderboard.', cost: 1, levelReq: 5 },
    { id: 'caret_orange',  kind: 'caretColor', name: 'Orange cursor',      desc: 'An orange typing cursor.', cost: 1, levelReq: 10 },
    { id: 'trail_green',   kind: 'trailColor', name: 'Green trail',        desc: 'Turns the nebula trail green. Needs Nebula trail.', cost: 1, levelReq: 15 },
    { id: 'name_purple',   kind: 'nameColor',  name: 'Purple name',        desc: 'Your name shows in purple on the leaderboard.', cost: 2, levelReq: 20 },
    { id: 'caret_pink',    kind: 'caretColor', name: 'Pink cursor',        desc: 'A pink typing cursor.', cost: 1, levelReq: 25 },
    { id: 'trail_gold',    kind: 'trailColor', name: 'Gold trail',         desc: 'Turns the nebula trail gold. Needs Nebula trail.', cost: 2, levelReq: 30 },
    { id: 'name_gold',     kind: 'nameColor',  name: 'Gold name',          desc: 'Your name shows in gold on the leaderboard.', cost: 2, levelReq: 35 },
    { id: 'caret_rainbow', kind: 'caretColor', name: 'Rainbow cursor',     desc: 'A typing cursor that cycles through colours.', cost: 2, levelReq: 40 },
];
window.SHOP_ITEMS = SHOP_ITEMS;

function getShopItem(id) { return SHOP_ITEMS.find(i => i.id === id) || null; }

function getSkillsState() {
    const fallback = { aura: false, soundscapes: false, nebulaTrail: false, keySoundPacks: {}, cosmetics: {} };
    if (skillStateCache) return skillStateCache;
    try {
        const raw = JSON.parse(localStorage.getItem('sampire-skills') || '{}');
        const unlockedPacks = {};
        for (const packId of getShopKeySoundPackIds()) {
            unlockedPacks[packId] = !!(raw.keySoundPacks && raw.keySoundPacks[packId]);
        }
        const cosmetics = {};
        for (const item of SHOP_ITEMS) {
            if (['nameColor', 'caretColor', 'trailColor'].includes(item.kind)) cosmetics[item.id] = !!(raw.cosmetics && raw.cosmetics[item.id]);
        }
        skillStateCache = {
            aura: !!raw.aura,
            soundscapes: !!raw.soundscapes,
            nebulaTrail: !!raw.nebulaTrail,
            keySoundPacks: unlockedPacks,
            cosmetics,
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
    const cosmetics = {};
    for (const item of SHOP_ITEMS) {
        if (['nameColor', 'caretColor', 'trailColor'].includes(item.kind)) cosmetics[item.id] = !!(nextState && nextState.cosmetics && nextState.cosmetics[item.id]);
    }
    skillStateCache = {
        aura: !!(nextState && nextState.aura),
        soundscapes: !!(nextState && nextState.soundscapes),
        nebulaTrail: !!(nextState && nextState.nebulaTrail),
        keySoundPacks: nextPacks,
        cosmetics,
    };
    try { localStorage.setItem('sampire-skills', JSON.stringify(skillStateCache)); } catch (e) {}
    flushProgressSyncNow();
}

function isSkillUnlocked(skillId) {
    const state = getSkillsState();
    return !!state[skillId];
}

function isCosmeticOwned(id) {
    const state = getSkillsState();
    return !!(state.cosmetics && state.cosmetics[id]);
}

function isShopItemOwned(id) {
    const item = getShopItem(id);
    if (!item) return false;
    if (item.kind === 'effect') return isSkillUnlocked(id);
    if (item.kind === 'consumable') return false;
    return isCosmeticOwned(id);
}

function isKeySoundPackUnlocked(packName) {
    const safe = String(packName || '').trim();
    if (!safe) return false;
    if (safe === KEY_SOUND_DEFAULT_PACK) return true;
    const state = getSkillsState();
    return !!(state.keySoundPacks && state.keySoundPacks[safe]);
}

// Equipped title and colours: sampire-title = { title, nameColor, caretColor, trailColor } (colour fields hold item ids).
function getEquippedCosmetics() {
    const raw = loadLocalJson(TITLE_KEY, {});
    return {
        title: String(raw && raw.title || ''),
        nameColor: String(raw && raw.nameColor || ''),
        caretColor: String(raw && raw.caretColor || ''),
        trailColor: String(raw && raw.trailColor || ''),
    };
}

function saveEquippedCosmetics(next) {
    saveLocalJson(TITLE_KEY, { title: next.title || '', nameColor: next.nameColor || '', caretColor: next.caretColor || '', trailColor: next.trailColor || '', nameColorValue: COSMETIC_COLORS[next.nameColor] || '' });
    applyCosmetics();
}

function equipCosmetic(kind, id) {
    const eq = getEquippedCosmetics();
    if (kind === 'title') {
        eq.title = getUnlockedTitles().includes(id) ? id : '';
    } else if (['nameColor', 'caretColor', 'trailColor'].includes(kind)) {
        eq[kind] = (id && isCosmeticOwned(id)) ? id : '';
    } else return;
    saveEquippedCosmetics(eq);
    if (document.getElementById('skills-modal')?.classList.contains('show')) renderSkillsModal();
    if (document.getElementById('inventory-modal')?.classList.contains('show')) renderInventoryModal();
    flushProgressSyncNow();
}
window.equipCosmetic = equipCosmetic;

function applyCosmetics() {
    const eq = getEquippedCosmetics();
    const root = document.documentElement;
    const caret = eq.caretColor && isCosmeticOwned(eq.caretColor) ? COSMETIC_COLORS[eq.caretColor] : '';
    const trail = eq.trailColor && isCosmeticOwned(eq.trailColor) ? COSMETIC_COLORS[eq.trailColor] : '';
    if (caret && caret !== 'rainbow') root.style.setProperty('--tm-caret-color', caret); else root.style.removeProperty('--tm-caret-color');
    root.toggleAttribute('data-caret-rainbow', caret === 'rainbow');
    if (trail) root.style.setProperty('--tm-trail-color', trail); else root.style.removeProperty('--tm-trail-color');
    root.toggleAttribute('data-trail-color', !!trail);
}

function getPlayerTitle() {
    const eq = getEquippedCosmetics();
    return eq.title && getUnlockedTitles().includes(eq.title) ? eq.title : '';
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
        <span class="burst-unlocked">Bought</span>
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
    if (getSkillPoints() < def.cost) {
        playSound(SFX.below50);
        showUiMessage(`Not enough crystals. This costs ${def.cost}.`);
        return;
    }
    const state = getSkillsState();
    if (!state.keySoundPacks || typeof state.keySoundPacks !== 'object') state.keySoundPacks = {};
    state.keySoundPacks[safe] = true;
    spendCrystals(def.cost);
    saveSkillsState(state);
    triggerShopPurchaseFx(`pack:${safe}`);
    updateSkillDisplay();
    renderSkillsModal();
    updateKeySoundPackMenuUI();
    showUiMessage(`${def.label} bought.`, 'success', 1800, 'top-left');
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
    const points = getSkillPoints();
    document.querySelectorAll('#skill-point-badge, .skill-point-badge[data-live]').forEach(badge => { badge.textContent = `Crystals: ${points}`; });
}

// Buys any item from the SHOP_ITEMS table. Effects, consumables and cosmetics all go through here.
function buyShopItem(itemId) {
    const def = getShopItem(itemId);
    if (!def) return;
    const level = getLevel(getTotalXP());
    if (level < def.levelReq) {
        playSound(SFX.below50);
        showUiMessage(`${def.name} opens at level ${def.levelReq}.`);
        return;
    }
    if (def.kind === 'consumable') {
        if (def.id === 'streak_freeze' && getStreakFreezeCount() >= MAX_STREAK_FREEZES) {
            playSound(SFX.below50);
            showUiMessage(`You already hold ${MAX_STREAK_FREEZES} streak freezes.`);
            return;
        }
    } else if (isShopItemOwned(def.id)) {
        playSound(SFX.below50);
        return;
    }
    if (getSkillPoints() < def.cost) {
        playSound(SFX.below50);
        showUiMessage(`Not enough crystals. This costs ${def.cost}.`);
        return;
    }
    spendCrystals(def.cost);
    const state = getSkillsState();
    if (def.kind === 'effect') {
        state[def.id] = true;
        saveSkillsState(state);
        const rewardSettings = getRewardSettings();
        rewardSettings[def.id] = true;
        saveRewardSettings(rewardSettings);
        if (def.id === 'soundscapes') setActiveMusicTheme('universe');
        updateMusicMenuUI();
        applyAuraStyles();
    } else if (def.kind === 'consumable') {
        const streak = getStreakData();
        streak.freezes = Math.min(MAX_STREAK_FREEZES, (streak.freezes || 0) + 1);
        saveStreakData(streak);
    } else {
        state.cosmetics = state.cosmetics || {};
        state.cosmetics[def.id] = true;
        saveSkillsState(state);
        equipCosmetic(def.kind, def.id);
    }
    triggerShopPurchaseFx(def.id);
    updateSkillDisplay();
    renderSkillsModal();
    renderGoalsStrip();
    flushProgressSyncNow();
}
window.buyShopItem = buyShopItem;

// Older name used by profile markup.
function spendSkillPoint(skillId) { buyShopItem(skillId); }

function renderShopCard(item, { crystal, level, state }) {
    const owned = isShopItemOwned(item.id);
    const lockedByLevel = level < item.levelReq;
    const freezes = item.id === 'streak_freeze' ? getStreakFreezeCount() : 0;
    const maxed = item.id === 'streak_freeze' && freezes >= MAX_STREAK_FREEZES;
    const eq = getEquippedCosmetics();
    const equipped = ['nameColor', 'caretColor', 'trailColor'].includes(item.kind) && eq[item.kind] === item.id;
    let status;
    if (item.kind === 'consumable') status = `<div class="skill-status ${freezes ? 'unlocked' : 'locked'}">You hold ${freezes} of ${MAX_STREAK_FREEZES}</div>`;
    else if (owned) status = `<div class="skill-status unlocked">Owned${equipped ? ' · in use' : ''}</div>`;
    else if (lockedByLevel) status = `<div class="skill-status locked">Opens at level ${item.levelReq}</div>`;
    else status = `<div class="skill-status locked">Not owned</div>`;
    let button;
    if (item.kind === 'consumable') button = `<button class="secondary shop-buy-btn" ${maxed ? 'disabled' : ''} onclick="buyShopItem('${item.id}')">${maxed ? 'Full' : `Buy for ${item.cost}`}</button>`;
    else if (owned && ['nameColor', 'caretColor', 'trailColor'].includes(item.kind)) button = `<button class="secondary shop-buy-btn" onclick="equipCosmetic('${item.kind}', '${equipped ? '' : item.id}')">${equipped ? 'Turn off' : 'Use this'}</button>`;
    else if (owned) button = `<button class="secondary shop-buy-btn" disabled>Owned</button>`;
    else button = `<button class="secondary shop-buy-btn" ${lockedByLevel ? 'disabled' : ''} onclick="buyShopItem('${item.id}')">${lockedByLevel ? `Level ${item.levelReq}` : `Buy for ${item.cost}`}</button>`;
    let controls = '';
    if (item.id === 'aura') {
        controls = auraPreviewVisible
            ? `<div class="reward-preview-stage" id="aura-preview-stage" onclick="previewAuraReward()" title="Click to replay preview"><span class="reward-preview-word" id="aura-preview-word">cosmic</span><span class="reward-preview-word">typing</span></div>`
            : `<button class="reward-preview-btn" onclick="toggleAuraPreview()">Preview</button>`;
    } else if (item.id === 'nebulaTrail') {
        controls = nebulaPreviewVisible
            ? `<div class="reward-preview-stage" id="nebula-preview-stage" onclick="previewNebulaTrailReward()" title="Click to replay preview"><span class="reward-preview-word">type</span><span class="reward-preview-word">faster</span><span class="reward-preview-cursor" aria-hidden="true"></span></div>`
            : `<button class="reward-preview-btn" onclick="toggleNebulaPreview()">Preview</button>`;
    } else if (item.id === 'soundscapes') {
        controls = `<button class="soundscape-preview-icon-btn" onclick="toggleSoundscapesPreview()" aria-label="${rewardSoundPreviewPlaying ? 'Pause music preview' : 'Play music preview'}" title="${rewardSoundPreviewPlaying ? 'Pause preview' : 'Play preview'}">${rewardSoundPreviewPlaying ? '❚❚' : '▶'}</button>`;
    } else if (item.kind === 'nameColor' || item.kind === 'caretColor' || item.kind === 'trailColor') {
        const c = COSMETIC_COLORS[item.id];
        controls = `<span class="shop-color-swatch${c === 'rainbow' ? ' rainbow' : ''}" style="${c && c !== 'rainbow' ? `--swatch:${c}` : ''}" aria-hidden="true"></span>`;
    }
    return `<div class="skill-card${owned ? ' purchased' : ''}${getShopPurchaseFxClass(item.id)}" data-shop-item="${item.id}" data-shop-cost="${item.cost}">
        ${getShopPurchaseFxMarkup(item.id)}
        <div class="skill-card-title">${escapeHtml(item.name)}</div>
        <div class="skill-card-desc">${escapeHtml(item.desc)}</div>
        <div class="skill-card-meta"><span class="skill-cost-row"><span class="skill-cost-label">Cost</span><span class="skill-cost-current">${item.cost} ${crystal}</span>${item.levelReq > 1 ? `<span class="skill-cost-label">· Level ${item.levelReq}</span>` : ''}</span></div>
        ${status}
        ${button}
        <div class="skill-card-controls">${controls}</div>
    </div>`;
}

function renderSkillsModal() {
    const content = document.getElementById('skills-content');
    if (!content) return;
    const points = getSkillPoints();
    const level = getLevel(getTotalXP());
    const state = getSkillsState();
    const crystal = '<span class="aether-crystal-icon" role="img" aria-label="crystal" title="Crystal"></span>';
    const ctx = { crystal, level, state };
    const nextUnlock = getNextUnlock(level);
    const groups = [
        { title: 'Effects and extras', items: SHOP_ITEMS.filter(i => i.kind === 'effect' || i.kind === 'consumable') },
        { title: 'Colours and titles', items: SHOP_ITEMS.filter(i => ['nameColor', 'caretColor', 'trailColor'].includes(i.kind)) },
    ];
    const titles = getUnlockedTitles(level);
    const eq = getEquippedCosmetics();
    const titleHtml = `<div class="shop-titles"><span class="shop-titles-label">Your title:</span>
        <select class="shop-title-select" aria-label="Choose your title" onchange="equipCosmetic('title', this.value)">
            <option value="">None</option>
            ${titles.map(t => `<option value="${escapeHtml(t)}" ${eq.title === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
        </select>
        <span class="shop-titles-note">${titles.length ? `Titles unlock every 5 levels. Next: ${nextUnlock ? `level ${nextUnlock.level}` : 'all unlocked'}.` : 'Your first title unlocks at level 5.'}</span></div>`;

    content.innerHTML = `
        <div class="skills-modal-header-row">
            <span class="daily-xp-level">Level ${level} <span class="daily-level-name">${escapeHtml(getLevelName(level))}</span></span>
            <span class="shop-banner-title">Shop</span>
            <span class="skill-point-badge" data-live="1">Crystals: ${points}</span>
        </div>
        <p class="shop-how">You earn 1 crystal each level and 1 for every ${CRYSTALS_PER_WORDS} words you type in counted runs. Story mode pays crystals too.</p>
        ${groups.map(g => `<div class="profile-section-title">${g.title}</div><div class="skills-modal-grid">${g.items.map(i => renderShopCard(i, ctx)).join('')}</div>`).join('')}
        ${titleHtml}
        <div class="profile-section-title">Keyboard sound packs</div>
        <div class="skills-modal-grid">
            ${SHOP_KEY_SOUND_PACKS.map((pack) => {
                const owned = isKeySoundPackUnlocked(pack.id);
                return `<div class="skill-card${owned ? ' purchased' : ''}${getShopPurchaseFxClass(`pack:${pack.id}`)}" data-shop-item="pack:${escapeHtml(pack.id)}" data-shop-cost="${pack.cost}">
                    ${getShopPurchaseFxMarkup(`pack:${pack.id}`)}
                    <div class="skill-card-title">${escapeHtml(pack.label)}</div>
                    <div class="skill-card-desc">${escapeHtml(pack.desc)}</div>
                    <div class="skill-card-meta"><span class="skill-cost-row"><span class="skill-cost-label">Cost</span><span class="skill-cost-current">${pack.cost} ${crystal}</span></span></div>
                    <div class="skill-status ${owned ? 'unlocked' : 'locked'}">${owned ? 'Owned' : 'Not owned'}</div>
                    <button class="secondary shop-buy-btn" ${owned ? 'disabled' : ''} onclick="unlockShopKeySoundPack('${escapeHtml(pack.id)}')">${owned ? 'Owned' : `Buy for ${pack.cost}`}</button>
                    <div class="skill-card-controls">
                        <input type="text" class="shop-preview-input" maxlength="42" placeholder="Type here to hear this pack" onkeydown="handleShopKeySoundPreviewKeydown(event, '${escapeHtml(pack.id)}')">
                        <div class="shop-preview-note">Try the sound before you buy.</div>
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

const inventorySectionsOpen = { soundscapes: true, cosmetics: true, keypacks: true };

function isInventorySectionOpen(section) { return !!inventorySectionsOpen[section]; }

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
    showUiMessage(`${safe} is now your key sound.`, 'success', 1400, 'top-left');
}

function renderInventoryModal() {
    const content = document.getElementById('inventory-content');
    if (!content) return;
    const owned = getSkillsState();
    const settings = getRewardSettings();
    const eq = getEquippedCosmetics();
    const soundscapesItems = [
        { id: 'soundscapes', name: 'Second music theme', desc: 'The menu music theme "Your Own Personal Universe".' },
    ].filter(item => !!owned[item.id]);
    const cosmeticsItems = [
        { id: 'aura', name: 'Word glow', desc: 'Glow around the word you are typing.' },
        { id: 'nebulaTrail', name: 'Nebula trail', desc: 'Colourful trail while you type.' },
    ].filter(item => !!owned[item.id]);
    const colourItems = SHOP_ITEMS.filter(i => ['nameColor', 'caretColor', 'trailColor'].includes(i.kind) && isCosmeticOwned(i.id));
    const keyboardPackItems = SHOP_KEY_SOUND_PACKS
        .filter((pack) => isKeySoundPackUnlocked(pack.id))
        .map((pack) => ({ id: pack.id, icon: pack.icon, name: pack.label, desc: pack.desc, equipped: keySoundPackName === pack.id }));
    const freezes = getStreakFreezeCount();

    const anyOwned = soundscapesItems.length > 0 || cosmeticsItems.length > 0 || keyboardPackItems.length > 0 || colourItems.length > 0 || freezes > 0;
    if (!anyOwned) {
        content.innerHTML = '<div class="inventory-empty">You do not own anything yet. Crystals come from levelling up and from every 250 words you type. Spend them in the Shop.</div>';
        return;
    }

    const renderRewardCards = (items) => items.map((item) => {
        const on = settings[item.id] !== false;
        const previewHtml = item.id === 'aura'
            ? `<div class="reward-preview-stage" onclick="previewAuraRewardAt('inventory-aura-preview-word')" title="Click to replay preview"><span class="reward-preview-word" id="inventory-aura-preview-word">cosmic</span><span class="reward-preview-word">typing</span></div>`
            : item.id === 'nebulaTrail'
                ? `<div class="reward-preview-stage" id="inventory-nebula-preview-stage" onclick="previewNebulaTrailRewardAt('inventory-nebula-preview-stage')" title="Click to replay preview"><span class="reward-preview-word">type</span><span class="reward-preview-word">faster</span><span class="reward-preview-cursor" aria-hidden="true"></span></div>`
                : `<button type="button" class="soundscape-preview-icon-btn" onclick="toggleSoundscapesPreview()" aria-label="${rewardSoundPreviewPlaying ? 'Pause music preview' : 'Play music preview'}" title="${rewardSoundPreviewPlaying ? 'Pause preview' : 'Play preview'}">${rewardSoundPreviewPlaying ? '❚❚' : '▶'}</button>`;
        return `<div class="inventory-item reward-item">
            <div class="inventory-item-main">
                <div class="inventory-item-top">
                    <span class="inventory-item-name">${escapeHtml(item.name)}</span>
                    <button class="inventory-toggle ${on ? 'on' : ''}" onclick="toggleRewardFromInventory('${item.id}')">${on ? `Turn ${escapeHtml(item.name)} off` : `Turn ${escapeHtml(item.name)} on`}</button>
                </div>
                <div class="inventory-preview-panel">${previewHtml}</div>
                <div class="inventory-item-desc">${escapeHtml(item.desc)}</div>
            </div>
        </div>`;
    }).join('');

    const renderColourCards = (items) => items.map((item) => {
        const inUse = eq[item.kind] === item.id;
        const c = COSMETIC_COLORS[item.id];
        return `<div class="inventory-item">
            <div class="inventory-item-top">
                <span class="inventory-item-name"><span class="shop-color-swatch${c === 'rainbow' ? ' rainbow' : ''}" style="${c && c !== 'rainbow' ? `--swatch:${c}` : ''}" aria-hidden="true"></span> ${escapeHtml(item.name)}</span>
                <button class="inventory-toggle ${inUse ? 'on' : ''}" onclick="equipCosmetic('${item.kind}', '${inUse ? '' : item.id}')">${inUse ? 'Turn off' : 'Use this'}</button>
            </div>
            <div class="inventory-item-desc">${escapeHtml(item.desc)}</div>
        </div>`;
    }).join('');

    const renderPackCards = (items) => items.map((item) => `
        <div class="inventory-item">
            <div class="inventory-item-top">
                <span class="inventory-item-name">${escapeHtml(item.name)}</span>
                <button class="inventory-toggle ${item.equipped ? 'on' : ''}" onclick="equipKeySoundPackFromInventory('${escapeHtml(item.id)}')">${item.equipped ? 'In use' : 'Use this'}</button>
            </div>
            <div class="inventory-item-desc">${escapeHtml(item.desc)}</div>
            <div class="inventory-pack-preview">
                <span class="inventory-pack-preview-label">Try it</span>
                <input type="text" class="shop-preview-input" maxlength="42" placeholder="Type here to hear this pack" onkeydown="handleShopKeySoundPreviewKeydown(event, '${escapeHtml(item.id)}')">
            </div>
        </div>
    `).join('');

    const renderInventorySection = (sectionId, title, itemCount, bodyHtml) => {
        const open = isInventorySectionOpen(sectionId);
        return `<div class="inventory-section">
            <div class="inventory-section-header">
                <span class="inventory-section-title">${title}</span>
                <span class="inventory-section-controls">
                    <span class="weekly-reset">${itemCount} owned</span>
                    <button type="button" class="challenge-section-toggle" aria-label="${open ? `Collapse ${title}` : `Expand ${title}`}" aria-expanded="${open ? 'true' : 'false'}" onclick="toggleInventorySection('${sectionId}')"><span class="chevron">▾</span></button>
                </span>
            </div>
            ${open ? bodyHtml : ''}
        </div>`;
    };

    content.innerHTML = `
        <div class="inventory-grid">
            ${freezes > 0 ? `<div class="inventory-note">Streak freezes held: ${freezes} of ${MAX_STREAK_FREEZES}. One is used automatically if you miss a day.</div>` : ''}
            ${renderInventorySection('soundscapes', 'Music', soundscapesItems.length, (soundscapesItems.length > 0 ? renderRewardCards(soundscapesItems) : '<div class="inventory-section-empty">No music themes owned yet.</div>'))}
            ${renderInventorySection('cosmetics', 'Effects and colours', cosmeticsItems.length + colourItems.length, ((cosmeticsItems.length > 0 || colourItems.length > 0) ? renderRewardCards(cosmeticsItems) + renderColourCards(colourItems) : '<div class="inventory-section-empty">No effects owned yet.</div>'))}
            ${renderInventorySection('keypacks', 'Keyboard sound packs', keyboardPackItems.length, (keyboardPackItems.length > 0 ? renderPackCards(keyboardPackItems) : '<div class="inventory-section-empty">No keyboard sound packs owned yet.</div>'))}
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

// ── Top-bar XP display ───────────────────────────────────────────────────────
function updateXPDisplay() {
    const xp = getTotalXP();
    const badge = document.getElementById('level-badge');
    const fill  = document.getElementById('xp-bar-fill');
    const counter = document.getElementById('xp-counter');
    const streakIndicator = document.getElementById('xp-streak-indicator');
    const streakTooltip = document.getElementById('xp-streak-tooltip');
    const lvl = getLevel(xp);
    const streakCount = getEffectiveStreak();
    const streakMultiplier = getXPMultiplier(streakCount);
    if (badge) { badge.textContent = `Level ${lvl}`; badge.title = getLevelName(lvl); }
    if (counter) counter.textContent = lvl >= MAX_LEVEL ? 'Max level' : `${getXpInLevel(xp)} / ${XP_PER_LEVEL} XP`;
    if (fill)  fill.style.width  = (getLevelProgress(xp) * 100).toFixed(1) + '%';
    if (streakIndicator && streakTooltip) {
        if (streakMultiplier > 1) {
            streakTooltip.textContent = `${streakCount}-day played streak: ${formatMultiplier(streakMultiplier)} XP on every run. ${getStreakLine()}.`;
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

// Floats a "+N XP" chip over the top-bar XP bar and pulses the bar.
function animateXpGain(amount) {
    const host = document.getElementById('xp-display');
    const fill = document.getElementById('xp-bar-fill');
    if (!host || !(amount > 0)) return;
    const chip = document.createElement('span');
    chip.className = 'xp-gain-chip';
    chip.textContent = `+${amount} XP`;
    host.appendChild(chip);
    if (fill) { fill.classList.remove('xp-gain-pulse'); void fill.offsetWidth; fill.classList.add('xp-gain-pulse'); }
    setTimeout(() => chip.remove(), 1900);
}

// ── Today's goals strip (above the typing area) ──────────────────────────────
const GOALS_STRIP_OPEN_KEY = 'sampire-goals-strip-open';

function isGoalsStripOpen() {
    try { return localStorage.getItem(GOALS_STRIP_OPEN_KEY) === '1'; } catch (e) { return false; }
}

function toggleGoalsStrip() {
    const next = !isGoalsStripOpen();
    try { localStorage.setItem(GOALS_STRIP_OPEN_KEY, next ? '1' : '0'); } catch (e) {}
    renderGoalsStrip();
}
window.toggleGoalsStrip = toggleGoalsStrip;

function renderQuestRow(q, status, { compact = false } = {}) {
    const progressText = formatQuestProgress(q, status);
    const cls = status.done ? ' done' : (status.locked ? ' locked' : '');
    return `<button type="button" class="goal-row${cls}${compact ? ' compact' : ''}" data-quest-id="${escapeHtml(q.id)}" onclick="jumpToChallengeFromProgress('${escapeHtml(q.id)}')" title="${escapeHtml(q.desc(q))}">
        <span class="goal-row-top"><span class="goal-row-name">${status.done ? '✓ ' : ''}${escapeHtml(q.name)}</span><span class="goal-row-xp">+${q.xp} XP</span></span>
        <span class="goal-row-bar" aria-hidden="true"><span class="goal-row-fill" style="width:${status.pct}%"></span></span>
        <span class="goal-row-progress">${escapeHtml(progressText)}</span>
    </button>`;
}

function renderGoalsStrip() {
    const host = document.getElementById('goals-strip');
    if (!host) return;
    if (currentMode === 'daily') { host.style.display = 'none'; return; }
    host.style.display = '';
    const open = isGoalsStripOpen();
    const quests = getTodaysDailyQuests();
    const statuses = quests.map(q => getQuestStatus(q));
    const doneCount = statuses.filter(s => s.done).length;
    const streak = getEffectiveStreak();
    host.innerHTML = `
        <div class="goals-strip-head">
            <button type="button" class="goals-strip-toggle" aria-expanded="${open ? 'true' : 'false'}" aria-controls="goals-strip-body" onclick="toggleGoalsStrip()">
                <span class="goals-strip-title">Today's goals</span>
                <span class="goals-strip-count">${doneCount} of ${quests.length} done</span>
                <span class="chevron" aria-hidden="true">${open ? '▾' : '▸'}</span>
            </button>
            <span class="goals-strip-streak" id="goals-strip-streak">${streak > 0 ? '🔥 ' : ''}${escapeHtml(getStreakLine())}</span>
        </div>
        <div class="goals-strip-body" id="goals-strip-body" ${open ? '' : 'hidden'}>
            ${quests.map((q, i) => renderQuestRow(q, statuses[i], { compact: true })).join('')}
        </div>`;
}

// ── Challenges panel ─────────────────────────────────────────────────────────
function jumpToChallengeFromProgress(challengeId) {
    const id = String(challengeId || '').trim();
    if (!id) return;
    if (id === 'community_goal') {
        closeResults();
        openCommunityHub();
        return;
    }
    if (isWeeklyQuestId(id)) challengeSectionsOpen.weekly = true; else challengeSectionsOpen.daily = true;
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

const challengeSectionsOpen = { daily: true, weekly: true, badges: true };

function isChallengeSectionOpen(section) { return !!challengeSectionsOpen[section]; }

function toggleChallengeSection(section) {
    if (!Object.prototype.hasOwnProperty.call(challengeSectionsOpen, section)) return;
    challengeSectionsOpen[section] = !challengeSectionsOpen[section];
    renderDailyChallenges();
}
window.toggleChallengeSection = toggleChallengeSection;

function renderChallengeCard(q, status, weekly) {
    const progressText = formatQuestProgress(q, status);
    const right = status.done
        ? `<span class="challenge-done-badge">&#10003; Done</span>`
        : status.locked
            ? `<span class="challenge-locked-badge">Not yet</span>`
            : (q.passive === false)
                ? `<button class="challenge-start-btn" onclick="startChallenge('${q.id}')">Start</button>`
                : `<span class="challenge-locked-badge">In progress</span>`;
    return `<div id="challenge-card-${escapeHtml(q.id)}" data-challenge-id="${escapeHtml(q.id)}" class="challenge-card${status.done ? ' completed' : ''}${status.locked ? ' locked' : ''}">
        <div class="challenge-card-left">
            <div class="challenge-name">${escapeHtml(q.name)} <span class="challenge-xp">+${q.xp} XP</span></div>
            <div class="challenge-desc">${escapeHtml(q.desc(q))}</div>
            <div class="weekly-progress"><span class="goal-row-bar" aria-hidden="true"><span class="goal-row-fill" style="width:${status.pct}%"></span></span> ${escapeHtml(progressText)}</div>
        </div>
        <div class="challenge-card-right">${right}</div>
    </div>`;
}

function renderBadgesSection() {
    const families = getBadgeFamilies();
    const earned = new Set(getEarnedBadges().map(b => b.id));
    const singles = BADGE_DEFS.filter(b => !b.family);
    return `<div class="badge-grid">
        ${families.map(f => {
            const p = f.progress;
            return `<div class="badge-card${f.allEarned ? ' earned' : ''}">
                <div class="badge-card-top"><span class="badge-card-icon" style="--pct:${f.allEarned ? 100 : p.pct}">${f.next.icon}</span><span class="badge-card-name">${escapeHtml(f.next.name)}</span><span class="badge-card-tier">${f.earnedCount} of ${f.tiers.length}</span></div>
                <div class="badge-card-desc">${escapeHtml(f.label)}: ${f.allEarned ? 'all tiers earned' : escapeHtml(f.next.desc)}</div>
                <span class="goal-row-bar" aria-hidden="true"><span class="goal-row-fill" style="width:${p.pct}%"></span></span>
                <div class="badge-card-progress">${f.allEarned ? 'Complete' : `${p.value.toLocaleString()} of ${p.target.toLocaleString()}`}</div>
            </div>`;
        }).join('')}
        ${singles.map(b => `<div class="badge-card${earned.has(b.id) ? ' earned' : ''}">
            <div class="badge-card-top"><span class="badge-card-icon" style="--pct:${earned.has(b.id) ? 100 : 0}">${earned.has(b.id) ? b.icon : '🔒'}</span><span class="badge-card-name">${escapeHtml(b.name)}</span></div>
            <div class="badge-card-desc">${escapeHtml(b.desc)}</div>
            <div class="badge-card-progress">${earned.has(b.id) ? 'Earned' : 'Not yet'}</div>
        </div>`).join('')}
    </div>`;
}

function renderDailyChallenges() {
    const panel = document.getElementById('challenge-panel');
    if (!panel) return;
    syncLegacyChallengeArrays();
    const strip = document.getElementById('goals-strip');
    if (strip) strip.style.display = 'none';
    const quests = getTodaysDailyQuests();
    const dailyStatuses = quests.map(q => getQuestStatus(q));
    const weeklyStatuses = WEEKLY_QUESTS.map(q => getQuestStatus(q));
    const xp = getTotalXP();
    const level = getLevel(xp);
    const streakCount = getEffectiveStreak();
    const streakMultiplier = getXPMultiplier(streakCount);
    const weekStart = getWeekStartDate();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekRangeLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} to ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    const dailyOpen = isChallengeSectionOpen('daily');
    const weeklyOpen = isChallengeSectionOpen('weekly');
    const badgesOpen = isChallengeSectionOpen('badges');
    const nextUnlock = getNextUnlock(level);
    const freezes = getStreakFreezeCount();
    panel.innerHTML = `
        <div class="daily-header category-header daily">
            <span class="daily-title-wrap"><span class="daily-title-icon" aria-hidden="true">⚡</span><span class="daily-title">Today's goals</span><button type="button" class="challenge-section-toggle challenge-title-toggle" aria-label="${dailyOpen ? 'Collapse daily quests' : 'Expand daily quests'}" aria-expanded="${dailyOpen ? 'true' : 'false'}" onclick="toggleChallengeSection('daily')"><span class="chevron">▾</span></button></span>
            <span class="challenge-section-controls">
                <span class="daily-reset">${dailyStatuses.filter(s => s.done).length} of ${quests.length} done today &nbsp;·&nbsp; new goals at midnight</span>
            </span>
        </div>
        ${dailyOpen ? `
            <div class="challenge-cards">${quests.map((q, i) => renderChallengeCard(q, dailyStatuses[i], false)).join('')}</div>
            <div class="daily-xp-row">
                <span class="daily-xp-level">Level ${level} <span class="daily-level-name">${escapeHtml(getLevelName(level))}</span></span>
                <div class="daily-xp-bar-wrap"><div class="daily-xp-bar-fill" style="width:${(getLevelProgress(xp)*100).toFixed(1)}%"></div></div>
                <span class="daily-xp-label">${level >= MAX_LEVEL ? 'Max level' : `${getXpInLevel(xp)} / ${XP_PER_LEVEL} XP`}</span>
            </div>
            <div class="daily-next-unlock">${nextUnlock ? `Next unlock at level ${nextUnlock.level}: ${escapeHtml(nextUnlock.label)}` : 'Every level unlock earned.'}</div>
            <div class="daily-streak-row">
                <span class="daily-streak-badge">${streakCount >= 3 ? '🔥' : '⚡'} ${streakCount}-day played streak</span>
                ${streakMultiplier > 1 ? `<span class="daily-multiplier">${formatMultiplier(streakMultiplier)} XP on every run${streakMultiplier >= 2 ? ' (max)' : ''}</span>` : ''}
                <span class="daily-streak-note">${escapeHtml(getStreakLine())}${freezes ? ` · ${freezes} streak freeze${freezes === 1 ? '' : 's'} held` : ''}</span>
                <span class="skill-info-wrap" tabindex="0" aria-label="How the streak works">
                    <span class="skill-info-icon" aria-hidden="true">i</span>
                    <span class="skill-info-tooltip">Finish one counted run a day to keep the streak. Day 2 pays 1.25x XP, day 3 pays 1.5x, day 4 pays 1.75x and day 5 and up pay 2x. A streak freeze from the shop covers one missed day.</span>
                </span>
            </div>
        ` : ''}

        <div class="weekly-section">
            <div class="daily-header category-header weekly">
                <span class="daily-title-wrap"><span class="daily-title-icon" aria-hidden="true">📅</span><span class="daily-title">This week</span><button type="button" class="challenge-section-toggle challenge-title-toggle" aria-label="${weeklyOpen ? 'Collapse weekly quests' : 'Expand weekly quests'}" aria-expanded="${weeklyOpen ? 'true' : 'false'}" onclick="toggleChallengeSection('weekly')"><span class="chevron">▾</span></button></span>
                <span class="challenge-section-controls">
                    <span class="weekly-reset">${weeklyStatuses.filter(s => s.done).length} of ${WEEKLY_QUESTS.length} done &nbsp;·&nbsp; ${escapeHtml(weekRangeLabel)}</span>
                </span>
            </div>
            ${weeklyOpen ? `<div class="challenge-cards">${WEEKLY_QUESTS.map((q, i) => renderChallengeCard(q, weeklyStatuses[i], true)).join('')}</div>` : ''}
            <div class="community-goal-section" id="community-goal-section">
                <div class="daily-header category-header community">
                    <span class="daily-title-wrap"><span class="daily-title-icon" aria-hidden="true">🛸</span><span class="daily-title">Team goal</span><button type="button" class="challenge-section-toggle challenge-title-toggle challenge-title-openhub" aria-label="Open the team goal" onclick="openCommunityHub()"><span>Open</span></button></span>
                    <span class="challenge-section-controls">
                        <span class="weekly-reset">Everyone's words count toward one weekly total. Type 1,000 words in a week the team reaches its goal to earn the Team player badge.</span>
                    </span>
                </div>
            </div>
        </div>

        <div class="orion-section">
            <div class="daily-header category-header orion">
                <span class="daily-title-wrap"><span class="daily-title-icon" aria-hidden="true">🛡️</span><span class="daily-title">Orion Bulwark</span></span>
                <span class="challenge-section-controls">
                    <span class="weekly-reset">${level >= 2 ? 'A wave-defence typing game. Each run pays XP.' : 'Unlocks at level 2.'}</span>
                    ${level >= 2 && window.OrionMode ? '<button type="button" class="challenge-start-btn" onclick="playOrionFromChallenges()">Play Orion</button>' : ''}
                </span>
            </div>
        </div>

        <div class="badges-section">
            <div class="daily-header category-header badges">
                <span class="daily-title-wrap"><span class="daily-title-icon" aria-hidden="true">🏅</span><span class="daily-title">Badges</span><button type="button" class="challenge-section-toggle challenge-title-toggle" aria-label="${badgesOpen ? 'Collapse badges' : 'Expand badges'}" aria-expanded="${badgesOpen ? 'true' : 'false'}" onclick="toggleChallengeSection('badges')"><span class="chevron">▾</span></button></span>
                <span class="challenge-section-controls">
                    <span class="weekly-reset">${getEarnedBadges().length} of ${BADGE_DEFS.length} earned</span>
                    <button type="button" class="secondary challenge-lifetime-btn" onclick="openLifetimeStats()">Lifetime stats</button>
                </span>
            </div>
            ${badgesOpen ? renderBadgesSection() : ''}
        </div>`;
    updateProfileToggleHoverInfo();
}

function playOrionFromChallenges() {
    if (!window.OrionMode || getLevel(getTotalXP()) < 2) return;
    try { OrionMode.open({ onExit: () => setMode('daily') }); } catch (e) { console.warn('Orion could not open', e); }
}
window.playOrionFromChallenges = playOrionFromChallenges;

function startChallenge(id) {
    activeChallengeId = id;
    document.getElementById('challenge-panel').style.display = 'none';
    document.getElementById('typing-area').style.display = '';
    const strip = document.getElementById('goals-strip');
    if (strip) strip.style.display = '';
    if (id === 'sprint')       currentMode = 'words30';
    else if (id === 'nobackspace') currentMode = 'words';
    else if (id === 'perfectionist') currentMode = 'quotes';
    else                       currentMode = 'words';
    document.querySelectorAll('.mode-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === currentMode));
    updateChallengeHint();
    newTest();
}

function abandonChallenge() {
    activeChallengeId = null;
    setMode('daily');
}

function showChallengeFail() {
    isComplete = true;
    if (typeof stopTimer === 'function') stopTimer();
    else { clearInterval(timerHandle); timerHandle = null; }
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
    renderGoalsStrip();
    if (!hint) return;
    if (activeChallengeId === 'nobackspace')
        hint.textContent = `Backspace is off · Tab to restart · ${NO_BACKSPACE_MIN_ACC}% accuracy needed`;
    else if (activeChallengeId === 'perfectionist')
        hint.textContent = 'Any mistake ends the run · Tab to restart';
    else if (activeChallengeId === 'sprint')
        hint.textContent = '30 seconds · 100 WPM · Tab to restart';
    else
        hint.textContent = typeof getDefaultHintText === 'function' ? getDefaultHintText() : 'Click the text above to begin \u00b7 Tab to restart \u00b7 Backspace to correct';
}

// ── Lifetime stats (works for guests too) ────────────────────────────────────
function openLifetimeStats() {
    const modal = document.getElementById('lifetime-stats-modal');
    if (!modal) return;
    if (typeof renderLifetimeStatsModal === 'function') renderLifetimeStatsModal();
    openModal(modal);
}
window.openLifetimeStats = openLifetimeStats;

// ── Level-up overlay ─────────────────────────────────────────────────────────
function showLevelUpOverlay({ level, prevLevel }) {
    const modal = document.getElementById('levelup-overlay');
    const content = document.getElementById('levelup-content');
    if (!modal || !content) return;
    const from = Math.max(1, Number(prevLevel) || level - 1);
    const unlocks = [];
    for (let lv = from + 1; lv <= level; lv++) unlocks.push(...getUnlocksAtLevel(lv));
    const crystals = level - from;
    const next = getNextUnlock(level);
    content.innerHTML = `
        <div class="levelup-kicker">Level up</div>
        <div class="levelup-level">Level ${level}</div>
        <div class="levelup-name">${escapeHtml(getLevelName(level))}</div>
        <ul class="levelup-list">
            <li>+${crystals} crystal${crystals === 1 ? '' : 's'} to spend in the shop</li>
            ${unlocks.map(u => `<li>${u.kind === 'title' ? 'New title: ' + escapeHtml(u.id) : 'Now in the shop: ' + escapeHtml(u.label.replace(/ \(shop\)$/, ''))}</li>`).join('')}
            ${!unlocks.length && next ? `<li>Next unlock at level ${next.level}: ${escapeHtml(next.label.replace(/ \(shop\)$/, ''))}</li>` : ''}
        </ul>
        <div class="levelup-actions">
            <button type="button" class="new-test-btn" onclick="closeLevelUpOverlay()">Keep going</button>
            <button type="button" class="secondary" onclick="closeLevelUpOverlay(); openSkills();">Open the shop</button>
        </div>`;
    try { playSound(SFX.ding); } catch (e) {}
    showLayerOverlay(modal);
}

// Shows a card above whatever is open (the results stay visible underneath) and moves focus into it.
function showLayerOverlay(modal) {
    if (!modal) return;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    modal._returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const btn = modal.querySelector('button');
    if (btn) { try { btn.focus({ preventScroll: true }); } catch (e) {} }
    if (!modal._layerWired) {
        modal._layerWired = true;
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLayerOverlay(modal); }
            else if (e.key === 'Tab') {
                const items = Array.from(modal.querySelectorAll('button, select, a[href]')).filter(el => !el.disabled);
                if (!items.length) return;
                const i = items.indexOf(document.activeElement);
                e.preventDefault(); e.stopPropagation();
                items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
            } else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); e.stopPropagation(); }
        });
        modal.addEventListener('click', (e) => { if (e.target === modal) closeLayerOverlay(modal); });
    }
}

function closeLayerOverlay(modal) {
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    const back = modal._returnFocus;
    modal._returnFocus = null;
    if (back && typeof back.focus === 'function' && document.contains(back)) { try { back.focus({ preventScroll: true }); } catch (e) {} }
}

function closeLevelUpOverlay() {
    closeLayerOverlay(document.getElementById('levelup-overlay'));
}
window.closeLevelUpOverlay = closeLevelUpOverlay;

// ── Weekly recap ─────────────────────────────────────────────────────────────
let lastWeeklyRecapData = null;

function formatWeekLabel(weekKey) {
    const d = new Date(`${weekKey}T12:00:00`);
    if (Number.isNaN(d.getTime())) return weekKey;
    const end = new Date(d); end.setDate(end.getDate() + 6);
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} to ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function showWeeklyRecap(data) {
    const modal = document.getElementById('weekly-recap-modal');
    const content = document.getElementById('weekly-recap-content');
    if (!modal || !content || !data) return;
    lastWeeklyRecapData = data;
    const prev = data.previous;
    const avg = Math.round(data.avgWpm || 0);
    const prevAvg = prev ? Math.round(prev.avgWpm || 0) : null;
    const change = prevAvg != null ? avg - prevAvg : null;
    const changeText = change == null ? 'No week before this one to compare.' : (change === 0 ? 'Same average as the week before.' : `${change > 0 ? 'Up' : 'Down'} ${Math.abs(change)} WPM on the week before.`);
    content.innerHTML = `
        <div class="recap-kicker">Last week</div>
        <div class="recap-range">${escapeHtml(formatWeekLabel(data.week))}</div>
        <div class="recap-grid">
            <div class="recap-stat"><span class="recap-value">${Number(data.runs).toLocaleString()}</span><span class="recap-label">Runs</span></div>
            <div class="recap-stat"><span class="recap-value">${Number(data.words).toLocaleString()}</span><span class="recap-label">Words</span></div>
            <div class="recap-stat"><span class="recap-value">${data.bestWpm}</span><span class="recap-label">Best WPM</span></div>
            <div class="recap-stat"><span class="recap-value">${avg}</span><span class="recap-label">Average WPM</span></div>
            <div class="recap-stat"><span class="recap-value">${data.questsDone || 0}</span><span class="recap-label">Quests done</span></div>
            <div class="recap-stat"><span class="recap-value">${data.streak || 0}</span><span class="recap-label">Day streak</span></div>
        </div>
        <p class="recap-change">${escapeHtml(changeText)}</p>
        <div class="levelup-actions">
            <button type="button" class="new-test-btn" onclick="closeWeeklyRecap()">On to this week</button>
            ${window.ShareCard && typeof window.ShareCard.shareRecap === 'function' ? '<button type="button" class="secondary" onclick="shareWeeklyRecap()">Share</button>' : ''}
        </div>`;
    showLayerOverlay(modal);
}

function closeWeeklyRecap() {
    closeLayerOverlay(document.getElementById('weekly-recap-modal'));
}
window.closeWeeklyRecap = closeWeeklyRecap;

function shareWeeklyRecap() {
    try { window.ShareCard?.shareRecap?.(lastWeeklyRecapData); } catch (e) { console.warn('Share failed', e); }
}
window.shareWeeklyRecap = shareWeeklyRecap;

function takePendingWeeklyRecap() {
    const r = pendingWeeklyRecap;
    pendingWeeklyRecap = null;
    return r;
}

// ── Decorative fields and auth input bindings (unchanged) ────────────────────
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

// ── Self-start (safe before boot: reads storage only) ────────────────────────
try {
    syncLegacyChallengeArrays();
    applyCosmetics();
    renderGoalsStrip();
} catch (e) { console.warn('Progression start-up skipped', e); }
