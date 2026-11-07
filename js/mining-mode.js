(function attachIncrementalMining(global) {
    'use strict';

    const MINING_STATE_STORAGE_KEY = 'sampire-mining-state-v1';
    const MINING_COMMUNITY_STORAGE_KEY = 'sampire-mining-community-buffer-v1';
    const DEFAULT_LAYER_HP = [84, 132, 196, 284, 396];
    const DEFAULT_BASE_DAMAGE = 6;
    const OVERLOAD_DURATION_MS = 10000;
    const OVERLOAD_CHARGE_PER_WORD = 2;
    const STORY_LIBRARY = [
        {
            id: 'alice-in-wonderland',
            name: 'Alice in Wonderland',
            assetPath: 'assets/library/alice-in-wonderland.json',
            author: 'Lewis Carroll',
            locked: false,
        },
        {
            id: 'sherlock-holmes',
            name: 'The Adventures of Sherlock Holmes',
            assetPath: 'assets/library/sherlock-holmes.json',
            author: 'Arthur Conan Doyle',
            locked: false,
        },
        {
            id: 'twenty-thousand-leagues',
            name: 'Twenty Thousand Leagues Under the Sea',
            assetPath: 'assets/library/twenty-thousand-leagues.json',
            author: 'Jules Verne',
            locked: false,
        },
    ];
    const DRONE_SPECIALIZATIONS = [
        {
            id: 'swarm',
            name: 'Swarm Firmware',
            description: 'Doubles drone attack speed while each individual hit lands lighter.',
            unlockLevel: 10,
            attackSpeedMultiplier: 2,
            passiveDamageMultiplier: 1,
            perShotDamageMultiplier: 0.5,
            passiveCritChance: 0,
            doubleCrystalChance: 0,
        },
        {
            id: 'precision',
            name: 'Precision Firmware',
            description: 'Drones have a 25% chance to channel your current critical damage multiplier.',
            unlockLevel: 15,
            attackSpeedMultiplier: 1,
            passiveDamageMultiplier: 1,
            perShotDamageMultiplier: 1,
            passiveCritChance: 0.25,
            doubleCrystalChance: 0,
        },
        {
            id: 'salvage',
            name: 'Salvage Firmware',
            description: 'Drones deal 20% less damage, but occasionally recover double crystal payloads.',
            unlockLevel: 20,
            attackSpeedMultiplier: 1,
            passiveDamageMultiplier: 0.8,
            perShotDamageMultiplier: 0.8,
            passiveCritChance: 0,
            doubleCrystalChance: 0.05,
        },
    ];

    const MINING_UPGRADES = [
        {
            id: 'automated_drones',
            name: 'Automated Limpet Drones',
            description: 'Deploys autonomous drones that add passive asteroid damage every second.',
            category: 'automation',
            baseCost: 25,
            costScale: 1.42,
            maxLevel: 50,
            effect(level) {
                return { dps: level * 3.5 };
            },
        },
        {
            id: 'laser_drills',
            name: 'Laser Drills',
            description: 'Increases the base damage applied by active typing bursts.',
            category: 'active',
            baseCost: 40,
            costScale: 1.55,
            maxLevel: 25,
            effect(level) {
                return { baseDamageBonus: level * 2.25 };
            },
        },
        {
            id: 'buffer_optimizations',
            name: 'Buffer Optimizations',
            description: 'Converts high WPM runs into stronger burst multipliers and steadier crystal yields.',
            category: 'bridge',
            baseCost: 65,
            costScale: 1.6,
            maxLevel: 20,
            effect(level) {
                return {
                    wpmMultiplierBonus: level * 0.035,
                    crystalYieldBonus: level * 0.04,
                };
            },
        },
        {
            id: 'neural_focus',
            name: 'Neural Focus',
            description: 'Sharpens target lock routines to raise critical hit frequency.',
            category: 'critical',
            baseCost: 90,
            costScale: 1.68,
            maxLevel: 25,
            effect(level) {
                return { critChanceBonus: level * 0.01 };
            },
        },
        {
            id: 'overclocked_actuators',
            name: 'Overclocked Actuators',
            description: 'Pushes strike servos past spec, increasing critical hit damage.',
            category: 'critical',
            baseCost: 120,
            costScale: 1.74,
            maxLevel: 20,
            effect(level) {
                return { critMultiplierBonus: level * 0.2 };
            },
        },
    ];

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function roundTo(value, digits) {
        const factor = 10 ** digits;
        return Math.round(value * factor) / factor;
    }

    function formatMiningNumber(value) {
        const num = Math.max(0, Number(value) || 0);
        if (num < 1000) return String(Math.round(num));
        const suffixes = [
            { value: 1e9, suffix: 'B' },
            { value: 1e6, suffix: 'M' },
            { value: 1e3, suffix: 'K' },
        ];
        for (const entry of suffixes) {
            if (num >= entry.value) {
                const scaled = num / entry.value;
                const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
                return `${Number(scaled.toFixed(decimals))}${entry.suffix}`;
            }
        }
        return String(Math.round(num));
    }

    function formatDamageText(value, options) {
        const settings = options && typeof options === 'object' ? options : {};
        const isCritical = !!settings.isCritical;
        const num = Math.max(0, Number(value) || 0);
        const suffixes = [
            { value: 1e15, suffix: 'Q' },
            { value: 1e12, suffix: 'T' },
            { value: 1e9, suffix: 'B' },
            { value: 1e6, suffix: 'M' },
            { value: 1e3, suffix: 'K' },
        ];
        let out = '';
        for (const entry of suffixes) {
            if (num >= entry.value) {
                out = `${(num / entry.value).toFixed(1).replace(/\.0$/, '')}${entry.suffix}`;
                break;
            }
        }
        if (!out) out = num >= 100 ? String(Math.round(num)) : num.toFixed(1).replace(/\.0$/, '');
        return isCritical ? `${out}!!` : out;
    }

    function createSeededRandom(seed) {
        let state = (Number(seed) || 0) >>> 0;
        return function nextRandom() {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 4294967296;
        };
    }

    function hexToRgb(hex) {
        const clean = String(hex || '').replace('#', '');
        const normalized = clean.length === 3
            ? clean.split('').map((char) => char + char).join('')
            : clean.padEnd(6, '0').slice(0, 6);
        return {
            r: parseInt(normalized.slice(0, 2), 16),
            g: parseInt(normalized.slice(2, 4), 16),
            b: parseInt(normalized.slice(4, 6), 16),
        };
    }

    function mixRgb(a, b, t) {
        const ratio = clamp(Number(t) || 0, 0, 1);
        return {
            r: Math.round(a.r + (b.r - a.r) * ratio),
            g: Math.round(a.g + (b.g - a.g) * ratio),
            b: Math.round(a.b + (b.b - a.b) * ratio),
        };
    }

    function coordNoise(x, y, seed) {
        let n = (((x + 11) * 374761393) ^ ((y + 7) * 668265263) ^ (((seed >>> 0) + 1) * 2147483647)) >>> 0;
        n = (n ^ (n >> 13)) >>> 0;
        n = Math.imul(n, 1274126177) >>> 0;
        n = (n ^ (n >> 16)) >>> 0;
        return n / 4294967295;
    }

    function pointInPolygon(px, py, points) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].x;
            const yi = points[i].y;
            const xj = points[j].x;
            const yj = points[j].y;
            const intersects = ((yi > py) !== (yj > py))
                && (px < ((xj - xi) * (py - yi) / ((yj - yi) || 1e-9)) + xi);
            if (intersects) inside = !inside;
        }
        return inside;
    }

    function distanceToSegment(px, py, ax, ay, bx, by) {
        const abx = bx - ax;
        const aby = by - ay;
        const apx = px - ax;
        const apy = py - ay;
        const abLenSq = (abx * abx) + (aby * aby) || 1e-9;
        const t = clamp(((apx * abx) + (apy * aby)) / abLenSq, 0, 1);
        const cx = ax + (abx * t);
        const cy = ay + (aby * t);
        return Math.hypot(px - cx, py - cy);
    }

    function getAsteroidPalette() {
        return {
            shadow: hexToRgb('#1a1a2e'),
            mid: hexToRgb('#4e5d6c'),
            rim: hexToRgb('#e0e0e0'),
            gold: hexToRgb('#fbc02d'),
            crater: hexToRgb('#11111d'),
            craterRim: hexToRgb('#2e3644'),
        };
    }

    function generateAsteroidArtSpec(seed, options) {
        const settings = options && typeof options === 'object' ? options : {};
        const rand = createSeededRandom(seed);
        const size = Math.max(24, Math.floor(Number(settings.size) || 40));
        const centerX = (size / 2) - 0.5;
        const centerY = (size / 2) - 0.5;
        const pointCount = 20 + Math.floor(rand() * 8);
        const baseRadius = (size * 0.33) + (rand() * size * 0.05);
        const outline = [];
        const rawRadii = [];

        for (let i = 0; i < pointCount; i++) {
            const step = (Math.PI * 2 * i) / pointCount;
            const angleJitter = (rand() - 0.5) * (Math.PI / pointCount) * 0.22;
            const angle = step + angleJitter;
            const radiusScale = 0.86 + (rand() * 0.18);
            const spikeBias = rand() > 0.92 ? 1.015 + (rand() * 0.05) : 1;
            const edgeNoise = (Math.sin((angle * 2.2) + (rand() * Math.PI * 2)) * 0.2) + ((rand() - 0.5) * 0.34);
            rawRadii.push({
                angle,
                radius: baseRadius * radiusScale * spikeBias + edgeNoise,
            });
        }

        for (let i = 0; i < pointCount; i++) {
            const prev2 = rawRadii[(i - 2 + pointCount) % pointCount];
            const prev = rawRadii[(i - 1 + pointCount) % pointCount];
            const current = rawRadii[i];
            const next = rawRadii[(i + 1) % pointCount];
            const next2 = rawRadii[(i + 2) % pointCount];
            const smoothedRadius = (
                (prev2.radius * 0.12) +
                (prev.radius * 0.2) +
                (current.radius * 0.36) +
                (next.radius * 0.2) +
                (next2.radius * 0.12)
            );
            outline.push({
                x: centerX + Math.cos(current.angle) * smoothedRadius,
                y: centerY + Math.sin(current.angle) * smoothedRadius,
            });
        }

        const craters = [];
        const craterCount = 3 + Math.floor(rand() * 4);
        for (let i = 0; i < craterCount; i++) {
            let crater = null;
            for (let tries = 0; tries < 36; tries++) {
                const x = Math.floor(size * 0.24 + (rand() * size * 0.52));
                const y = Math.floor(size * 0.24 + (rand() * size * 0.52));
                if (!pointInPolygon(x + 0.5, y + 0.5, outline)) continue;
                if (Math.hypot(x - centerX, y - centerY) > baseRadius * 0.82) continue;
                crater = {
                    x,
                    y,
                    radiusX: 2 + Math.floor(rand() * 3),
                    radiusY: 2 + Math.floor(rand() * 3),
                    jaggedness: 0.14 + rand() * 0.26,
                    seed: Math.floor(rand() * 1e9),
                };
                break;
            }
            if (crater) craters.push(crater);
        }

        return {
            seed: (Number(seed) || 0) >>> 0,
            size,
            centerX,
            centerY,
            baseRadius,
            outline,
            craters,
            rotationDeg: Math.round(rand() * 360),
        };
    }

    function drawAsteroidToCanvas(canvas, spec) {
        if (!canvas || typeof canvas.getContext !== 'function' || !spec) return false;
        const size = Math.max(16, Math.floor(Number(spec.size) || 32));
        canvas.width = size;
        canvas.height = size;
        canvas.style.background = 'transparent';
        const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
        if (!ctx) return false;
        ctx.clearRect(0, 0, size, size);
        ctx.imageSmoothingEnabled = false;

        const image = ctx.createImageData(size, size);
        const pixels = image.data;
        const filled = Array.from({ length: size }, () => Array(size).fill(false));
        const edgeDistance = Array.from({ length: size }, () => Array(size).fill(Infinity));
        const palette = getAsteroidPalette();

        const setPixel = (x, y, color, alpha) => {
            if (x < 0 || y < 0 || x >= size || y >= size) return;
            const idx = (y * size + x) * 4;
            pixels[idx] = color.r;
            pixels[idx + 1] = color.g;
            pixels[idx + 2] = color.b;
            pixels[idx + 3] = alpha;
        };

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const px = x + 0.5;
                const py = y + 0.5;
                if (!pointInPolygon(px, py, spec.outline)) continue;
                filled[y][x] = true;

                let minEdge = Infinity;
                for (let i = 0; i < spec.outline.length; i++) {
                    const a = spec.outline[i];
                    const b = spec.outline[(i + 1) % spec.outline.length];
                    const d = distanceToSegment(px, py, a.x, a.y, b.x, b.y);
                    if (d < minEdge) minEdge = d;
                }
                edgeDistance[y][x] = minEdge;

                const dx = px - spec.centerX;
                const dy = py - spec.centerY;
                const radial = clamp(Math.hypot(dx, dy) / Math.max(1, spec.baseRadius * 1.05), 0, 1.2);
                const nx = dx / Math.max(1, spec.baseRadius);
                const ny = dy / Math.max(1, spec.baseRadius);
                const directional = clamp(0.48 + (nx * 0.44) + (ny * 0.44), 0, 1);
                const edgeRoughness = (coordNoise(x, y, spec.seed) - 0.5) * 0.18;
                const shadowMix = clamp(0.1 + directional * 0.9 + radial * 0.18 + edgeRoughness, 0, 1);
                let color = mixRgb(palette.mid, palette.shadow, shadowMix);

                const rimLight = clamp(((3.1 - minEdge) / 3.1), 0, 1)
                    * clamp(1 - directional, 0, 1)
                    * 1;
                if (rimLight > 0.01) {
                    const rimColor = coordNoise(x + 19, y + 5, spec.seed) > 0.58 ? palette.gold : palette.rim;
                    color = mixRgb(color, rimColor, rimLight);
                }

                const faceLight = clamp(0.22 + ((-nx * 0.34) + (-ny * 0.34)), 0, 0.5);
                if (faceLight > 0.02) color = mixRgb(color, palette.rim, faceLight * 0.38);

                setPixel(x, y, color, 255);
            }
        }

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (!filled[y][x]) continue;
                const edgePixel = !filled[y][x - 1] || !filled[y][x + 1] || !filled[y - 1]?.[x] || !filled[y + 1]?.[x];
                if (!edgePixel) continue;
                const idx = (y * size + x) * 4;
                const current = { r: pixels[idx], g: pixels[idx + 1], b: pixels[idx + 2] };
                const topLeftEdge = (x + y) < size * 0.92;
                const contour = topLeftEdge
                    ? mixRgb(current, coordNoise(x + 31, y + 47, spec.seed) > 0.62 ? palette.gold : palette.rim, 0.48)
                    : mixRgb(current, palette.shadow, 0.42);
                pixels[idx] = contour.r;
                pixels[idx + 1] = contour.g;
                pixels[idx + 2] = contour.b;
            }
        }

        for (const crater of spec.craters) {
            for (let y = Math.max(0, crater.y - crater.radiusY - 2); y <= Math.min(size - 1, crater.y + crater.radiusY + 2); y++) {
                for (let x = Math.max(0, crater.x - crater.radiusX - 2); x <= Math.min(size - 1, crater.x + crater.radiusX + 2); x++) {
                    if (!filled[y][x]) continue;
                    const localNoise = (coordNoise(x + 3, y + 11, crater.seed) - 0.5) * crater.jaggedness * 2;
                    const dx = (x - crater.x) / Math.max(1, crater.radiusX);
                    const dy = (y - crater.y) / Math.max(1, crater.radiusY);
                    const shape = Math.abs(dx) ** 1.35 + Math.abs(dy) ** 1.18 + localNoise;
                    if (shape > 1) continue;
                    const idx = (y * size + x) * 4;
                    const current = { r: pixels[idx], g: pixels[idx + 1], b: pixels[idx + 2] };
                    const depthMix = clamp(0.48 + ((1 - shape) * 0.34), 0, 0.9);
                    let craterColor = mixRgb(current, palette.crater, depthMix);
                    const bottomEdge = dy > 0.3 && shape > 0.58;
                    const rimEdge = shape > 0.72;
                    if (bottomEdge) craterColor = mixRgb(craterColor, palette.rim, 0.42);
                    else if (rimEdge && dx > 0.08 && dy > -0.15) craterColor = mixRgb(craterColor, palette.craterRim, 0.58);
                    pixels[idx] = craterColor.r;
                    pixels[idx + 1] = craterColor.g;
                    pixels[idx + 2] = craterColor.b;
                }
            }
        }

        ctx.putImageData(image, 0, 0);
        return true;
    }

    function createDefaultMiningState() {
        return {
            version: 3,
            totalAetherCrystals: 0,
            asteroidHP: DEFAULT_LAYER_HP[0],
            asteroidMaxHP: DEFAULT_LAYER_HP[0],
            currentLayer: 0,
            currentStoryBookId: 'alice-in-wonderland',
            currentStoryProgress: 0,
            dps: 0,
            critChance: 0.05,
            critMultiplier: 2,
            overloadMeter: 0,
            overloadEndsAt: 0,
            droneSpecialization: '',
            totalDamageDealt: 0,
            lastTickAt: Date.now(),
            lastActiveAt: 0,
            upgrades: Object.fromEntries(MINING_UPGRADES.map((upgrade) => [upgrade.id, 0])),
            storyProgressByBook: {
                'alice-in-wonderland': 0,
            },
            communityContribution: {
                pendingDamage: 0,
                lifetimeDamage: 0,
            },
        };
    }

    function sanitizeState(rawState) {
        const fallback = createDefaultMiningState();
        const state = rawState && typeof rawState === 'object' ? rawState : {};
        const upgrades = {};
        const storyProgressByBook = {};

        for (const def of MINING_UPGRADES) {
            upgrades[def.id] = clamp(Math.floor(Number(state.upgrades && state.upgrades[def.id]) || 0), 0, def.maxLevel);
        }

        for (const book of STORY_LIBRARY) {
            if (book.locked) continue;
            storyProgressByBook[book.id] = Math.max(0, Math.floor(Number(
                state.storyProgressByBook && state.storyProgressByBook[book.id],
            ) || (book.id === fallback.currentStoryBookId ? fallback.currentStoryProgress : 0)));
        }

        const currentStoryBookId = STORY_LIBRARY.some((book) => !book.locked && book.id === state.currentStoryBookId)
            ? state.currentStoryBookId
            : fallback.currentStoryBookId;
        const currentStoryProgress = Math.max(
            0,
            Math.floor(Number(
                state.currentStoryProgress != null
                    ? state.currentStoryProgress
                    : storyProgressByBook[currentStoryBookId],
            ) || 0),
        );
        storyProgressByBook[currentStoryBookId] = currentStoryProgress;

        return {
            version: 3,
            totalAetherCrystals: Math.max(0, Math.floor(Number(state.totalAetherCrystals) || 0)),
            asteroidHP: Math.max(0, Number.isFinite(Number(state.asteroidHP)) && state.asteroidHP !== null && state.asteroidHP !== '' ? Number(state.asteroidHP) : fallback.asteroidHP),
            asteroidMaxHP: Math.max(1, Number(state.asteroidMaxHP) || fallback.asteroidMaxHP),
            currentLayer: Math.max(0, Math.floor(Number(state.currentLayer) || 0)),
            currentStoryBookId,
            currentStoryProgress,
            dps: Math.max(0, Number(state.dps) || 0),
            critChance: Math.max(0, Number(state.critChance) || fallback.critChance),
            critMultiplier: Math.max(1, Number(state.critMultiplier) || fallback.critMultiplier),
            overloadMeter: clamp(Number(state.overloadMeter) || 0, 0, 100),
            overloadEndsAt: Math.max(0, Number(state.overloadEndsAt) || 0),
            droneSpecialization: DRONE_SPECIALIZATIONS.some((entry) => entry.id === state.droneSpecialization) ? state.droneSpecialization : '',
            totalDamageDealt: Math.max(0, Number(state.totalDamageDealt) || 0),
            lastTickAt: Math.max(0, Number(state.lastTickAt) || Date.now()),
            lastActiveAt: Math.max(0, Number(state.lastActiveAt) || 0),
            upgrades,
            storyProgressByBook,
            communityContribution: {
                pendingDamage: Math.max(0, Math.floor(Number(state.communityContribution && state.communityContribution.pendingDamage) || 0)),
                lifetimeDamage: Math.max(0, Math.floor(Number(state.communityContribution && state.communityContribution.lifetimeDamage) || 0)),
            },
        };
    }

    function getUpgradeDefinition(upgradeId) {
        return MINING_UPGRADES.find((upgrade) => upgrade.id === upgradeId) || null;
    }

    function getStoryBookDefinition(bookId) {
        return STORY_LIBRARY.find((book) => book.id === bookId) || null;
    }

    const MAX_ELAPSED_MS = 8 * 60 * 60 * 1000;

    function getDroneSpecializationDefinition(specId) {
        return DRONE_SPECIALIZATIONS.find((entry) => entry.id === specId) || null;
    }

    function getDroneSpecializationEffects(specId) {
        const spec = getDroneSpecializationDefinition(specId);
        return {
            id: spec ? spec.id : '',
            name: spec ? spec.name : 'Base Firmware',
            description: spec ? spec.description : 'Balanced drone firmware with no specialization applied.',
            unlockLevel: spec ? spec.unlockLevel : 10,
            attackSpeedMultiplier: spec ? spec.attackSpeedMultiplier : 1,
            passiveDamageMultiplier: spec ? spec.passiveDamageMultiplier : 1,
            perShotDamageMultiplier: spec ? spec.perShotDamageMultiplier : 1,
            passiveCritChance: spec ? spec.passiveCritChance : 0,
            doubleCrystalChance: spec ? spec.doubleCrystalChance : 0,
        };
    }

    function getDroneNetMultiplier(effects) {
        return (Number(effects.passiveDamageMultiplier) || 1)
            * (Number(effects.attackSpeedMultiplier) || 1)
            * (Number(effects.perShotDamageMultiplier) || 1);
    }

    // Passive damage accrued between state.lastTickAt and now. Elapsed time is
    // capped, and the overload multiplier applies only before overload expiry.
    function computePassiveDamage(normalized, now) {
        const elapsedMs = Math.min(MAX_ELAPSED_MS, Math.max(0, now - normalized.lastTickAt));
        const droneEffects = getDroneSpecializationEffects(normalized.droneSpecialization);
        const perSecond = normalized.dps * getDroneNetMultiplier(droneEffects);
        if (!elapsedMs || !perSecond) return { elapsedMs, baseDamage: 0, overloadDamage: 0, droneEffects, perSecond };
        const windowStart = normalized.lastTickAt;
        const overloadMs = Math.max(0, Math.min(elapsedMs, normalized.overloadEndsAt - windowStart));
        return {
            elapsedMs,
            baseDamage: perSecond * ((elapsedMs - overloadMs) / 1000),
            overloadDamage: perSecond * 3 * (overloadMs / 1000),
            droneEffects,
            perSecond,
        };
    }

    function getUpgradeCost(upgradeId, level) {
        const def = getUpgradeDefinition(upgradeId);
        if (!def) return Infinity;
        const normalizedLevel = Math.max(0, Math.floor(Number(level) || 0));
        return Math.max(1, Math.floor(def.baseCost * (def.costScale ** normalizedLevel)));
    }

    function getUpgradeEffects(upgrades) {
        const totals = {
            dps: 0,
            baseDamageBonus: 0,
            wpmMultiplierBonus: 0,
            crystalYieldBonus: 0,
            critChanceBonus: 0,
            critMultiplierBonus: 0,
        };

        for (const def of MINING_UPGRADES) {
            const level = Math.max(0, Math.floor(Number(upgrades && upgrades[def.id]) || 0));
            const effect = def.effect(level) || {};
            totals.dps += Number(effect.dps) || 0;
            totals.baseDamageBonus += Number(effect.baseDamageBonus) || 0;
            totals.wpmMultiplierBonus += Number(effect.wpmMultiplierBonus) || 0;
            totals.crystalYieldBonus += Number(effect.crystalYieldBonus) || 0;
            totals.critChanceBonus += Number(effect.critChanceBonus) || 0;
            totals.critMultiplierBonus += Number(effect.critMultiplierBonus) || 0;
        }

        totals.dps = roundTo(Math.max(0, totals.dps), 2);
        totals.baseDamageBonus = roundTo(Math.max(0, totals.baseDamageBonus), 2);
        totals.wpmMultiplierBonus = roundTo(Math.max(0, totals.wpmMultiplierBonus), 3);
        totals.crystalYieldBonus = roundTo(Math.max(0, totals.crystalYieldBonus), 3);
        totals.critChanceBonus = roundTo(Math.max(0, totals.critChanceBonus), 3);
        totals.critMultiplierBonus = roundTo(Math.max(0, totals.critMultiplierBonus), 3);
        return totals;
    }

    function getLayerMaxHp(layerIndex) {
        const normalizedIndex = Math.max(0, Math.floor(Number(layerIndex) || 0));
        const preset = DEFAULT_LAYER_HP[normalizedIndex];
        if (preset) return preset;
        const overflowIndex = normalizedIndex - (DEFAULT_LAYER_HP.length - 1);
        return Math.floor(DEFAULT_LAYER_HP[DEFAULT_LAYER_HP.length - 1] * (1.22 ** overflowIndex));
    }

    function isOverloadActive(state, nowMs) {
        const normalized = sanitizeState(state);
        const now = Math.max(0, Number(nowMs) || Date.now());
        return normalized.overloadEndsAt > now;
    }

    function addOverloadCharge(state, amount) {
        const normalized = recalculateDerivedState(state);
        if (isOverloadActive(normalized)) return { state: saveMiningState(normalized), chargedAmount: 0 };
        const delta = Math.max(0, Number(amount) || 0);
        const prevMeter = normalized.overloadMeter;
        normalized.overloadMeter = clamp(prevMeter + delta, 0, 100);
        return {
            state: saveMiningState(normalized),
            chargedAmount: roundTo(normalized.overloadMeter - prevMeter, 2),
        };
    }

    function activateOverload(state, nowMs) {
        const normalized = recalculateDerivedState(state);
        const now = Math.max(0, Number(nowMs) || Date.now());
        if (normalized.overloadMeter < 100) {
            return { ok: false, error: 'Overload not charged.', state: saveMiningState(normalized) };
        }
        // Credit passive damage accrued before overload starts.
        const credited = recalculateDerivedState(applyDamageToState(normalized, 0, { now, source: 'idle' }).state);
        credited.overloadMeter = 0;
        credited.overloadEndsAt = now + OVERLOAD_DURATION_MS;
        credited.lastTickAt = now;
        return {
            ok: true,
            state: saveMiningState(credited),
            endsAt: credited.overloadEndsAt,
            durationMs: OVERLOAD_DURATION_MS,
        };
    }

    function setDroneSpecialization(state, specId) {
        const normalized = recalculateDerivedState(state);
        const dronesLevel = Math.max(0, Math.floor(Number(normalized.upgrades && normalized.upgrades.automated_drones) || 0));
        if (dronesLevel < 10) {
            return { ok: false, error: 'Automated Limpet Drones must reach level 10 first.', state: saveMiningState(normalized) };
        }
        const specDef = specId ? getDroneSpecializationDefinition(specId) : null;
        if (specId && !specDef) {
            return { ok: false, error: 'Unknown drone specialization.', state: saveMiningState(normalized) };
        }
        if (specDef && dronesLevel < specDef.unlockLevel) {
            return { ok: false, error: `${specDef.name} requires Automated Limpet Drones level ${specDef.unlockLevel}.`, state: saveMiningState(normalized) };
        }
        normalized.droneSpecialization = specId || '';
        return { ok: true, state: saveMiningState(normalized), specialization: normalized.droneSpecialization };
    }

    function setCurrentStoryBook(state, bookId, options) {
        const normalized = sanitizeState(state);
        const settings = options && typeof options === 'object' ? options : {};
        const book = getStoryBookDefinition(bookId);
        if (!book || book.locked) {
            return { ok: false, error: 'Unknown story book.', state: saveMiningState(normalized) };
        }
        normalized.currentStoryBookId = book.id;
        const restart = !!settings.restart;
        const nextProgress = restart
            ? 0
            : Math.max(0, Math.floor(Number(normalized.storyProgressByBook[book.id]) || 0));
        normalized.currentStoryProgress = nextProgress;
        normalized.storyProgressByBook[book.id] = nextProgress;
        return {
            ok: true,
            state: saveMiningState(normalized),
            bookId: book.id,
            progress: nextProgress,
        };
    }

    function setCurrentStoryProgress(state, nextProgress) {
        const normalized = sanitizeState(state);
        const progress = Math.max(0, Math.floor(Number(nextProgress) || 0));
        const bookId = normalized.currentStoryBookId || createDefaultMiningState().currentStoryBookId;
        normalized.currentStoryProgress = progress;
        normalized.storyProgressByBook[bookId] = progress;
        return {
            ok: true,
            state: saveMiningState(normalized),
            progress,
            bookId,
        };
    }

    function getEffectiveMiningStats(state, nowMs) {
        const normalized = recalculateDerivedState(state);
        const overloadActive = isOverloadActive(normalized, nowMs);
        const droneEffects = getDroneSpecializationEffects(normalized.droneSpecialization);
        const passiveDamageMultiplier = roundTo(
            getDroneNetMultiplier(droneEffects) * (overloadActive ? 3 : 1),
            3,
        );
        return {
            baseDps: normalized.dps,
            effectiveDps: roundTo(normalized.dps * passiveDamageMultiplier, 2),
            overloadActive,
            overloadEndsAt: normalized.overloadEndsAt,
            overloadMeter: normalized.overloadMeter,
            droneSpecialization: normalized.droneSpecialization,
            droneEffects,
        };
    }

    function calculateDamage(input) {
        const payload = input && typeof input === 'object' ? input : {};
        const charactersTyped = Math.max(0, Math.floor(Number(payload.charactersTyped) || 0));
        const wordsEquivalent = charactersTyped / 5;
        const wpm = Math.max(0, Number(payload.wpm) || 0);
        const baseDamage = Math.max(1, Number(payload.baseDamage) || DEFAULT_BASE_DAMAGE);
        const rawAccuracy = payload.accuracy === null || payload.accuracy === undefined || payload.accuracy === '' ? NaN : Number(payload.accuracy);
        const accuracy = Number.isFinite(rawAccuracy) ? clamp(rawAccuracy, 0, 1.1) : NaN;
        const combo = Math.max(0, Number(payload.combo) || 0);
        const bufferBonus = Math.max(0, Number(payload.bufferBonus) || 0);
        const activeUpgradeBonus = Math.max(0, Number(payload.activeUpgradeBonus) || 0);
        const sessionAccuracy = Math.max(0, Math.min(1, Number(payload.sessionAccuracy)));
        const baseCritChance = Math.max(0, Number(payload.critChance) || 0.05);
        const critMultiplier = Math.max(1, Number(payload.critMultiplier) || 2);
        const overloadActive = !!payload.isOverloadActive;
        const focusBonus = sessionAccuracy > 0.98 ? 0.05 : 0;
        const critChanceApplied = overloadActive ? 1 : Math.max(0, Math.min(1, baseCritChance + focusBonus));
        const rollForCrit = !!payload.rollForCrit;

        const effectiveAccuracy = Number.isFinite(accuracy) ? accuracy : 0.5;
        const accuracyMultiplier = clamp(0.35 + (effectiveAccuracy * 0.75), 0.35, 1.1);
        const wpmMultiplier = clamp((wpm / 45) + 0.55 + bufferBonus, 0.55, 4.6);
        const comboMultiplier = clamp(1 + (combo * 0.03), 1, 1.45);
        const burstMultiplier = charactersTyped >= 25
            ? clamp(1 + ((charactersTyped - 25) / 180), 1, 1.35)
            : 1;
        const totalBaseDamage = baseDamage + activeUpgradeBonus;

        let activeDamage = Math.max(
            0,
            Math.round(wordsEquivalent * totalBaseDamage * wpmMultiplier * accuracyMultiplier * comboMultiplier * burstMultiplier),
        );
        const isCritical = activeDamage > 0 && (overloadActive || (rollForCrit && Math.random() < critChanceApplied));
        if (isCritical) activeDamage = Math.max(0, Math.round(activeDamage * critMultiplier));

        return {
            activeDamage,
            isCritical,
            isOverloadActive: overloadActive,
            critChanceApplied: roundTo(critChanceApplied, 3),
            critMultiplierApplied: roundTo(critMultiplier, 2),
            focusBonusApplied: roundTo(focusBonus, 3),
            damageText: formatDamageText(activeDamage, { isCritical }),
            breakdown: {
                charactersTyped,
                wordsEquivalent: roundTo(wordsEquivalent, 2),
                baseDamage: roundTo(totalBaseDamage, 2),
                accuracyMultiplier: roundTo(accuracyMultiplier, 3),
                wpmMultiplier: roundTo(wpmMultiplier, 3),
                comboMultiplier: roundTo(comboMultiplier, 3),
                burstMultiplier: roundTo(burstMultiplier, 3),
            },
        };
    }

    function loadMiningState() {
        try {
            const raw = global.localStorage.getItem(MINING_STATE_STORAGE_KEY);
            if (!raw) return createDefaultMiningState();
            return sanitizeState(JSON.parse(raw));
        } catch (error) {
            return createDefaultMiningState();
        }
    }

    function saveMiningState(state) {
        const normalized = sanitizeState(state);
        try {
            global.localStorage.setItem(MINING_STATE_STORAGE_KEY, JSON.stringify(normalized));
        } catch (error) {
            // Ignore storage failures and keep runtime state alive.
        }
        return normalized;
    }

    function recalculateDerivedState(state) {
        const normalized = sanitizeState(state);
        const effects = getUpgradeEffects(normalized.upgrades);
        normalized.dps = effects.dps;
        normalized.critChance = roundTo(0.05 + effects.critChanceBonus, 3);
        normalized.critMultiplier = roundTo(2 + effects.critMultiplierBonus, 2);
        normalized.asteroidMaxHP = getLayerMaxHp(normalized.currentLayer);
        normalized.asteroidHP = clamp(normalized.asteroidHP, 0, normalized.asteroidMaxHP);
        return normalized;
    }

    function applyDamageToState(state, damageAmount, meta) {
        const normalized = recalculateDerivedState(state);
        let damage = Math.max(0, Number(damageAmount) || 0);
        let crystalsEarned = 0;
        let shatteredLayers = 0;
        const timestamp = Math.max(0, Number(meta && meta.now) || Date.now());
        const crystalMultiplier = Math.max(1, Number(meta && meta.crystalMultiplier) || 1);
        const doubleCrystalChance = clamp(Number(meta && meta.doubleCrystalChance) || 0, 0, 1);

        // Credit passive DPS accrued since the last tick before moving lastTickAt.
        const passive = computePassiveDamage(normalized, timestamp);
        damage += roundTo(passive.baseDamage + passive.overloadDamage, 2);
        normalized.lastTickAt = timestamp;

        if (damage <= 0) {
            return { state: normalized, result: { damageApplied: 0, crystalsEarned, shatteredLayers } };
        }

        while (damage > 0) {
            const remainingHp = Math.max(0, normalized.asteroidHP);
            if (damage < remainingHp) {
                normalized.asteroidHP = roundTo(remainingHp - damage, 2);
                normalized.totalDamageDealt = roundTo(normalized.totalDamageDealt + damage, 2);
                damage = 0;
                break;
            }

            damage -= remainingHp;
            normalized.totalDamageDealt = roundTo(normalized.totalDamageDealt + remainingHp, 2);
            shatteredLayers += 1;
            const effects = getUpgradeEffects(normalized.upgrades);
            let layerCrystalReward = Math.max(1, Math.round((normalized.currentLayer + 1) * (1 + effects.crystalYieldBonus)));
            layerCrystalReward = Math.max(1, Math.round(layerCrystalReward * crystalMultiplier));
            if (doubleCrystalChance > 0 && Math.random() < doubleCrystalChance) {
                layerCrystalReward *= 2;
            }
            crystalsEarned += layerCrystalReward;
            normalized.currentLayer += 1;
            normalized.asteroidMaxHP = getLayerMaxHp(normalized.currentLayer);
            normalized.asteroidHP = normalized.asteroidMaxHP;
        }

        normalized.totalAetherCrystals += crystalsEarned;
        normalized.lastTickAt = timestamp;
        const isTypingSource = !!(meta && meta.source === 'typing');
        normalized.lastActiveAt = isTypingSource ? normalized.lastTickAt : normalized.lastActiveAt;
        if (isTypingSource) {
            normalized.communityContribution.pendingDamage += Math.floor(Number(damageAmount) || 0);
            normalized.communityContribution.lifetimeDamage += Math.floor(Number(damageAmount) || 0);
        }

        return {
            state: saveMiningState(normalized),
            result: {
                damageApplied: Math.floor(Number(damageAmount) || 0),
                crystalsEarned,
                shatteredLayers,
            },
        };
    }

    function tickMiningState(state, nowMs) {
        const normalized = recalculateDerivedState(state);
        const now = Math.max(0, Number(nowMs) || Date.now());
        const passive = computePassiveDamage(normalized, now);
        const elapsedMs = passive.elapsedMs;
        const overloadActive = isOverloadActive(normalized, now);
        const droneEffects = passive.droneEffects;
        const effectiveDps = roundTo(passive.perSecond * (overloadActive ? 3 : 1), 2);
        if (!elapsedMs || !effectiveDps) {
            normalized.lastTickAt = now;
            return {
                state: saveMiningState(normalized),
                idleDamage: 0,
                effectiveDps,
                overloadActive,
                passiveCritApplied: false,
            };
        }

        const overloadedPortion = passive.overloadDamage > 0;
        let idleDamage = roundTo(passive.baseDamage + (overloadedPortion ? passive.overloadDamage * normalized.critMultiplier : 0), 2);
        let passiveCritApplied = false;
        if (idleDamage > 0 && overloadedPortion) {
            passiveCritApplied = true;
        } else if (idleDamage > 0 && droneEffects.passiveCritChance > 0 && Math.random() < droneEffects.passiveCritChance) {
            idleDamage = roundTo(idleDamage * normalized.critMultiplier, 2);
            passiveCritApplied = true;
        }
        const applied = applyDamageToState(
            { ...normalized, lastTickAt: now },
            idleDamage,
            {
                source: 'idle',
                now,
                doubleCrystalChance: droneEffects.doubleCrystalChance,
            },
        );
        applied.state.lastTickAt = now;
        saveMiningState(applied.state);
        return {
            state: applied.state,
            idleDamage,
            effectiveDps,
            overloadActive,
            passiveCritApplied,
            result: applied.result,
        };
    }

    function purchaseMiningUpgrade(state, upgradeId) {
        const normalized = recalculateDerivedState(state);
        const def = getUpgradeDefinition(upgradeId);
        if (!def) return { ok: false, error: 'Unknown upgrade.', state: normalized };

        const currentLevel = Math.max(0, Math.floor(Number(normalized.upgrades[upgradeId]) || 0));
        if (currentLevel >= def.maxLevel) {
            return { ok: false, error: 'Upgrade already maxed.', state: normalized };
        }

        const cost = getUpgradeCost(upgradeId, currentLevel);
        if (normalized.totalAetherCrystals < cost) {
            return { ok: false, error: 'Not enough Aether Crystals.', state: normalized, cost };
        }

        normalized.totalAetherCrystals -= cost;
        normalized.upgrades[upgradeId] = currentLevel + 1;
        const nextState = saveMiningState(recalculateDerivedState(normalized));
        return { ok: true, state: nextState, cost, level: nextState.upgrades[upgradeId] };
    }

    function getBufferedCommunityContribution() {
        try {
            const raw = global.localStorage.getItem(MINING_COMMUNITY_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return {
                damage: Math.max(0, Math.floor(Number(parsed.damage) || 0)),
            };
        } catch (error) {
            return { damage: 0 };
        }
    }

    function flushMiningCommunityBuffer(state) {
        const normalized = sanitizeState(state);
        const damage = Math.max(0, Math.floor(Number(normalized.communityContribution.pendingDamage) || 0));
        if (!damage) return { damage: 0, state: normalized };
        try {
            const total = getBufferedCommunityContribution().damage + damage;
            global.localStorage.setItem(MINING_COMMUNITY_STORAGE_KEY, JSON.stringify({ damage: total }));
        } catch (error) {
            // Storage failed: keep pending so damage is not lost.
            return { damage: 0, state: normalized };
        }
        normalized.communityContribution.pendingDamage = 0;
        return { damage, state: saveMiningState(normalized) };
    }

    global.TypeMineMining = {
        MINING_STATE_STORAGE_KEY,
        MINING_COMMUNITY_STORAGE_KEY,
        OVERLOAD_DURATION_MS,
        OVERLOAD_CHARGE_PER_WORD,
        STORY_LIBRARY,
        MINING_UPGRADES,
        DRONE_SPECIALIZATIONS,
        formatMiningNumber,
        formatDamageText,
        createSeededRandom,
        generateAsteroidArtSpec,
        drawAsteroidToCanvas,
        createDefaultMiningState,
        loadMiningState,
        saveMiningState,
        recalculateDerivedState,
        calculateDamage,
        applyDamageToState,
        tickMiningState,
        purchaseMiningUpgrade,
        addOverloadCharge,
        activateOverload,
        isOverloadActive,
        setDroneSpecialization,
        setCurrentStoryBook,
        setCurrentStoryProgress,
        getUpgradeDefinition,
        getUpgradeCost,
        getUpgradeEffects,
        getStoryBookDefinition,
        getDroneSpecializationDefinition,
        getDroneSpecializationEffects,
        getEffectiveMiningStats,
        getLayerMaxHp,
        getBufferedCommunityContribution,
        flushMiningCommunityBuffer,
    };
})(window);
