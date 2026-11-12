function isLyraGateOpen() {
    return !!document.getElementById('lyra-gate-modal')?.classList.contains('show');
}

function scheduleLyraTimeout(fn, delay) {
    const handle = setTimeout(() => {
        lyraPendingTimeouts.delete(handle);
        if (!isLyraGateOpen()) return;
        fn();
    }, delay);
    lyraPendingTimeouts.add(handle);
    return handle;
}

function clearLyraPendingTimeouts() {
    for (const handle of lyraPendingTimeouts) clearTimeout(handle);
    lyraPendingTimeouts.clear();
    if (lyraAsteroidCycleTimer) { clearTimeout(lyraAsteroidCycleTimer); lyraAsteroidCycleTimer = null; }
    if (lyraShipFlyAwayTimer) { clearTimeout(lyraShipFlyAwayTimer); lyraShipFlyAwayTimer = null; }
}

function invalidateLyraSceneAnchors() {
    lyraSceneAnchorCache = null;
}

function setLyraText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
}

// Only touch a panel's DOM when its rendered HTML actually changed, so hover/focus/clicks survive.
function setLyraPanelHtml(panel, html) {
    if (!panel) return;
    if (lyraPanelHtmlCache[panel.id] === html && panel.childElementCount > 0) return;
    lyraPanelHtmlCache[panel.id] = html;
    panel.innerHTML = html;
}

function startLyraStatsInterval() {
    if (lyraStatsInterval) clearInterval(lyraStatsInterval);
    lyraStatsInterval = setInterval(updateLyraStats, 500);
}

function randomizeLyraAsteroidSeed() {
    lyraGateState.asteroidSeed = Math.floor(Math.random() * 1e9);
}

function getLyraStoryLibrary() {
    const api = getMiningApi();
    return api && Array.isArray(api.STORY_LIBRARY) ? api.STORY_LIBRARY : [];
}

function getLyraCurrentStoryBookId() {
    return String(lyraMiningState && lyraMiningState.currentStoryBookId || 'alice-in-wonderland');
}

function normalizeLyraChar(char) {
    return String(char || '').toLowerCase();
}

function lyraCharsMatch(a, b) {
    return typedCharMatches(normalizeLyraChar(a), normalizeLyraChar(b));
}

function lyraWordsMatch(attempt, target) {
    const x = Array.from(String(attempt || ''));
    const y = Array.from(String(target || ''));
    return x.length === y.length && x.every((ch, i) => lyraCharsMatch(ch, y[i]));
}

function getLyraCurrentStoryWords() {
    return lyraStoryLibraryCache.get(getLyraCurrentStoryBookId()) || [];
}

function renderLyraStoryLoadingOverlay() {
    const overlay = document.getElementById('lyra-story-loading-overlay');
    const label = document.getElementById('lyra-story-loading-label');
    const fill = document.getElementById('lyra-story-loading-fill');
    const meta = document.getElementById('lyra-story-loading-meta');
    if (!overlay || !label || !fill || !meta) return;
    overlay.classList.toggle('active', !!lyraStoryLoadingState.active);
    overlay.setAttribute('aria-hidden', lyraStoryLoadingState.active ? 'false' : 'true');
    label.textContent = lyraStoryLoadingState.label || 'Downloading Data...';
    fill.style.width = `${Math.max(0, Math.min(100, Number(lyraStoryLoadingState.progress) || 0)).toFixed(1)}%`;
    meta.textContent = lyraStoryLoadingState.meta || `${Math.round(Number(lyraStoryLoadingState.progress) || 0)}%`;
}

function setLyraStoryLoadingState(patch) {
    lyraStoryLoadingState = {
        ...lyraStoryLoadingState,
        ...(patch && typeof patch === 'object' ? patch : {}),
    };
    renderLyraStoryLoadingOverlay();
}

function getLyraStoryWindow(startIndex, count) {
    const storyWords = getLyraCurrentStoryWords();
    if (!storyWords.length) return [];
    const start = Math.max(0, Math.floor(Number(startIndex) || 0));
    const size = Math.max(1, Math.floor(Number(count) || 1));
    return storyWords.slice(start, start + size);
}

function isLyraStoryComplete() {
    const storyWords = getLyraCurrentStoryWords();
    return storyWords.length > 0 && lyraGateState.storyBaseIndex >= storyWords.length;
}

function normalizeLyraStoryChar(char) {
    const map = {
        '\u2018': '\'',
        '\u2019': '\'',
        '\u201c': '"',
        '\u201d': '"',
        '\u2014': '-',
        '\u2013': '-',
    };
    return map[char] || char;
}

async function tokenizeLyraStoryTextInChunks(text, chunkSize = 5000, onProgress = null) {
    const source = String(text || '').replace(/\r/g, '');
    const words = [];
    let token = '';
    let chunkWordCount = 0;
    let processedWords = 0;
    for (let i = 0; i < source.length; i++) {
        const char = normalizeLyraStoryChar(source[i]);
        if (/\s/.test(char)) {
            if (token) {
                words.push(token);
                token = '';
                chunkWordCount++;
                processedWords++;
                if (chunkWordCount >= chunkSize) {
                    if (typeof onProgress === 'function') onProgress(processedWords);
                    chunkWordCount = 0;
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
            continue;
        }
        token += char;
    }
    if (token) {
        words.push(token);
        processedWords++;
    }
    if (typeof onProgress === 'function') onProgress(processedWords, true);
    return words;
}

async function fetchLyraStoryPayload(book, options = {}) {
    const response = await fetch(book.assetPath, { cache: options.force ? 'no-store' : 'force-cache' });
    if (!response.ok) throw new Error(`Failed to load ${book.name}`);
    const totalBytes = Math.max(0, Number(response.headers.get('content-length')) || 0);
    if (!response.body || typeof response.body.getReader !== 'function') {
        const text = await response.text();
        setLyraStoryLoadingState({
            active: true,
            progress: 55,
            label: 'Downloading Data...',
            meta: totalBytes ? `${formatMiningNumber(totalBytes)} bytes` : 'Preparing stream',
        });
        return text;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let text = '';
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        received += value ? value.byteLength : 0;
        text += decoder.decode(value, { stream: true });
        const progress = totalBytes > 0 ? Math.min(55, (received / totalBytes) * 55) : Math.min(55, 8 + (received / 200000) * 47);
        setLyraStoryLoadingState({
            active: true,
            progress,
            label: 'Downloading Data...',
            meta: totalBytes > 0
                ? `${Math.round((received / totalBytes) * 100)}% of source payload`
                : `${formatMiningNumber(received)} bytes streamed`,
        });
    }
    text += decoder.decode();
    return text;
}

async function loadLyraStoryBook(bookId, options = {}) {
    const api = getMiningApi();
    const book = api && typeof api.getStoryBookDefinition === 'function'
        ? api.getStoryBookDefinition(bookId)
        : null;
    if (!book || book.locked || !book.assetPath) return [];
    if (!options.force && (lyraStoryLibraryCache.get(book.id) || []).length > 0) {
        return lyraStoryLibraryCache.get(book.id);
    }
    setLyraStoryLoadingState({
        active: true,
        progress: 4,
        label: 'Downloading Data...',
        meta: `Linking ${book.name}`,
    });
    try {
        const rawText = await fetchLyraStoryPayload(book, options);
        setLyraStoryLoadingState({
            active: true,
            progress: 62,
            label: 'Converting Data...',
            meta: 'Preparing word array',
        });
        const payload = JSON.parse(rawText);
        let words = [];
        if (Array.isArray(payload)) {
            words = payload.filter((word) => typeof word === 'string' && word.length > 0);
            setLyraStoryLoadingState({
                active: true,
                progress: 100,
                label: 'Downloading Data...',
                meta: `${formatMiningNumber(words.length)} words ready`,
            });
        } else if (payload && typeof payload.text === 'string') {
            words = await tokenizeLyraStoryTextInChunks(payload.text, 5000, (processed) => {
                const progress = Math.min(100, 62 + (Math.min(processed, 50000) / 50000) * 38);
                setLyraStoryLoadingState({
                    active: true,
                    progress,
                    label: 'Converting Data...',
                    meta: `${formatMiningNumber(processed)} words processed`,
                });
            });
        } else if (typeof payload === 'string') {
            words = await tokenizeLyraStoryTextInChunks(payload, 5000, (processed) => {
                const progress = Math.min(100, 62 + (Math.min(processed, 50000) / 50000) * 38);
                setLyraStoryLoadingState({
                    active: true,
                    progress,
                    label: 'Converting Data...',
                    meta: `${formatMiningNumber(processed)} words processed`,
                });
            });
        }
        if (words.length > 0) lyraStoryLibraryCache.set(book.id, words);
        setLyraStoryLoadingState({
            active: true,
            progress: 100,
            label: 'Downloading Data...',
            meta: `${formatMiningNumber(words.length)} words ready`,
        });
        setTimeout(() => {
            if (lyraStoryLoadingState.progress >= 100) {
                setLyraStoryLoadingState({ active: false, progress: 0, meta: '0%', label: 'Downloading Data...' });
            }
        }, 180);
        return words;
    } catch (error) {
        setLyraStoryLoadingState({ active: false, progress: 0, meta: '0%', label: 'Downloading Data...' });
        throw error;
    }
}

function primeLyraCurrentStoryBook(force = false) {
    const bookId = getLyraCurrentStoryBookId();
    lyraStoryLoadPromise = loadLyraStoryBook(bookId, { force: !!force }).then((words) => {
        if (!words.length) {
            showUiMessage('Story is unavailable right now. Using random words instead.', 'error', 2600, 'top-right');
        }
        return words;
    }).catch((error) => {
        console.error('Lyra story fetch failed', error);
        showUiMessage('Story Mode failed to load that book. Using random words instead.', 'error', 2600, 'top-right');
        return [];
    });
    return lyraStoryLoadPromise;
}

function renderLyraStoryMeta() {
    const meta = document.getElementById('lyra-story-meta');
    const progressEl = document.getElementById('lyra-book-progress');
    const api = getMiningApi();
    if ((!meta && !progressEl) || !api || typeof api.getStoryBookDefinition !== 'function') return;
    const book = api.getStoryBookDefinition(getLyraCurrentStoryBookId());
    if (meta) meta.textContent = book ? `${book.name} | ${book.author || 'Unknown Author'}` : 'Story Mode';
    if (progressEl) {
        const totalWords = Math.max(1, getLyraCurrentStoryWords().length || 1);
        const currentIndex = Math.max(0, Math.floor(Number(lyraMiningState && lyraMiningState.currentStoryProgress) || 0));
        progressEl.textContent = `${((currentIndex / totalWords) * 100).toFixed(1)}%`;
    }
}

function updateLyraStoryResetMenu() {
    const wrap = document.getElementById('lyra-story-reset');
    const toggle = document.getElementById('lyra-story-reset-toggle');
    const menu = document.getElementById('lyra-story-reset-menu');
    if (!wrap || !toggle || !menu) return;
    wrap.classList.toggle('open', lyraStoryResetMenuOpen);
    toggle.setAttribute('aria-expanded', lyraStoryResetMenuOpen ? 'true' : 'false');
    menu.setAttribute('aria-hidden', lyraStoryResetMenuOpen ? 'false' : 'true');
}

function closeLyraStoryResetMenu() {
    lyraStoryResetMenuOpen = false;
    updateLyraStoryResetMenu();
}

function toggleLyraStoryResetMenu(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    lyraStoryResetMenuOpen = !lyraStoryResetMenuOpen;
    updateLyraStoryResetMenu();
}
window.toggleLyraStoryResetMenu = toggleLyraStoryResetMenu;

function getLyraCurrentChapterStartIndex() {
    const storyWords = getLyraCurrentStoryWords();
    const currentIndex = Math.max(0, Math.floor(Number(lyraMiningState && lyraMiningState.currentStoryProgress) || 0));
    if (!storyWords.length || currentIndex <= 0) return 0;
    for (let i = Math.min(currentIndex, storyWords.length - 1); i >= 0; i--) {
        if (String(storyWords[i] || '').toUpperCase() === 'CHAPTER') {
            return i;
        }
    }
    return 0;
}

function restartLyraStoryProgress(scope) {
    const api = getMiningApi();
    if (!api || !lyraMiningState || typeof api.setCurrentStoryProgress !== 'function') return;
    const targetIndex = scope === 'book' ? 0 : getLyraCurrentChapterStartIndex();
    const updated = api.setCurrentStoryProgress(lyraMiningState, targetIndex);
    lyraMiningState = updated.state;
    closeLyraStoryResetMenu();
    const restartSplash = document.querySelector('.lyra-clear-splash');
    if (restartSplash) restartSplash.remove();
    if (lyraStatsInterval) {
        clearInterval(lyraStatsInterval);
        lyraStatsInterval = null;
    }
    resetLyraGateState();
    resetLyraSceneForNextAsteroid();
    renderLyraWordStream();
    renderLyraMiningHud();
    renderLyraMiningSidebar();
    updateLyraStats();
    if (isLyraGateOpen()) startLyraStatsInterval();
    focusLyraInput();
    showUiMessage(
        scope === 'book' ? 'Story progress reset to the beginning of the book.' : 'Story progress reset to the start of this chapter.',
        'info',
        1800,
        'top-right',
    );
}
window.restartLyraStoryProgress = restartLyraStoryProgress;

function ensureLyraWordsBuffer(minWordCount = 120) {
    const storyWords = getLyraCurrentStoryWords();
    if (storyWords.length) {
        const desiredCount = Math.max(1, Math.min(LYRA_VISIBLE_WORD_WINDOW, minWordCount));
        lyraGateState.words = getLyraStoryWindow(lyraGateState.storyBaseIndex, desiredCount);
        return;
    }
    const needed = Math.max(0, minWordCount - lyraGateState.words.length);
    if (needed <= 0) return;
    const extra = generateWordTest(Math.max(needed, 100)).split(' ').filter(Boolean);
    lyraGateState.words.push(...extra);
    lyraGateState.words = lyraGateState.words.slice(0, Math.max(1, minWordCount));
}

function resetLyraGateState() {
    clearLyraPendingTimeouts();
    const storyBaseIndex = Math.max(0, Math.floor(Number(lyraMiningState && lyraMiningState.currentStoryProgress) || 0));
    lyraGateState = {
        words: getLyraStoryWindow(storyBaseIndex, LYRA_VISIBLE_WORD_WINDOW),
        storyBaseIndex,
        typed: '',
        totalCompleted: 0,
        cycleBusy: false,
        asteroidSeed: Math.floor(Math.random() * 1e9),
        startTime: null,
        totalChars: 0,
        correctChars: 0,
        comboStreak: 0,
        bestCombo: 0,
        recentDamageBursts: [],
    };
}

function getLyraAsteroidsMined() {
    return Math.floor(lyraGateState.totalCompleted / LYRA_WORDS_PER_ASTEROID);
}

function isSectorCleared(sectorId) {
    try {
        const data = JSON.parse(localStorage.getItem('sectorClearedMap') || '{}');
        return !!data[sectorId];
    } catch { return false; }
}

function markSectorCleared(sectorId) {
    try {
        const data = JSON.parse(localStorage.getItem('sectorClearedMap') || '{}');
        data[sectorId] = true;
        localStorage.setItem('sectorClearedMap', JSON.stringify(data));
    } catch {}
}

function getMiningApi() {
    return window.TypeMineMining || null;
}

function formatMiningNumber(value) {
    const api = getMiningApi();
    if (api && typeof api.formatMiningNumber === 'function') return api.formatMiningNumber(value);
    return String(Math.max(0, Math.round(Number(value) || 0)));
}

function formatMiningDamageText(value, isCritical = false) {
    const api = getMiningApi();
    if (api && typeof api.formatDamageText === 'function') return api.formatDamageText(value, { isCritical });
    const base = formatMiningNumber(value);
    return isCritical ? `${base}!!` : base;
}

function getLyraEffectiveMiningStats() {
    const api = getMiningApi();
    if (!api || !lyraMiningState || typeof api.getEffectiveMiningStats !== 'function') return null;
    return api.getEffectiveMiningStats(lyraMiningState, Date.now());
}

function pruneLyraDamageBursts(now = performance.now()) {
    const windowMs = 4000;
    lyraGateState.recentDamageBursts = (lyraGateState.recentDamageBursts || []).filter((entry) => {
        return entry && Number.isFinite(entry.ts) && (now - entry.ts) <= windowMs;
    });
    return lyraGateState.recentDamageBursts;
}

function recordLyraDamageBurst(amount, source = 'typing') {
    const damage = Math.max(0, Number(amount) || 0);
    if (damage <= 0 || source !== 'typing') return;
    const now = performance.now();
    pruneLyraDamageBursts(now);
    lyraGateState.recentDamageBursts.push({ ts: now, damage });
}

function getLyraActiveTypingDps(now = performance.now()) {
    const bursts = pruneLyraDamageBursts(now);
    if (!bursts.length) return 0;
    const totalDamage = bursts.reduce((sum, entry) => sum + (Number(entry.damage) || 0), 0);
    return totalDamage / 4;
}

function getLyraDisplayedDps(stats = null) {
    const effectiveStats = stats || getLyraEffectiveMiningStats();
    const passiveDps = effectiveStats
        ? Math.max(0, Number(effectiveStats.effectiveDps) || 0)
        : Math.max(0, Number(lyraMiningState && lyraMiningState.dps) || 0);
    return passiveDps + getLyraActiveTypingDps();
}

function isLyraOverloadActive() {
    const stats = getLyraEffectiveMiningStats();
    return !!(stats && stats.overloadActive);
}

function getLyraCurrentWpm() {
    const elapsed = lyraGateState.startTime ? (performance.now() - lyraGateState.startTime) / 1000 : 0;
    const minutes = elapsed / 60;
    return minutes > 0.01 ? Math.round((lyraGateState.correctChars / 5) / minutes) : 0;
}

function getLyraAccuracyRatio() {
    if (lyraGateState.totalChars <= 0) return 1;
    return Math.max(0, Math.min(1, lyraGateState.correctChars / lyraGateState.totalChars));
}

function getLyraComboMultiplierDisplay() {
    return (1 + (Math.max(0, lyraGateState.comboStreak) * 0.03)).toFixed(2);
}

function syncLyraMiningStateWithWallet(state) {
    const api = getMiningApi();
    if (!api) return null;
    const normalized = api.recalculateDerivedState(state || api.loadMiningState());
    const wallet = getSkillPoints();
    const nextCrystals = Math.max(0, Math.floor(Number(wallet) || 0));
    if (nextCrystals !== normalized.totalAetherCrystals) {
        normalized.totalAetherCrystals = nextCrystals;
    }
    lyraMiningState = api.saveMiningState(normalized);
    return lyraMiningState;
}

function syncLyraWalletFromMiningState(prevCrystalCount = null) {
    if (!lyraMiningState) return;
    const nextCrystals = Math.max(0, Math.floor(Number(lyraMiningState.totalAetherCrystals) || 0));
    if (prevCrystalCount == null || nextCrystals !== Math.floor(Number(prevCrystalCount) || 0)) {
        setSkillPoints(nextCrystals);
        updateSkillDisplay();
        flushProgressSyncNow();
    }
}

function getLyraAsteroidHealthBand(state = lyraMiningState) {
    if (!state) return 'healthy';
    const maxHp = Math.max(1, Number(state.asteroidMaxHP) || 1);
    const ratio = Math.max(0, Math.min(1, (Number(state.asteroidHP) || 0) / maxHp));
    if (ratio <= 0.33) return 'critical';
    if (ratio <= 0.66) return 'fractured';
    return 'healthy';
}

function getLyraAsteroidDisplaySize(state = lyraMiningState) {
    const api = getMiningApi();
    const maxHp = Math.max(1, Number(state && state.asteroidMaxHP) || 1);
    const baseHp = Math.max(1, Number(api && typeof api.getLayerMaxHp === 'function' ? api.getLayerMaxHp(0) : 180) || 180);
    const sizeFloor = 120;
    const sizeCeiling = 220;
    const growthRatio = Math.max(1, maxHp / baseHp);
    const normalized = Math.min(1, Math.log10(growthRatio) / 1.1);
    return Math.round(sizeFloor + ((sizeCeiling - sizeFloor) * normalized));
}

function updateLyraAsteroidVisualState() {
    const asteroid = document.getElementById('lyra-asteroid');
    const wrap = document.getElementById('lyra-asteroid-wrap');
    if (!asteroid || !wrap || !lyraMiningState) return;
    const band = getLyraAsteroidHealthBand(lyraMiningState);
    const displaySize = getLyraAsteroidDisplaySize(lyraMiningState);
    asteroid.dataset.healthBand = band;
    if (displaySize !== lyraLastAsteroidDisplaySize) {
        lyraLastAsteroidDisplaySize = displaySize;
        invalidateLyraSceneAnchors();
    }
    wrap.style.setProperty('--lyra-asteroid-size', `${displaySize}px`);
    if (band === 'critical') wrap.style.setProperty('--lyra-asteroid-glow', 'rgba(248, 198, 96, 0.4)');
    else if (band === 'fractured') wrap.style.setProperty('--lyra-asteroid-glow', 'rgba(102, 233, 255, 0.34)');
    else wrap.style.setProperty('--lyra-asteroid-glow', 'rgba(124, 111, 247, 0.34)');
}

function getLyraDroneCount() {
    const level = Math.max(0, Number(lyraMiningState && lyraMiningState.upgrades && lyraMiningState.upgrades.automated_drones) || 0);
    if (level <= 0) return 0;
    return Math.min(3, 1 + Math.floor((level - 1) / 5));
}

function stopLyraDroneOrbitLoop() {
    if (lyraDroneOrbitFrame) cancelAnimationFrame(lyraDroneOrbitFrame);
    lyraDroneOrbitFrame = 0;
    lyraDroneOrbitLastTs = 0;
}

function ensureLyraDroneOrbitState(count) {
    if (!Number.isFinite(count) || count <= 0) {
        lyraDroneOrbitState = [];
        return;
    }
    if (lyraDroneOrbitState.length === count) return;
    const next = [];
    for (let i = 0; i < count; i++) {
        const existing = lyraDroneOrbitState[i];
        next.push(existing || {
            angle: Math.random() * Math.PI * 2,
            speed: (0.45 + Math.random() * 0.65) * (Math.random() > 0.5 ? 1 : -1),
            radius: 168 + Math.random() * 42,
            verticalScale: 0.64 + Math.random() * 0.2,
            wobbleAmp: 6 + Math.random() * 9,
            wobbleSpeed: 1.2 + Math.random() * 1.4,
            bobAmp: 1.2 + Math.random() * 2.4,
            bobSpeed: 1.8 + Math.random() * 1.3,
            phase: Math.random() * Math.PI * 2,
        });
    }
    lyraDroneOrbitState = next;
}

function positionLyraDroneElement(drone, orbit, anchors, ts = performance.now()) {
    if (!drone || !orbit || !anchors) return;
    const wobble = Math.sin((ts / 1000) * orbit.wobbleSpeed + orbit.phase) * orbit.wobbleAmp;
    const radius = orbit.radius + wobble;
    const x = anchors.asteroidCenterX + Math.cos(orbit.angle) * radius;
    const bob = Math.sin((ts / 1000) * orbit.bobSpeed + orbit.phase * 1.7) * orbit.bobAmp;
    const y = anchors.asteroidCenterY + Math.sin(orbit.angle) * (radius * orbit.verticalScale) + bob;
    const facing = (Math.atan2(anchors.asteroidCenterY - y, anchors.asteroidCenterX - x) * 180 / Math.PI) + 90;
    drone.style.left = `${x.toFixed(1)}px`;
    drone.style.top = `${y.toFixed(1)}px`;
    drone.style.transform = `translate(-50%, -50%) rotate(${facing.toFixed(2)}deg)`;
    drone.dataset.orbitX = x.toFixed(2);
    drone.dataset.orbitY = y.toFixed(2);
}

function updateLyraDroneOrbitFrame(ts) {
    const layer = document.getElementById('lyra-drone-layer');
    const anchors = getLyraSceneAnchors();
    const drones = [...document.querySelectorAll('#lyra-drone-layer .lyra-drone')];
    if (!layer || !anchors || drones.length === 0) {
        stopLyraDroneOrbitLoop();
        return;
    }
    if (!lyraDroneOrbitLastTs) lyraDroneOrbitLastTs = ts;
    const dt = Math.min(0.05, Math.max(0.001, (ts - lyraDroneOrbitLastTs) / 1000));
    lyraDroneOrbitLastTs = ts;

    for (let i = 0; i < drones.length; i++) {
        const drone = drones[i];
        const orbit = lyraDroneOrbitState[i];
        if (!orbit) continue;
        orbit.angle += orbit.speed * dt;
        positionLyraDroneElement(drone, orbit, anchors, ts);
    }

    lyraDroneOrbitFrame = requestAnimationFrame(updateLyraDroneOrbitFrame);
}

function startLyraDroneOrbitLoop() {
    if (lyraDroneOrbitFrame) return;
    lyraDroneOrbitLastTs = 0;
    lyraDroneOrbitFrame = requestAnimationFrame(updateLyraDroneOrbitFrame);
}

function renderLyraMiningDrones() {
    const layer = document.getElementById('lyra-drone-layer');
    if (!layer) return;
    const count = getLyraDroneCount();
    // Rebuild only when the drone count changes (or the layer was cleared).
    if (layer.childElementCount === count && lyraDroneOrbitState.length === count) {
        if (count > 0) startLyraDroneOrbitLoop();
        else stopLyraDroneOrbitLoop();
        return;
    }
    const anchors = getLyraSceneAnchors();
    if (!anchors) return;
    layer.innerHTML = '';
    ensureLyraDroneOrbitState(count);
    if (count <= 0) {
        stopLyraDroneOrbitLoop();
        return;
    }

    for (let i = 0; i < count; i++) {
        const drone = document.createElement('span');
        drone.className = 'lyra-drone';
        drone.dataset.droneIndex = String(i);

        const shell = document.createElement('span');
        shell.className = 'lyra-drone-shell';
        drone.appendChild(shell);

        const nose = document.createElement('span');
        nose.className = 'lyra-drone-nose';
        drone.appendChild(nose);

        const armLeft = document.createElement('span');
        armLeft.className = 'lyra-drone-arm left';
        drone.appendChild(armLeft);

        const armRight = document.createElement('span');
        armRight.className = 'lyra-drone-arm right';
        drone.appendChild(armRight);

        const podLeft = document.createElement('span');
        podLeft.className = 'lyra-drone-pod left';
        drone.appendChild(podLeft);

        const podRight = document.createElement('span');
        podRight.className = 'lyra-drone-pod right';
        drone.appendChild(podRight);

        const finLeft = document.createElement('span');
        finLeft.className = 'lyra-drone-fin left';
        drone.appendChild(finLeft);

        const finRight = document.createElement('span');
        finRight.className = 'lyra-drone-fin right';
        drone.appendChild(finRight);

        const thrusterLeft = document.createElement('span');
        thrusterLeft.className = 'lyra-drone-thruster left';
        drone.appendChild(thrusterLeft);

        const thrusterRight = document.createElement('span');
        thrusterRight.className = 'lyra-drone-thruster right';
        drone.appendChild(thrusterRight);

        const core = document.createElement('span');
        core.className = 'lyra-drone-core';
        drone.appendChild(core);
        layer.appendChild(drone);
        positionLyraDroneElement(drone, lyraDroneOrbitState[i], anchors);
    }
    startLyraDroneOrbitLoop();
}

function getLyraAsteroidImpactPoint(sourceX, sourceY, anchors = null) {
    const sceneAnchors = anchors || getLyraSceneAnchors();
    if (!sceneAnchors || !Number.isFinite(sourceX) || !Number.isFinite(sourceY)) return null;
    const dx = sceneAnchors.asteroidCenterX - sourceX;
    const dy = sceneAnchors.asteroidCenterY - sourceY;
    const fullLength = Math.hypot(dx, dy);
    if (fullLength <= 0.001) return null;
    const nx = dx / fullLength;
    const ny = dy / fullLength;
    return {
        x: sceneAnchors.asteroidCenterX - (nx * sceneAnchors.asteroidRadius),
        y: sceneAnchors.asteroidCenterY - (ny * sceneAnchors.asteroidRadius),
        nx,
        ny,
        fullLength,
    };
}

function emitLyraDroneVolley(options = {}) {
    if (!isLyraGateOpen()) return;
    const laserLayer = document.getElementById('lyra-laser-layer');
    const scene = document.getElementById('lyra-scene');
    const anchors = getLyraSceneAnchors();
    const drones = [...document.querySelectorAll('#lyra-drone-layer .lyra-drone')];
    if (!laserLayer || !scene || !anchors || drones.length === 0) return;
    const sceneRect = scene.getBoundingClientRect();
    const popupValues = Array.isArray(options.popupValues) ? options.popupValues : [];
    const isCritical = !!options.isCritical;
    const isOverloadActive = !!options.isOverloadActive;

    for (const [index, drone] of drones.entries()) {
        const core = drone.querySelector('.lyra-drone-core');
        const sourceRect = (core || drone).getBoundingClientRect();
        let x = (sourceRect.left - sceneRect.left) + (sourceRect.width * 0.5);
        let y = (sourceRect.top - sceneRect.top) + (sourceRect.height * 0.5);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > sceneRect.width || y > sceneRect.height) {
            x = Number(drone.dataset.orbitX);
            y = Number(drone.dataset.orbitY);
        }
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const impactPoint = getLyraAsteroidImpactPoint(x, y, anchors);
        if (!impactPoint) continue;
        const length = impactPoint.fullLength - anchors.asteroidRadius;
        if (length <= 4) continue;
        const endX = impactPoint.x;
        const endY = impactPoint.y;
        const beamDx = endX - x;
        const beamDy = endY - y;
        const beamLength = Math.hypot(beamDx, beamDy);
        const angle = Math.atan2(beamDy, beamDx) * 180 / Math.PI;
        const beam = document.createElement('span');
        beam.className = 'lyra-laser-burst drone-shot';
        beam.style.left = `${x.toFixed(1)}px`;
        beam.style.top = `${(y - 2.5).toFixed(1)}px`;
        beam.style.width = `${beamLength.toFixed(1)}px`;
        beam.style.rotate = `${angle.toFixed(2)}deg`;
        laserLayer.appendChild(beam);
        beam.addEventListener('animationend', () => beam.remove(), { once: true });

        const impact = document.createElement('span');
        impact.className = 'lyra-laser-impact drone-shot';
        impact.style.left = `${endX.toFixed(1)}px`;
        impact.style.top = `${endY.toFixed(1)}px`;
        laserLayer.appendChild(impact);
        impact.addEventListener('animationend', () => impact.remove(), { once: true });
        flashLyraAsteroidHit();
        scheduleLyraTimeout(() => emitLyraAsteroidChunks(1 + Math.floor(Math.random() * 2)), 42);
        const popupValue = Number(popupValues[index]) || 0;
        if (popupValue > 0) {
            spawnLyraDamagePopup(popupValue, {
                x: endX,
                y: endY,
                isCritical,
                isOverloadActive,
            });
        }
    }
}

function flashLyraAsteroidHit() {
    const asteroid = document.getElementById('lyra-asteroid');
    if (!asteroid) return;
    asteroid.classList.remove('hit-flash');
    void asteroid.offsetWidth;
    asteroid.classList.add('hit-flash');
    clearTimeout(asteroid._hitFlashTimer);
    asteroid._hitFlashTimer = setTimeout(() => asteroid.classList.remove('hit-flash'), 120);
}

function triggerLyraCriticalShake() {
    const scene = document.getElementById('lyra-scene');
    if (!scene) return;
    scene.classList.remove('crit-shake');
    void scene.offsetWidth;
    scene.classList.add('crit-shake');
    clearTimeout(scene._critShakeTimer);
    scene._critShakeTimer = setTimeout(() => scene.classList.remove('crit-shake'), 220);
}

function ensureLyraDamagePopupPool() {
    if (lyraDamagePopupPool.length >= LYRA_DAMAGE_POPUP_POOL_SIZE) return;
        lyraDamagePopupPool = Array.from({ length: LYRA_DAMAGE_POPUP_POOL_SIZE }, () => ({
            active: false,
            x: 0,
            y: 0,
            age: 0,
            life: 0.9,
            text: '',
            color: '#7dd3fc',
            isCritical: false,
        }));
}

function resizeLyraPopupCanvas() {
    const scene = document.getElementById('lyra-scene');
    const canvas = document.getElementById('lyra-popup-canvas');
    if (!scene || !canvas) return;
    const rect = scene.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = `${Math.round(rect.width)}px`;
    canvas.style.height = `${Math.round(rect.height)}px`;
    if (rect.width > 0 && rect.height > 0) canvas.dataset.lyraSized = '1';
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function stopLyraDamagePopupLoop() {
    if (lyraDamagePopupFrame) cancelAnimationFrame(lyraDamagePopupFrame);
    lyraDamagePopupFrame = 0;
    lyraDamagePopupLastTs = 0;
    const canvas = document.getElementById('lyra-popup-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const popup of lyraDamagePopupPool) popup.active = false;
}

function drawLyraDamagePopups(ts) {
    const canvas = document.getElementById('lyra-popup-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (!canvas || !ctx) {
        lyraDamagePopupFrame = 0;
        return;
    }
    if (!lyraDamagePopupLastTs) lyraDamagePopupLastTs = ts;
    const dt = Math.min(0.05, Math.max(0.001, (ts - lyraDamagePopupLastTs) / 1000));
    lyraDamagePopupLastTs = ts;
    const speedMultiplier = isLyraOverloadActive() ? 1.55 : 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let activeCount = 0;
    for (const popup of lyraDamagePopupPool) {
        if (!popup.active) continue;
        popup.age += dt * speedMultiplier;
        if (popup.age >= popup.life) {
            popup.active = false;
            continue;
        }
        activeCount++;
        const progress = popup.age / popup.life;
        const lift = (popup.isCritical ? 68 : 54) * progress * speedMultiplier;
        const fade = 1 - progress;
        const scale = popup.isCritical ? 1.34 + (0.14 * (1 - progress)) : 1 + (0.08 * (1 - progress));
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(popup.x, popup.y - lift);
        ctx.scale(scale, scale);
        ctx.font = popup.isCritical ? '900 34px "Ubuntu Mono", monospace' : '900 22px "Ubuntu Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = popup.isCritical ? 6 : 4;
        ctx.strokeStyle = 'rgba(8, 15, 40, 0.74)';
        ctx.strokeText(popup.text, 0, 0);
        ctx.fillStyle = popup.color;
        ctx.shadowBlur = popup.isCritical ? 28 : 16;
        ctx.shadowColor = popup.color;
        ctx.fillText(popup.text, 0, 0);
        ctx.restore();
    }
    if (activeCount > 0) {
        lyraDamagePopupFrame = requestAnimationFrame(drawLyraDamagePopups);
    } else {
        lyraDamagePopupFrame = 0;
    }
}

function spawnLyraDamagePopup(value, options = {}) {
    const anchors = getLyraSceneAnchors();
    if (!anchors) return;
    ensureLyraDamagePopupPool();
    // Resizing clears the canvas; it happens on window resize and gate open. Only size it here if never sized.
    const popupCanvas = document.getElementById('lyra-popup-canvas');
    if (popupCanvas && !popupCanvas.dataset.lyraSized) resizeLyraPopupCanvas();
    let popup = lyraDamagePopupPool.find((entry) => !entry.active);
    if (!popup) popup = lyraDamagePopupPool.reduce((oldest, entry) => (entry.age > oldest.age ? entry : oldest), lyraDamagePopupPool[0]);
    const isCritical = !!options.isCritical;
    const overloadActive = !!options.isOverloadActive || isLyraOverloadActive();
    const popupX = Number.isFinite(options.x) ? options.x : anchors.asteroidCenterX;
    const popupY = Number.isFinite(options.y) ? options.y : anchors.asteroidCenterY;
    popup.active = true;
    popup.x = popupX;
    popup.y = popupY;
    popup.age = 0;
    popup.life = overloadActive ? (isCritical ? 0.78 : 0.7) : (isCritical ? 1.04 : 0.92);
    popup.text = formatMiningDamageText(value, isCritical);
    popup.color = isCritical ? '#ff4d5a' : '#7dd3fc';
    popup.isCritical = isCritical;
    if (!lyraDamagePopupFrame) {
        lyraDamagePopupLastTs = 0;
        lyraDamagePopupFrame = requestAnimationFrame(drawLyraDamagePopups);
    }
}

function getLyraUpgradeIconSvg(upgradeId) {
    const icons = {
        automated_drones: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5 18 10v4l-6 3.5L6 14v-4Z"></path><path d="M12 6.5V3.5"></path><path d="M6 10 3.5 8.5"></path><path d="M18 10l2.5-1.5"></path></svg>',
        laser_drills: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 2 6 13h4l-1 9 7-13h-4l2-7Z"></path></svg>',
        buffer_optimizations: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14"></path><path d="M5 12h10"></path><path d="M5 17h6"></path><path d="M18 15v4"></path><path d="M16 17h4"></path></svg>',
        neural_focus: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><path d="M12 2v3"></path><path d="M12 19v3"></path><path d="M2 12h3"></path><path d="M19 12h3"></path></svg>',
        overclocked_actuators: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v10"></path><path d="M7 12h10"></path><path d="m17 7 2 2"></path><path d="m5 15 2 2"></path><path d="m17 17 2-2"></path><path d="m5 9 2-2"></path></svg>',
    };
    return icons[upgradeId] || icons.buffer_optimizations;
}

function setLyraSidebarTab(tabId) {
    lyraSidebarTab = ['systems', 'library', 'firmware', 'statistics'].includes(tabId) ? tabId : 'systems';
    document.querySelectorAll('#lyra-upgrades-sidebar .lyra-sidebar-tab').forEach((button) => {
        button.classList.toggle('active', button.dataset.lyraTab === lyraSidebarTab);
    });
    document.querySelectorAll('#lyra-upgrades-sidebar .lyra-sidebar-panel').forEach((panel) => {
        const isActive = panel.id === `lyra-panel-${lyraSidebarTab}`;
        panel.classList.toggle('active', isActive);
        panel.style.opacity = isActive ? '1' : '0';
        panel.style.visibility = isActive ? 'visible' : 'hidden';
        panel.style.pointerEvents = isActive ? 'auto' : 'none';
        panel.style.zIndex = isActive ? '2' : '1';
    });
}
window.setLyraSidebarTab = setLyraSidebarTab;

function setLyraSelectedUpgrade(upgradeId) {
    lyraSelectedUpgradeId = upgradeId || lyraSelectedUpgradeId;
    renderLyraMiningSidebar();
}
window.setLyraSelectedUpgrade = setLyraSelectedUpgrade;

function triggerLyraPurchaseFeedback(buttonEl) {
    if (!(buttonEl instanceof HTMLElement)) return;
    const card = buttonEl.closest('.lyra-upgrade-card');
    buttonEl.classList.remove('glitch-success');
    if (card) card.classList.remove('purchase-flash');
    void buttonEl.offsetWidth;
    buttonEl.classList.add('glitch-success');
    if (card) card.classList.add('purchase-flash');
    setTimeout(() => {
        buttonEl.classList.remove('glitch-success');
        if (card) card.classList.remove('purchase-flash');
    }, 420);
}

function startLyraOverloadHintLoop() {
    return;
}

async function selectLyraStoryBook(bookId) {
    const api = getMiningApi();
    if (!api || !lyraMiningState || typeof api.setCurrentStoryBook !== 'function') return;
    const book = typeof api.getStoryBookDefinition === 'function' ? api.getStoryBookDefinition(bookId) : null;
    if (!book || book.locked) return;
    try {
        await loadLyraStoryBook(bookId);
        const selection = api.setCurrentStoryBook(lyraMiningState, bookId);
        lyraMiningState = selection.state;
        if (lyraStatsInterval) {
            clearInterval(lyraStatsInterval);
            lyraStatsInterval = null;
        }
        const bookSplash = document.querySelector('.lyra-clear-splash');
        if (bookSplash) bookSplash.remove();
        resetLyraGateState();
        resetLyraSceneForNextAsteroid();
        renderLyraWordStream();
        renderLyraMiningHud();
        renderLyraMiningSidebar();
        updateLyraStats();
        if (isLyraGateOpen()) startLyraStatsInterval();
        focusLyraInput();
    } catch (error) {
        console.error('selectLyraStoryBook failed', error);
        showUiMessage('Unable to load that story book right now.', 'error', 2200, 'top-right');
    }
}
window.selectLyraStoryBook = selectLyraStoryBook;

function renderLyraLibraryPanel() {
    const panel = document.getElementById('lyra-panel-library');
    const api = getMiningApi();
    if (!panel || !api || !lyraMiningState) return;
    const books = getLyraStoryLibrary();
    const activeBookId = getLyraCurrentStoryBookId();
    const html = `
        <div class="lyra-library-panel">
            <div class="lyra-library-card">
                <div class="lyra-library-head">
                    <div class="lyra-library-title">Story Library</div>
                    <div class="lyra-specialization-status">Story Mode</div>
                </div>
                <div class="lyra-library-copy">Mine through public domain books. Your place is saved after every completed word, so you resume exactly where you left off.</div>
                <div class="lyra-library-books">
                    ${books.map((book) => {
        if (book.locked) {
            return `
                            <button type="button" class="lyra-library-book" disabled>
                                <strong>New Books Coming Soon!</strong>
                                <span>Locked</span>
                                <small>Additional public-domain expeditions will unlock here.</small>
                            </button>
                        `;
        }
        const savedProgress = Math.max(0, Math.floor(Number(
            lyraMiningState.storyProgressByBook && lyraMiningState.storyProgressByBook[book.id],
        ) || 0));
        return `
                        <button type="button" class="lyra-library-book${activeBookId === book.id ? ' active' : ''}" onclick="selectLyraStoryBook('${book.id}')">
                            <strong>${escapeHtml(book.name)}</strong>
                            <span>${escapeHtml(book.author || 'Public Domain')}</span>
                            <small>${savedProgress > 0 ? `Resume at word ${formatMiningNumber(savedProgress + 1)}` : 'Start from the beginning'}</small>
                        </button>
                    `;
    }).join('')}
                </div>
            </div>
        </div>
    `;
    setLyraPanelHtml(panel, html);
}

function renderLyraDroneSpecializationPanel() {
    const panel = document.getElementById('lyra-panel-firmware');
    const api = getMiningApi();
    if (!panel || !api || !lyraMiningState) return;
    const dronesLevel = Math.max(0, Number(lyraMiningState.upgrades && lyraMiningState.upgrades.automated_drones) || 0);
    const unlocked = dronesLevel >= 10;
    const currentSpec = lyraMiningState.droneSpecialization || '';
    if (!unlocked) {
        const lockedHtml = `
            <div class="lyra-specialization-card locked">
                <div class="lyra-specialization-head">
                    <div class="lyra-specialization-label">Drone Firmware</div>
                    <div class="lyra-specialization-status">Locked</div>
                </div>
                <div class="lyra-specialization-desc">Reach Automated Limpet Drones level 10 to unlock Swarm, Precision, and Salvage firmware paths.</div>
            </div>
        `;
        setLyraPanelHtml(panel, lockedHtml);
        return;
    }
    const html = `
        <div class="lyra-specialization-panel">
        <div class="lyra-specialization-card">
            <div class="lyra-specialization-head">
                <div class="lyra-specialization-label">Drone Firmware</div>
                <div class="lyra-specialization-status">${currentSpec ? 'Selected' : 'Choose Path'}</div>
            </div>
            <div class="lyra-specialization-desc">Firmware paths reshape passive mining behavior once the limpet network is mature enough.</div>
            <div class="lyra-specialization-options">
                ${api.DRONE_SPECIALIZATIONS.map((spec) => {
                    const needLevel = Number(spec.unlockLevel) || 10;
                    const specLocked = dronesLevel < needLevel;
                    return `
                    <button
                        type="button"
                        class="lyra-specialization-option${currentSpec === spec.id ? ' active' : ''}"
                        onclick="setLyraDroneSpecialization('${spec.id}')"
                        ${specLocked ? 'disabled aria-disabled="true"' : ''}
                    >
                        <strong>${escapeHtml(spec.name)}</strong>
                        <span>${specLocked ? `Unlocks at drone level ${needLevel}` : escapeHtml(spec.description)}</span>
                    </button>
                `;
                }).join('')}
            </div>
        </div>
        </div>
    `;
    setLyraPanelHtml(panel, html);
}

function renderLyraStatisticsPanel() {
    const panel = document.getElementById('lyra-panel-statistics');
    const api = getMiningApi();
    if (!panel || !api || !lyraMiningState) return;
    const effectiveStats = getLyraEffectiveMiningStats();
    const displayDps = getLyraDisplayedDps(effectiveStats);
    const accuracy = Math.round(getLyraAccuracyRatio() * 100);
    const overloadMeter = effectiveStats ? Math.round(effectiveStats.overloadMeter) : 0;
    const overloadState = effectiveStats && effectiveStats.overloadActive ? 'Active' : overloadMeter >= 100 ? 'Primed' : 'Charging';
    const html = `
        <div class="lyra-statistics-panel">
            <div class="lyra-stat-card">
                <div class="lyra-stat-card-title">Mining Telemetry</div>
                <div class="lyra-stat-grid">
                    <div class="lyra-stat-chip"><span>DPS</span><strong>${formatMiningNumber(displayDps)}</strong></div>
                    <div class="lyra-stat-chip"><span>Crit Chance</span><strong>${Math.round((lyraMiningState.critChance || 0) * 100)}%</strong></div>
                    <div class="lyra-stat-chip"><span>Crit Damage</span><strong>${Number(lyraMiningState.critMultiplier || 0).toFixed(1)}x</strong></div>
                    <div class="lyra-stat-chip"><span>Accuracy</span><strong>${accuracy}%</strong></div>
                </div>
            </div>
            <div class="lyra-stat-card">
                <div class="lyra-stat-card-title">Burst Status</div>
                <div class="lyra-stat-grid">
                    <div class="lyra-stat-chip"><span>Overload</span><strong>${overloadState}</strong></div>
                    <div class="lyra-stat-chip"><span>Charge</span><strong>${overloadMeter}%</strong></div>
                    <div class="lyra-stat-chip"><span>Streak</span><strong>${lyraGateState.comboStreak}</strong></div>
                    <div class="lyra-stat-chip"><span>Lifetime Dmg</span><strong>${formatMiningNumber(lyraMiningState.totalDamageDealt || 0)}</strong></div>
                </div>
            </div>
        </div>
    `;
    setLyraPanelHtml(panel, html);
}

function renderLyraMiningSidebar() {
    const crystalsEl = document.getElementById('lyra-sidebar-crystals');
    const layerEl = document.getElementById('lyra-sidebar-layer');
    const dpsEl = document.getElementById('lyra-sidebar-dps');
    const systemsPanel = document.getElementById('lyra-panel-systems');
    if (!systemsPanel || !lyraMiningState) return;
    const api = getMiningApi();
    if (!api) return;
    const wallet = Math.max(0, Math.floor(Number(lyraMiningState.totalAetherCrystals) || 0));
    const effects = api.getUpgradeEffects(lyraMiningState.upgrades);
    const effectiveStats = typeof api.getEffectiveMiningStats === 'function'
        ? api.getEffectiveMiningStats(lyraMiningState, Date.now())
        : null;
    const displayDps = getLyraDisplayedDps(effectiveStats);
    setLyraText(crystalsEl, formatMiningNumber(wallet));
    setLyraText(layerEl, formatMiningNumber((Number(lyraMiningState.currentLayer) || 0) + 1));
    setLyraText(dpsEl, formatMiningNumber(displayDps || effects.dps));
    const visibleUpgrades = api.MINING_UPGRADES.filter((upgrade) => ['automation', 'active', 'bridge', 'critical'].includes(upgrade.category));
    if (!visibleUpgrades.some((upgrade) => upgrade.id === lyraSelectedUpgradeId)) {
        lyraSelectedUpgradeId = visibleUpgrades[0] ? visibleUpgrades[0].id : '';
    }
    const selectedUpgrade = visibleUpgrades.find((upgrade) => upgrade.id === lyraSelectedUpgradeId) || visibleUpgrades[0] || null;
    const selectedLevel = selectedUpgrade ? Math.max(0, Number(lyraMiningState.upgrades && lyraMiningState.upgrades[selectedUpgrade.id]) || 0) : 0;
    const selectedCost = selectedUpgrade ? api.getUpgradeCost(selectedUpgrade.id, selectedLevel) : 0;
    const selectedAffordable = !!selectedUpgrade && wallet >= selectedCost && selectedLevel < selectedUpgrade.maxLevel;
    const selectedEffect = selectedUpgrade ? (selectedUpgrade.effect(selectedLevel + 1) || {}) : {};
    const selectedEffectText = !selectedUpgrade
        ? ''
        : selectedUpgrade.id === 'automated_drones'
            ? `+${formatMiningNumber(selectedEffect.dps || 0)} DPS next level`
            : selectedUpgrade.id === 'laser_drills'
                ? `+${formatMiningNumber(selectedEffect.baseDamageBonus || 0)} active damage`
                : selectedUpgrade.id === 'buffer_optimizations'
                    ? `+${Math.round((selectedEffect.wpmMultiplierBonus || 0) * 100)}% WPM scaling`
                    : selectedUpgrade.id === 'neural_focus'
                        ? `+${Math.round((selectedEffect.critChanceBonus || 0) * 100)}% crit chance`
                        : `+${Number(selectedEffect.critMultiplierBonus || 0).toFixed(1)}x crit damage`;
    const systemsHtml = `
        <div class="lyra-systems-panel">
        <div class="lyra-upgrade-list">
        ${visibleUpgrades.map((upgrade) => {
        const level = Math.max(0, Number(lyraMiningState.upgrades && lyraMiningState.upgrades[upgrade.id]) || 0);
        const cost = api.getUpgradeCost(upgrade.id, level);
        const affordable = wallet >= cost && level < upgrade.maxLevel;
        return `
            <button type="button" class="lyra-upgrade-card${affordable ? ' can-afford' : ''}${lyraSelectedUpgradeId === upgrade.id ? ' selected' : ''}" onclick="setLyraSelectedUpgrade('${upgrade.id}')">
                <div class="lyra-upgrade-top">
                    <div class="lyra-upgrade-title">
                        <div class="lyra-upgrade-icon">${getLyraUpgradeIconSvg(upgrade.id)}</div>
                        <div class="lyra-upgrade-name">${escapeHtml(upgrade.name)}</div>
                    </div>
                    <div class="lyra-upgrade-level">Lv ${level}/${upgrade.maxLevel}</div>
                </div>
            </button>
        `;
        }).join('')}
        </div>
        ${selectedUpgrade ? `
            <div class="lyra-upgrade-detail">
                <div class="lyra-upgrade-detail-head">
                    <div class="lyra-upgrade-detail-title">
                        <div class="lyra-upgrade-icon">${getLyraUpgradeIconSvg(selectedUpgrade.id)}</div>
                        <span>${escapeHtml(selectedUpgrade.name)}</span>
                    </div>
                    <div class="lyra-upgrade-level">Lv ${selectedLevel}/${selectedUpgrade.maxLevel}</div>
                </div>
                <div class="lyra-upgrade-detail-copy">${escapeHtml(selectedUpgrade.description)}</div>
                <div class="lyra-upgrade-detail-meta">
                    <div class="lyra-upgrade-detail-chip">
                        <span>Effect</span>
                        <strong>${escapeHtml(selectedEffectText)}</strong>
                    </div>
                    <div class="lyra-upgrade-detail-chip">
                        <span>Cost</span>
                        <strong>${formatMiningNumber(selectedCost)}</strong>
                    </div>
                </div>
                <button type="button" class="lyra-upgrade-buy${selectedAffordable ? ' can-afford' : ''}" onclick="purchaseLyraMiningUpgrade('${selectedUpgrade.id}', this)" ${selectedAffordable ? '' : 'disabled'}>
                    ${selectedLevel >= selectedUpgrade.maxLevel ? 'Maxed' : 'Purchase'}
                </button>
            </div>
        ` : ''}
        </div>
    `;
    setLyraPanelHtml(systemsPanel, systemsHtml);
    renderLyraLibraryPanel();
    renderLyraDroneSpecializationPanel();
    renderLyraStatisticsPanel();
    setLyraSidebarTab(lyraSidebarTab);
}

function updateLyraOverloadVisualState(stats = null) {
    const wrap = document.querySelector('#lyra-gate-modal .lyra-gate-wrap');
    const scene = document.getElementById('lyra-scene');
    const overloadWrap = document.getElementById('lyra-overload-wrap');
    const statusEl = document.getElementById('lyra-overload-status');
    const hintEl = document.getElementById('lyra-overload-hint');
    const triggerEl = document.getElementById('lyra-overload-trigger');
    const effectiveStats = stats || getLyraEffectiveMiningStats();
    const meter = effectiveStats ? Math.max(0, Math.min(100, Number(effectiveStats.overloadMeter) || 0)) : 0;
    const active = !!(effectiveStats && effectiveStats.overloadActive);
    const ready = !active && meter >= 100;
    const hintState = active ? 'active' : ready ? 'ready' : 'charging';
    const api = getMiningApi();
    const remainingMs = active ? Math.max(0, Number(effectiveStats.overloadEndsAt) - Date.now()) : 0;
    const overloadDurationMs = Math.max(1, Number(api && api.OVERLOAD_DURATION_MS) || 10000);
    const displayPercent = active
        ? Math.max(0, Math.min(100, (remainingMs / overloadDurationMs) * 100))
        : meter;
    const activeSegments = Math.max(0, Math.min(10, Math.ceil(displayPercent / 10)));
    document.querySelectorAll('#lyra-overload-battery .lyra-overload-segment').forEach((segment) => {
        const segmentLevel = Number(segment.getAttribute('data-overload-segment')) || 0;
        segment.classList.toggle('active', activeSegments >= segmentLevel);
    });
    if (statusEl) {
        if (active) {
            statusEl.textContent = `${(remainingMs / 1000).toFixed(1)}s`;
        } else {
            statusEl.textContent = `${Math.round(meter)}%`;
        }
    }
    if (hintEl) {
        hintEl.classList.toggle('lyra-overload-charging', hintState === 'charging');
        hintEl.textContent = hintState === 'charging' ? 'Charging' : hintState === 'ready' ? 'Primed' : 'Active';
    }
    if (triggerEl) {
        triggerEl.disabled = !ready;
        triggerEl.classList.toggle('ready', ready);
        triggerEl.textContent = active ? 'Engaged' : 'Activate';
    }
    if (wrap) wrap.classList.toggle('overload-active', active);
    if (scene) scene.classList.toggle('overload-active', active);
    if (overloadWrap) {
        overloadWrap.dataset.overloadState = hintState;
        overloadWrap.classList.toggle('ready', ready);
        overloadWrap.classList.toggle('overload-active', active);
    }
    startLyraOverloadHintLoop();
}

function renderLyraMiningHud() {
    if (lyraHudFrame) return;
    lyraHudFrame = requestAnimationFrame(() => {
        lyraHudFrame = 0;
        renderLyraMiningHudNow();
    });
}

function renderLyraMiningHudNow() {
    const progressEl = document.getElementById('lyra-progress-text');
    const hpEl = document.getElementById('lyra-scene-hp');
    const dpsEl = document.getElementById('lyra-scene-dps');
    const comboEl = document.getElementById('lyra-scene-combo');
    if (!lyraMiningState) return;
    const maxHp = Math.max(1, Number(lyraMiningState.asteroidMaxHP) || 1);
    const hp = Math.max(0, Number(lyraMiningState.asteroidHP) || 0);
    const comboText = `x${getLyraComboMultiplierDisplay()}`;
    const effectiveStats = getLyraEffectiveMiningStats();
    const displayDps = getLyraDisplayedDps(effectiveStats);
    const progressText = `Layer ${formatMiningNumber((Number(lyraMiningState.currentLayer) || 0) + 1)} · HP ${formatMiningNumber(hp)} / ${formatMiningNumber(maxHp)} · Combo ${comboText}`;
    setLyraText(progressEl, progressText);
    setLyraText(hpEl, `${formatMiningNumber(hp)} / ${formatMiningNumber(maxHp)}`);
    setLyraText(dpsEl, formatMiningNumber(displayDps));
    setLyraText(comboEl, comboText);
    updateLyraAsteroidVisualState();
    updateLyraOverloadVisualState(effectiveStats);
    renderLyraMiningDrones();
    renderLyraMiningSidebar();
}

function applyLyraMiningDamage(damageAmount, source = 'typing') {
    const api = getMiningApi();
    if (!api || !lyraMiningState) return null;
    const prevCrystals = lyraMiningState.totalAetherCrystals;
    const applied = api.applyDamageToState(lyraMiningState, damageAmount, { source });
    lyraMiningState = applied.state;
    recordLyraDamageBurst(damageAmount, source);
    syncLyraWalletFromMiningState(prevCrystals);
    renderLyraMiningHud();
    if (applied.result && applied.result.shatteredLayers > 0) {
        triggerLyraAsteroidCycle();
    }
    return applied;
}

function tickLyraMiningPassiveDamage() {
    const api = getMiningApi();
    if (!api || !lyraMiningState) return;
    const prevCrystals = lyraMiningState.totalAetherCrystals;
    const ticked = api.tickMiningState(lyraMiningState, Date.now());
    lyraMiningState = ticked.state;
    syncLyraWalletFromMiningState(prevCrystals);
    renderLyraMiningHud();
    if (Number(ticked.idleDamage) > 0.05) {
        const droneEffects = typeof api.getDroneSpecializationEffects === 'function'
            ? api.getDroneSpecializationEffects(lyraMiningState.droneSpecialization)
            : null;
        const volleyRepeats = Math.max(1, Math.round(Number(droneEffects && droneEffects.attackSpeedMultiplier) || 1));
        const droneCount = Math.max(1, document.querySelectorAll('#lyra-drone-layer .lyra-drone').length);
        const totalShots = droneCount * volleyRepeats;
        const popupShares = Array.from({ length: totalShots }, (_, index) => {
            const remaining = Math.max(0, Number(ticked.idleDamage) || 0)
                - ((Number(ticked.idleDamage) || 0) / totalShots) * index;
            if (index === totalShots - 1) return remaining;
            return (Number(ticked.idleDamage) || 0) / totalShots;
        });
        for (let i = 0; i < volleyRepeats; i++) {
            const start = i * droneCount;
            const end = start + droneCount;
            scheduleLyraTimeout(() => emitLyraDroneVolley({
                popupValues: popupShares.slice(start, end),
                isCritical: !!ticked.passiveCritApplied,
                isOverloadActive: !!ticked.overloadActive,
            }), i * 80);
        }
        if (ticked.passiveCritApplied) triggerLyraCriticalShake();
    }
    if (ticked.result && ticked.result.shatteredLayers > 0 && !lyraGateState.cycleBusy) {
        triggerLyraAsteroidCycle();
    }
}

function purchaseLyraMiningUpgrade(upgradeId, buttonEl = null) {
    const api = getMiningApi();
    if (!api) return;
    syncLyraMiningStateWithWallet(lyraMiningState);
    const purchased = api.purchaseMiningUpgrade(lyraMiningState, upgradeId);
    lyraMiningState = purchased.state;
    if (!purchased.ok) {
        playSound(SFX.below50);
        showUiMessage(purchased.error || 'Purchase failed.', 'error', 1600, 'top-left');
        renderLyraMiningHud();
        return;
    }
    setSkillPoints(Math.max(0, Math.floor(Number(lyraMiningState.totalAetherCrystals) || 0)));
    updateSkillDisplay();
    flushProgressSyncNow();
    playSound(SFX.purchase1);
    renderLyraMiningHud();
    triggerLyraPurchaseFeedback(buttonEl);
    showUiMessage(`${api.getUpgradeDefinition(upgradeId)?.name || 'Upgrade'} purchased.`, 'success', 1500, 'top-left');
}
window.purchaseLyraMiningUpgrade = purchaseLyraMiningUpgrade;

function setLyraDroneSpecialization(specId) {
    const api = getMiningApi();
    if (!api || !lyraMiningState || typeof api.setDroneSpecialization !== 'function') return;
    const result = api.setDroneSpecialization(lyraMiningState, specId);
    lyraMiningState = result.state;
    renderLyraMiningHud();
    if (!result.ok) {
        playSound(SFX.below50);
        showUiMessage(result.error || 'Unable to apply firmware path.', 'error', 1800, 'top-left');
        return;
    }
    playSound(SFX.purchase1);
    showUiMessage(`${api.getDroneSpecializationDefinition(specId)?.name || 'Firmware'} online.`, 'success', 1600, 'top-left');
}
window.setLyraDroneSpecialization = setLyraDroneSpecialization;

function triggerLyraOverload(source = 'key') {
    const api = getMiningApi();
    if (!api || !lyraMiningState || typeof api.activateOverload !== 'function') return false;
    const result = api.activateOverload(lyraMiningState, Date.now());
    lyraMiningState = result.state;
    renderLyraMiningHud();
    if (!result.ok) return false;
    playSound(SFX.levelUp);
    if (source !== 'tick') showUiMessage('Aether Overload engaged.', 'success', 1400, 'top-left');
    return true;
}
window.triggerLyraOverload = triggerLyraOverload;

// Resolves true when this setup is still the latest one and finished; false if superseded.
async function setupLyraMiningMode(options = {}) {
    const api = getMiningApi();
    const generation = ++lyraSetupGeneration;
    if (!api) {
        lyraSetupInFlight = false;
        return true;
    }
    lyraSetupInFlight = true;
    try {
        syncLyraMiningStateWithWallet(api.loadMiningState());
        await primeLyraCurrentStoryBook(!!options.force);
        if (generation !== lyraSetupGeneration) return false;
        const prevCrystals = lyraMiningState.totalAetherCrystals;
        const ticked = api.tickMiningState(lyraMiningState, Date.now());
        lyraMiningState = ticked.state;
        syncLyraWalletFromMiningState(prevCrystals);
        invalidateLyraSceneAnchors();
        resizeLyraPopupCanvas();
        renderLyraMiningHud();
        setLyraSidebarTab(lyraSidebarTab);
        lyraSetupInFlight = false;
        return true;
    } catch (error) {
        if (generation === lyraSetupGeneration) lyraSetupInFlight = false;
        throw error;
    }
}

function handleLyraSetupFailure(error) {
    console.error('setupLyraMiningMode failed', error);
    lyraSetupInFlight = false;
    showUiMessage('Lyra Gate failed to initialize. Close and reopen it to try again.', 'error', 2600, 'top-right');
    if (!isLyraGateOpen()) return;
    try {
        resetLyraSceneForNextAsteroid();
        renderLyraWordStream();
        focusLyraInput();
    } catch (renderError) {
        console.error('Lyra Gate fallback render failed', renderError);
    }
}

// Runs setup, then onReady() only if this setup is still current and the gate is open.
function runLyraSetup(onReady, options = {}) {
    return setupLyraMiningMode(options).then((ready) => {
        if (!ready || !isLyraGateOpen()) return;
        startLyraStatsInterval();
        onReady();
    }).catch(handleLyraSetupFailure);
}

function flushLyraCommunityDamage() {
    const api = getMiningApi();
    if (!api || !lyraMiningState || typeof api.flushMiningCommunityBuffer !== 'function') return;
    let flushed = null;
    try {
        flushed = api.flushMiningCommunityBuffer(lyraMiningState);
    } catch (error) {
        console.error('flushMiningCommunityBuffer failed', error);
        return;
    }
    // flushMiningCommunityBuffer persists the returned state via saveMiningState itself.
    if (flushed && flushed.state) lyraMiningState = flushed.state;
    const damage = Math.max(0, Math.floor(Number(flushed && flushed.damage) || 0));
    const queued = takeLyraCommunityRetry();
    if (damage + queued > 0) void submitLyraCommunityDamage(damage + queued);
}

const LYRA_COMMUNITY_RETRY_KEY = 'sampire-community-retry';
const LYRA_COMMUNITY_RETRY_CAP = 20000;

function takeLyraCommunityRetry() {
    try {
        const amount = Math.max(0, Math.floor(Number(localStorage.getItem(LYRA_COMMUNITY_RETRY_KEY)) || 0));
        localStorage.removeItem(LYRA_COMMUNITY_RETRY_KEY);
        return Math.min(amount, LYRA_COMMUNITY_RETRY_CAP);
    } catch (e) { return 0; }
}

function queueLyraCommunityRetry(amount) {
    const add = Math.max(0, Math.floor(Number(amount) || 0));
    if (add <= 0) return;
    try {
        const cur = Math.max(0, Math.floor(Number(localStorage.getItem(LYRA_COMMUNITY_RETRY_KEY)) || 0));
        localStorage.setItem(LYRA_COMMUNITY_RETRY_KEY, String(Math.min(LYRA_COMMUNITY_RETRY_CAP, cur + add)));
    } catch (e) {}
}

// The contribute endpoint's `words` field is added directly to a contributor's damage total (max 2000 per call).
async function submitLyraCommunityDamage(damage) {
    let remaining = damage;
    while (remaining > 0) {
        const part = Math.min(LYRA_COMMUNITY_MAX_WORDS_PER_CALL, remaining);
        const result = await submitCommunityContribution(part);
        if (!result || !result.ok) {
            console.warn('Lyra community contribution failed', result && result.error);
            queueLyraCommunityRetry(remaining);
            return;
        }
        remaining -= part;
    }
}

window.addEventListener('resize', () => {
    invalidateLyraSceneAnchors();
    if (!isLyraGateOpen()) return;
    resizeLyraPopupCanvas();
    updateLyraShipAim();
});

function renderLyraWordStream() {
    const stream = document.getElementById('lyra-quote-display');
    if (!stream) return;
    ensureLyraWordsBuffer(LYRA_VISIBLE_WORD_WINDOW);
    if (lyraWordSlots.length !== LYRA_VISIBLE_WORD_WINDOW || stream.childElementCount === 0) {
        lyraWordSlots = [];
        lyraCharSpans = [];
        stream.innerHTML = '';
        for (let slotIndex = 0; slotIndex < LYRA_VISIBLE_WORD_WINDOW; slotIndex++) {
            const wordSpan = document.createElement('span');
            wordSpan.className = 'quote-word';
            wordSpan.style.whiteSpace = 'nowrap';
            const spaceSpan = document.createElement('span');
            spaceSpan.textContent = '\u00A0';
            const slot = {
                wordEl: wordSpan,
                spaceEl: spaceSpan,
                charEls: [],
            };
            lyraWordSlots.push(slot);
            stream.appendChild(wordSpan);
            stream.appendChild(spaceSpan);
        }
    }
    lyraCharSpans = [];
    const activeWord = String(lyraGateState.words[0] || '');
    const typedChars = String(lyraGateState.typed || '');
    for (let slotIndex = 0; slotIndex < lyraWordSlots.length; slotIndex++) {
        const slot = lyraWordSlots[slotIndex];
        const word = String(lyraGateState.words[slotIndex] || '');
        slot.wordEl.dataset.lyraActiveWord = slotIndex === 0 && word ? '1' : '';
        slot.wordEl.style.display = word ? 'inline-block' : 'none';
        slot.spaceEl.style.display = word && slotIndex < lyraWordSlots.length - 1 ? 'inline' : 'none';
        if (!word) continue;
        if (slot.charEls.length < word.length) {
            for (let i = slot.charEls.length; i < word.length; i++) {
                const span = document.createElement('span');
                slot.charEls.push(span);
                slot.wordEl.appendChild(span);
            }
        }
        for (let i = 0; i < slot.charEls.length; i++) {
            const span = slot.charEls[i];
            if (i >= word.length) {
                span.style.display = 'none';
                span.textContent = '';
                span.className = '';
                continue;
            }
            const ch = word[i];
            span.style.display = 'inline';
            span.textContent = ch;
            if (slotIndex === 0) {
                if (i < typedChars.length) {
                    span.className = lyraCharsMatch(typedChars[i], ch) ? 'char-correct' : 'char-incorrect';
                } else if (i === typedChars.length) {
                    span.className = 'char-cursor';
                } else {
                    span.className = 'char-untyped';
                }
            } else {
                span.className = 'char-untyped';
            }
            lyraCharSpans.push(span);
        }
    }
    updateLyraShipAim();
    updateLyraStats();
    renderLyraMiningHud();
    renderLyraStoryMeta();
    if (isLyraStoryComplete()) showLyraStoryCompleteSplash();
    updateLyraStoryResetMenu();
    if (stream) {
        stream.scrollLeft = 0;
    }
}

function updateLyraStats() {
    const wpmEl = document.getElementById('lyra-wpm');
    const accEl = document.getElementById('lyra-acc');
    const timeEl = document.getElementById('lyra-time');
    if (!wpmEl || !accEl || !timeEl) return;
    const elapsed = lyraGateState.startTime ? (performance.now() - lyraGateState.startTime) / 1000 : 0;
    const wpm = getLyraCurrentWpm();
    const acc = Math.round(getLyraAccuracyRatio() * 100);
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    wpmEl.textContent = wpm;
    accEl.textContent = acc;
    timeEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
    if (isLyraGateOpen() && !lyraGateState.cycleBusy) tickLyraMiningPassiveDamage();
}

function renderLyraAsteroid(seed) {
    const asteroid = document.getElementById('lyra-asteroid');
    if (!asteroid) return;
    const api = getMiningApi();
    if (!api || typeof api.generateAsteroidArtSpec !== 'function' || typeof api.drawAsteroidToCanvas !== 'function') return;
    const displaySize = getLyraAsteroidDisplaySize(lyraMiningState);
    const renderSize = Math.max(40, Math.min(96, Math.round(displaySize * 0.5)));
    const spec = api.generateAsteroidArtSpec((Number(seed) || 0) >>> 0, { size: renderSize });
    asteroid.innerHTML = '';
    asteroid.style.setProperty('--lyra-asteroid-base-rotation', `${spec.rotationDeg}deg`);
    const canvas = document.createElement('canvas');
    canvas.className = 'lyra-asteroid-canvas';
    api.drawAsteroidToCanvas(canvas, spec);
    asteroid.appendChild(canvas);
}

function initLyraStars() {
    const layer = document.getElementById('lyra-stars-layer');
    if (!layer || layer.childElementCount > 0) return;
    const starPalette = ['#eff6ff', '#e2e8f0', '#dbeafe', '#bfdbfe', '#ddd6fe', '#c4b5fd', '#fde68a'];
    for (let i = 0; i < 80; i++) {
        const star = document.createElement('span');
        star.className = 'lyra-star';
        const size = 1 + Math.random() * 2.5;
        star.style.width = size + 'px';
        star.style.height = size + 'px';
        star.style.left = (Math.random() * 110 - 5) + '%';
        star.style.top = (Math.random() * 110 - 5) + '%';
        star.style.background = starPalette[Math.floor(Math.random() * starPalette.length)];
        star.style.setProperty('--dur', (1.6 + Math.random() * 3.6).toFixed(2) + 's');
        star.style.setProperty('--del', (Math.random() * 6.5).toFixed(2) + 's');
        star.style.setProperty('--min-o', (0.06 + Math.random() * 0.18).toFixed(2));
        star.style.setProperty('--max-o', (0.72 + Math.random() * 0.28).toFixed(2));
        layer.appendChild(star);
    }
}

function bindLyraSceneParallax() {
    const scene = document.getElementById('lyra-scene');
    const stars = document.getElementById('lyra-stars-layer');
    if (!scene || !stars || scene.dataset.parallaxBound) return;
    scene.dataset.parallaxBound = '1';
    scene.addEventListener('mousemove', (e) => {
        const rect = scene.getBoundingClientRect();
        const rx = ((e.clientX - rect.left) / rect.width - 0.5);
        const ry = ((e.clientY - rect.top) / rect.height - 0.5);
        stars.style.transform = `translate(${(-rx * 14).toFixed(1)}px, ${(-ry * 8).toFixed(1)}px)`;
    });
    scene.addEventListener('mouseleave', () => {
        stars.style.transform = 'translate(0, 0)';
    });
}

function focusLyraInput() {
    if (!isLyraGateOpen()) return;
    if (quoteDisplay) quoteDisplay.classList.remove('focused');
    if (lyraQuoteDisplay) lyraQuoteDisplay.classList.add('focused');
    hiddenInput.focus();
}

function getLyraSceneAnchors() {
    if (lyraSceneAnchorCache) return lyraSceneAnchorCache;
    const scene = document.getElementById('lyra-scene');
    const asteroid = document.getElementById('lyra-asteroid-wrap');
    const ship = document.getElementById('lyra-ship');
    const muzzle = document.getElementById('lyra-ship-muzzle');
    if (!scene || !asteroid || !ship) return null;
    const sRect = scene.getBoundingClientRect();
    const aRect = asteroid.getBoundingClientRect();
    const shipRect = ship.getBoundingClientRect();
    const muzzleRect = muzzle ? muzzle.getBoundingClientRect() : null;
    const muzzleX = muzzleRect
        ? (muzzleRect.left - sRect.left) + (muzzleRect.width * 0.5)
        : (shipRect.left - sRect.left) + shipRect.width * 0.5;
    const muzzleY = muzzleRect
        ? (muzzleRect.top - sRect.top) + (muzzleRect.height * 0.5)
        : (shipRect.top - sRect.top) + shipRect.height * 0.18;
    const anchors = {
        shipCenterX: (shipRect.left - sRect.left) + shipRect.width * 0.5,
        shipCenterY: (shipRect.top - sRect.top) + shipRect.height * 0.5,
        shipMuzzleX: muzzleX,
        shipMuzzleY: muzzleY,
        shipRadius: Math.max(12, Math.min(shipRect.width, shipRect.height) * 0.34),
        asteroidCenterX: (aRect.left - sRect.left) + aRect.width * 0.5,
        asteroidCenterY: (aRect.top - sRect.top) + aRect.height * 0.55,
        asteroidRadius: Math.max(24, Math.min(aRect.width, aRect.height) * 0.44),
    };
    // Don't cache measurements taken while the scene is hidden or unlaid-out.
    if (sRect.width > 0 && sRect.height > 0) lyraSceneAnchorCache = anchors;
    return anchors;
}

function updateLyraShipAim() {
    const anchors = getLyraSceneAnchors();
    const ship = document.getElementById('lyra-ship');
    if (!anchors || !ship) return;
    // Player ship sprite points upward by default, so offset by +90deg from path angle.
    const angle = (Math.atan2(anchors.asteroidCenterY - anchors.shipCenterY, anchors.asteroidCenterX - anchors.shipCenterX) * 180 / Math.PI) + 90;
    const angleValue = `${angle.toFixed(2)}deg`;
    if (ship.style.getPropertyValue('--lyra-ship-angle') !== angleValue) {
        ship.style.setProperty('--lyra-ship-angle', angleValue);
        // Rotating the ship moves its muzzle, so re-measure next time.
        invalidateLyraSceneAnchors();
    }
}

function emitLyraLaserBurst() {
    if (!isLyraGateOpen()) return;
    const laserLayer = document.getElementById('lyra-laser-layer');
    const anchors = getLyraSceneAnchors();
    if (!laserLayer || !anchors) return;
    const impactPoint = getLyraAsteroidImpactPoint(anchors.shipMuzzleX, anchors.shipMuzzleY, anchors);
    if (!impactPoint) return;
    const endX = impactPoint.x;
    const endY = impactPoint.y;
    const beamDx = endX - anchors.shipMuzzleX;
    const beamDy = endY - anchors.shipMuzzleY;
    const length = Math.hypot(beamDx, beamDy);
    if (length < 2) return;

    const angle = Math.atan2(beamDy, beamDx) * 180 / Math.PI;

    // Laser beam rendered in the Lyra scene's own layer
    const beam = document.createElement('span');
    beam.className = 'lyra-laser-burst';
    beam.style.left = anchors.shipMuzzleX + 'px';
    beam.style.top = (anchors.shipMuzzleY - 2.5) + 'px';
    beam.style.width = length + 'px';
    beam.style.rotate = angle + 'deg';
    laserLayer.appendChild(beam);
    beam.addEventListener('animationend', () => beam.remove(), { once: true });

    // Impact flash at asteroid surface
    const impact = document.createElement('span');
    impact.className = 'lyra-laser-impact';
    impact.style.left = endX + 'px';
    impact.style.top = endY + 'px';
    laserLayer.appendChild(impact);
    impact.addEventListener('animationend', () => impact.remove(), { once: true });

    updateLyraShipAim();
    scheduleLyraTimeout(() => emitLyraAsteroidChunks(1 + Math.floor(Math.random() * 2)), 42);
    return { x: endX, y: endY };
}

function emitLyraWordCompletionShatter() {
    if (!isLyraGateOpen() || !miningVisualsEnabled) return;
    const stream = document.getElementById('lyra-quote-display');
    const activeWord = stream ? stream.querySelector('.quote-word[data-lyra-active-word="1"]') : null;
    if (!stream || !activeWord) return;

    const hostRect = stream.getBoundingClientRect();
    const wordRect = activeWord.getBoundingClientRect();
    const centerX = wordRect.left - hostRect.left + (wordRect.width * 0.5);
    const centerY = wordRect.top - hostRect.top + (wordRect.height * 0.58);
    const burstCount = 18;
    const palette = ['#fde047', '#fb923c', '#f97316', '#ef4444', '#facc15'];

    const core = document.createElement('span');
    core.className = 'mining-shatter-core';
    core.style.setProperty('--x', `${centerX.toFixed(1)}px`);
    core.style.setProperty('--y', `${centerY.toFixed(1)}px`);
    stream.appendChild(core);
    core.addEventListener('animationend', () => core.remove(), { once: true });

    for (let i = 0; i < burstCount; i++) {
        const particle = document.createElement('span');
        particle.className = 'mining-shatter-particle';
        const theta = (Math.PI * 2 * i / burstCount) + (Math.random() * 0.34);
        const travel = 16 + Math.random() * 24;
        const dx = Math.cos(theta) * travel;
        const dy = Math.sin(theta) * travel - (4 + Math.random() * 7);
        const size = 4 + Math.random() * 4;
        const duration = 0.3 + Math.random() * 0.16;
        const color = palette[Math.floor(Math.random() * palette.length)];

        particle.style.setProperty('--x', `${centerX.toFixed(1)}px`);
        particle.style.setProperty('--y', `${centerY.toFixed(1)}px`);
        particle.style.setProperty('--dx', `${dx.toFixed(1)}px`);
        particle.style.setProperty('--dy', `${dy.toFixed(1)}px`);
        particle.style.setProperty('--size', `${size.toFixed(1)}px`);
        particle.style.setProperty('--dur', `${duration.toFixed(2)}s`);
        particle.style.setProperty('--pixel', color);

        stream.appendChild(particle);
        particle.addEventListener('animationend', () => particle.remove(), { once: true });
    }
}

function emitLyraAsteroidChunks(count = 1) {
    if (!isLyraGateOpen()) return;
    const chunkLayer = document.getElementById('lyra-chunk-layer');
    const asteroidWrap = document.getElementById('lyra-asteroid-wrap');
    const scene = document.getElementById('lyra-scene');
    if (!chunkLayer || !asteroidWrap || !scene) return;
    const sceneRect = scene.getBoundingClientRect();
    const asteroidRect = asteroidWrap.getBoundingClientRect();
    const cx = (asteroidRect.left - sceneRect.left) + asteroidRect.width * 0.5;
    const cy = (asteroidRect.top - sceneRect.top) + asteroidRect.height * 0.5;
    const radius = Math.min(asteroidRect.width, asteroidRect.height) * 0.42;
    for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const startX = cx + Math.cos(theta) * radius;
        const startY = cy + Math.sin(theta) * radius;
        const driftTheta = theta + ((Math.random() - 0.5) * 0.9);
        const driftDist = 26 + Math.random() * 90;
        const dx = Math.cos(driftTheta) * driftDist;
        const dy = Math.sin(driftTheta) * driftDist - (6 + Math.random() * 22);
        const chunk = document.createElement('span');
        chunk.className = 'lyra-rock-chunk';
        chunk.style.left = `${startX.toFixed(2)}px`;
        chunk.style.top = `${startY.toFixed(2)}px`;
        chunk.style.setProperty('--dx', `${dx.toFixed(2)}px`);
        chunk.style.setProperty('--dy', `${dy.toFixed(2)}px`);
        chunk.style.setProperty('--rot', `${(Math.random() * 760 - 380).toFixed(2)}deg`);
        chunkLayer.appendChild(chunk);
        scheduleLyraTimeout(() => chunk.remove(), 1700);
    }
}

function emitLyraExplosionAndCrystals() {
    if (!isLyraGateOpen()) return;
    const anchors = getLyraSceneAnchors();
    const crystalLayer = document.getElementById('lyra-crystal-layer');
    const explosionLayer = document.getElementById('lyra-explosion-layer');
    if (!anchors || !crystalLayer || !explosionLayer) return;
    for (let i = 0; i < 14; i++) {
        const px = document.createElement('span');
        px.className = 'lyra-explosion-pixel';
        px.style.left = `${(anchors.asteroidCenterX + (Math.random() - 0.5) * 26).toFixed(2)}px`;
        px.style.top = `${(anchors.asteroidCenterY + (Math.random() - 0.5) * 20).toFixed(2)}px`;
        px.style.setProperty('--dx', `${((Math.random() - 0.5) * 120).toFixed(2)}px`);
        px.style.setProperty('--dy', `${((Math.random() - 0.5) * 84).toFixed(2)}px`);
        explosionLayer.appendChild(px);
        setTimeout(() => px.remove(), 720);
    }
    for (let i = 0; i < 16; i++) {
        const crystal = document.createElement('span');
        crystal.className = 'lyra-crystal';
        const sx = anchors.asteroidCenterX + (Math.random() - 0.5) * 68;
        const sy = anchors.asteroidCenterY + (Math.random() - 0.5) * 58;
        const tx = anchors.shipCenterX - sx + (Math.random() - 0.5) * 24;
        const ty = anchors.shipCenterY - sy + (Math.random() - 0.5) * 18;
        crystal.style.left = `${sx.toFixed(2)}px`;
        crystal.style.top = `${sy.toFixed(2)}px`;
        crystal.style.animationDelay = `${(Math.random() * 0.24).toFixed(2)}s`;
        crystal.style.setProperty('--tx', `${tx.toFixed(2)}px`);
        crystal.style.setProperty('--ty', `${ty.toFixed(2)}px`);
        crystalLayer.appendChild(crystal);
        setTimeout(() => crystal.remove(), 1450);
    }
}

function resetLyraSceneForNextAsteroid() {
    const asteroid = document.getElementById('lyra-asteroid');
    const ship = document.getElementById('lyra-ship');
    const drones = document.getElementById('lyra-drone-layer');
    const lasers = document.getElementById('lyra-laser-layer');
    const chunks = document.getElementById('lyra-chunk-layer');
    const crystals = document.getElementById('lyra-crystal-layer');
    const explosion = document.getElementById('lyra-explosion-layer');
    if (asteroid) {
        asteroid.classList.remove('exploding');
        randomizeLyraAsteroidSeed();
        renderLyraAsteroid(lyraGateState.asteroidSeed);
    }
    if (ship) ship.classList.remove('fly-away');
    if (drones) drones.innerHTML = '';
    stopLyraDroneOrbitLoop();
    invalidateLyraSceneAnchors();
    if (lasers) lasers.innerHTML = '';
    if (chunks) chunks.innerHTML = '';
    if (crystals) crystals.innerHTML = '';
    if (explosion) explosion.innerHTML = '';
    updateLyraShipAim();
    updateLyraAsteroidVisualState();
    renderLyraMiningHud();
}

function triggerLyraAsteroidCycle() {
    if (lyraGateState.cycleBusy || !isLyraGateOpen()) return;
    lyraGateState.cycleBusy = true;
    const asteroid = document.getElementById('lyra-asteroid');
    const ship = document.getElementById('lyra-ship');
    if (asteroid) asteroid.classList.add('exploding');
    emitLyraExplosionAndCrystals();
    if (lyraShipFlyAwayTimer) clearTimeout(lyraShipFlyAwayTimer);
    lyraShipFlyAwayTimer = setTimeout(() => {
        lyraShipFlyAwayTimer = null;
        if (ship) ship.classList.add('fly-away');
    }, 160);
    if (lyraAsteroidCycleTimer) clearTimeout(lyraAsteroidCycleTimer);
    lyraAsteroidCycleTimer = setTimeout(() => {
        lyraAsteroidCycleTimer = null;
        if (!isLyraGateOpen()) return;
        lyraGateState.cycleBusy = false;
        resetLyraSceneForNextAsteroid();
        renderLyraWordStream();
    }, 1600);
}

function showLyraGateClearSplash() {
    const wrap = document.querySelector('.lyra-gate-wrap');
    if (!wrap) return;
    // Compute final stats
    const elapsed = lyraGateState.startTime ? (performance.now() - lyraGateState.startTime) / 1000 : 0;
    const minutes = elapsed / 60;
    const wpm = minutes > 0 ? Math.round((lyraGateState.correctChars / 5) / minutes) : 0;
    const acc = lyraGateState.totalChars > 0 ? Math.round((lyraGateState.correctChars / lyraGateState.totalChars) * 100) : 100;
    const timeStr = `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`;

    const starSvg = `<svg class="lyra-clear-star" viewBox="0 0 24 24"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l7.1-1.01z"/></svg>`;

    const splash = document.createElement('div');
    splash.className = 'lyra-clear-splash';
    splash.innerHTML = `
        <div class="lyra-clear-stars">${starSvg}${starSvg}${starSvg}</div>
        <div class="lyra-clear-title">Lyra Gate Clear!</div>
        <div class="lyra-clear-subtitle">All ${LYRA_ASTEROIDS_TO_CLEAR} asteroids have been mined</div>
        <div class="lyra-clear-stats">
            <span><strong>${wpm}</strong> WPM</span>
            <span><strong>${acc}</strong>% ACC</span>
            <span><strong>${timeStr}</strong></span>
        </div>
        <div class="lyra-clear-actions">
            <button onclick="replayLyraGate()">Mine Again</button>
            <button onclick="closeLyraGate()">Return to Sector Map</button>
        </div>
    `;
    wrap.appendChild(splash);
}

function showLyraStoryCompleteSplash() {
    const wrap = document.querySelector('.lyra-gate-wrap');
    if (!wrap || !isLyraGateOpen() || document.querySelector('.lyra-clear-splash')) return;
    const api = getMiningApi();
    const books = getLyraStoryLibrary().filter((book) => !book.locked && book.id !== getLyraCurrentStoryBookId());
    const currentBook = api && typeof api.getStoryBookDefinition === 'function' ? api.getStoryBookDefinition(getLyraCurrentStoryBookId()) : null;
    const nextBook = books[0] || null;
    const splash = document.createElement('div');
    splash.className = 'lyra-clear-splash';
    splash.innerHTML = `
        <div class="lyra-clear-title">Story Complete!</div>
        <div class="lyra-clear-subtitle">You reached the end of ${escapeHtml(currentBook ? currentBook.name : 'this book')}</div>
        <div class="lyra-clear-actions">
            <button onclick="restartLyraStoryProgress('book')">Restart Book</button>
            ${nextBook ? `<button onclick="selectLyraStoryBook('${escapeHtml(nextBook.id)}')">Next: ${escapeHtml(nextBook.name)}</button>` : ''}
            <button onclick="closeLyraGate()">Return to Sector Map</button>
        </div>
    `;
    wrap.appendChild(splash);
}

function replayLyraGate() {
    const splash = document.querySelector('.lyra-clear-splash');
    if (splash) splash.remove();
    if (lyraStatsInterval) { clearInterval(lyraStatsInterval); lyraStatsInterval = null; }
    stopLyraDamagePopupLoop();
    resetLyraGateState();
    runLyraSetup(() => {
        resetLyraSceneForNextAsteroid();
        renderLyraWordStream();
        updateLyraStats();
        focusLyraInput();
    }, { force: getLyraCurrentStoryWords().length === 0 });
}

function handleLyraGateKeydown(e) {
    if (!isLyraGateOpen()) return false;
    if (lyraSetupInFlight) {
        e.preventDefault();
        return true;
    }
    if (lyraGateState.cycleBusy) {
        e.preventDefault();
        return true;
    }
    if (e.key === 'Tab') {
        playKeypressSound('Tab', e);
        e.preventDefault();
        e.stopPropagation();
        if (triggerLyraOverload('tab')) return true;
        if (lyraStatsInterval) { clearInterval(lyraStatsInterval); lyraStatsInterval = null; }
        stopLyraDamagePopupLoop();
        resetLyraGateState();
        runLyraSetup(() => {
            resetLyraSceneForNextAsteroid();
            renderLyraWordStream();
            updateLyraStats();
            focusLyraInput();
        }, { force: getLyraCurrentStoryWords().length === 0 });
        return true;
    }
    if (!lyraGateState.words.length) {
        // End of the book: nothing to type until the player restarts or picks another book.
        e.preventDefault();
        return true;
    }
    const currentWord = lyraGateState.words[0] || '';
    const lyraKey = normalizeTypedChar(e.key);
    if (e.key === 'Backspace') {
        playKeypressSound('Backspace', e);
        e.preventDefault();
        // Remove correct chars that are no longer in place so retyping doesn't inflate WPM.
        const lyraTypedNow = lyraGateState.typed;
        let lyraRemoveFrom = -1;
        if (e.ctrlKey || e.metaKey) lyraRemoveFrom = 0;
        else if (lyraTypedNow.length > 0) lyraRemoveFrom = lyraTypedNow.length - 1;
        if (lyraRemoveFrom >= 0) {
            for (let i = lyraRemoveFrom; i < lyraTypedNow.length; i++) {
                if (currentWord[i] && lyraCharsMatch(lyraTypedNow[i], currentWord[i])) {
                    lyraGateState.correctChars = Math.max(0, lyraGateState.correctChars - 1);
                }
            }
            lyraGateState.typed = lyraTypedNow.slice(0, lyraRemoveFrom);
        }
        renderLyraWordStream();
        return true;
    }
    if (lyraKey === ' ' && e.key.length === 1) {
        e.preventDefault();
        if (e.repeat) return true;
        playKeypressSound(' ', e);
        if (!lyraGateState.typed.length && triggerLyraOverload('space')) return true;
        const isPerfectWord = lyraWordsMatch(lyraGateState.typed, currentWord);
        if (isPerfectWord) {
            emitLyraWordCompletionShatter();
            if (miningLaserSoundEnabled) playSound(SFX.laser);
            lyraGateState.totalCompleted += 1;
            const api = getMiningApi();
            if (api && lyraMiningState) {
                if (typeof api.setCurrentStoryProgress === 'function' && getLyraCurrentStoryWords().length > 0) {
                    const storyAdvance = api.setCurrentStoryProgress(
                        lyraMiningState,
                        Math.max(0, Number(lyraMiningState.currentStoryProgress) || 0) + 1,
                    );
                    lyraMiningState = storyAdvance.state;
                }
                const effects = api.getUpgradeEffects(lyraMiningState.upgrades);
                const completionDamage = api.calculateDamage({
                    charactersTyped: currentWord.length,
                    wpm: getLyraCurrentWpm(),
                    accuracy: getLyraAccuracyRatio(),
                    sessionAccuracy: getLyraAccuracyRatio(),
                    combo: lyraGateState.comboStreak,
                    bufferBonus: effects.wpmMultiplierBonus,
                    activeUpgradeBonus: effects.baseDamageBonus,
                    critChance: lyraMiningState.critChance,
                    critMultiplier: lyraMiningState.critMultiplier,
                    isOverloadActive: typeof api.isOverloadActive === 'function' ? api.isOverloadActive(lyraMiningState, Date.now()) : false,
                    rollForCrit: true,
                });
                const appliedCompletion = applyLyraMiningDamage(completionDamage.activeDamage, 'typing');
                if (appliedCompletion && completionDamage.activeDamage > 0) {
                    const completionAnchors = getLyraSceneAnchors();
                    const completionImpact = completionAnchors
                        ? getLyraAsteroidImpactPoint(completionAnchors.shipMuzzleX, completionAnchors.shipMuzzleY, completionAnchors)
                        : null;
                    spawnLyraDamagePopup(completionDamage.activeDamage, {
                        x: completionImpact ? completionImpact.x : undefined,
                        y: completionImpact ? completionImpact.y : undefined,
                        isCritical: completionDamage.isCritical,
                        isOverloadActive: completionDamage.isOverloadActive,
                    });
                    if (completionDamage.isCritical) triggerLyraCriticalShake();
                }
                if (typeof api.addOverloadCharge === 'function') {
                    const charged = api.addOverloadCharge(lyraMiningState, api.OVERLOAD_CHARGE_PER_WORD || 2);
                    lyraMiningState = charged.state;
                    renderLyraMiningHud();
                }
            }
            lyraGateState.storyBaseIndex += 1;
            if (lyraGateState.words.length > 0) lyraGateState.words.shift();
            ensureLyraWordsBuffer(LYRA_VISIBLE_WORD_WINDOW);
            lyraGateState.typed = '';
            renderLyraWordStream();
            return true;
        }
        lyraGateState.typed = '';
        lyraGateState.comboStreak = 0;
        showUiMessage('Complete the word to advance the story.', 'info', 1000, 'top-right');
        renderLyraWordStream();
        return true;
    }
    if (!isPrintableKeyEvent(e) || e.repeat) return false;
    playKeypressSound(e.key, e);
    e.preventDefault();
    // Start timer on first character
    if (!lyraGateState.startTime) {
        lyraGateState.startTime = performance.now();
        if (lyraStatsInterval) clearInterval(lyraStatsInterval);
        lyraStatsInterval = setInterval(updateLyraStats, 500);
    }
    const nextIndex = lyraGateState.typed.length;
    const expected = currentWord[nextIndex] || '';
    lyraGateState.typed += lyraKey;
    lyraGateState.totalChars++;
    if (expected && lyraCharsMatch(lyraKey, expected)) {
        lyraGateState.correctChars++;
        lyraGateState.comboStreak += 1;
        lyraGateState.bestCombo = Math.max(lyraGateState.bestCombo, lyraGateState.comboStreak);
        const laserImpact = emitLyraLaserBurst();
        const api = getMiningApi();
        if (api && lyraMiningState) {
            const effects = api.getUpgradeEffects(lyraMiningState.upgrades);
            const damageInfo = api.calculateDamage({
                charactersTyped: 1,
                wpm: getLyraCurrentWpm(),
                accuracy: getLyraAccuracyRatio(),
                sessionAccuracy: getLyraAccuracyRatio(),
                combo: lyraGateState.comboStreak,
                bufferBonus: effects.wpmMultiplierBonus,
                activeUpgradeBonus: effects.baseDamageBonus,
                critChance: lyraMiningState.critChance,
                critMultiplier: lyraMiningState.critMultiplier,
                isOverloadActive: typeof api.isOverloadActive === 'function' ? api.isOverloadActive(lyraMiningState, Date.now()) : false,
                rollForCrit: false,
            });
            const applied = applyLyraMiningDamage(damageInfo.activeDamage, 'typing');
            if (applied && damageInfo.activeDamage > 0) {
                spawnLyraDamagePopup(damageInfo.activeDamage, {
                    x: laserImpact ? laserImpact.x : undefined,
                    y: laserImpact ? laserImpact.y : undefined,
                    isCritical: damageInfo.isCritical,
                    isOverloadActive: damageInfo.isOverloadActive,
                });
                flashLyraAsteroidHit();
                if (damageInfo.isCritical) triggerLyraCriticalShake();
            }
        }
    } else {
        lyraGateState.comboStreak = 0;
        updateLyraShipAim();
    }
    renderLyraWordStream();
    return true;
}

function openLyraGate() {
    const modal = document.getElementById('lyra-gate-modal');
    const ship = document.getElementById('lyra-ship');
    if (!modal) {
        showUiMessage('Lyra Gate failed to initialize. Refresh and try again.', 'error', 2600, 'top-right');
        return false;
    }
    openModal(modal);
    // Hide the main mining laser overlay while Lyra is open
    if (miningLaserOverlay) {
        miningLaserOverlay.classList.remove('show');
        miningLaserOverlay.style.opacity = '0';
    }
    try {
        stopLyraDamagePopupLoop();
        stopLyraDroneOrbitLoop();
        resetLyraGateState();
        invalidateLyraSceneAnchors();
        lyraPanelHtmlCache = {};
        const popupCanvasEl = document.getElementById('lyra-popup-canvas');
        if (popupCanvasEl) delete popupCanvasEl.dataset.lyraSized;
        if (lyraCommunityFlushInterval) clearInterval(lyraCommunityFlushInterval);
        lyraCommunityFlushInterval = setInterval(flushLyraCommunityDamage, LYRA_COMMUNITY_FLUSH_MS);
        runLyraSetup(() => {
            resetLyraSceneForNextAsteroid();
            renderLyraWordStream();
            setTimeout(() => {
                updateLyraShipAim();
                resizeLyraPopupCanvas();
                focusLyraInput();
            }, 0);
        });
        if (ship) {
            ship.innerHTML = getCommunityShipSprite('player');
            const muzzle = document.createElement('span');
            muzzle.className = 'lyra-ship-muzzle';
            muzzle.id = 'lyra-ship-muzzle';
            ship.appendChild(muzzle);
        }
        initLyraStars();
        bindLyraSceneParallax();
    } catch (err) {
        console.error('openLyraGate failed', err);
        // Keep the modal open even if scene init has a transient issue.
        setTimeout(() => focusLyraInput(), 0);
    }
    return true;
}

function closeLyraGate() {
    const modal = document.getElementById('lyra-gate-modal');
    if (!modal) return;
    closeModal(modal);
    lyraGateState.cycleBusy = false;
    lyraSetupGeneration++;
    lyraSetupInFlight = false;
    clearLyraPendingTimeouts();
    if (lyraHudFrame) { cancelAnimationFrame(lyraHudFrame); lyraHudFrame = 0; }
    if (lyraCommunityFlushInterval) { clearInterval(lyraCommunityFlushInterval); lyraCommunityFlushInterval = null; }
    flushLyraCommunityDamage();
    invalidateLyraSceneAnchors();
    closeLyraStoryResetMenu();
    if (lyraOverloadHintInterval) {
        clearInterval(lyraOverloadHintInterval);
        lyraOverloadHintInterval = null;
    }
    lyraOverloadHintFrame = 0;
    if (lyraStatsInterval) { clearInterval(lyraStatsInterval); lyraStatsInterval = null; }
    if (lyraQuoteDisplay) lyraQuoteDisplay.classList.remove('focused');
    const splash = document.querySelector('.lyra-clear-splash');
    if (splash) splash.remove();
    stopLyraDamagePopupLoop();
    stopLyraDroneOrbitLoop();
    // Reset the main mining laser overlay to its default state
    if (miningLaserOverlay) {
        miningLaserOverlay.classList.remove('show');
        miningLaserOverlay.style.zIndex = '';
        miningLaserOverlay.style.opacity = '';
        miningLaserOverlay.style.display = '';
        miningLaserOverlay.querySelectorAll('.mining-laser-shot, .mining-laser-shot-core').forEach(el => el.remove());
    }
    if (miningLaserShip) {
        miningLaserShip.innerHTML = '';
    }
    // Clear Lyra scene layers
    const laserLayer = document.getElementById('lyra-laser-layer');
    if (laserLayer) laserLayer.innerHTML = '';
    const droneLayer = document.getElementById('lyra-drone-layer');
    if (droneLayer) droneLayer.innerHTML = '';
    const closeChunkLayer = document.getElementById('lyra-chunk-layer');
    if (closeChunkLayer) closeChunkLayer.innerHTML = '';
}

document.addEventListener('click', (event) => {
    const wrap = document.getElementById('lyra-story-reset');
    if (!wrap || !lyraStoryResetMenuOpen) return;
    if (wrap.contains(event.target)) return;
    closeLyraStoryResetMenu();
});

function handleLyraGateBackdrop(event) {
    if (event && event.target === document.getElementById('lyra-gate-modal')) closeLyraGate();
}

function handleSectorSystemSelect(node) {
    if (!node) return;
    if (!node.isAccessible) {
        showUiMessage('Sector locked. Raise level and average WPM to unlock.', 'error', 2200, 'top-right');
        return;
    }
    if (node.id === 'lyra') {
        closeSectorMap();
        setTimeout(() => {
            openLyraGate();
        }, 60);
        return;
    }
    if (node.id === 'orion' && window.OrionMode) {
        closeSectorMap();
        setTimeout(() => OrionMode.open({
            wordPool: WORD_LIST,
            onExit: () => { openSectorMap(); },
            onRunComplete: (r) => {
                // Scaled to sit alongside challenge rewards (50-300 XP)
                const xp = Math.min(300, Math.max(5, Math.round(r.score / 10 + r.wave * 15 + r.wordsDestroyed)));
                const xpResult = addXP(xp);
                showUiMessage(`Orion Bulwark: +${xp} XP${xpResult && xpResult.levelUp ? ` \u2022 Level ${xpResult.level}!` : ''}`, 'success', 2600, 'top-right');
            },
        }), 60);
        return;
    }
    showUiMessage(`${node.name} travel missions are not online yet.`, 'warn', 2000, 'top-right');
}

function handleSectorSystemSelectById(systemId) {
    const source = Array.isArray(sectorMapResolvedSystems) && sectorMapResolvedSystems.length
        ? sectorMapResolvedSystems
        : SECTOR_MAP_SYSTEMS;
    const node = source.find((s) => String(s.id) === String(systemId));
    if (!node) return;
    handleSectorSystemSelect(node);
}

const SECTOR_MAP_SYSTEMS = [
    { id: 'lyra', name: 'Lyra Gate', x: 150, y: 480, difficulty: 'easy', avgWpm: 35, requiredLevel: 1, unlocked: true, links: ['orion'] },
    { id: 'orion', name: 'Orion Drift', x: 300, y: 390, difficulty: 'easy', avgWpm: 45, requiredLevel: 2, unlocked: true, links: ['perseus', 'vega'] },
    { id: 'perseus', name: 'Perseus Spine', x: 470, y: 450, difficulty: 'medium', avgWpm: 60, requiredLevel: 4, unlocked: false, links: ['vega', 'antares'] },
    { id: 'vega', name: 'Vega Expanse', x: 520, y: 280, difficulty: 'medium', avgWpm: 72, requiredLevel: 6, unlocked: false, links: ['antares', 'helios'] },
    { id: 'antares', name: 'Antares Rift', x: 700, y: 380, difficulty: 'medium', avgWpm: 82, requiredLevel: 8, unlocked: false, links: ['helios', 'zenith'] },
    { id: 'helios', name: 'Helios Crown', x: 810, y: 240, difficulty: 'high', avgWpm: 95, requiredLevel: 10, unlocked: false, links: ['zenith'] },
    { id: 'zenith', name: 'Zenith Core', x: 1030, y: 310, difficulty: 'high', avgWpm: 110, requiredLevel: 12, unlocked: false, links: [] },
];
let sectorMapResolvedSystems = [];

function getSectorDifficultyStyle(level) {
    if (level === 'easy') {
        return { glow: 'url(#sector-easy-glow)', r: 8, hr: 17 };
    }
    if (level === 'medium') {
        return { glow: 'url(#sector-medium-glow)', r: 9, hr: 20 };
    }
    return { glow: 'url(#sector-high-glow)', r: 10, hr: 23 };
}

const SECTOR_NODE_COLORS = {
    lyra: { core: '#4cc9f0', stroke: '#d6f8ff', halo: 'rgba(76, 201, 240, 0.64)' },
    orion: { core: '#4895ef', stroke: '#dbeafe', halo: 'rgba(72, 149, 239, 0.64)' },
    perseus: { core: '#7b6cff', stroke: '#ebe6ff', halo: 'rgba(123, 108, 255, 0.66)' },
    vega: { core: '#b5179e', stroke: '#f5d6ef', halo: 'rgba(181, 23, 158, 0.64)' },
    antares: { core: '#f72585', stroke: '#ffe1ef', halo: 'rgba(247, 37, 133, 0.66)' },
    helios: { core: '#fb8500', stroke: '#ffedd5', halo: 'rgba(251, 133, 0, 0.66)' },
    zenith: { core: '#ffd166', stroke: '#fff5cc', halo: 'rgba(255, 209, 102, 0.68)' },
};

function getSectorNodeColorStyle(nodeId) {
    return SECTOR_NODE_COLORS[String(nodeId || '').toLowerCase()]
        || { core: '#93c5fd', stroke: '#e0f2fe', halo: 'rgba(147, 197, 253, 0.62)' };
}

function updateSectorTacticalOverlay(systemId = '') {
    const body = document.getElementById('sector-tactical-body');
    if (!body) return;
    body.textContent = 'Bright stars are travel-ready sectors. Dim stars are locked until your level and average WPM are high enough. Dotted links show active routes between sectors you can currently access.';
}

function positionSectorNodeHoverBubble(event) {
    if (!event) return;
    const bubble = document.getElementById('sector-node-hover-bubble');
    const wrap = document.querySelector('#sector-map-modal .sector-map-wrap');
    if (!bubble || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const offset = 14;
    const bubbleWidth = Math.max(120, bubble.offsetWidth || 0);
    const bubbleHeight = Math.max(54, bubble.offsetHeight || 0);
    let x = event.clientX - rect.left + offset;
    let y = event.clientY - rect.top + offset;
    if (x + bubbleWidth > rect.width - 8) x = Math.max(8, rect.width - bubbleWidth - 8);
    if (y + bubbleHeight > rect.height - 8) y = Math.max(8, rect.height - bubbleHeight - 8);
    bubble.style.left = `${Math.max(8, x)}px`;
    bubble.style.top = `${Math.max(8, y)}px`;
}

function showSectorNodeHoverBubble(systemId, event) {
    const bubble = document.getElementById('sector-node-hover-bubble');
    if (!bubble || !systemId) return;
    const source = Array.isArray(sectorMapResolvedSystems) && sectorMapResolvedSystems.length ? sectorMapResolvedSystems : SECTOR_MAP_SYSTEMS;
    const node = source.find((s) => s.id === systemId);
    if (!node) return;
    const requiredLevel = Math.max(1, Number(node.requiredLevel) || 1);
    const requiredAvgWpm = Math.max(0, Number(node.avgWpm) || 0);
    const statusReasons = [];
    if (!node.pathUnlocked) statusReasons.push(`reach level ${requiredLevel}`);
    if (!node.wpmQualified) statusReasons.push(`raise account average to ${Math.round(requiredAvgWpm)} WPM`);
    const cleared = isSectorCleared(node.id);
    const accessText = cleared ? 'Cleared' : node.isAccessible ? 'Travel Ready' : `Locked: ${statusReasons.join(' and ')}`;
    bubble.classList.toggle('is-ready', !!node.isAccessible);
    bubble.innerHTML = `<strong>${escapeHtml(node.name)}</strong><br>Average WPM required to mine here: <strong>${Math.round(node.avgWpm)}</strong><br>Status: <strong style="${cleared ? 'color:#86efac' : ''}">${escapeHtml(accessText)}</strong>`;
    bubble.classList.add('show');
    bubble.setAttribute('aria-hidden', 'false');
    positionSectorNodeHoverBubble(event);
}

function hideSectorNodeHoverBubble() {
    const bubble = document.getElementById('sector-node-hover-bubble');
    if (!bubble) return;
    bubble.classList.remove('show');
    bubble.setAttribute('aria-hidden', 'true');
}

function renderSectorMap() {
    const starsLayer = document.getElementById('sector-map-stars');
    const nodesLayer = document.getElementById('sector-map-nodes');
    const linksLayer = document.getElementById('sector-map-links');
    if (!starsLayer || !nodesLayer || !linksLayer) return;
    starsLayer.innerHTML = '';
    nodesLayer.innerHTML = '';
    linksLayer.innerHTML = '';
    if (!nodesLayer.dataset.clickBound) {
        nodesLayer.dataset.clickBound = '1';
        nodesLayer.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target : null;
            const nodeEl = target ? target.closest('g.sector-node') : null;
            const nodeId = nodeEl && nodeEl.dataset ? nodeEl.dataset.nodeId : '';
            if (nodeId) handleSectorSystemSelectById(nodeId);
        });
    }
    const playerLevel = getLevel(getTotalXP());
    const history = loadHistory();
    const validWpmValues = history
        .map((entry) => Math.max(0, Number(entry && entry.wpm) || 0))
        .filter((value) => value > 0);
    const accountAvgWpm = validWpmValues.length
        ? validWpmValues.reduce((sum, value) => sum + value, 0) / validWpmValues.length
        : 0;
    const systems = SECTOR_MAP_SYSTEMS.map((node) => ({
        ...node,
        pathUnlocked: !!node.unlocked || playerLevel >= Math.max(1, Number(node.requiredLevel) || 1),
        wpmQualified: String(node.id) === 'lyra'
            ? true
            : accountAvgWpm >= Math.max(0, Number(node.avgWpm) || 0),
        isAccessible: String(node.id) === 'lyra'
            ? (!!node.unlocked || playerLevel >= Math.max(1, Number(node.requiredLevel) || 1))
            : ((!!node.unlocked || playerLevel >= Math.max(1, Number(node.requiredLevel) || 1))
                && accountAvgWpm >= Math.max(0, Number(node.avgWpm) || 0)),
    }));
    sectorMapResolvedSystems = systems;

    const starCount = 100 + Math.floor(Math.random() * 51);
    const regularStarPalette = ['#eff6ff', '#e2e8f0', '#dbeafe', '#bfdbfe'];
    const aetherStarPalette = ['#ddd6fe', '#c4b5fd', '#fde68a', '#facc15'];
    for (let i = 0; i < starCount; i++) {
        const star = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const isAetherTint = Math.random() < 0.1;
        const palette = isAetherTint ? aetherStarPalette : regularStarPalette;
        const color = palette[Math.floor(Math.random() * palette.length)];
        const cx = Math.random() * 1200;
        const cy = Math.random() * 720;
        const r = 0.5 + Math.random() * 1.5;
        const duration = 1.6 + Math.random() * 3.6;
        const delay = Math.random() * 6.5;
        const minOpacity = 0.06 + Math.random() * 0.18;
        const maxOpacity = 0.72 + Math.random() * 0.28;

        star.setAttribute('class', 'sector-star');
        star.setAttribute('cx', cx.toFixed(2));
        star.setAttribute('cy', cy.toFixed(2));
        star.setAttribute('r', r.toFixed(2));
        star.setAttribute('fill', color);
        star.style.animationDuration = `${duration.toFixed(2)}s`;
        star.style.animationDelay = `${delay.toFixed(2)}s`;
        star.style.setProperty('--min-o', minOpacity.toFixed(2));
        star.style.setProperty('--max-o', maxOpacity.toFixed(2));
        starsLayer.appendChild(star);
    }

    const byId = new Map(systems.map((node) => [node.id, node]));
    const drawn = new Set();
    for (const a of systems) {
        if (!a.isAccessible) continue;
        for (const bId of a.links || []) {
            const b = byId.get(bId);
            if (!b || !b.isAccessible) continue;
            const key = [a.id, b.id].sort().join(':');
            if (drawn.has(key)) continue;
            drawn.add(key);
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', String(a.x));
            line.setAttribute('y1', String(a.y));
            line.setAttribute('x2', String(b.x));
            line.setAttribute('y2', String(b.y));
            line.setAttribute('class', 'sector-link');
            linksLayer.appendChild(line);
        }
    }

    for (const node of systems) {
        const style = getSectorDifficultyStyle(node.difficulty);
        const colorStyle = getSectorNodeColorStyle(node.id);
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const importanceClass = node.difficulty === 'high' ? 'sector-importance-high' : 'sector-importance-standard';
        g.setAttribute('class', `sector-node ${node.isAccessible ? 'is-unlocked' : 'is-locked'} ${importanceClass}`);
        g.setAttribute('tabindex', node.isAccessible ? '0' : '-1');
        g.setAttribute('role', 'button');
        g.setAttribute('aria-label', `${node.name}, average WPM ${Math.round(node.avgWpm)}, ${node.isAccessible ? 'accessible' : 'locked'}`);
        g.dataset.nodeId = node.id;
        g.addEventListener('focus', () => updateSectorTacticalOverlay(node.id));
        g.addEventListener('blur', hideSectorNodeHoverBubble);
        g.addEventListener('mouseover', (event) => {
            updateSectorTacticalOverlay(node.id);
            showSectorNodeHoverBubble(node.id, event);
        });
        g.addEventListener('mousemove', positionSectorNodeHoverBubble);
        g.addEventListener('mouseleave', hideSectorNodeHoverBubble);
        g.addEventListener('click', () => handleSectorSystemSelect(node));
        g.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleSectorSystemSelect(node);
            }
        });

        const halo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        hit.setAttribute('cx', String(node.x));
        hit.setAttribute('cy', String(node.y));
        hit.setAttribute('r', String(style.hr + 12));
        hit.setAttribute('fill', 'rgba(255,255,255,0.001)');
        hit.setAttribute('class', 'node-hit-target');
        hit.setAttribute('pointer-events', 'all');

        halo.setAttribute('cx', String(node.x));
        halo.setAttribute('cy', String(node.y));
        halo.setAttribute('r', String(style.hr));
        halo.setAttribute('class', 'node-halo');
        halo.setAttribute('fill', colorStyle.halo);
        halo.setAttribute('filter', style.glow);

        const core = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        core.setAttribute('cx', String(node.x));
        core.setAttribute('cy', String(node.y));
        core.setAttribute('r', String(style.r));
        core.setAttribute('class', 'node-core');
        core.setAttribute('fill', colorStyle.core);
        core.setAttribute('stroke', colorStyle.stroke);
        core.setAttribute('filter', style.glow);

        g.appendChild(hit);
        g.appendChild(halo);
        g.appendChild(core);

        // Cleared badge
        if (isSectorCleared(node.id)) {
            const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            badge.setAttribute('x', String(node.x));
            badge.setAttribute('y', String(node.y + style.hr + 16));
            badge.setAttribute('text-anchor', 'middle');
            badge.setAttribute('font-size', '9');
            badge.setAttribute('font-weight', '800');
            badge.setAttribute('letter-spacing', '0.12em');
            badge.setAttribute('fill', '#86efac');
            badge.setAttribute('class', 'sector-cleared-label');
            badge.textContent = 'CLEARED';
            g.appendChild(badge);

            const check = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            check.setAttribute('d', `M${node.x - 4},${node.y + 0.5} l3,3 l5,-6`);
            check.setAttribute('stroke', '#86efac');
            check.setAttribute('stroke-width', '2');
            check.setAttribute('fill', 'none');
            check.setAttribute('stroke-linecap', 'round');
            check.setAttribute('stroke-linejoin', 'round');
            g.appendChild(check);
        }

        nodesLayer.appendChild(g);
    }
    updateSectorTacticalOverlay('');
}

function updateSectorStarsParallaxFromMouse(event) {
    const wrap = document.querySelector('#sector-map-modal .sector-map-wrap');
    const starsLayer = document.getElementById('sector-map-stars');
    if (!wrap || !starsLayer || !event) return;
    const rect = wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const relX = ((event.clientX - rect.left) / rect.width) - 0.5;
    const relY = ((event.clientY - rect.top) / rect.height) - 0.5;
    const tx = (-relX * 16).toFixed(2);
    const ty = (-relY * 10).toFixed(2);
    starsLayer.setAttribute('transform', `translate(${tx} ${ty})`);
}

function resetSectorStarsParallax() {
    const starsLayer = document.getElementById('sector-map-stars');
    if (!starsLayer) return;
    starsLayer.setAttribute('transform', 'translate(0 0)');
}

function bindSectorMapParallax() {
    const wrap = document.querySelector('#sector-map-modal .sector-map-wrap');
    if (!wrap || wrap.dataset.parallaxBound === '1') return;
    wrap.dataset.parallaxBound = '1';
    wrap.addEventListener('mousemove', updateSectorStarsParallaxFromMouse);
    wrap.addEventListener('mouseleave', resetSectorStarsParallax);
}

function openSectorMap() {
    const modal = document.getElementById('sector-map-modal');
    if (!modal) return;
    renderSectorMap();
    bindSectorMapParallax();
    openModal(modal);
    if (modal._sectorMapIntroTimer) {
        clearTimeout(modal._sectorMapIntroTimer);
        modal._sectorMapIntroTimer = null;
    }
    modal.classList.remove('sector-map-opening');
    // Re-trigger a sector-map-specific entrance sequence without affecting other modals.
    void modal.offsetWidth;
    modal.classList.add('sector-map-opening');
    modal._sectorMapIntroTimer = setTimeout(() => {
        modal.classList.remove('sector-map-opening');
        modal._sectorMapIntroTimer = null;
    }, 1200);
}

function closeSectorMap() {
    const modal = document.getElementById('sector-map-modal');
    if (!modal) return;
    if (modal._sectorMapIntroTimer) {
        clearTimeout(modal._sectorMapIntroTimer);
        modal._sectorMapIntroTimer = null;
    }
    modal.classList.remove('sector-map-opening');
    resetSectorStarsParallax();
    hideSectorNodeHoverBubble();
    closeModal(modal);
}

function handleSectorMapBackdrop(event) {
    if (event && event.target === document.getElementById('sector-map-modal')) closeSectorMap();
}

function updateSectorMapButtonVisibility() {
    // Sector Map button is now always visible in the top bar
}
