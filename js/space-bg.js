/* ═══════════════════════════════════════════════════════════
   Animated Space Background — spiral galaxies, nebula, stars
   ═══════════════════════════════════════════════════════════ */
(function spaceBg() {
    const canvas = document.getElementById('space-bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, dpr;

    function resize() {
        dpr = Math.min(devicePixelRatio || 1, 2);
        W = innerWidth; H = innerHeight;
        canvas.width = W * dpr; canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        buildNebula();
    }

    /* ── Galaxy static textures (halo + core only) ── */
    function makeGalaxyBase(R, coreCol, midCol, outerCol) {
        const sz = Math.ceil(R * 2.6);
        const halo = document.createElement('canvas');
        halo.width = halo.height = sz;
        const h = halo.getContext('2d');
        const cx = sz / 2, cy = sz / 2;

        // Halo glow
        let gr = h.createRadialGradient(cx, cy, 0, cx, cy, R * 1.2);
        gr.addColorStop(0, midCol + '30');
        gr.addColorStop(0.5, outerCol + '14');
        gr.addColorStop(1, 'transparent');
        h.fillStyle = gr;
        h.fillRect(0, 0, sz, sz);

        const core = document.createElement('canvas');
        core.width = core.height = sz;
        const c = core.getContext('2d');

        // Bright core glow
        const cR = R * 0.17;
        gr = c.createRadialGradient(cx, cy, 0, cx, cy, cR);
        gr.addColorStop(0, '#ffffffee');
        gr.addColorStop(0.15, coreCol + 'cc');
        gr.addColorStop(0.45, midCol + '55');
        gr.addColorStop(1, 'transparent');
        c.fillStyle = gr;
        c.beginPath(); c.arc(cx, cy, cR, 0, Math.PI * 2); c.fill();

        // White hotspot
        gr = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.035);
        gr.addColorStop(0, '#ffffff');
        gr.addColorStop(1, '#ffffff00');
        c.fillStyle = gr;
        c.beginPath(); c.arc(cx, cy, R * 0.035, 0, Math.PI * 2); c.fill();
        return { halo, core, sz };
    }

    /* ── Draw spiral arms dynamically (called each frame) ── */
    function drawArms(gx, gy, R, tilt, coreCol, midCol, outerCol, armN, turnN, angleOff) {
        ctx.save();
        ctx.translate(gx, gy);
        ctx.scale(1, tilt);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';

        const seg = 70;
        for (let a = 0; a < armN; a++) {
            const base = (a / armN) * Math.PI * 2 + angleOff;
            const pts = [];
            for (let i = 0; i <= seg; i++) {
                const t = i / seg;
                const r = t * R * 0.88;
                const ang = base + t * Math.PI * 2 * turnN;
                pts.push({ x: Math.cos(ang) * r, y: Math.sin(ang) * r, t });
            }
            // Multi-pass glow with fading sections
            [
                { w: R * 0.15, a: 0.07, c: outerCol },
                { w: R * 0.09, a: 0.12, c: outerCol },
                { w: R * 0.05, a: 0.20, c: midCol },
                { w: R * 0.025, a: 0.34, c: midCol },
                { w: R * 0.012, a: 0.50, c: coreCol },
            ].forEach(p => {
                [
                    { s: 0, e: 0.45, as: 1.0 },
                    { s: 0.40, e: 0.75, as: 0.50 },
                    { s: 0.70, e: 1.0, as: 0.20 },
                ].forEach(sec => {
                    ctx.beginPath();
                    let on = false;
                    pts.forEach(pt => {
                        if (pt.t >= sec.s && pt.t <= sec.e) {
                            if (!on) { ctx.moveTo(pt.x, pt.y); on = true; }
                            else ctx.lineTo(pt.x, pt.y);
                        }
                    });
                    ctx.strokeStyle = p.c;
                    ctx.lineWidth = p.w * (1 - (sec.s + sec.e) / 2 * 0.5);
                    ctx.globalAlpha = p.a * sec.as;
                    ctx.stroke();
                });
            });
        }
        ctx.restore();
    }

    /* ── Galaxy definitions (matching reference) ── */
    const GD = [
        // Large central — purple / blue / cyan
        { x: .48, y: .46, R: 200, core: '#a5f3fc', mid: '#818cf8', out: '#7c3aed', n: 2, t: 2.8, tilt: .55, ang: .3, spd: .12 },
        // Bottom-left — orange / yellow
        { x: .20, y: .80, R: 145, core: '#fef3c7', mid: '#fbbf24', out: '#ea580c', n: 2, t: 2.5, tilt: .50, ang: -.4, spd: .15 },
        // Bottom-right — pink / magenta
        { x: .82, y: .78, R: 165, core: '#fdf2f8', mid: '#f472b6', out: '#a855f7', n: 2, t: 2.6, tilt: .50, ang: .6, spd: -.10 },
        // Top-left — cyan / teal
        { x: .16, y: .16, R: 105, core: '#ecfdf5', mid: '#22d3ee', out: '#0891b2', n: 2, t: 2.3, tilt: .60, ang: .8, spd: .18 },
        // Top-right — orange / warm
        { x: .88, y: .10, R: 85, core: '#fef3c7', mid: '#f97316', out: '#c2410c', n: 2, t: 2.0, tilt: .45, ang: -.2, spd: -.14 },
        // Small scattered galaxies
        { x: .07, y: .07, R: 42, core: '#c4b5fd', mid: '#818cf8', out: '#6d28d9', n: 2, t: 2.0, tilt: .50, ang: 1.2, spd: .25 },
        { x: .35, y: .22, R: 32, core: '#67e8f9', mid: '#06b6d4', out: '#0e7490', n: 2, t: 1.8, tilt: .60, ang: .5, spd: -.22 },
        { x: .65, y: .13, R: 28, core: '#fda4af', mid: '#f43f5e', out: '#9f1239', n: 2, t: 1.5, tilt: .55, ang: -.8, spd: .28 },
        { x: .92, y: .50, R: 35, core: '#e0e7ff', mid: '#a5b4fc', out: '#4f46e5', n: 2, t: 2.0, tilt: .50, ang: .3, spd: -.20 },
        { x: .05, y: .48, R: 22, core: '#d946ef', mid: '#a855f7', out: '#6b21a8', n: 2, t: 1.5, tilt: .50, ang: .7, spd: .25 },
    ];

    const GBase = GD.map(g => makeGalaxyBase(g.R, g.core, g.mid, g.out));

    /* ── Stars ── */
    const STARS = Array.from({ length: 350 }, () => ({
        x: Math.random(), y: Math.random(),
        r: 0.4 + Math.random() * 1.8,
        ba: 0.3 + Math.random() * 0.7,
        ts: 0.15 + Math.random() * 0.6,
        to: Math.random() * 6.28,
        c: ['#e2e8f0', '#7dd3fc', '#c4b5fd', '#f9a8d4', '#fde68a', '#a5f3fc', '#fff'][Math.floor(Math.random() * 7)]
    }));

    /* ── 4-pointed sparkles ── */
    const SPARKLES = [
        { x: .30, y: .13, s: 14, c: '#22d3ee' },
        { x: .72, y: .08, s: 10, c: '#f9a8d4' },
        { x: .10, y: .42, s: 12, c: '#c4b5fd' },
        { x: .55, y: .28, s: 8, c: '#7dd3fc' },
        { x: .90, y: .35, s: 11, c: '#f0abfc' },
        { x: .40, y: .70, s: 9, c: '#fde68a' },
        { x: .15, y: .88, s: 13, c: '#67e8f9' },
        { x: .68, y: .55, s: 8, c: '#e2e8f0' },
    ];

    /* ── Colorful orbs ── */
    const ORBS = [
        { x: .30, y: .58, r: 8, c: ['#3b82f6', '#1d4ed8'] },
        { x: .70, y: .28, r: 6, c: ['#ec4899', '#be185d'] },
        { x: .55, y: .68, r: 5, c: ['#22d3ee', '#0e7490'] },
        { x: .12, y: .38, r: 7, c: ['#8b5cf6', '#6d28d9'] },
        { x: .85, y: .58, r: 5, c: ['#f472b6', '#db2777'] },
        { x: .42, y: .10, r: 6, c: ['#60a5fa', '#2563eb'] },
        { x: .75, y: .50, r: 4, c: ['#c084fc', '#7c3aed'] },
        { x: .15, y: .63, r: 5, c: ['#22d3ee', '#06b6d4'] },
        { x: .62, y: .42, r: 4, c: ['#fb923c', '#ea580c'] },
    ];

    /* ── Pre-render nebula ── */
    let nebula;
    function buildNebula() {
        nebula = document.createElement('canvas');
        nebula.width = W * dpr; nebula.height = H * dpr;
        const g = nebula.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Base gradient
        const lin = g.createLinearGradient(0, 0, W, H);
        lin.addColorStop(0, '#0b0333');
        lin.addColorStop(0.36, '#17064f');
        lin.addColorStop(0.58, '#12033e');
        lin.addColorStop(1, '#06011f');
        g.fillStyle = lin;
        g.fillRect(0, 0, W, H);

        // Nebula clouds
        [
            { x: .50, y: .48, rx: 450, ry: 280, c: 'rgba(56,189,248,0.18)' },
            { x: .22, y: .22, rx: 380, ry: 240, c: 'rgba(139,92,246,0.30)' },
            { x: .80, y: .78, rx: 350, ry: 220, c: 'rgba(168,85,247,0.22)' },
            { x: .60, y: .60, rx: 400, ry: 250, c: 'rgba(20,184,166,0.14)' },
            { x: .15, y: .75, rx: 250, ry: 180, c: 'rgba(236,72,153,0.14)' },
            { x: .85, y: .12, rx: 200, ry: 150, c: 'rgba(249,115,22,0.12)' },
            { x: .48, y: .46, rx: 300, ry: 210, c: 'rgba(99,102,241,0.18)' },
            // Dark patches for depth
            { x: .35, y: .55, rx: 200, ry: 130, c: 'rgba(8,3,30,0.50)' },
            { x: .70, y: .42, rx: 180, ry: 120, c: 'rgba(8,3,30,0.40)' },
            { x: .55, y: .20, rx: 160, ry: 100, c: 'rgba(8,3,30,0.30)' },
        ].forEach(cl => {
            const mx = Math.max(cl.rx, cl.ry);
            const gr = g.createRadialGradient(cl.x * W, cl.y * H, 0, cl.x * W, cl.y * H, mx);
            gr.addColorStop(0, cl.c);
            gr.addColorStop(1, 'transparent');
            g.save();
            g.translate(cl.x * W, cl.y * H);
            g.scale(1, cl.ry / cl.rx);
            g.translate(-cl.x * W, -cl.y * H);
            g.fillStyle = gr;
            g.fillRect(cl.x * W - mx, cl.y * H - mx, mx * 2, mx * 2);
            g.restore();
        });
    }

    /* ── Draw sparkle shape ── */
    function drawSparkle(x, y, s, c, alpha) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.12, y);
        ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.12, y);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - s, y); ctx.lineTo(x, y + s * 0.12);
        ctx.lineTo(x + s, y); ctx.lineTo(x, y - s * 0.12);
        ctx.closePath(); ctx.fill();
    }

    /* ── Animation loop ── */
    let time = 0;
    function frame() {
        requestAnimationFrame(frame);
        time += 1 / 60;

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        // Nebula base
        if (nebula) ctx.drawImage(nebula, 0, 0, W, H);

        // Galaxies — halo, then dynamic arms, then core
        GD.forEach((g, i) => {
            const { halo, core, sz } = GBase[i];
            const half = sz / 2;
            const gx = g.x * W, gy = g.y * H;

            // Halo (static, tilted)
            ctx.save();
            ctx.translate(gx, gy);
            ctx.scale(1, g.tilt);
            ctx.globalAlpha = 0.92;
            ctx.drawImage(halo, -half, -half, sz, sz);
            ctx.restore();

            // Arms (drawn dynamically — spiral flows around core)
            drawArms(gx, gy, g.R, g.tilt, g.core, g.mid, g.out, g.n, g.t, g.ang + time * g.spd);

            // Core (static, tilted, on top)
            ctx.save();
            ctx.translate(gx, gy);
            ctx.scale(1, g.tilt);
            ctx.globalAlpha = 1;
            ctx.drawImage(core, -half, -half, sz, sz);
            ctx.restore();
        });

        ctx.globalAlpha = 1;

        // Orbs with glow
        ORBS.forEach(o => {
            const ox = o.x * W, oy = o.y * H;
            ctx.save();
            ctx.globalAlpha = 0.35 + 0.1 * Math.sin(time * 1.5 + o.x * 10);
            ctx.shadowColor = o.c[0]; ctx.shadowBlur = o.r * 4;
            ctx.fillStyle = o.c[0];
            ctx.beginPath(); ctx.arc(ox, oy, o.r, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
            const og = ctx.createRadialGradient(ox - o.r * .3, oy - o.r * .3, 0, ox, oy, o.r);
            og.addColorStop(0, o.c[0]); og.addColorStop(1, o.c[1]);
            ctx.fillStyle = og;
            ctx.beginPath(); ctx.arc(ox, oy, o.r, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        });

        // Twinkling stars
        STARS.forEach(s => {
            ctx.globalAlpha = s.ba * (0.7 + 0.3 * Math.sin(time * s.ts + s.to));
            ctx.fillStyle = s.c;
            ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); ctx.fill();
        });

        // Sparkles
        SPARKLES.forEach(sp => {
            const a = 0.5 + 0.5 * Math.sin(time * 1.2 + sp.x * 20);
            drawSparkle(sp.x * W, sp.y * H, sp.s * (0.7 + 0.3 * a), sp.c, a);
        });

        // Shooting stars
        if (time >= nextShoot) spawnShootingStar();
        shootingStars.forEach(ss => {
            if (time < ss.start || time > ss.start + ss.dur) return;
            const p = (time - ss.start) / ss.dur;
            const headX = ss.x0 + ss.dx * p;
            const headY = ss.y0 + ss.dy * p;
            const tailLen = ss.len;
            const tailX = headX - (ss.dx / Math.hypot(ss.dx, ss.dy)) * tailLen;
            const tailY = headY - (ss.dy / Math.hypot(ss.dx, ss.dy)) * tailLen;
            const fade = p < 0.15 ? p / 0.15 : p > 0.7 ? (1 - p) / 0.3 : 1;
            const gr = ctx.createLinearGradient(tailX, tailY, headX, headY);
            gr.addColorStop(0, 'transparent');
            gr.addColorStop(0.6, ss.color + '80');
            gr.addColorStop(1, '#ffffff');
            ctx.save();
            ctx.globalAlpha = fade * 0.9;
            ctx.strokeStyle = gr;
            ctx.lineWidth = ss.width;
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(headX, headY); ctx.stroke();
            // Bright head glow
            ctx.globalAlpha = fade;
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(headX, headY, ss.width * 0.8, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        });

        ctx.globalAlpha = 1;
    }

    /* ── Shooting stars — spawn occasionally ── */
    const shootingStars = [];
    let nextShoot = 3 + Math.random() * 5;

    function spawnShootingStar() {
        const angle = Math.random() * Math.PI * 2; // any direction
        const speed = 1.8 + Math.random() * 1.4;
        const dist = Math.max(W, H) * (0.4 + Math.random() * 0.5);
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        // Random origin anywhere on screen
        const x0 = W * Math.random();
        const y0 = H * Math.random();
        shootingStars.push({
            x0, y0, dx, dy,
            dur: speed,
            start: time,
            len: 60 + Math.random() * 100,
            width: 1.2 + Math.random() * 1.5,
            color: ['#a5f3fc', '#c4b5fd', '#fde68a', '#f9a8d4', '#e2e8f0'][Math.floor(Math.random() * 5)]
        });
        // Clean up old ones
        while (shootingStars.length > 5) shootingStars.shift();
        nextShoot = time + 4 + Math.random() * 10;
    }

    resize();
    addEventListener('resize', resize);
    frame();
})();
