/* Orion Bulwark - wave-defense typing mode for TypeMine Galactic. Exposes window.OrionMode. */
(function (root) {
    'use strict';

    var BEST_KEY = 'sampire-orion-best';
    var FALLBACK_WORDS = ['star','moon','dust','void','orbit','comet','solar','laser','pulse','nova','drift','cargo','alloy','probe','radar','plasma','quartz','vector','galaxy','nebula','meteor','thruster','asteroid','shield','gravity','reactor','horizon','cosmonaut','satellite','supernova'];
    var DREAD_WORDS = ['iron','storm','crown','silent','harvest','ember','ghost','titan','abyss','falcon','tempest','orbital','warden','eclipse','cinder'];

    // ---------- pure logic ----------
    function isDreadnought(n) { return n > 0 && n % 5 === 0; }

    function waveConfig(n) {
        n = Math.max(1, Math.floor(n) || 1);
        var minLen = Math.min(3 + Math.floor((n - 1) / 2), 9);
        return {
            wave: n,
            dreadnought: isDreadnought(n),
            count: 6 + 2 * n,
            spawnInterval: Math.max(0.55, 2.4 - 0.14 * (n - 1)),
            speed: 26 + 4 * (n - 1),          // px/sec at 600px field height
            minLen: minLen,
            maxLen: Math.min(minLen + 2, 12),
            dreadWords: 3 + Math.floor(n / 5)
        };
    }

    function comboAfterClean(c) { return Math.min(4, Math.round((c + 0.1) * 10) / 10); }
    function comboAfterMiss() { return 1; }
    function scoreForWord(len, combo) { return Math.round(len * Math.min(4, Math.max(1, combo))); }
    function calcWpm(correctChars, activeSec) {
        if (!(activeSec > 0)) return 0;
        return Math.round((correctChars / 5) / (activeSec / 60));
    }
    function calcAccuracy(correct, total) { return total > 0 ? Math.round((correct / total) * 1000) / 10 : 100; }

    // Closest to station = largest y (station at bottom). Candidates must start with letter and be untyped.
    function selectTarget(words, letter) {
        var best = null, l = String(letter).toLowerCase();
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            if (w.dead || !w.text || w.text.charAt(0).toLowerCase() !== l) continue;
            if (!best || w.y > best.y) best = w;
        }
        return best;
    }

    function clampDt(dt) { return Math.max(0, Math.min(dt, 0.05)); }

    function pickWord(pool, minLen, maxLen, rnd) {
        var c = pool.filter(function (w) { return w.length >= minLen && w.length <= maxLen; });
        if (!c.length) c = pool;
        return c[Math.floor((rnd || Math.random)() * c.length)];
    }

    function cleanPool(pool) {
        var out = [];
        if (Array.isArray(pool)) pool.forEach(function (w) {
            w = String(w).toLowerCase().trim();
            if (/^[a-z]{3,14}$/.test(w)) out.push(w);
        });
        return out.length >= 20 ? out : FALLBACK_WORDS.concat(out);
    }

    // ---------- runtime ----------
    var S = null; // session state when open

    function css() {
        if (document.getElementById('orion-mode-styles')) return;
        var st = document.createElement('style');
        st.id = 'orion-mode-styles';
        st.textContent =
'#orion-mode{position:fixed;inset:0;z-index:99990;background:#05011a;color:var(--lyra-terminal-text,#eef3ff);font-family:"Nunito","Segoe UI",system-ui,sans-serif;display:flex;flex-direction:column;user-select:none}' +
'#orion-mode canvas{flex:1;width:100%;min-height:0;display:block}' +
'#orion-mode .om-hud{display:flex;flex-wrap:wrap;gap:.6rem 1.4rem;align-items:center;justify-content:center;padding:.6rem 1rem;background:rgba(12,10,34,.72);border-bottom:1px solid var(--lyra-terminal-border-strong,rgba(107,168,255,.34));box-shadow:var(--lyra-neon-low,0 0 12px rgba(102,233,255,.12));backdrop-filter:blur(10px)}' +
'#orion-mode .om-stat{display:flex;flex-direction:column;align-items:center;font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:var(--lyra-terminal-muted,#a5b3d1)}' +
'#orion-mode .om-stat b{font-size:1.15rem;letter-spacing:0;color:var(--lyra-terminal-accent,#66e9ff);text-shadow:0 0 10px rgba(102,233,255,.5)}' +
'#orion-mode .om-shield{width:min(240px,40vw);height:12px;border-radius:8px;background:rgba(255,255,255,.08);border:1px solid var(--lyra-terminal-border,rgba(126,146,193,.14));overflow:hidden}' +
'#orion-mode .om-shield i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#66e9ff,#4895ef);box-shadow:0 0 12px rgba(102,233,255,.6);transition:width .15s}' +
'#orion-mode .om-shield i.low{background:linear-gradient(90deg,#ff4d6d,#f8c660)}' +
'#orion-mode .om-btn{background:rgba(255,255,255,.06);color:inherit;border:1px solid var(--lyra-terminal-border-strong,rgba(107,168,255,.34));border-radius:10px;padding:.5rem 1.1rem;font:inherit;cursor:pointer;box-shadow:var(--lyra-neon-low,0 0 12px rgba(102,233,255,.12))}' +
'#orion-mode .om-btn:hover,#orion-mode .om-btn:focus-visible{box-shadow:var(--lyra-neon-mid,0 0 22px rgba(102,233,255,.18));border-color:var(--lyra-terminal-accent,#66e9ff);outline:none}' +
'#orion-mode .om-panel{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:.9rem;background:rgba(5,1,26,.78);text-align:center}' +
'#orion-mode .om-panel.show{display:flex}' +
'#orion-mode .om-panel h2{font-size:clamp(1.8rem,5vw,3rem);color:var(--lyra-terminal-accent,#66e9ff);text-shadow:0 0 22px rgba(102,233,255,.5);letter-spacing:.1em}' +
'#orion-mode .om-panel p{color:var(--lyra-terminal-muted,#a5b3d1)}' +
'#orion-mode .om-row{display:flex;gap:.8rem;flex-wrap:wrap;justify-content:center}' +
'#orion-mode .om-wave{pointer-events:none;background:transparent}' +
'#orion-mode .om-wave h2{color:var(--lyra-terminal-accent-2,#f8c660);text-shadow:0 0 26px rgba(248,198,96,.5)}' +
'#orion-mode .om-input{position:absolute;left:-9999px;top:0;width:1px;height:1px;opacity:0}';
        document.head.appendChild(st);
    }

    function toast(msg, type) {
        try { if (typeof root.showUiMessage === 'function') root.showUiMessage(msg, type || 'info', 2200, 'top-right'); } catch (e) {}
    }
    function tick(key) {
        try { if (typeof root.playKeypressSound === 'function') root.playKeypressSound(key); } catch (e) {}
    }

    function open(opts) {
        if (S) close(true);
        opts = opts || {};
        css();
        var reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
        var best = 0;
        try { best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) {}

        var el = document.createElement('div');
        el.id = 'orion-mode';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-label', 'Orion Bulwark');
        el.innerHTML =
'<div class="om-hud"><div class="om-stat">Shield<div class="om-shield"><i data-r="shield"></i></div></div>' +
'<div class="om-stat">Wave<b data-r="wave">1</b></div><div class="om-stat">Score<b data-r="score">0</b></div>' +
'<div class="om-stat">Combo<b data-r="combo">1.0x</b></div><div class="om-stat">WPM<b data-r="wpm">0</b></div>' +
'<div class="om-stat">Best<b data-r="best">0</b></div><button class="om-btn" data-r="pausebtn" type="button">Pause</button></div>' +
'<canvas></canvas><input class="om-input" data-r="input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Typing input">' +
'<div class="om-panel om-wave" data-r="wavep"><h2 data-r="wavet"></h2><p data-r="wavesub"></p></div>' +
'<div class="om-panel" data-r="pausep"><h2>Paused</h2><div class="om-row"><button class="om-btn" data-r="resume" type="button">Resume</button><button class="om-btn" data-r="exit1" type="button">Exit</button></div></div>' +
'<div class="om-panel" data-r="overp"><h2>Bulwark Breached</h2><p data-r="overt"></p><div class="om-row"><button class="om-btn" data-r="retry" type="button">Retry</button><button class="om-btn" data-r="exit2" type="button">Exit</button></div></div>';
        document.body.appendChild(el);
        var R = {};
        [].forEach.call(el.querySelectorAll('[data-r]'), function (n) { R[n.getAttribute('data-r')] = n; });
        var canvas = el.querySelector('canvas');
        var ctx = canvas.getContext('2d');

        S = {
            el: el, R: R, canvas: canvas, ctx: ctx, opts: opts, reduced: reduced, best: best,
            pool: cleanPool(opts.wordPool), listeners: [], raf: 0, timers: [], last: 0,
            w: 0, h: 0, dpr: 1, stars: [], closed: false
        };
        var s = S;
        function on(t, ev, fn, o) { t.addEventListener(ev, fn, o); s.listeners.push([t, ev, fn, o]); }

        function reset() {
            s.words = []; s.particles = []; s.lasers = []; s.lock = null;
            s.shield = 100; s.score = 0; s.combo = 1; s.wave = 0; s.wordsDestroyed = 0;
            s.correct = 0; s.total = 0; s.active = 0; s.shake = 0; s.hit = 0;
            s.state = 'interstitial'; s.paused = false; s.over = false; s.completed = false;
            beginWave(1);
            hud();
            R.pausep.classList.remove('show'); R.overp.classList.remove('show');
        }
        function beginWave(n) {
            s.wave = n; s.cfg = waveConfig(n); s.spawned = 0; s.spawnT = 0.6; s.dreadSpawned = false;
            s.state = 'interstitial'; s.interT = 3;
            R.wavet.textContent = s.cfg.dreadnought ? 'Dreadnought - Wave ' + n : 'Wave ' + n;
            R.wavesub.textContent = s.cfg.dreadnought ? 'Type the full phrase while small drifters keep coming' : 'Hold the line';
            R.wavep.classList.add('show');
        }
        function spawn(text, dread) {
            var cfgSpeed = s.cfg.speed * (s.h / 600 || 1) * (dread ? 0.35 : 1);
            var x = s.w * (0.12 + Math.random() * 0.76);
            var tx = s.w / 2 + (Math.random() - 0.5) * s.w * 0.2;
            var y0 = -10, dist = Math.max(1, s.h - 70 - y0);
            var vy = cfgSpeed * (0.9 + Math.random() * 0.2);
            s.words.push({ text: text, typed: 0, x: x, y: y0, vx: (tx - x) / (dist / vy), vy: vy, dread: !!dread, hp: text.length, dead: false, flash: 0 });
        }
        function burst(x, y, n, color) {
            n = s.reduced ? Math.ceil(n / 4) : n;
            for (var i = 0; i < n; i++) {
                var a = Math.random() * 6.283, sp = 40 + Math.random() * 180;
                s.particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.5, max: 1, c: color });
            }
        }
        function hud() {
            R.shield.style.width = Math.max(0, s.shield) + '%';
            R.shield.className = s.shield < 30 ? 'low' : '';
            R.wave.textContent = s.wave; R.score.textContent = s.score;
            R.combo.textContent = s.combo.toFixed(1) + 'x';
            R.wpm.textContent = calcWpm(s.correct, s.active);
            R.best.textContent = Math.max(s.best, s.score);
        }
        function result() {
            return { score: s.score, wave: s.wave, wpm: calcWpm(s.correct, s.active), accuracy: calcAccuracy(s.correct, s.total),
                wordsDestroyed: s.wordsDestroyed, durationSec: Math.round(s.active) };
        }
        function saveBest() {
            if (s.score > s.best) { s.best = s.score; try { localStorage.setItem(BEST_KEY, String(s.best)); } catch (e) {} }
        }
        function gameOver() {
            s.over = true; s.state = 'over'; s.lock = null;
            saveBest();
            var r = result();
            R.overt.textContent = 'Score ' + r.score + ' | Wave ' + r.wave + ' | ' + r.wpm + ' WPM | ' + r.accuracy + '% accuracy' + (s.score >= s.best && s.score > 0 ? ' | New best!' : '');
            R.overp.classList.add('show');
            if (!s.completed) {
                s.completed = true;
                try { if (typeof s.opts.onRunComplete === 'function') s.opts.onRunComplete(r); } catch (e) { console.error(e); }
            }
            hud();
        }
        function damage(n) {
            s.shield = Math.max(0, s.shield - n); s.hit = 0.25;
            if (!s.reduced) s.shake = 0.3;
            if (s.shield <= 0 && !s.over) gameOver();
        }
        function miss() {
            s.total++; s.combo = comboAfterMiss();
            damage(2);
            hud();
        }
        function charIn(ch) {
            if (s.state !== 'playing' || s.paused || s.over) return;
            ch = ch.toLowerCase();
            if (s.lock && s.lock.dead) s.lock = null;
            if (!s.lock) {
                var t = selectTarget(s.words, ch);
                if (!t) { miss(); return; }
                s.lock = t;
            }
            var w = s.lock;
            if (w.text.charAt(w.typed) !== ch) { miss(); return; }
            w.typed++; s.correct++; s.total++; w.flash = 0.1;
            tick(ch);
            s.lasers.push({ x: s.w / 2, y: s.h - 40, tx: w.x, ty: w.y, life: 0.12 });
            if (w.typed >= w.text.length) {
                w.dead = true; s.lock = null; s.wordsDestroyed++;
                s.combo = comboAfterClean(s.combo);
                s.score += scoreForWord(w.text.length, s.combo) + (w.dread ? 50 * s.wave : 0);
                burst(w.x, w.y, w.dread ? 90 : 28, w.dread ? '#f8c660' : '#66e9ff');
                if (w.dread && !s.reduced) s.shake = 0.5;
                saveBest();
            }
            hud();
        }
        function release() { s.lock = null; }
        function pause(p) {
            if (s.over || s.state === 'interstitial' && p === false && !s.paused) return;
            s.paused = p;
            R.pausep.classList.toggle('show', p);
            if (!p) { s.last = 0; focusInput(); }
        }
        function focusInput() { try { R.input.focus({ preventScroll: true }); } catch (e) {} }
        function exit() {
            var r = result();
            saveBest();
            var cb = s.opts.onExit;
            close(true);
            try { if (typeof cb === 'function') cb(r); } catch (e) { console.error(e); }
        }

        // ---- input: keydown handles printable keys; input event handles IME/mobile keys keydown can't ----
        var lastKeydownAt = 0;
        on(document, 'keydown', function (e) {
            if (e.repeat) { e.preventDefault(); return; }
            if (e.key === 'Escape') {
                e.preventDefault();
                if (s.over) exit(); else pause(!s.paused);
                return;
            }
            if (s.paused || s.over) return;
            if (e.key === 'Backspace') { e.preventDefault(); release(); return; }
            var altGr = (e.getModifierState && e.getModifierState('AltGraph')) || (e.ctrlKey && e.altKey);
            if ((e.ctrlKey || e.metaKey) && !altGr) return;
            if (e.key && e.key.length === 1) {
                e.preventDefault();
                lastKeydownAt = performance.now();
                charIn(e.key);
            }
            // 'Unidentified'/'Process' (mobile/IME): fall through to the input event
        }, true);
        on(R.input, 'input', function () {
            var v = R.input.value; R.input.value = '';
            if (!v) return;
            if (performance.now() - lastKeydownAt < 40) return; // already handled by keydown
            for (var i = 0; i < v.length; i++) charIn(v.charAt(i));
        });
        on(R.input, 'keydown', function () {});
        on(el, 'pointerdown', function () { if (!s.paused && !s.over) focusInput(); });
        on(document, 'visibilitychange', function () { if (document.hidden && !s.over && !s.paused) pause(true); });
        on(root, 'blur', function () { if (!s.over && !s.paused) pause(true); });
        on(root, 'resize', resize);
        on(R.pausebtn, 'click', function () { pause(!s.paused); });
        on(R.resume, 'click', function () { pause(false); });
        on(R.exit1, 'click', exit);
        on(R.exit2, 'click', exit);
        on(R.retry, 'click', function () { reset(); focusInput(); s.last = 0; });

        function resize() {
            s.dpr = Math.min(root.devicePixelRatio || 1, 2);
            var r = canvas.getBoundingClientRect();
            s.w = Math.max(200, r.width); s.h = Math.max(200, r.height);
            canvas.width = s.w * s.dpr; canvas.height = s.h * s.dpr;
            ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
            s.stars = [];
            for (var i = 0; i < (s.reduced ? 60 : 120); i++) s.stars.push({ x: Math.random() * s.w, y: Math.random() * s.h, z: Math.random() * 0.8 + 0.2 });
        }

        function update(dt) {
            if (s.state === 'interstitial') {
                s.interT -= dt;
                if (s.interT <= 0) { s.state = 'playing'; R.wavep.classList.remove('show'); }
            } else if (s.state === 'playing') {
                s.active += dt;
                var c = s.cfg;
                s.spawnT -= dt;
                if (c.dreadnought && !s.dreadSpawned) {
                    s.dreadSpawned = true;
                    var parts = []; for (var i = 0; i < c.dreadWords; i++) parts.push(DREAD_WORDS[Math.floor(Math.random() * DREAD_WORDS.length)]);
                    spawn(parts.join(' '), true);
                }
                if (s.spawnT <= 0) {
                    var limit = c.dreadnought ? Infinity : c.count;
                    if (s.spawned < limit) {
                        var lenMin = c.dreadnought ? 3 : c.minLen, lenMax = c.dreadnought ? 5 : c.maxLen;
                        spawn(pickWord(s.pool, lenMin, lenMax), false); s.spawned++;
                    }
                    s.spawnT = c.spawnInterval * (c.dreadnought ? 1.8 : 1);
                }
                var alive = 0, dreadAlive = false;
                s.words.forEach(function (w) {
                    if (w.dead) return;
                    w.x += w.vx * dt; w.y += w.vy * dt; if (w.flash > 0) w.flash -= dt;
                    if (w.y >= s.h - 56) {
                        w.dead = true; if (s.lock === w) s.lock = null;
                        damage(w.dread ? 50 : 8 + Math.min(w.text.length, 8));
                        s.combo = comboAfterMiss();
                        burst(w.x, s.h - 56, 20, '#ff4d6d');
                        hud();
                    } else { alive++; if (w.dread) dreadAlive = true; }
                });
                if (!s.over) {
                    var done = c.dreadnought ? (s.dreadSpawned && !dreadAlive) : (s.spawned >= c.count && alive === 0);
                    if (done) {
                        s.words = s.words.filter(function (w) { return false; }); s.lock = null;
                        s.shield = Math.min(100, s.shield + 5);
                        beginWave(s.wave + 1); hud();
                    }
                }
                s.words = s.words.filter(function (w) { return !w.dead; });
            }
            s.particles.forEach(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
            s.particles = s.particles.filter(function (p) { return p.life > 0; });
            s.lasers.forEach(function (l) { l.life -= dt; });
            s.lasers = s.lasers.filter(function (l) { return l.life > 0; });
            if (s.shake > 0) s.shake -= dt; if (s.hit > 0) s.hit -= dt;
            s.stars.forEach(function (st) { st.y += 12 * st.z * dt; if (st.y > s.h) { st.y = 0; st.x = Math.random() * s.w; } });
            if (Math.floor(s.active * 2) !== s.lastHud) { s.lastHud = Math.floor(s.active * 2); R.wpm.textContent = calcWpm(s.correct, s.active); }
        }

        function draw() {
            var x = ctx, W = s.w, H = s.h;
            x.save();
            x.clearRect(0, 0, W, H);
            if (s.shake > 0 && !s.reduced) x.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
            x.fillStyle = '#05011a'; x.fillRect(-10, -10, W + 20, H + 20);
            s.stars.forEach(function (st) { x.globalAlpha = 0.3 + st.z * 0.6; x.fillStyle = '#cfe7ff'; x.fillRect(st.x, st.y, st.z * 2, st.z * 2); });
            x.globalAlpha = 1;
            // station
            var cx = W / 2, sy = H - 40;
            x.shadowColor = s.hit > 0 ? '#ff4d6d' : '#66e9ff'; x.shadowBlur = 18;
            x.strokeStyle = s.hit > 0 ? '#ff4d6d' : '#66e9ff'; x.fillStyle = 'rgba(102,233,255,.12)'; x.lineWidth = 2;
            x.beginPath(); x.moveTo(cx - 40, H - 8); x.lineTo(cx - 22, sy); x.lineTo(cx, sy - 14); x.lineTo(cx + 22, sy); x.lineTo(cx + 40, H - 8); x.closePath(); x.fill(); x.stroke();
            // lasers
            s.lasers.forEach(function (l) { x.globalAlpha = l.life / 0.12; x.strokeStyle = '#f8c660'; x.shadowColor = '#f8c660'; x.beginPath(); x.moveTo(l.x, l.y); x.lineTo(l.tx, l.ty); x.stroke(); });
            x.globalAlpha = 1;
            // words
            x.textAlign = 'center'; x.textBaseline = 'middle';
            s.words.forEach(function (w) {
                var size = w.dread ? 24 : 20;
                x.font = '700 ' + size + 'px "Nunito","Segoe UI",monospace';
                var tw = x.measureText(w.text).width, locked = s === S && s.lock === w;
                x.shadowBlur = locked ? 20 : 8; x.shadowColor = w.dread ? '#f8c660' : (locked ? '#f8c660' : '#7c6ff7');
                x.fillStyle = 'rgba(12,10,34,.78)';
                x.fillRect(w.x - tw / 2 - 8, w.y - size / 2 - 5, tw + 16, size + 10);
                x.strokeStyle = locked ? '#f8c660' : (w.dread ? '#ff4d6d' : 'rgba(107,168,255,.5)');
                x.strokeRect(w.x - tw / 2 - 8, w.y - size / 2 - 5, tw + 16, size + 10);
                var rest = w.text.slice(w.typed), left = w.x - tw / 2;
                x.textAlign = 'left';
                if (w.typed) { x.fillStyle = '#4a5578'; x.fillText(w.text.slice(0, w.typed), left, w.y); }
                x.fillStyle = locked ? '#fff3cf' : '#eef3ff';
                x.fillText(rest, left + (w.typed ? x.measureText(w.text.slice(0, w.typed)).width : 0), w.y);
                x.textAlign = 'center';
                if (w.dread) {
                    var bw = tw + 16; x.shadowBlur = 0;
                    x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(w.x - bw / 2, w.y - size / 2 - 14, bw, 5);
                    x.fillStyle = '#ff4d6d'; x.fillRect(w.x - bw / 2, w.y - size / 2 - 14, bw * (1 - w.typed / w.hp), 5);
                }
            });
            // particles
            x.shadowBlur = 0;
            s.particles.forEach(function (p) { x.globalAlpha = Math.max(0, p.life); x.fillStyle = p.c; x.fillRect(p.x, p.y, 3, 3); });
            x.restore();
        }

        function frame(ts) {
            if (!S || S !== s || s.closed) return;
            s.raf = root.requestAnimationFrame(frame);
            if (!s.last) s.last = ts;
            var dt = clampDt((ts - s.last) / 1000); s.last = ts;
            if (!s.paused && !s.over) update(dt);
            else if (s.over) { dt = Math.min(dt, 0.05); s.particles.forEach(function (p) { p.life -= dt; }); s.particles = s.particles.filter(function (p) { return p.life > 0; }); }
            draw();
        }

        resize();
        reset();
        R.best.textContent = s.best;
        focusInput();
        s.raf = root.requestAnimationFrame(frame);
        toast('Orion Bulwark online. Esc to pause.', 'info');
    }

    function close(silent) {
        var s = S;
        if (!s) return;
        s.closed = true; S = null;
        if (s.raf) root.cancelAnimationFrame(s.raf);
        s.timers.forEach(function (t) { clearTimeout(t); });
        s.listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
        s.listeners.length = 0;
        if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
    }

    var api = {
        open: open,
        close: function () { close(); },
        isOpen: function () { return !!S; },
        _internal: {
            waveConfig: waveConfig, isDreadnought: isDreadnought, comboAfterClean: comboAfterClean,
            comboAfterMiss: comboAfterMiss, scoreForWord: scoreForWord, selectTarget: selectTarget,
            calcWpm: calcWpm, calcAccuracy: calcAccuracy, clampDt: clampDt, cleanPool: cleanPool
        }
    };
    root.OrionMode = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
