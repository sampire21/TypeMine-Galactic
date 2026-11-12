// ── Shareable result card ───────────────────────────────────────────────────
// Draws a 1200x630 PNG of a run (or a weekly recap) on a canvas, with no external
// images so it works offline, then shares it with the system share sheet when the
// browser supports sharing files. Otherwise it downloads the PNG and copies a short
// text summary plus a link to the clipboard. Opening that link (?r=...) shows a
// "can you beat it?" banner that starts the same mode.
// A challenge link (?c=...) goes further: it carries the test seed, mode and text options,
// so a friend gets the exact same text, and a win/lose banner after their run.
(function () {
    const CARD_W = 1200;
    const CARD_H = 630;
    const MODE_LABELS = { quotes: 'Quotes', words: 'Random Words', words30: 'Timed 30s', adaptive: 'Weak keys', community: 'Team goal' };
    const SHARE_MODES = ['quotes', 'words', 'words30', 'adaptive'];
    // Modes whose text can be rebuilt from a seed. Weak keys, Story and Team goal cannot.
    const CHALLENGE_MODES = ['quotes', 'words', 'words30'];
    const CHALLENGE_TEXT_OPTIONS = ['time', 'words', 'punctuation', 'numbers', 'wordList'];
    const CHALLENGE_OPTION_CHOICES = { time: [15, 30, 60, 120], words: [10, 25, 50, 100], wordList: ['common', 'wide'] };
    let lastRunChallengeSpec = null; // { seed, mode, options } of the run shown on the results card
    let activeChallenge = null;      // decoded ?c= payload the player accepted with "Try it"
    // Nunito when the page has loaded it, otherwise a rounded system font.
    const FONT = "'Nunito', 'Ubuntu', 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif";
    const NAVY = '#0b1430';
    const TEAL = '#3fd9ec';
    const AMBER = '#ffb347';
    const MUTED = '#8fa6c8';

    function roundRect(ctx, x, y, w, h, r) {
        const rad = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.lineTo(x + w - rad, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
        ctx.lineTo(x + w, y + h - rad);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
        ctx.lineTo(x + rad, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
        ctx.lineTo(x, y + rad);
        ctx.quadraticCurveTo(x, y, x + rad, y);
        ctx.closePath();
    }

    // Glossy capsule, Spore style: dark fill, teal rim, soft outer glow, highlight on top.
    function drawCapsule(ctx, x, y, w, h, { glow = TEAL, rim = 'rgba(63,217,236,0.45)' } = {}) {
        ctx.save();
        ctx.shadowColor = glow;
        ctx.shadowBlur = 28;
        roundRect(ctx, x, y, w, h, 34);
        ctx.fillStyle = 'rgba(14, 20, 48, 0.92)';
        ctx.fill();
        ctx.restore();
        roundRect(ctx, x, y, w, h, 34);
        ctx.strokeStyle = rim;
        ctx.lineWidth = 2;
        ctx.stroke();
        const gloss = ctx.createLinearGradient(0, y, 0, y + h);
        gloss.addColorStop(0, 'rgba(255,255,255,0.14)');
        gloss.addColorStop(0.5, 'rgba(255,255,255,0.02)');
        gloss.addColorStop(1, 'rgba(0,0,0,0.18)');
        roundRect(ctx, x, y, w, h, 34);
        ctx.fillStyle = gloss;
        ctx.fill();
    }

    function drawOrb(ctx, cx, cy, r, color = TEAL) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 30;
        const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.2, color);
        g.addColorStop(1, 'rgba(10, 60, 80, 0.9)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function esc(value) {
        return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value);
    }

    function modeLabel(mode) {
        const m = String(mode || '').trim();
        return MODE_LABELS[m] || (m ? m : 'Typing');
    }

    function cleanName(value) {
        const name = String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24);
        return name || 'Guest';
    }

    function clampNumber(value, min, max, fallback = 0) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, n));
    }

    function currentPlayerName() {
        if (typeof currentUser !== 'undefined' && currentUser && currentUser.username) return cleanName(currentUser.username);
        return 'Guest';
    }

    function normalizeSummary(summary) {
        const s = summary && typeof summary === 'object' ? summary : {};
        const mode = SHARE_MODES.includes(String(s.mode)) ? String(s.mode) : (String(s.mode || '') || 'quotes');
        const dateMs = Number(s.date) || Date.now();
        return {
            wpm: Math.round(clampNumber(s.wpm, 0, 400)),
            rawWpm: Math.round(clampNumber(s.rawWpm, 0, 600)),
            accuracy: Math.round(clampNumber(s.accuracy, 0, 100)),
            time: Math.round(clampNumber(s.time, 0, 36000)),
            mode,
            modeLabel: s.modeLabel ? String(s.modeLabel).slice(0, 40) : modeLabel(mode),
            name: cleanName(s.name || currentPlayerName()),
            date: new Date(dateMs),
            isPB: !!s.isPB,
        };
    }

    function formatDate(d) {
        try {
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (e) {
            return d.toDateString();
        }
    }

    function formatTime(seconds) {
        const t = Math.max(0, Math.round(Number(seconds) || 0));
        if (t < 60) return `${t}s`;
        const m = Math.floor(t / 60);
        const s = t % 60;
        return `${m}m ${s}s`;
    }

    // Deterministic star field so the same card always looks the same.
    function drawBackground(ctx) {
        const grad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
        grad.addColorStop(0, '#060b1f');
        grad.addColorStop(0.55, NAVY);
        grad.addColorStop(1, '#0e1f44');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CARD_W, CARD_H);
        let seed = 7;
        const rand = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
        for (let i = 0; i < 140; i++) {
            const x = rand() * CARD_W;
            const y = rand() * CARD_H;
            const r = 0.6 + rand() * 1.6;
            ctx.globalAlpha = 0.25 + rand() * 0.6;
            ctx.fillStyle = rand() > 0.8 ? TEAL : '#e2f2ff';
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        // soft glow
        const glow = ctx.createRadialGradient(CARD_W * 0.8, CARD_H * 0.35, 20, CARD_W * 0.8, CARD_H * 0.35, 460);
        glow.addColorStop(0, 'rgba(63,217,236,0.28)');
        glow.addColorStop(1, 'rgba(63,217,236,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, CARD_W, CARD_H);
        const glow2 = ctx.createRadialGradient(CARD_W * 0.15, CARD_H * 0.95, 10, CARD_W * 0.15, CARD_H * 0.95, 380);
        glow2.addColorStop(0, 'rgba(255,179,71,0.22)');
        glow2.addColorStop(1, 'rgba(255,179,71,0)');
        ctx.fillStyle = glow2;
        ctx.fillRect(0, 0, CARD_W, CARD_H);
        // decorative orbs (planets)
        drawOrb(ctx, CARD_W - 150, 150, 70, TEAL);
        drawOrb(ctx, CARD_W - 60, 300, 26, AMBER);
        // outer rounded frame
        roundRect(ctx, 18, 18, CARD_W - 36, CARD_H - 36, 44);
        ctx.strokeStyle = 'rgba(63,217,236,0.35)';
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    function drawWordmark(ctx) {
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillStyle = AMBER;
        ctx.font = `800 40px ${FONT}`;
        ctx.fillText('TYPEMINE', 64, 92);
        const w = ctx.measureText('TYPEMINE').width;
        ctx.fillStyle = TEAL;
        ctx.font = `700 40px ${FONT}`;
        ctx.fillText('GALACTIC', 64 + w + 16, 92);
    }

    function drawFooter(ctx) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = 'rgba(143,166,200,0.85)';
        ctx.font = `600 22px ${FONT}`;
        ctx.fillText('typemine', CARD_W - 64, CARD_H - 44);
    }

    function drawStat(ctx, x, y, label, value) {
        drawCapsule(ctx, x - 20, y - 40, 260, 118, { glow: 'rgba(63,217,236,0.35)' });
        ctx.textAlign = 'left';
        ctx.fillStyle = MUTED;
        ctx.font = `700 20px ${FONT}`;
        ctx.fillText(label.toUpperCase(), x + 4, y);
        ctx.fillStyle = '#f2fbff';
        ctx.font = `800 50px ${FONT}`;
        ctx.fillText(value, x + 4, y + 56);
    }

    function makeCanvas() {
        const canvas = document.createElement('canvas');
        canvas.width = CARD_W;
        canvas.height = CARD_H;
        return canvas;
    }

    function drawResultCard(summaryIn) {
        const s = normalizeSummary(summaryIn);
        const canvas = makeCanvas();
        const ctx = canvas.getContext('2d');
        drawBackground(ctx);
        drawWordmark(ctx);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#e6f6ff';
        ctx.font = `700 34px ${FONT}`;
        ctx.fillText(`${s.name}  in  ${s.modeLabel}`, 64, 168);

        // WPM, huge, with a soft teal glow
        ctx.save();
        ctx.shadowColor = 'rgba(63,217,236,0.55)';
        ctx.shadowBlur = 36;
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 220px ${FONT}`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(String(s.wpm), 56, 410);
        const wpmWidth = ctx.measureText(String(s.wpm)).width;
        ctx.restore();
        ctx.fillStyle = TEAL;
        ctx.font = `800 64px ${FONT}`;
        ctx.fillText('WPM', 56 + wpmWidth + 24, 410);
        if (s.isPB) {
            ctx.fillStyle = AMBER;
            ctx.font = `800 30px ${FONT}`;
            ctx.fillText('Personal best', 56 + wpmWidth + 28, 350);
        }

        drawStat(ctx, 84, 500, 'Accuracy', `${s.accuracy}%`);
        drawStat(ctx, 384, 500, 'Time', formatTime(s.time));
        drawStat(ctx, 684, 500, 'Date', formatDate(s.date));
        drawFooter(ctx);
        return canvas;
    }

    function normalizeRecap(data) {
        const d = data && typeof data === 'object' ? data : {};
        return {
            name: cleanName(d.name || currentPlayerName()),
            weekLabel: String(d.weekLabel || 'This week').slice(0, 40),
            runs: Math.round(clampNumber(d.runs, 0, 100000)),
            bestWpm: Math.round(clampNumber(d.bestWpm, 0, 400)),
            avgWpm: Math.round(clampNumber(d.avgWpm ?? d.averageWpm, 0, 400)),
            words: Math.round(clampNumber(d.words, 0, 10000000)),
            accuracy: Math.round(clampNumber(d.accuracy ?? d.averageAccuracy, 0, 100)),
            streak: Math.round(clampNumber(d.streak, 0, 10000)),
            date: new Date(Number(d.date) || Date.now()),
        };
    }

    function drawRecapCard(dataIn) {
        const r = normalizeRecap(dataIn);
        const canvas = makeCanvas();
        const ctx = canvas.getContext('2d');
        drawBackground(ctx);
        drawWordmark(ctx);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#e6f6ff';
        ctx.font = `700 34px ${FONT}`;
        ctx.fillText(`${r.name}'s weekly recap  (${r.weekLabel})`, 64, 168);

        ctx.save();
        ctx.shadowColor = 'rgba(63,217,236,0.55)';
        ctx.shadowBlur = 30;
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 150px ${FONT}`;
        ctx.fillText(String(r.bestWpm), 56, 320);
        const w = ctx.measureText(String(r.bestWpm)).width;
        ctx.restore();
        ctx.fillStyle = TEAL;
        ctx.font = `800 48px ${FONT}`;
        ctx.fillText('best WPM this week', 56 + w + 20, 320);

        drawStat(ctx, 84, 410, 'Runs', r.runs.toLocaleString());
        drawStat(ctx, 384, 410, 'Average', `${r.avgWpm} WPM`);
        drawStat(ctx, 684, 410, 'Accuracy', `${r.accuracy}%`);
        drawStat(ctx, 84, 540, 'Words', r.words.toLocaleString());
        drawStat(ctx, 384, 540, 'Streak', `${r.streak} day${r.streak === 1 ? '' : 's'}`);
        drawStat(ctx, 684, 540, 'Date', formatDate(r.date));
        drawFooter(ctx);
        return canvas;
    }

    function canvasToBlob(canvas) {
        return new Promise((resolve, reject) => {
            try {
                canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not draw the card.'))), 'image/png');
            } catch (e) {
                reject(e);
            }
        });
    }

    async function render(summary) {
        return canvasToBlob(drawResultCard(summary));
    }

    async function renderRecap(data) {
        return canvasToBlob(drawRecapCard(data));
    }

    // ?r= link: URL-safe base64 of a small JSON object.
    function encodeShareParam(obj) {
        const json = JSON.stringify(obj);
        const b64 = btoa(unescape(encodeURIComponent(json)));
        return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function decodeShareParam(raw) {
        try {
            let b64 = String(raw || '').replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4) b64 += '=';
            const json = decodeURIComponent(escape(atob(b64)));
            const obj = JSON.parse(json);
            if (!obj || typeof obj !== 'object') return null;
            const wpm = Math.round(clampNumber(obj.wpm, 0, 400, NaN));
            if (!Number.isFinite(wpm) || wpm <= 0) return null;
            return {
                wpm,
                accuracy: Math.round(clampNumber(obj.accuracy, 0, 100)),
                mode: SHARE_MODES.includes(String(obj.mode)) ? String(obj.mode) : 'quotes',
                name: cleanName(obj.name),
            };
        } catch (e) {
            return null;
        }
    }

    function buildShareLink(summary) {
        const s = normalizeSummary(summary);
        const payload = { wpm: s.wpm, accuracy: s.accuracy, mode: SHARE_MODES.includes(s.mode) ? s.mode : 'quotes', name: s.name };
        const base = `${location.origin}${location.pathname}`;
        return `${base}?r=${encodeShareParam(payload)}`;
    }

    function buildShareText(summary) {
        const s = normalizeSummary(summary);
        return `${s.name} typed ${s.wpm} WPM at ${s.accuracy}% accuracy in ${s.modeLabel} on TypeMine Galactic. Can you beat it?`;
    }

    function buildRecapText(data) {
        const r = normalizeRecap(data);
        return `${r.name}'s week on TypeMine Galactic: best ${r.bestWpm} WPM, ${r.runs} runs, ${r.words.toLocaleString()} words, ${r.accuracy}% accuracy.`;
    }

    async function copyText(text) {
        if (typeof copyTextToClipboard === 'function') return copyTextToClipboard(text);
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (e) {}
        return false;
    }

    function downloadBlob(blob, filename) {
        try {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                a.remove();
                URL.revokeObjectURL(url);
            }, 2000);
            return true;
        } catch (e) {
            return false;
        }
    }

    function toast(message, type = 'success') {
        if (typeof showUiMessage === 'function') showUiMessage(message, type, 3200, 'top-left');
    }

    async function shareBlob(blob, { filename, title, text, link }) {
        const file = (typeof File === 'function') ? new File([blob], filename, { type: 'image/png' }) : null;
        if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({ files: [file], title, text: link ? `${text} ${link}` : text });
                return 'shared';
            } catch (e) {
                if (e && e.name === 'AbortError') return 'cancelled';
                // fall through to the download path
            }
        }
        const downloaded = downloadBlob(blob, filename);
        const copied = await copyText(link ? `${text} ${link}` : text);
        if (downloaded && copied) toast('Card saved as a PNG. The summary and link are copied, ready to paste.');
        else if (downloaded) toast('Card saved as a PNG.');
        else if (copied) toast('Summary and link copied. The image could not be saved in this browser.', 'info');
        else toast('Sharing is not available in this browser.', 'error');
        return downloaded ? 'downloaded' : (copied ? 'copied' : 'failed');
    }

    // `challengeSpec` (optional) makes the shared link a challenge link, so the reader gets the same text.
    async function share(summary, { challengeSpec = null } = {}) {
        const s = normalizeSummary(summary);
        if (s.wpm <= 0) {
            toast('Finish a run first, then share it.', 'info');
            return 'nothing';
        }
        let blob;
        try {
            blob = await render(s);
        } catch (e) {
            toast('The card could not be drawn in this browser.', 'error');
            return 'failed';
        }
        const spec = normalizeChallengeSpec(challengeSpec);
        return shareBlob(blob, {
            filename: `typemine-${s.wpm}wpm.png`,
            title: 'My TypeMine Galactic result',
            text: spec ? buildChallengeText(s) : buildShareText(s),
            link: spec ? buildChallengeLink(s, spec) : buildShareLink(s),
        });
    }

    async function shareRecap(data) {
        const r = normalizeRecap(data);
        let blob;
        try {
            blob = await renderRecap(r);
        } catch (e) {
            toast('The recap card could not be drawn in this browser.', 'error');
            return 'failed';
        }
        return shareBlob(blob, {
            filename: 'typemine-weekly-recap.png',
            title: 'My week on TypeMine Galactic',
            text: buildRecapText(r),
            link: `${location.origin}${location.pathname}`,
        });
    }

    // Results overlay fallback when the shared summary object is not set yet.
    function summaryFromResultsOverlay() {
        const num = (id) => parseFloat(String(document.getElementById(id)?.textContent || '').replace(/[^\d.]/g, '')) || 0;
        const modeText = String(document.getElementById('final-test-type')?.textContent || '').trim();
        const mode = modeText.includes('30') ? 'words30' : (modeText.includes('word') ? 'words' : (modeText.includes('quote') ? 'quotes' : modeText));
        return {
            wpm: num('final-wpm'),
            accuracy: num('final-accuracy'),
            time: num('final-time'),
            mode,
            modeLabel: modeText ? modeLabel(mode) : undefined,
            date: Date.now(),
        };
    }

    function lastRunSummaryOrOverlay() {
        return (window.lastRunSummary && Number(window.lastRunSummary.wpm) > 0)
            ? window.lastRunSummary
            : summaryFromResultsOverlay();
    }

    function shareLastRun() {
        return share(lastRunSummaryOrOverlay(), { challengeSpec: lastRunChallengeSpec });
    }

    // ── Challenge a friend ──────────────────────────────────────────────────
    function pickTextOptions(options) {
        const src = options && typeof options === 'object' ? options : {};
        const out = {};
        for (const name of CHALLENGE_TEXT_OPTIONS) {
            if (!(name in src)) continue;
            const v = src[name];
            if (name === 'punctuation' || name === 'numbers') out[name] = v === true || v === 'true' || v === 1 || v === '1';
            else if (name === 'wordList') { if (CHALLENGE_OPTION_CHOICES.wordList.includes(v)) out[name] = v; }
            else { const n = Number(v); if (CHALLENGE_OPTION_CHOICES[name].includes(n)) out[name] = n; }
        }
        return out;
    }

    function normalizeChallengeSpec(spec) {
        if (!spec || typeof spec !== 'object') return null;
        const seed = Number(spec.seed);
        if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) return null;
        const mode = String(spec.mode || '');
        if (!CHALLENGE_MODES.includes(mode)) return null;
        return { seed, mode, options: pickTextOptions(spec.options) };
    }

    // Remembers the seed of the run that just finished so the results card can offer a challenge link.
    function captureChallengeSpec(summary) {
        lastRunChallengeSpec = null;
        if (typeof window.getCurrentTestSpec !== 'function') return;
        if (!summary || summary.counted === false || !(Number(summary.wpm) > 0)) return;
        try {
            const spec = window.getCurrentTestSpec();
            const mode = String(summary.mode || '');
            if (!spec || mode !== String(spec.mode || '') || !CHALLENGE_MODES.includes(mode)) return;
            // Text that is not rebuilt from the seed alone: challenge quests, Bible quotes, weak-key passages.
            if (typeof activeChallengeId !== 'undefined' && activeChallengeId) return;
            if (mode === 'quotes' && typeof bibleModeEnabled !== 'undefined' && bibleModeEnabled) return;
            if (mode === 'quotes' && typeof activeCommunityBoostMode !== 'undefined' && activeCommunityBoostMode === 'targeted_weakness') return;
            lastRunChallengeSpec = normalizeChallengeSpec({ seed: Number(spec.seed) >>> 0, mode, options: spec.options });
        } catch (e) {
            lastRunChallengeSpec = null;
        }
    }

    function decodeChallengeParam(raw) {
        try {
            let b64 = String(raw || '').replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4) b64 += '=';
            const obj = JSON.parse(decodeURIComponent(escape(atob(b64))));
            const spec = normalizeChallengeSpec(obj);
            if (!spec) return null;
            const wpm = Math.round(clampNumber(obj.wpm, 0, 400, NaN));
            if (!Number.isFinite(wpm) || wpm <= 0) return null;
            return {
                seed: spec.seed,
                mode: spec.mode,
                options: spec.options,
                wpm,
                accuracy: Math.round(clampNumber(obj.accuracy, 0, 100)),
                name: cleanName(obj.name),
            };
        } catch (e) {
            return null;
        }
    }

    function buildChallengeLink(summary, spec) {
        const clean = normalizeChallengeSpec(spec);
        if (!clean) return '';
        const s = normalizeSummary(summary);
        const payload = { seed: clean.seed, mode: clean.mode, options: clean.options, wpm: s.wpm, accuracy: s.accuracy, name: s.name };
        return `${location.origin}${location.pathname}?c=${encodeShareParam(payload)}`;
    }

    function buildChallengeText(summary) {
        const s = normalizeSummary(summary);
        return `${s.name} typed ${s.wpm} WPM at ${s.accuracy}% accuracy on this exact text in ${s.modeLabel}. Beat it?`;
    }

    // "Challenge a friend" on the results card: copies a link that reproduces this run's text.
    async function challengeLastRun() {
        const summary = lastRunSummaryOrOverlay();
        if (!lastRunChallengeSpec || !(Number(summary.wpm) > 0)) {
            toast('Challenge links work for Quotes, Random Words and Timed runs. Finish one of those first.', 'info');
            return '';
        }
        const link = buildChallengeLink(summary, lastRunChallengeSpec);
        const ok = await copyText(`${buildChallengeText(summary)} ${link}`);
        toast(ok ? 'Challenge link copied. Send it to a friend and they get this exact text.' : `Copy this link: ${link}`, ok ? 'success' : 'info');
        return link;
    }

    function startChallengeTest(data) {
        if (!data || typeof newTest !== 'function') return false;
        try {
            const splash = document.getElementById('entry-splash');
            if (splash && !splash.classList.contains('hidden') && typeof hideSplashScreen === 'function') hideSplashScreen();
            const outcome = document.getElementById('challenge-outcome');
            if (outcome) { outcome.hidden = true; outcome.innerHTML = ''; }
            newTest({ seed: data.seed, mode: data.mode, options: data.options });
            return true;
        } catch (e) {
            return false;
        }
    }

    function acceptChallenge(data) {
        activeChallenge = data;
        startChallengeTest(data);
    }

    function rematchChallenge() {
        if (!activeChallenge) return;
        startChallengeTest(activeChallenge);
    }

    function endChallenge() {
        activeChallenge = null;
        const outcome = document.getElementById('challenge-outcome');
        if (outcome) { outcome.hidden = true; outcome.innerHTML = ''; }
    }

    // Win/lose banner on the results card after a challenge run (same seed and mode as the link).
    function renderChallengeOutcome(summary) {
        const el = document.getElementById('challenge-outcome');
        if (!el) return;
        let spec = null;
        try { spec = typeof window.getCurrentTestSpec === 'function' ? window.getCurrentTestSpec() : null; } catch (e) { spec = null; }
        const matches = !!(activeChallenge && spec
            && (Number(spec.seed) >>> 0) === activeChallenge.seed
            && String(spec.mode || '') === activeChallenge.mode);
        if (!matches) {
            el.hidden = true;
            el.innerHTML = '';
            return;
        }
        const wpm = Math.round(Number(summary && summary.wpm) || 0);
        const theirs = activeChallenge.wpm;
        const name = activeChallenge.name;
        const won = wpm > theirs;
        const text = won
            ? `You beat ${name}: ${wpm} vs ${theirs} WPM!`
            : `${name} still leads, ${theirs} vs ${wpm}. Try again?`;
        el.className = `challenge-outcome ${won ? 'win' : 'lose'}`;
        el.innerHTML = `<span class="challenge-outcome-text">${esc(text)}</span>`
            + `<span class="challenge-outcome-actions">`
            + `<button type="button" class="secondary challenge-rematch-btn" onclick="rematchChallenge()">Rematch</button>`
            + (won ? `<button type="button" class="secondary challenge-return-btn" onclick="challengeLastRun()">Send it back</button>` : '')
            + `<button type="button" class="secondary challenge-done-btn" onclick="endChallenge()">Done</button>`
            + `</span>`;
        el.hidden = false;
    }

    function checkChallengeParam() {
        let raw = '';
        try { raw = String(new URLSearchParams(location.search).get('c') || ''); } catch (e) { return; }
        if (!raw) return;
        const data = decodeChallengeParam(raw);
        if (!data) {
            removeParam('c');
            return;
        }
        const text = `${data.name} typed ${data.wpm} WPM on this exact text. Beat it?`;
        if (typeof showSocialBanner === 'function') {
            showSocialBanner({
                id: 'challenge-banner',
                text,
                actions: [
                    { label: 'Try it', primary: true, onClick: () => { acceptChallenge(data); removeParam('c'); } },
                    { label: 'Not now', onClick: () => removeParam('c') },
                ],
            });
        } else {
            toast(text, 'info');
        }
    }

    document.addEventListener('typemine:run-finished', (event) => {
        const summary = (event && event.detail) || window.lastRunSummary;
        try { captureChallengeSpec(summary); } catch (e) {}
        try { renderChallengeOutcome(summary); } catch (e) {}
    });

    function startModeFromShare(mode) {
        if (typeof setMode !== 'function') return;
        try {
            if (document.getElementById('entry-splash') && !document.getElementById('entry-splash').classList.contains('hidden') && typeof hideSplashScreen === 'function') {
                hideSplashScreen();
            }
            setMode(SHARE_MODES.includes(mode) ? mode : 'quotes');
        } catch (e) {}
    }

    function removeParam(name) {
        try {
            const url = new URL(location.href);
            if (!url.searchParams.has(name)) return;
            url.searchParams.delete(name);
            history.replaceState(null, '', url.pathname + (url.search || '') + (url.hash || ''));
        } catch (e) {}
    }

    function checkSharedResultParam() {
        let raw = '';
        try { raw = String(new URLSearchParams(location.search).get('r') || ''); } catch (e) { return; }
        if (!raw) return;
        const data = decodeShareParam(raw);
        if (!data) {
            removeParam('r');
            return;
        }
        const text = `${data.name} typed ${data.wpm} WPM in ${modeLabel(data.mode)}. Can you beat it?`;
        if (typeof showSocialBanner === 'function') {
            showSocialBanner({
                id: 'shared-result-banner',
                text,
                actions: [
                    { label: 'Try it', primary: true, onClick: () => { startModeFromShare(data.mode); removeParam('r'); } },
                    { label: 'Not now', onClick: () => removeParam('r') },
                ],
            });
        } else {
            toast(text, 'info');
        }
    }

    window.ShareCard = {
        CARD_W,
        CARD_H,
        render,
        renderRecap,
        share,
        shareRecap,
        buildShareLink,
        buildShareText,
        decodeShareParam,
        encodeShareParam,
        drawResultCard,
        drawRecapCard,
        // challenge links
        CHALLENGE_MODES,
        encodeChallengeParam: encodeShareParam,
        decodeChallengeParam,
        buildChallengeLink,
        buildChallengeText,
        getLastRunChallengeSpec: () => (lastRunChallengeSpec ? { ...lastRunChallengeSpec, options: { ...lastRunChallengeSpec.options } } : null),
        getActiveChallenge: () => (activeChallenge ? { ...activeChallenge } : null),
        acceptChallenge,
    };
    window.shareLastRun = shareLastRun;
    window.challengeLastRun = challengeLastRun;
    window.rematchChallenge = rematchChallenge;
    window.endChallenge = endChallenge;

    window.addEventListener('DOMContentLoaded', () => {
        try { checkChallengeParam(); } catch (e) {}
        try { checkSharedResultParam(); } catch (e) {}
    });
})();
