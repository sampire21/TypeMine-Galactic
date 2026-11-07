/* TypeMine Galactic - Run Analysis and Live Ghost Delta.
 * Plain browser JS. Exposes window.RunAnalysis (and module.exports under node).
 * Timeline shape (from index.html): [{ t: seconds, index: charsTyped }, ...]
 * ghostDelta sign convention: deltaMs > 0 means ahead of the ghost. */
(function (root) {
    'use strict';

    var OPEN_KEY = 'sampire-run-analysis-open';
    var ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

    // ---------- pure computation ----------
    function prefixMax(points) {
        var out = new Array(points.length), m = -Infinity;
        for (var i = 0; i < points.length; i++) {
            if (points[i].index > m) m = points[i].index;
            out[i] = m;
        }
        return out;
    }

    // Time (seconds) at which a monotonic progress series first reached idx.
    // pmax must be non-decreasing. Returns null if never reached.
    function timeAtIndex(points, pmax, idx) {
        var lo = 0, hi = points.length;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (pmax[mid] >= idx) hi = mid; else lo = mid + 1; }
        if (lo >= points.length) return null;
        if (lo === 0) return points[0].t;
        var a = points[lo - 1], b = points[lo], pa = pmax[lo - 1], pb = pmax[lo];
        if (pb === pa) return b.t;
        return a.t + ((idx - pa) / (pb - pa)) * (b.t - a.t);
    }

    function splitWords(quote) {
        var words = [], re = /\S+/g, m;
        quote = String(quote == null ? '' : quote);
        while ((m = re.exec(quote))) words.push({ word: m[0], start: m.index, end: m.index + m[0].length });
        return words;
    }

    // Per-word WPM and error flags. Only words fully typed are included.
    function computeWordStats(quote, typedChars, timeline) {
        var words = splitWords(quote), typed = typedChars || [], pts = Array.isArray(timeline) ? timeline : [];
        if (!pts.length) return [];
        var pmax = prefixMax(pts), out = [];
        for (var w = 0; w < words.length; w++) {
            var wd = words[w];
            if (typed.length < wd.end) break;
            var t0 = timeAtIndex(pts, pmax, wd.start);
            var t1 = timeAtIndex(pts, pmax, Math.min(wd.end + 1, typed.length));
            if (t1 == null) t1 = timeAtIndex(pts, pmax, wd.end);
            var errors = 0;
            for (var i = wd.start; i < wd.end; i++) if (typed[i] !== quote[i]) errors++;
            var wpm = null;
            if (t0 != null && t1 != null) {
                var sec = Math.max(t1 - t0, 0.05);
                wpm = Math.round((((wd.end - wd.start) + 1) / 5) / (sec / 60));
            }
            out.push({ word: wd.word, start: wd.start, wpm: wpm, errors: errors });
        }
        return out;
    }

    function slowestWords(stats, n) {
        return stats.filter(function (s) { return s.wpm != null; })
            .sort(function (a, b) { return a.wpm - b.wpm; }).slice(0, n || 5);
    }

    // Best sliding window of ~windowSec seconds. Returns {wpm, seconds} or null.
    function fastestBurst(timeline, windowSec) {
        windowSec = windowSec || 3;
        if (!Array.isArray(timeline) || timeline.length < 2) return null;
        var pmax = prefixMax(timeline), best = null, s = 0;
        for (var e = 1; e < timeline.length; e++) {
            while (s < e - 1 && timeline[e].t - timeline[s + 1].t >= windowSec) s++;
            var span = timeline[e].t - timeline[s].t;
            if (span < Math.min(2, windowSec) || span > windowSec * 2) continue;
            var wpm = ((pmax[e] - pmax[s]) / 5) / (span / 60);
            if (!best || wpm > best.wpm) best = { wpm: Math.round(wpm), seconds: Math.round(span) };
        }
        return best;
    }

    // Per-letter stats derived from the run itself: {char: {accuracy, avgMs, samples}}
    function computeKeyStats(quote, typedChars, timeline) {
        var stats = {}, typed = typedChars || [], q = String(quote || '');
        function get(c) { return stats[c] || (stats[c] = { ok: 0, n: 0, ms: 0, msN: 0 }); }
        for (var i = 0; i < typed.length && i < q.length; i++) {
            var c = q[i].toLowerCase();
            if (!/[a-z]/.test(c)) continue;
            var g = get(c); g.n++; if (typed[i] === q[i]) g.ok++;
        }
        var pts = Array.isArray(timeline) ? timeline : [];
        for (var k = 1; k < pts.length; k++) {
            if (pts[k].index !== pts[k - 1].index + 1) continue;
            var dt = pts[k].t - pts[k - 1].t;
            if (dt <= 0 || dt > 3) continue;
            var ch = String(q[pts[k - 1].index] || '').toLowerCase();
            if (!/[a-z]/.test(ch)) continue;
            var gg = get(ch); gg.ms += dt * 1000; gg.msN++;
        }
        var out = {};
        Object.keys(stats).forEach(function (c) {
            var g = stats[c];
            out[c] = { accuracy: g.n ? g.ok / g.n : undefined, avgMs: g.msN ? g.ms / g.msN : undefined, samples: g.n };
        });
        return out;
    }

    function normAcc(a) { return typeof a !== 'number' || isNaN(a) ? null : (a > 1 ? a / 100 : a); }

    function slowestLetters(keyData, n) {
        return Object.keys(keyData).filter(function (c) { return /^[a-z]$/.test(c) && keyData[c].samples >= 2; })
            .map(function (c) {
                var d = keyData[c], acc = normAcc(d.accuracy);
                return { c: c, acc: acc == null ? 1 : acc, ms: d.avgMs || 0 };
            })
            .sort(function (a, b) { return (a.acc - b.acc) || (b.ms - a.ms); })
            .filter(function (x, i) { return i < (n || 3); })
            .map(function (x) { return x.c; });
    }

    // ---------- ghost delta ----------
    function createGhostTracker() {
        var ref = null, len = -1, pmax = null, pT = 0, pI = 0;
        function bind(g) {
            if (g === ref && g.length === len) return;
            ref = g; len = g.length; pmax = prefixMax(g); pT = 0; pI = 0;
        }
        function reset() { ref = null; len = -1; pmax = null; pT = 0; pI = 0; }
        // Amortized O(1): pointers only move forward in normal play.
        function update(currentIndex, elapsedMs, ghost) {
            if (!Array.isArray(ghost) || ghost.length === 0) return { deltaChars: 0, deltaMs: 0 };
            bind(ghost);
            var n = ghost.length, e = elapsedMs / 1000;
            while (pT + 1 < n && ghost[pT + 1].t <= e) pT++;
            while (pT > 0 && ghost[pT].t > e) pT--;
            var gIdx;
            if (e <= ghost[0].t) gIdx = ghost[0].index;
            else if (pT + 1 >= n) gIdx = ghost[n - 1].index;
            else {
                var a = ghost[pT], b = ghost[pT + 1], span = b.t - a.t;
                gIdx = span <= 0 ? b.index : Math.round(a.index + ((e - a.t) / span) * (b.index - a.index));
            }
            var deltaChars = currentIndex - gIdx;
            // pointer to first ghost point whose progress >= currentIndex
            while (pI < n && pmax[pI] < currentIndex) pI++;
            while (pI > 0 && pmax[pI - 1] >= currentIndex) pI--;
            var gT;
            if (pI >= n) gT = null;
            else if (pI === 0) gT = ghost[0].t;
            else {
                var p = ghost[pI - 1], q = ghost[pI], pa = pmax[pI - 1], pb = pmax[pI];
                gT = pb === pa ? q.t : p.t + ((currentIndex - pa) / (pb - pa)) * (q.t - p.t);
            }
            // Ghost never reached this index: you are past its whole run.
            var deltaMs = gT == null ? Math.max(0, elapsedMs - ghost[n - 1].t * 1000) : (gT * 1000 - elapsedMs);
            return { deltaChars: deltaChars, deltaMs: Math.round(deltaMs) };
        }
        return { update: update, reset: reset };
    }

    // ---------- DOM helpers ----------
    var doc = typeof document !== 'undefined' ? document : null;

    function injectStyle() {
        if (!doc || doc.getElementById('run-analysis-style')) return;
        var st = doc.createElement('style');
        st.id = 'run-analysis-style';
        st.textContent = [
            '.ra-wrap{margin:14px 0;border:1px solid rgba(126,146,193,.22);border-radius:12px;background:rgba(255,255,255,.04);color:var(--lyra-terminal-text,#eef3ff);font-size:.9rem}',
            '.ra-toggle{width:100%;text-align:left;background:none;border:0;color:var(--lyra-terminal-accent,#66e9ff);font:inherit;font-weight:600;padding:10px 14px;cursor:pointer;letter-spacing:.04em}',
            '.ra-toggle:focus-visible{outline:2px solid var(--lyra-terminal-accent,#66e9ff);outline-offset:-2px;border-radius:12px}',
            '.ra-body{padding:0 14px 14px}.ra-body[hidden]{display:none}',
            '.ra-summary{margin:0 0 10px;color:var(--lyra-terminal-muted,#a5b3d1)}',
            '.ra-h{margin:10px 0 6px;font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;color:var(--lyra-terminal-muted,#a5b3d1)}',
            '.ra-chips{display:flex;flex-wrap:wrap;gap:6px}',
            '.ra-chip{padding:3px 9px;border-radius:999px;border:1px solid rgba(102,233,255,.35);background:rgba(102,233,255,.08);font-size:.82rem}',
            '.ra-chip small{opacity:.7;margin-left:5px}',
            '.ra-chip.ra-err{border-color:rgba(255,95,109,.55);background:rgba(255,95,109,.12)}',
            '.ra-kb{display:flex;flex-direction:column;align-items:center;gap:4px;margin-top:6px}',
            '.ra-row{display:flex;gap:4px}',
            '.ra-key{width:clamp(20px,6.5vw,32px);height:clamp(22px,7vw,32px);display:flex;align-items:center;justify-content:center;border-radius:6px;font:600 .78rem monospace;text-transform:uppercase;background:rgba(255,255,255,.07);color:#cfd8ee;border:1px solid rgba(255,255,255,.08)}',
            '.ra-empty{color:var(--lyra-terminal-muted,#a5b3d1);font-style:italic}',
            '.ra-ghost-badge{display:inline-block;padding:3px 10px;border-radius:999px;font:600 .85rem monospace;background:rgba(10,10,30,.7);border:1px solid currentColor;pointer-events:none}',
            '.ra-ghost-badge[hidden]{display:none}',
            '.ra-ghost-badge.ra-ahead{color:var(--entry-neon-green,#32d74b)}',
            '.ra-ghost-badge.ra-behind{color:#ff5f6d}'
        ].join('');
        (doc.head || doc.documentElement).appendChild(st);
    }

    function el(tag, cls, text) {
        var n = doc.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function chipRow(items, errCls) {
        var row = el('div', 'ra-chips');
        items.forEach(function (it) {
            var c = el('span', 'ra-chip' + (errCls ? ' ' + errCls : ''), it.word);
            if (it.note) c.appendChild(el('small', null, it.note));
            row.appendChild(c);
        });
        return row;
    }

    function keyColor(d, range) {
        if (!d || !d.samples) return null;
        var acc = normAcc(d.accuracy);
        if (acc != null && acc < 0.97) {
            return 'rgba(255,95,109,' + (0.35 + Math.min(1, (1 - acc) * 2) * 0.5).toFixed(2) + ')';
        }
        if (typeof d.avgMs === 'number' && range.max > range.min) {
            var f = (d.avgMs - range.min) / (range.max - range.min); // 0 fast .. 1 slow
            var hue = Math.round(135 - f * 95); // green -> amber
            return 'hsla(' + hue + ',75%,50%,0.7)';
        }
        return 'rgba(50,215,75,0.55)';
    }

    function renderKeyboard(keyData) {
        var ms = Object.keys(keyData).map(function (c) { return keyData[c].avgMs; })
            .filter(function (v) { return typeof v === 'number' && v > 0; });
        var range = { min: Math.min.apply(null, ms), max: Math.max.apply(null, ms) };
        var kb = el('div', 'ra-kb');
        kb.setAttribute('role', 'img');
        kb.setAttribute('aria-label', 'Keyboard heatmap: red keys had errors, green to amber keys show speed.');
        ROWS.forEach(function (r) {
            var row = el('div', 'ra-row');
            r.split('').forEach(function (c) {
                var k = el('span', 'ra-key', c), col = keyColor(keyData[c], range);
                if (col) k.style.background = col;
                row.appendChild(k);
            });
            kb.appendChild(row);
        });
        return kb;
    }

    function render(container, data) {
        if (!container || !doc) return;
        injectStyle();
        data = data || {};
        var quote = String(data.quote || ''), typed = data.typedChars || [], tl = data.timeline || [];
        var wordStats = computeWordStats(quote, typed, tl);
        var slow = slowestWords(wordStats, 5);
        var errWords = wordStats.filter(function (w) { return w.errors > 0; });
        var keyData = computeKeyStats(quote, typed, tl);
        if (data.keyHeatmap && typeof data.keyHeatmap === 'object') {
            Object.keys(data.keyHeatmap).forEach(function (c) {
                if (/^[a-zA-Z]$/.test(c)) keyData[c.toLowerCase()] = data.keyHeatmap[c];
            });
        }
        var letters = slowestLetters(keyData, 3);
        var burst = fastestBurst(tl, 3);
        var parts = [];
        if (letters.length) parts.push('Slowest letters: ' + letters.join(', '));
        if (burst) parts.push('Fastest burst: ' + burst.wpm + ' WPM over ' + burst.seconds + 's');
        else if (Array.isArray(data.wpmSamples) && data.wpmSamples.length) {
            var peak = Math.max.apply(null, data.wpmSamples.map(function (s) { return s.wpm || 0; }));
            if (peak > 0) parts.push('Peak: ' + Math.round(peak) + ' WPM');
        }

        while (container.firstChild) container.removeChild(container.firstChild);
        var wrap = el('div', 'ra-wrap');
        var open = false;
        try { open = localStorage.getItem(OPEN_KEY) === '1'; } catch (e) {}
        var toggle = el('button', 'ra-toggle');
        toggle.type = 'button';
        var body = el('div', 'ra-body');
        function sync() {
            toggle.textContent = open ? 'Run analysis ▾' : 'Run analysis ▸';
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            body.hidden = !open;
        }
        toggle.addEventListener('click', function () {
            open = !open; sync();
            try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch (e) {}
        });

        body.appendChild(el('p', 'ra-summary', parts.length ? parts.join(' · ') : 'Not enough data for a summary.'));
        body.appendChild(el('div', 'ra-h', 'Slowest words'));
        body.appendChild(slow.length ? chipRow(slow.map(function (w) { return { word: w.word, note: w.wpm + ' wpm' }; }))
            : el('div', 'ra-empty', 'No word timing available'));
        body.appendChild(el('div', 'ra-h', 'Words with errors'));
        body.appendChild(errWords.length ? chipRow(errWords.map(function (w) { return { word: w.word, note: w.errors + ' err' }; }), 'ra-err')
            : el('div', 'ra-empty', 'Clean run, no errors'));
        body.appendChild(el('div', 'ra-h', 'Key heatmap'));
        body.appendChild(renderKeyboard(keyData));

        wrap.appendChild(toggle); wrap.appendChild(body);
        container.appendChild(wrap);
        sync();
    }

    // ---------- ghostDelta public object ----------
    var tracker = createGhostTracker();
    var badge = null, lastPaint = 0, lastText = '';
    var ghostDelta = {
        mount: function (target) {
            if (!doc || !target) return;
            injectStyle();
            badge = el('span', 'ra-ghost-badge');
            badge.hidden = true;
            badge.setAttribute('aria-live', 'off');
            target.appendChild(badge);
        },
        update: function (s) {
            s = s || {};
            var r = tracker.update(s.currentIndex | 0, +s.elapsedMs || 0, s.ghostTimeline);
            if (!badge) return r;
            var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            if (now - lastPaint < 100) return r;
            lastPaint = now;
            if (!Array.isArray(s.ghostTimeline) || !s.ghostTimeline.length) {
                if (!badge.hidden) badge.hidden = true;
                return r;
            }
            var sec = Math.abs(r.deltaMs) / 1000;
            var ahead = r.deltaMs >= 0;
            var text = (ahead ? '+' : '−') + sec.toFixed(1) + 's ' + (ahead ? 'ahead' : 'behind');
            if (text !== lastText) {
                lastText = text;
                badge.textContent = text;
                badge.className = 'ra-ghost-badge ' + (ahead ? 'ra-ahead' : 'ra-behind');
            }
            if (badge.hidden) badge.hidden = false;
            return r;
        },
        reset: function () {
            tracker.reset(); lastText = ''; lastPaint = 0;
            if (badge) { badge.hidden = true; badge.textContent = ''; }
        }
    };

    var api = {
        render: render,
        ghostDelta: ghostDelta,
        _internal: {
            computeWordStats: computeWordStats, slowestWords: slowestWords, fastestBurst: fastestBurst,
            computeKeyStats: computeKeyStats, slowestLetters: slowestLetters, createGhostTracker: createGhostTracker,
            timeAtIndex: timeAtIndex, prefixMax: prefixMax
        }
    };
    root.RunAnalysis = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
