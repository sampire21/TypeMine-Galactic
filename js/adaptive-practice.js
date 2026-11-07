(function attachAdaptivePractice(global) {
    'use strict';

    const STORAGE_KEY = 'sampire-adaptive-stats-v1';
    const MAX_GAP_MS = 2000;
    const EMA_ALPHA = 0.15;
    const MIN_KEY_SAMPLES = 8;
    const MIN_BIGRAM_SAMPLES = 5;
    const SAVE_DEBOUNCE_MS = 750;
    const RANDOM_FRACTION = 0.3;
    const MAX_BIGRAMS = 1500;

    let stats = { keys: {}, bigrams: {}, total: 0 };
    let saveTimer = null;

    function storage() {
        try { return global.localStorage || null; } catch (e) { return null; }
    }

    function load() {
        const ls = storage();
        if (!ls) return;
        try {
            const raw = ls.getItem(STORAGE_KEY);
            if (!raw) return;
            const p = JSON.parse(raw);
            if (p && typeof p === 'object') {
                stats = {
                    keys: p.keys && typeof p.keys === 'object' ? p.keys : {},
                    bigrams: p.bigrams && typeof p.bigrams === 'object' ? p.bigrams : {},
                    total: Number(p.total) || 0,
                };
            }
        } catch (e) { /* corrupt data: start fresh */ }
    }

    function saveNow() {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        const ls = storage();
        if (!ls) return;
        try {
            pruneBigrams();
            ls.setItem(STORAGE_KEY, JSON.stringify(stats));
        } catch (e) { /* quota or private mode */ }
    }

    function scheduleSave() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, SAVE_DEBOUNCE_MS);
    }

    function pruneBigrams() {
        const keys = Object.keys(stats.bigrams);
        if (keys.length <= MAX_BIGRAMS) return;
        keys.sort((a, b) => stats.bigrams[a].n - stats.bigrams[b].n);
        for (let i = 0; i < keys.length - MAX_BIGRAMS; i++) delete stats.bigrams[keys[i]];
    }

    function bump(map, id, wrong, ms) {
        let s = map[id];
        if (!s) s = map[id] = { n: 0, err: 0, ema: 0, timed: 0 };
        s.n++;
        if (wrong) s.err++;
        if (ms != null) {
            s.ema = s.timed === 0 ? ms : s.ema + EMA_ALPHA * (ms - s.ema);
            s.timed++;
        }
    }


    function recordKeystroke(info) {
        if (!info) return;
        const expected = typeof info.expected === 'string' ? info.expected.toLowerCase() : '';
        if (expected.length !== 1) return;
        const typed = typeof info.typed === 'string' ? info.typed.toLowerCase() : '';
        const wrong = typed !== expected;
        const gap = Number(info.msSincePrev);
        const ms = Number.isFinite(gap) && gap > 0 && gap <= MAX_GAP_MS ? gap : null;
        bump(stats.keys, expected, wrong, ms);
        stats.total++;
        const prev = typeof info.prevChar === 'string' ? info.prevChar.toLowerCase() : '';
        if (prev.length === 1 && prev !== ' ' && expected !== ' ') {
            bump(stats.bigrams, prev + expected, wrong, ms);
        }
        scheduleSave();
    }

    function commitRun() { saveNow(); }

    function median(arr) {
        if (!arr.length) return 0;
        const a = arr.slice().sort((x, y) => x - y);
        const m = a.length >> 1;
        return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    }

    function rank(map, minSamples, n, lettersOnly) {
        const ids = Object.keys(map).filter(id => map[id].n >= minSamples &&
            (!lettersOnly || /^[a-z]+$/.test(id)));
        const med = median(ids.filter(id => map[id].timed > 0).map(id => map[id].ema)) || 1;
        return ids.map(id => {
            const s = map[id];
            const errRate = s.err / s.n;
            const slow = s.timed > 0 ? Math.max(0, s.ema / med - 1) : 0;
            return { id, score: errRate * 4 + Math.min(slow, 2), errRate, ms: s.ema, n: s.n };
        }).filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, Math.max(0, n | 0));
    }

    function getWeakKeys(n = 5) {
        return rank(stats.keys, MIN_KEY_SAMPLES, n, true).map(r => r.id);
    }

    function getWeakBigrams(n = 5) {
        return rank(stats.bigrams, MIN_BIGRAM_SAMPLES, n, true).map(r => r.id);
    }

    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function generateDrill(opts) {
        const o = opts || {};
        const wordCount = Math.max(1, Number(o.wordCount) || 30);
        const pool = Array.isArray(o.wordPool)
            ? o.wordPool.filter(w => typeof w === 'string' && /^[a-z]+$/i.test(w)).map(w => w.toLowerCase())
            : [];
        if (!pool.length) return '';

        // Difficulty unlock: longer words become available as data accumulates.
        const maxLen = stats.total < 200 ? 5 : stats.total < 800 ? 7 : stats.total < 2000 ? 9 : 99;
        let eligible = pool.filter(w => w.length <= maxLen);
        if (eligible.length < 20) eligible = pool;

        const keys = getWeakKeys(6);
        const bigrams = getWeakBigrams(6);
        const targets = keys.length + bigrams.length;
        const out = [];
        let weighted = [];
        if (targets) {
            weighted = eligible.map(w => {
                let s = 0;
                bigrams.forEach(b => { if (w.indexOf(b) !== -1) s += 3; });
                keys.forEach(k => { if (w.indexOf(k) !== -1) s += 1; });
                return { w, s };
            }).filter(x => x.s > 0);
        }
        for (let i = 0; i < wordCount; i++) {
            const prev = out[out.length - 1];
            let word;
            if (weighted.length && Math.random() >= RANDOM_FRACTION) {
                const total = weighted.reduce((a, x) => a + x.s, 0);
                let r = Math.random() * total;
                word = weighted[weighted.length - 1].w;
                for (const x of weighted) { r -= x.s; if (r <= 0) { word = x.w; break; } }
            } else {
                word = pick(eligible);
            }
            if (word === prev && eligible.length > 1) word = pick(eligible);
            out.push(word);
        }
        return out.join(' ');
    }

    function getKeyHeatmap() {
        const out = {};
        Object.keys(stats.keys).forEach(c => {
            const s = stats.keys[c];
            if (!s.n) return;
            out[c] = {
                accuracy: Math.round((1 - s.err / s.n) * 1000) / 10,
                avgMs: s.timed ? Math.round(s.ema) : null,
                samples: s.n,
            };
        });
        return out;
    }

    function reset() {
        stats = { keys: {}, bigrams: {}, total: 0 };
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        const ls = storage();
        try { if (ls) ls.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    }

    load();

    global.AdaptivePractice = {
        recordKeystroke, commitRun, getWeakKeys, getWeakBigrams,
        generateDrill, getKeyHeatmap, reset,
    };
})(typeof window !== 'undefined' ? window : globalThis);
