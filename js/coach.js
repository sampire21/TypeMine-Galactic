// js/coach.js: the teaching layer ("Coach").
// First-run flow for new players (placement test, goal, finger map, three drills,
// hand-off), plus ongoing coaching: a goal chip in the goals strip, a weekly lesson
// on the Challenges tab, a tip on the results card when accuracy is under 90%, and
// a once-a-day close-out card after the third counted run.
//
// Owns only: this file, css/coach.css, assets/finger-map.svg, #coach-modal markup.
// It talks to the rest of the game through globals that already exist:
//   setMode, newTest, setEngineOption, getEngineOption, init, focusInput,
//   AdaptivePractice.setFocusKeys/getWeakKeys/getKeyHeatmap, openModal/closeModal,
//   loadLocalJson/saveLocalJson, scheduleProgressSync, openSignupModal, closeResults,
//   getTodayStr, getDayLog, getEffectiveStreak, getXPMultiplier, addXP, loadHistory,
//   showUiMessage, escapeHtml, and the 'typemine:run-finished' event.
// Every call is guarded so a renamed helper degrades to "no coaching", not a crash.
//
// State lives in localStorage under 'sampire-coach' (synced with the account via
// SYNC_PROGRESS_KEYS). Automatic start of the first-run flow is controlled by
// 'sampire-coach-auto': "0" never, "1" always, unset = on for real browsers
// (navigator.webdriver false) so the existing automated tests do not get it.
(function attachCoach(global) {
    'use strict';

    const STORAGE_KEY = 'sampire-coach';
    const AUTO_KEY = 'sampire-coach-auto';
    const PLACEMENT_SECONDS = 30;
    const DRILL_WORDS = 30;          // about one minute at 30 WPM
    const DRILLS_PER_SESSION = 3;
    const LESSON_XP = 20;
    const FINGER_MAP_URL = 'assets/finger-map.svg';

    // ── Finger map (US QWERTY) ─────────────────────────────────────────────
    const FINGER_NAMES = {
        ll: 'left little finger', lr: 'left ring finger', lm: 'left middle finger', li: 'left index finger',
        ri: 'right index finger', rm: 'right middle finger', rr: 'right ring finger', rl: 'right little finger',
        th: 'thumb',
    };
    const FINGER_BY_KEY = (function build() {
        const m = {};
        const add = (f, keys) => { for (const k of keys) m[k] = f; };
        add('ll', '`1qaz');
        add('lr', '2wsx');
        add('lm', '3edc');
        add('li', '45rtfgvb');
        add('ri', '67yuhjnm');
        add('rm', '8ik,');
        add('rr', '9ol.');
        add('rl', '0-=p[]\\;\'/');
        m[' '] = 'th';
        return m;
    })();

    function fingerFor(key) {
        const k = String(key == null ? '' : key).toLowerCase();
        return FINGER_NAMES[FINGER_BY_KEY[k]] || '';
    }
    function fingerHint(key) {
        const f = fingerFor(key);
        return f ? `${key}: ${f}` : '';
    }

    // ── Small helpers ──────────────────────────────────────────────────────
    function esc(s) {
        if (typeof global.escapeHtml === 'function') return global.escapeHtml(s);
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function fn(name) { return typeof global[name] === 'function' ? global[name] : null; }
    function call(name, ...args) { const f = fn(name); try { return f ? f(...args) : undefined; } catch (e) { return undefined; } }
    function dateKey(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    function todayKey() { return call('getTodayStr') || dateKey(new Date()); }
    function keyToDate(key) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
        if (!m) return null;
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
    }
    function addDays(key, days) {
        const d = keyToDate(key) || new Date();
        d.setDate(d.getDate() + days);
        return dateKey(d);
    }
    function fmtDate(key) {
        const d = keyToDate(key);
        if (!d) return '';
        try { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch (e) { return key; }
    }
    function round5(n) { return Math.round(n / 5) * 5; }
    function listLetters(keys) {
        const list = (keys || []).filter(Boolean);
        if (!list.length) return '';
        if (list.length === 1) return list[0];
        return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
    }
    function isGuest() { return !(global.currentUser && global.currentUser.username); }

    // ── State ──────────────────────────────────────────────────────────────
    function defaultState() {
        return {
            placementWpm: null, placementAccuracy: null, placementDate: '', weakKeys: [],
            goalWpm: null, goalDate: '', goalLabel: '', goalStartWpm: null, goalSetDate: '',
            step: '', fingerMapSeen: false, dailyGoalWpm: null, skipped: false,
            drillResults: [], closeoutDate: '', lessonWeek: '', firstRunDone: false,
        };
    }
    function getState() {
        let raw = null;
        try {
            raw = typeof global.loadLocalJson === 'function' ? global.loadLocalJson(STORAGE_KEY, null) : JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        } catch (e) { raw = null; }
        return Object.assign(defaultState(), raw && typeof raw === 'object' ? raw : {});
    }
    function patch(changes) {
        const next = Object.assign(getState(), changes || {});
        try {
            if (typeof global.saveLocalJson === 'function') global.saveLocalJson(STORAGE_KEY, next);
            else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch (e) {}
        call('scheduleProgressSync');
        return next;
    }

    // ── Who is new? ────────────────────────────────────────────────────────
    function autoAllowed() {
        let flag = null;
        try { flag = localStorage.getItem(AUTO_KEY); } catch (e) {}
        if (flag === '0') return false;
        if (flag === '1') return true;
        return !(global.navigator && global.navigator.webdriver);
    }
    function historyCount() {
        try {
            const h = fn('loadHistory') ? global.loadHistory() : JSON.parse(localStorage.getItem('sampire-typing-history') || '[]');
            return Array.isArray(h) ? h.length : 0;
        } catch (e) { return 0; }
    }
    function lifetimeTests() {
        try { return parseInt(localStorage.getItem('sampire-lifetime-tests-completed') || '0', 10) || 0; } catch (e) { return 0; }
    }
    function isReturningPlayer() {
        const s = getState();
        if (s.placementWpm != null || s.skipped || s.step === 'done') return true;
        return historyCount() > 0 || lifetimeTests() > 0;
    }
    function shouldAutoStart() {
        return autoAllowed() && !isReturningPlayer();
    }

    // ── Weak keys ──────────────────────────────────────────────────────────
    // Slowest or most-missed letters. Uses the adaptive stats (lower sample bar than
    // AdaptivePractice.getWeakKeys so a single 30-second test is enough).
    function rankWeakLetters(n, minSamples) {
        const AP = global.AdaptivePractice;
        if (!AP || typeof AP.getKeyHeatmap !== 'function') return [];
        let heat = {};
        try { heat = AP.getKeyHeatmap() || {}; } catch (e) { return []; }
        const rows = Object.keys(heat).filter(c => /^[a-z]$/.test(c) && heat[c] && heat[c].samples >= minSamples)
            .map(c => ({ c, acc: Number(heat[c].accuracy) || 0, ms: Number(heat[c].avgMs) || 0, n: heat[c].samples }));
        if (!rows.length) return [];
        const timed = rows.filter(r => r.ms > 0).map(r => r.ms).sort((a, b) => a - b);
        const med = timed.length ? timed[timed.length >> 1] : 1;
        rows.forEach(r => {
            const slow = r.ms > 0 ? Math.max(0, r.ms / med - 1) : 0;
            r.score = (100 - r.acc) / 100 * 4 + Math.min(slow, 2);
        });
        return rows.filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, n).map(r => r.c);
    }
    function getWeakKeys(n = 3) {
        let keys = [];
        const AP = global.AdaptivePractice;
        try { if (AP && typeof AP.getWeakKeys === 'function') keys = AP.getWeakKeys(n) || []; } catch (e) { keys = []; }
        keys = keys.map(k => (typeof k === 'string' ? k : (k && (k.char || k.key || k.id)) || '')).filter(k => /^[a-z]$/.test(k));
        if (keys.length < n) {
            for (const k of rankWeakLetters(n * 2, 3)) { if (!keys.includes(k)) keys.push(k); if (keys.length >= n) break; }
        }
        if (keys.length < n) {
            for (const k of (getState().weakKeys || [])) { if (/^[a-z]$/.test(k) && !keys.includes(k)) keys.push(k); if (keys.length >= n) break; }
        }
        if (keys.length < n) {
            // Letters most people find hard; used until there is enough data.
            for (const k of ['p', 'b', 'y', 'q', 'z']) { if (!keys.includes(k)) keys.push(k); if (keys.length >= n) break; }
        }
        return keys.slice(0, n);
    }
    function mostMissedKey() {
        const AP = global.AdaptivePractice;
        if (!AP || typeof AP.getKeyHeatmap !== 'function') return '';
        try {
            const heat = AP.getKeyHeatmap() || {};
            let best = '', worst = 100;
            for (const c of Object.keys(heat)) {
                if (!/^[a-z]$/.test(c) || !heat[c] || heat[c].samples < 5) continue;
                if (heat[c].accuracy < worst && heat[c].accuracy < 90) { worst = heat[c].accuracy; best = c; }
            }
            return best;
        } catch (e) { return ''; }
    }

    // ── Rolling average and goal maths ─────────────────────────────────────
    function rollingAverage(days = 7) {
        let entries = [];
        try { entries = fn('loadHistory') ? global.loadHistory() : JSON.parse(localStorage.getItem('sampire-typing-history') || '[]'); } catch (e) { entries = []; }
        const cutoff = Date.now() - days * 86400000;
        let sum = 0, n = 0;
        for (const e of Array.isArray(entries) ? entries : []) {
            if (!e || typeof e !== 'object') continue;
            const t = typeof e.date === 'number' ? e.date : Date.parse(e.date);
            const wpm = Number(e.wpm);
            if (!Number.isFinite(t) || t < cutoff || !Number.isFinite(wpm) || wpm <= 0) continue;
            sum += wpm; n += 1;
        }
        if (n > 0) return { avg: Math.round(sum / n), runs: n };
        // No history rows in range: fall back to this week's counter.
        try {
            const w = fn('getWeeklyCounter') ? global.getWeeklyCounter() : null;
            if (w && w.runs > 0) return { avg: Math.round(w.sumWpm / w.runs), runs: w.runs };
        } catch (e) {}
        return { avg: 0, runs: 0 };
    }
    function goalStatus(s = getState()) {
        const roll = rollingAverage(7);
        const now = roll.runs > 0 ? roll.avg : (s.placementWpm != null ? Math.round(s.placementWpm) : 0);
        if (!s.goalWpm) return { kind: s.goalLabel === 'practise' ? 'practise' : 'none', now, runs: roll.runs };
        if (now >= s.goalWpm) return { kind: 'reached', now, runs: roll.runs };
        const start = Number.isFinite(Number(s.goalStartWpm)) ? Number(s.goalStartWpm) : (s.placementWpm != null ? s.placementWpm : now);
        const startDate = keyToDate(s.goalSetDate) || new Date();
        const endDate = keyToDate(s.goalDate) || startDate;
        const total = Math.max(1, endDate.getTime() - startDate.getTime());
        const t = Math.max(0, Math.min(1, (Date.now() - startDate.getTime()) / total));
        const expected = start + (s.goalWpm - start) * t;
        const past = Date.now() > endDate.getTime() + 86400000;
        if (roll.runs === 0) return { kind: 'noruns', now, runs: 0, expected };
        return { kind: past ? 'past' : (now + 1 >= expected ? 'ontrack' : 'behind'), now, runs: roll.runs, expected: Math.round(expected) };
    }
    function goalChipText(s = getState()) {
        const st = goalStatus(s);
        switch (st.kind) {
            case 'none': return 'Goal: none yet. Tap to set one.';
            case 'practise': return st.runs > 0 ? `Goal: just practise. Your 7-day average is ${st.now} WPM.` : 'Goal: just practise.';
            case 'reached': return `Goal reached: ${s.goalWpm} WPM. Tap to set a new one.`;
            case 'noruns': return `Goal: ${s.goalWpm} WPM by ${fmtDate(s.goalDate)}. No runs in the last 7 days yet.`;
            case 'past': return `Goal: ${s.goalWpm} WPM by ${fmtDate(s.goalDate)}. You are at ${st.now}, behind. Tap to pick a new date.`;
            case 'behind': return `Goal: ${s.goalWpm} WPM by ${fmtDate(s.goalDate)}. You are at ${st.now}, behind (aim for ${st.expected} this week).`;
            default: return `Goal: ${s.goalWpm} WPM by ${fmtDate(s.goalDate)}. You are at ${st.now}, on track.`;
        }
    }
    function computeDailyGoal(s = getState()) {
        const roll = rollingAverage(7);
        let base = roll.runs > 0 ? roll.avg : (s.placementWpm != null ? s.placementWpm : 0);
        try {
            const log = fn('getDayLog') ? global.getDayLog(todayKey()) : null;
            if (log && log.runs > 0) base = Math.max(base, Math.round(log.sumWpm / log.runs));
        } catch (e) {}
        if (!base) return null;
        let goal = Math.ceil(base + 1.5);
        if (s.goalWpm && goal > s.goalWpm) goal = s.goalWpm;
        return goal;
    }

    // ── Modal ──────────────────────────────────────────────────────────────
    function modalEl() { return document.getElementById('coach-modal'); }
    function isOpen() { const m = modalEl(); return !!(m && m.classList.contains('show')); }
    let onCloseAction = null; // what the X / Escape means for the card on screen

    function renderCard({ title, body, actions = [], step = '', wide = false, onClose = null }) {
        const m = modalEl();
        if (!m) return;
        const titleEl = document.getElementById('coach-modal-title');
        const bodyEl = document.getElementById('coach-modal-body');
        if (titleEl) titleEl.textContent = title || 'Coach';
        if (bodyEl) {
            bodyEl.innerHTML = `${body}${actions.length ? `<div class="coach-actions">${actions.map(a =>
                `<button type="button" class="btn ${a.kind || 'btn-secondary'}" data-coach-action="${esc(a.action)}"${a.id ? ` id="${esc(a.id)}"` : ''}${a.value != null ? ` data-coach-value="${esc(a.value)}"` : ''}>${esc(a.label)}</button>`).join('')}</div>` : ''}`;
        }
        m.dataset.step = step;
        m.classList.toggle('coach-wide', !!wide);
        onCloseAction = onClose;
        if (!isOpen()) {
            if (fn('openModal')) global.openModal(m); else { m.classList.add('show'); m.setAttribute('aria-hidden', 'false'); }
        }
        const primary = m.querySelector('.coach-actions .btn-primary') || m.querySelector('.coach-actions .btn');
        if (primary) { try { primary.focus({ preventScroll: true }); } catch (e) {} }
    }
    function closeCard() {
        const m = modalEl();
        if (!m) return;
        onCloseAction = null;
        if (fn('closeModal')) global.closeModal(m); else { m.classList.remove('show'); m.setAttribute('aria-hidden', 'true'); }
    }
    // The X button and Escape.
    function close() {
        const action = onCloseAction;
        closeCard();
        if (typeof action === 'function') action();
    }

    // ── Finger hint line under the text ────────────────────────────────────
    function hintEl() {
        let el = document.getElementById('coach-finger-hint');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'coach-finger-hint';
        el.className = 'coach-finger-hint';
        el.setAttribute('aria-live', 'polite');
        el.hidden = true;
        // Top of the typing area, so it is on screen while the player reads the text.
        const area = document.getElementById('typing-area');
        if (area) area.insertBefore(el, area.firstChild);
        return el;
    }
    function showHint(html) { const el = hintEl(); el.innerHTML = html; el.hidden = false; }
    function hideHint() { const el = document.getElementById('coach-finger-hint'); if (el) { el.hidden = true; el.innerHTML = ''; } }

    // ── Sessions (first run and weekly lesson) ─────────────────────────────
    let session = null;
    function sessionActive() { return !!(session && session.active); }

    function newSession(kind) {
        return { kind, active: true, phase: '', drillIndex: 0, drillKeys: [], drillResults: [], savedOptions: null, effectsWereOn: false };
    }
    function endSession() {
        if (!session) return;
        restorePlacementSetup();
        session.active = false;
        session = null;
        hideHint();
        try { if (global.AdaptivePractice && typeof global.AdaptivePractice.setFocusKeys === 'function') global.AdaptivePractice.setFocusKeys([]); } catch (e) {}
    }

    // Timed, 30 seconds, common words, no punctuation or numbers, effects off.
    function applyPlacementSetup() {
        if (!session) return;
        const get = fn('getEngineOption');
        if (get) session.savedOptions = { time: get('time'), punctuation: get('punctuation'), numbers: get('numbers'), wordList: get('wordList') };
        const set = fn('setEngineOption');
        if (set) {
            set('time', PLACEMENT_SECONDS, { restart: false });
            set('punctuation', false, { restart: false });
            set('numbers', false, { restart: false });
            set('wordList', 'common', { restart: false });
        }
        if (global.miningVisualsEnabled === true && fn('toggleMiningVisuals')) { session.effectsWereOn = true; call('toggleMiningVisuals'); }
    }
    function restorePlacementSetup() {
        if (!session) return;
        const set = fn('setEngineOption');
        if (set && session.savedOptions) {
            for (const name of Object.keys(session.savedOptions)) set(name, session.savedOptions[name], { restart: false });
            session.savedOptions = null;
        }
        if (session.effectsWereOn && global.miningVisualsEnabled === false && fn('toggleMiningVisuals')) call('toggleMiningVisuals');
        session.effectsWereOn = false;
    }

    function focusTyping() {
        setTimeout(() => { if (fn('focusInput')) { try { global.focusInput(); } catch (e) {} } }, 60);
    }

    // ── First-run flow ─────────────────────────────────────────────────────
    function startFirstRun({ from = 'intro' } = {}) {
        session = newSession('firstrun');
        patch({ step: from });
        if (from === 'placement') startPlacement();
        else showIntro();
    }

    function skipFlow() {
        patch({ skipped: true, step: 'done' });
        const mode = global.currentMode;
        endSession();
        closeCard();
        if (mode === 'words30' || mode === 'adaptive') call('setMode', 'words');
        call('showUiMessage', 'No problem. The Coach button in Settings brings this back any time.', 'info', 3200);
    }

    function showIntro() {
        session.phase = 'intro';
        renderCard({
            step: 'intro',
            title: 'Welcome. Let’s see how fast you type.',
            body: `<p class="coach-lead">A 30-second typing test sets your starting point. Then you pick a goal and do three short drills on the letters that slow you down.</p>
                <p class="coach-muted">The whole thing takes about five minutes. You can skip it and come back from Settings later.</p>`,
            actions: [
                { label: 'Start the 30-second test', action: 'placement', kind: 'btn-primary', id: 'coach-start-placement' },
                { label: 'Skip, I just want to type', action: 'skip', kind: 'btn-ghost', id: 'coach-skip' },
            ],
            onClose: skipFlow,
        });
    }

    function startPlacement() {
        session.phase = 'placement';
        patch({ step: 'placement' });
        closeCard();
        applyPlacementSetup();
        call('setMode', 'words30');
        showHint('<strong>Placement test.</strong> Type for 30 seconds. Mistakes are fine; just keep going.');
        focusTyping();
    }

    function onPlacementFinished(run) {
        const wpm = Math.max(0, Math.round(Number(run.wpm) || 0));
        const acc = Math.max(0, Math.min(100, Math.round(Number(run.accuracy) || 0)));
        const weak = rankWeakLetters(3, 3);
        restorePlacementSetup();
        hideHint();
        patch({ placementWpm: wpm, placementAccuracy: acc, placementDate: todayKey(), weakKeys: weak, step: 'result' });
        session.phase = 'result';
        setTimeout(() => { call('closeResults'); showPlacementResult(wpm, acc, weak); }, 40);
    }

    function showPlacementResult(wpm, acc, weak, { inFlow = true } = {}) {
        const slow = weak && weak.length ? `Your slowest letters: ${weak.join(', ')}.` : 'We will find your slow letters as you type more.';
        renderCard({
            step: 'result',
            title: inFlow ? 'Your starting point' : 'Your new starting point',
            body: `<p class="coach-big" id="coach-placement-line">${wpm} WPM, ${acc}% accurate.</p>
                <p class="coach-lead">Most adults type 35 to 45. ${esc(slow)}</p>
                <p class="coach-muted">${inFlow ? 'Next, pick a goal. A goal with a date is what keeps people coming back.' : 'Your goal chip now measures from this result.'}</p>`,
            actions: inFlow
                ? [{ label: 'Pick a goal', action: 'goal', kind: 'btn-primary', id: 'coach-pick-goal' }]
                : [{ label: 'Change goal', action: 'goalpicker', kind: 'btn-primary', id: 'coach-pick-goal' }, { label: 'Close', action: 'close', kind: 'btn-ghost' }],
            onClose: inFlow ? skipFlow : null,
        });
    }

    function goalOptions(s = getState()) {
        const p = s.placementWpm != null ? s.placementWpm : 35;
        const a = Math.max(45, round5(p + 8));
        const b = Math.max(55, round5(p + 18), a + 10);
        return [
            { wpm: a, weeks: 4, label: `${a} WPM in 4 weeks` },
            { wpm: b, weeks: 8, label: `${b} WPM in 8 weeks` },
            { wpm: 0, weeks: 0, label: 'Just practise' },
        ];
    }

    function showGoalPicker({ inFlow = true } = {}) {
        if (session) session.phase = 'goal';
        const opts = goalOptions();
        renderCard({
            step: 'goal',
            title: 'Pick a goal',
            body: `<p class="coach-lead">${inFlow ? 'Where do you want to be?' : 'Change your goal. The chip in the goals strip tracks it.'} Most people gain 5 to 10 WPM a month with a few minutes of practice a day.</p>`,
            actions: opts.map((o, i) => ({ label: o.label, action: 'setgoal', value: i, kind: i === 0 ? 'btn-primary' : 'btn-secondary', id: `coach-goal-${i}` })),
            onClose: inFlow ? skipFlow : null,
        });
    }

    function applyGoal(index) {
        const o = goalOptions()[Number(index)] || goalOptions()[2];
        const s = getState();
        const start = rollingAverage(7).runs > 0 ? rollingAverage(7).avg : (s.placementWpm != null ? s.placementWpm : null);
        if (o.wpm > 0) {
            patch({ goalWpm: o.wpm, goalDate: addDays(todayKey(), o.weeks * 7), goalLabel: o.label, goalStartWpm: start, goalSetDate: todayKey() });
        } else {
            patch({ goalWpm: null, goalDate: '', goalLabel: 'practise', goalStartWpm: start, goalSetDate: todayKey() });
        }
        renderGoalChip();
        if (sessionActive() && session.kind === 'firstrun') afterGoalPicked();
        else {
            closeCard();
            call('showUiMessage', o.wpm > 0 ? `Goal set: ${o.wpm} WPM by ${fmtDate(getState().goalDate)}.` : 'Goal set: just practise.', 'success', 2600);
        }
    }

    function needsFingerMap(s = getState()) {
        return (s.placementWpm != null && s.placementWpm < 40) || (s.placementAccuracy != null && s.placementAccuracy < 95);
    }
    function afterGoalPicked() {
        if (needsFingerMap()) showFingerMap({ inFlow: true });
        else startDrillSession('firstrun');
    }

    // ── Finger map screen ──────────────────────────────────────────────────
    let fingerMapSvg = null;
    function loadFingerMapSvg() {
        if (fingerMapSvg) return Promise.resolve(fingerMapSvg);
        return fetch(FINGER_MAP_URL).then(r => (r.ok ? r.text() : Promise.reject(new Error('no svg'))))
            .then(text => { if (/^\s*<svg/i.test(text)) { fingerMapSvg = text; return text; } throw new Error('bad svg'); })
            .catch(() => '');
    }
    function fingerMapFallback() {
        const row = (keys) => keys.map(k => `<span class="coach-keycap" data-key="${esc(k)}">${esc(k)}</span>`).join('');
        return `<div class="coach-keyrows" aria-label="Keyboard rows">
            <div class="coach-keyrow">${row('qwertyuiop'.split(''))}</div>
            <div class="coach-keyrow coach-keyrow-home">${row('asdfghjkl;'.split(''))}</div>
            <div class="coach-keyrow">${row('zxcvbnm,./'.split(''))}</div>
        </div>`;
    }
    function showFingerMap({ inFlow = false } = {}) {
        if (session) session.phase = 'fingers';
        const s = getState();
        const weak = (s.weakKeys && s.weakKeys.length ? s.weakKeys : getWeakKeys(3)).slice(0, 3);
        const weakLine = weak.length ? `Your slow letters glow on the map: ${weak.map(k => `<strong>${esc(fingerHint(k))}</strong>`).join('; ')}.` : '';
        renderCard({
            step: 'fingers',
            wide: true,
            title: 'Where your fingers go',
            body: `<div class="coach-finger-map" id="coach-finger-map">${fingerMapFallback()}</div>
                <p class="coach-lead">Rest your fingers on the <strong>home row</strong>: left hand on A S D F, right hand on J K L ;. The little bumps on F and J tell you where you are without looking.</p>
                <p class="coach-muted">Each colour is one finger. Every key is pressed by the finger whose colour it has, and your hand returns to the home row after each press. ${weakLine}</p>`,
            actions: inFlow
                ? [{ label: 'Got it', action: 'fingersdone', kind: 'btn-primary', id: 'coach-fingers-ok' }, { label: 'Skip, I touch-type', action: 'fingersdone', kind: 'btn-ghost', id: 'coach-fingers-skip' }]
                : [{ label: 'Close', action: 'close', kind: 'btn-primary' }],
            onClose: inFlow ? skipFlow : null,
        });
        patch({ fingerMapSeen: true });
        loadFingerMapSvg().then(svg => {
            const host = document.getElementById('coach-finger-map');
            if (!host || !svg) return;
            host.innerHTML = svg;
            weak.forEach(k => {
                const key = host.querySelector(`[data-key="${CSS.escape(k)}"] .key`);
                if (key) key.classList.add('is-focus');
            });
        });
    }

    // ── Drills ─────────────────────────────────────────────────────────────
    function startDrillSession(kind) {
        if (!session || session.kind !== kind) session = newSession(kind);
        session.drillIndex = 0;
        session.drillResults = [];
        session.drillKeys = getWeakKeys(DRILLS_PER_SESSION);
        startDrill(0);
    }

    function startDrill(index) {
        session.phase = 'drill';
        session.drillIndex = index;
        const key = session.drillKeys[index] || session.drillKeys[0] || 'p';
        if (session.kind === 'firstrun') patch({ step: `drill${index + 1}` });
        closeCard();
        const AP = global.AdaptivePractice;
        try { if (AP && typeof AP.setFocusKeys === 'function') AP.setFocusKeys([key]); } catch (e) {}
        global.adaptiveFocusKeys = [key];
        call('setMode', 'adaptive');
        // A one-minute drill: shorter than the default weak-key text.
        try {
            if (AP && typeof AP.generateDrill === 'function' && fn('init') && Array.isArray(global.WORD_LIST)) {
                const text = AP.generateDrill({ wordCount: DRILL_WORDS, wordPool: global.WORD_LIST });
                if (text) global.init(text, `Drill ${index + 1} of ${DRILLS_PER_SESSION}: the letter ${key}`);
            }
        } catch (e) {}
        showHint(`<span class="coach-hint-step">Drill ${index + 1} of ${DRILLS_PER_SESSION}.</span> Focus letter <strong class="coach-hint-key">${esc(fingerHint(key))}</strong>. Keep the other fingers on the home row.`);
        focusTyping();
    }

    function onDrillFinished(run) {
        const wpm = Math.max(0, Math.round(Number(run.wpm) || 0));
        const acc = Math.max(0, Math.min(100, Math.round(Number(run.accuracy) || 0)));
        const i = session.drillIndex;
        const key = session.drillKeys[i] || '';
        session.drillResults.push({ key, wpm, acc });
        hideHint();
        if (session.kind === 'firstrun') patch({ drillResults: session.drillResults.slice() });
        session.phase = 'drillnote';
        setTimeout(() => { call('closeResults'); showDrillNote(i, wpm, acc); }, 40);
    }

    function improvementNote(i, wpm, acc) {
        const s = getState();
        const prev = session.drillResults[i - 1];
        if (i === 0) {
            const base = session.kind === 'firstrun' && s.placementWpm != null ? s.placementWpm : rollingAverage(7).avg;
            if (!base) return `${wpm} WPM at ${acc}%. A good first drill.`;
            const d = wpm - base;
            if (d >= 2) return `${wpm} WPM at ${acc}%. That is ${d} WPM faster than your usual pace, on your hardest letters.`;
            if (d <= -2) return `${wpm} WPM at ${acc}%. A bit under your usual ${base}, which is normal for a drill on hard letters.`;
            return `${wpm} WPM at ${acc}%. About your usual pace, on your hardest letters.`;
        }
        const dw = wpm - prev.wpm;
        const da = acc - prev.acc;
        if (da >= 2) return `${wpm} WPM at ${acc}%. Accuracy up ${da} points on the last drill. That is the number that matters most.`;
        if (dw >= 2) return `${wpm} WPM at ${acc}%. Up ${dw} WPM on the last drill.`;
        if (dw <= -2) return `${wpm} WPM at ${acc}%. A touch slower than the last drill. Slow is fine while a new finger learns the key.`;
        return `${wpm} WPM at ${acc}%. Steady. Each pass makes the move more automatic.`;
    }

    function showDrillNote(i, wpm, acc) {
        const last = i >= DRILLS_PER_SESSION - 1;
        const key = session.drillKeys[i] || '';
        renderCard({
            step: 'drillnote',
            title: `Drill ${i + 1} of ${DRILLS_PER_SESSION} done`,
            body: `<p class="coach-lead" id="coach-drill-note">${esc(improvementNote(i, wpm, acc))}</p>
                <p class="coach-muted">Letter drilled: <strong>${esc(fingerHint(key))}</strong>.${last ? '' : ` Next up: <strong>${esc(fingerHint(session.drillKeys[i + 1] || ''))}</strong>.`}</p>`,
            actions: [{ label: last ? 'What’s next' : 'Next drill', action: last ? 'drillsdone' : 'nextdrill', kind: 'btn-primary', id: last ? 'coach-drills-done' : 'coach-next-drill' }],
            onClose: session.kind === 'firstrun' ? skipFlow : () => finishLesson(),
        });
    }

    function afterDrills() {
        if (!session) return;
        if (session.kind === 'firstrun') showHandoff();
        else finishLesson();
    }

    // ── Hand-off, first normal run, save prompt ────────────────────────────
    function showHandoff() {
        session.phase = 'handoff';
        patch({ step: 'handoff' });
        const s = getState();
        const goalLine = s.goalWpm
            ? `Your goal is <strong>${s.goalWpm} WPM by ${esc(fmtDate(s.goalDate))}</strong>. The Goal chip in that strip tells you if you are on track.`
            : 'You chose to just practise. The Goal chip in that strip shows your 7-day average.';
        renderCard({
            step: 'handoff',
            title: 'You’re set up',
            body: `<ul class="coach-list">
                <li><strong>Today’s goals.</strong> The strip under the mode tabs lists three small goals each day. Finish them for extra XP. ${goalLine}</li>
                <li><strong>Pace marker.</strong> On your next normal run a marker moves through the text at your best pace on that text, so you can race yourself.</li>
                <li><strong>Weak keys.</strong> The Weak keys tab builds drills from your slowest letters. The Challenges tab has a short lesson each week.</li>
            </ul>`,
            actions: [{ label: 'Start a normal run', action: 'firstrun', kind: 'btn-primary', id: 'coach-first-run' }],
            onClose: skipFlow,
        });
    }

    function startFirstNormalRun() {
        session.phase = 'firstrun';
        patch({ step: 'firstrun' });
        closeCard();
        if (global.ghostCursorEnabled === false && fn('toggleGhostCursor')) call('toggleGhostCursor');
        call('setMode', 'words');
        showHint('<strong>Normal run.</strong> The pace marker shows your best pace on this text once you have typed it before.');
        focusTyping();
    }

    function onFirstNormalRunFinished(run) {
        const wpm = Math.max(0, Math.round(Number(run.wpm) || 0));
        hideHint();
        patch({ firstRunDone: true, step: 'done' });
        const guest = isGuest();
        session.phase = 'save';
        if (!guest) {
            endSession();
            call('showUiMessage', 'All set. Your goal chip is in the Today’s goals strip.', 'success', 3200);
            return;
        }
        setTimeout(() => showSavePrompt(wpm), 900);
    }

    function showSavePrompt(wpm) {
        const streak = Number(call('getEffectiveStreak')) || 1;
        renderCard({
            step: 'save',
            title: `Save your ${wpm} WPM and your streak`,
            body: `<p class="coach-lead">Right now your progress lives only in this browser. A free account keeps your scores, goal and ${streak}-day streak on any device, and puts you on the leaderboards.</p>
                <p class="coach-muted">No email needed. Just a username and a password.</p>`,
            actions: [
                { label: 'Create account', action: 'signup', kind: 'btn-primary', id: 'coach-signup' },
                { label: 'Later', action: 'later', kind: 'btn-ghost', id: 'coach-later' },
            ],
            onClose: () => endSession(),
        });
    }

    // ── Weekly lesson ──────────────────────────────────────────────────────
    function weekKey() { return call('getWeekKey') || todayKey(); }
    function lessonDoneThisWeek() { return getState().lessonWeek === weekKey(); }

    function startLesson() {
        if (sessionActive() && session.kind === 'firstrun') return;
        closeCard();
        session = newSession('lesson');
        startDrillSession('lesson');
    }

    function finishLesson() {
        if (!session || session.kind !== 'lesson') return;
        const res = session.drillResults;
        const keys = session.drillKeys.slice();
        const n = res.length;
        const avgWpm = n ? Math.round(res.reduce((a, r) => a + r.wpm, 0) / n) : 0;
        const avgAcc = n ? Math.round(res.reduce((a, r) => a + r.acc, 0) / n) : 0;
        let xpLine = '';
        if (n >= DRILLS_PER_SESSION && !lessonDoneThisWeek()) {
            patch({ lessonWeek: weekKey() });
            if (fn('addXP')) { call('addXP', LESSON_XP); xpLine = ` +${LESSON_XP} XP for finishing this week’s lesson.`; }
        }
        endSession();
        if (n === 0) { call('setMode', 'daily'); return; }
        renderCard({
            step: 'lessondone',
            title: n >= DRILLS_PER_SESSION ? 'Lesson done' : 'Lesson stopped',
            body: `<p class="coach-lead" id="coach-lesson-summary">${n} drill${n === 1 ? '' : 's'} on ${esc(listLetters(keys.slice(0, n)))}: ${avgWpm} WPM at ${avgAcc}% on average.${esc(xpLine)}</p>
                <p class="coach-muted">Weak keys change as you improve. The Weak keys tab always has a fresh drill, and a new lesson is ready each week.</p>`,
            actions: [{ label: 'Back to Challenges', action: 'tochallenges', kind: 'btn-primary' }, { label: 'Keep typing', action: 'close', kind: 'btn-ghost' }],
            onClose: null,
        });
    }

    function renderLessonCard() {
        const panel = document.getElementById('challenge-panel');
        if (!panel) return;
        let card = document.getElementById('coach-lesson-card');
        const keys = getWeakKeys(3);
        const done = lessonDoneThisWeek();
        const html = `<div class="coach-lesson-left">
                <div class="coach-lesson-title">This week’s lesson <span class="coach-lesson-xp">+${LESSON_XP} XP</span></div>
                <div class="coach-lesson-desc">Three short drills on your weak keys (${esc(keys.join(', '))}) with a finger hint under the text. About three minutes.</div>
            </div>
            <div class="coach-lesson-right">${done ? '<span class="coach-lesson-done">Done this week</span>' : ''}<button type="button" class="btn ${done ? 'btn-ghost' : 'btn-primary'}" id="coach-lesson-btn" data-coach-action="lesson">${done ? 'Do it again' : 'Start lesson'}</button></div>`;
        if (!card) {
            card = document.createElement('div');
            card.id = 'coach-lesson-card';
            card.className = 'coach-lesson-card panel';
            panel.insertBefore(card, panel.firstChild);
        } else if (card.parentNode !== panel || panel.firstChild !== card) {
            panel.insertBefore(card, panel.firstChild);
        }
        if (card.innerHTML !== html) card.innerHTML = html;
    }

    // ── Goal chip ──────────────────────────────────────────────────────────
    function renderGoalChip() {
        const host = document.getElementById('goals-strip');
        if (!host) return;
        if (!host.firstElementChild) return; // strip not rendered yet
        const head = host.querySelector('.goals-strip-head') || host;
        let chip = document.getElementById('coach-goal-chip');
        const s = getState();
        const st = goalStatus(s);
        const text = goalChipText(s);
        if (!chip) {
            chip = document.createElement('button');
            chip.type = 'button';
            chip.id = 'coach-goal-chip';
            chip.className = 'coach-goal-chip';
            chip.setAttribute('data-coach-action', 'goalmenu');
            chip.title = 'Your speed goal. Tap to change it.';
        }
        if (chip.parentNode !== head) head.appendChild(chip);
        if (chip.dataset.status !== st.kind) chip.dataset.status = st.kind;
        if (chip.textContent !== text) chip.textContent = text;
    }

    // ── Results tip (accuracy under 90%) ───────────────────────────────────
    function renderResultTip(run) {
        const rewards = document.getElementById('result-rewards');
        if (!rewards || !rewards.parentNode) return;
        let tip = document.getElementById('coach-result-tip');
        const acc = Number(run.accuracy) || 0;
        if (!run.counted || acc >= 90) { if (tip) tip.remove(); return; }
        if (!tip) {
            tip = document.createElement('div');
            tip.id = 'coach-result-tip';
            tip.className = 'coach-result-tip';
        }
        if (tip.previousElementSibling !== rewards) rewards.parentNode.insertBefore(tip, rewards.nextSibling);
        const missed = mostMissedKey();
        const missedLine = missed ? ` You miss <strong>${esc(missed)}</strong> most often; that is your ${esc(fingerFor(missed))}.` : '';
        tip.innerHTML = `<span class="coach-tip-label">Coach tip</span> ${acc}% accuracy. Slow down a touch until you are above 95%; speed built on accuracy sticks, speed built on guesses does not.${missedLine}`;
    }

    // ── Daily close-out ────────────────────────────────────────────────────
    function maybeCloseout(run) {
        if (!run.counted || sessionActive() || !autoAllowed()) return;
        const s = getState();
        const today = todayKey();
        if (s.closeoutDate === today) return;
        let runs = 0;
        try { const log = fn('getDayLog') ? global.getDayLog(today) : null; runs = log ? Number(log.runs) || 0 : 0; } catch (e) { runs = 0; }
        if (runs < 3) return;
        const streak = Math.max(1, Number(call('getEffectiveStreak')) || 1);
        const mult = Number(call('getXPMultiplier', streak + 1)) || 1;
        const multText = `${Number(mult).toFixed(2).replace(/\.?0+$/, '')}x`;
        const tomorrow = computeDailyGoal(s);
        patch({ closeoutDate: today, dailyGoalWpm: tomorrow });
        // Never cover the results card: wait until the player closes it, then show the close-out.
        const showCloseout = () => renderCard({
                step: 'closeout',
                title: `Day ${streak} done`,
                body: `<p class="coach-lead" id="coach-closeout-line">Come back tomorrow for ${multText} XP.${tomorrow ? ` Tomorrow’s goal: ${tomorrow} WPM.` : ''}</p>
                    <p class="coach-muted">${streak >= 5 ? 'You are on the top streak bonus. Keep it.' : 'One counted run a day keeps the streak and raises the bonus.'}</p>`,
                actions: [{ label: 'Got it', action: 'close', kind: 'btn-primary', id: 'coach-closeout-ok' }],
                onClose: null,
            });
        const overlay = document.getElementById('result-overlay');
        if (overlay && overlay.classList.contains('show') && typeof MutationObserver === 'function') {
            const mo = new MutationObserver(() => {
                if (overlay.classList.contains('show')) return;
                mo.disconnect();
                setTimeout(showCloseout, 350);
            });
            mo.observe(overlay, { attributes: true, attributeFilter: ['class'] });
        } else {
            setTimeout(showCloseout, 900);
        }
    }

    // ── Coach menu (from Settings) ─────────────────────────────────────────
    function openMenu() {
        call('closeSettingsPanel');
        const s = getState();
        const st = goalStatus(s);
        const placement = s.placementWpm != null ? `Your placement test: ${s.placementWpm} WPM at ${s.placementAccuracy}% on ${fmtDate(s.placementDate)}.` : 'You have not done the 30-second placement test yet.';
        const goal = s.goalWpm ? goalChipText(s) : (s.goalLabel === 'practise' ? 'Goal: just practise.' : 'No goal set yet.');
        const avg = st.runs > 0 ? ` Your 7-day average is ${st.now} WPM over ${st.runs} run${st.runs === 1 ? '' : 's'}.` : '';
        renderCard({
            step: 'menu',
            title: 'Coach',
            body: `<p class="coach-lead">${esc(placement)}</p><p class="coach-muted">${esc(goal)}${esc(avg)}</p>`,
            actions: [
                { label: s.placementWpm != null ? 'Redo the 30-second test' : 'Do the 30-second test', action: 'redo', kind: 'btn-primary', id: 'coach-menu-redo' },
                { label: 'Change goal', action: 'goalpicker', kind: 'btn-secondary', id: 'coach-menu-goal' },
                { label: 'Show the finger map', action: 'fingers', kind: 'btn-secondary', id: 'coach-menu-fingers' },
                { label: 'Start a weak-key lesson', action: 'lesson', kind: 'btn-secondary', id: 'coach-menu-lesson' },
            ],
            onClose: null,
        });
    }

    function addSettingsButton() {
        if (document.getElementById('coach-open-btn')) return;
        const help = Array.from(document.querySelectorAll('#settings-panel button')).find(b => /openHelpModal/.test(b.getAttribute('onclick') || ''));
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary';
        btn.id = 'coach-open-btn';
        btn.setAttribute('data-coach-action', 'menu');
        btn.textContent = 'Coach';
        if (help && help.parentNode) help.parentNode.insertBefore(btn, help.nextSibling);
        else { const slot = document.getElementById('settings-engine-slot'); if (slot) slot.appendChild(btn); }
    }

    // ── Actions (one delegated click handler) ──────────────────────────────
    function handleAction(action, value) {
        switch (action) {
            case 'placement':
                if (!sessionActive()) session = newSession('firstrun');
                startPlacement();
                break;
            case 'skip': skipFlow(); break;
            case 'goal': showGoalPicker({ inFlow: true }); break;
            case 'setgoal': applyGoal(value); break;
            case 'goalpicker': showGoalPicker({ inFlow: false }); break;
            case 'goalmenu': showGoalPicker({ inFlow: false }); break;
            case 'fingersdone': startDrillSession('firstrun'); break;
            case 'fingers': showFingerMap({ inFlow: false }); break;
            case 'nextdrill': startDrill(session.drillIndex + 1); break;
            case 'drillsdone': afterDrills(); break;
            case 'firstrun': startFirstNormalRun(); break;
            case 'signup': endSession(); closeCard(); call('openSignupModal'); break;
            case 'later': endSession(); closeCard(); call('showUiMessage', 'You can create an account any time from the Profile button.', 'info', 3000); break;
            case 'lesson': startLesson(); break;
            case 'tochallenges': closeCard(); call('setMode', 'daily'); break;
            case 'menu': openMenu(); break;
            case 'redo':
                session = newSession('firstrun');
                session.redo = true;
                startPlacement();
                break;
            case 'close': close(); break;
            default: break;
        }
    }

    document.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('[data-coach-action]') : null;
        if (!btn) return;
        e.preventDefault();
        handleAction(btn.getAttribute('data-coach-action'), btn.getAttribute('data-coach-value'));
    });

    // ── Run finished ───────────────────────────────────────────────────────
    function onRunFinished(e) {
        const run = (e && e.detail) || global.lastRunSummary || {};
        if (sessionActive()) {
            if (session.phase === 'placement') {
                if (session.redo) {
                    // Redo from the Coach menu: record the new placement, then stop.
                    const wpm = Math.round(Number(run.wpm) || 0);
                    const acc = Math.round(Number(run.accuracy) || 0);
                    const weak = rankWeakLetters(3, 3);
                    restorePlacementSetup();
                    hideHint();
                    patch({ placementWpm: wpm, placementAccuracy: acc, placementDate: todayKey(), weakKeys: weak.length ? weak : getState().weakKeys, goalStartWpm: wpm, goalSetDate: todayKey() });
                    endSession();
                    renderGoalChip();
                    setTimeout(() => { call('closeResults'); showPlacementResult(wpm, acc, weak, { inFlow: false }); }, 40);
                    return;
                }
                onPlacementFinished(run);
                return;
            }
            if (session.phase === 'drill') { onDrillFinished(run); return; }
            if (session.phase === 'firstrun') { onFirstNormalRunFinished(run); renderResultTip(run); return; }
        }
        renderResultTip(run);
        renderGoalChip();
        maybeCloseout(run);
    }
    document.addEventListener('typemine:run-finished', onRunFinished);

    // ── Keep the chip and lesson card in place when other code re-renders ──
    function observe(id, render) {
        const host = document.getElementById(id);
        if (!host) return;
        try {
            new MutationObserver(() => {
                if (observe.busy) return;
                observe.busy = true;
                try { render(); } finally { observe.busy = false; }
            }).observe(host, { childList: true });
        } catch (e) {}
        render();
    }

    // ── Trigger: the splash goes away ──────────────────────────────────────
    function watchSplash() {
        const splash = document.getElementById('entry-splash');
        if (!splash) return;
        let fired = false;
        const check = () => {
            if (fired || !splash.classList.contains('hidden')) return;
            fired = true;
            if (!shouldAutoStart()) return;
            setTimeout(() => { if (!isReturningPlayer() && !isOpen()) startFirstRun(); }, 420);
        };
        try { new MutationObserver(check).observe(splash, { attributes: true, attributeFilter: ['class'] }); } catch (e) {}
        check();
    }

    function boot() {
        const m = modalEl();
        if (m) {
            m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
            m.addEventListener('click', (e) => { if (e.target === m && !sessionActive()) close(); });
        }
        addSettingsButton();
        observe('goals-strip', renderGoalChip);
        observe('challenge-panel', renderLessonCard);
        watchSplash();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    global.Coach = {
        startFirstRun, skip: skipFlow, openMenu, close, startLesson,
        showGoalPicker: () => showGoalPicker({ inFlow: false }),
        showFingerMap: () => showFingerMap({ inFlow: false }),
        fingerFor, fingerHint, getWeakKeys, goalChipText, goalStatus, rollingAverage, computeDailyGoal,
        getState, shouldAutoStart, isReturningPlayer,
        renderGoalChip, renderLessonCard,
        _session: () => session,
    };
})(typeof window !== 'undefined' ? window : globalThis);
