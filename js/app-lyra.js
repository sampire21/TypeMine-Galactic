// Lyra Gate (Story mode), the mining economy UI and the Story map.
// Shared Lyra state variables are declared in js/app-leaderboard.js; the ones below are new here.
let lyraVisibleWordWindow = LYRA_VISIBLE_WORD_WINDOW;
let lyraStreamRenderKey = '';
let lyraChapterStartsCache = new Map();
let lyraParallaxFrame = 0;
let lyraParallaxEvent = null;
let lyraLastKeyAt = 0;
let lyraMilestoneTimer = null;
let lyraStatsChipEls = null;
let lyraNextCrystalEstimate = { perWord: 0, wpm: -1, layer: -1 };
let sectorParallaxFrame = 0;
let sectorParallaxEvent = null;
let sectorWrapRectCache = null;
const LYRA_CHAPTERS_TO_CLEAR = 3;
const LYRA_CHECKPOINT_BONUS_BASE = 100;
const LYRA_CHECKPOINT_BONUS_STEP = 25;
const LYRA_SECTOR_CLEAR_BONUS = 500;
const lyraReducedMotionQuery = (typeof window.matchMedia === 'function') ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

function isLyraGateOpen() {
    return !!document.getElementById('lyra-gate-modal')?.classList.contains('show');
}

// Plays a named sound from the shared SFX bank if it exists; never throws.
function lyraPlaySound(name) {
    try {
        const bank = typeof SFX !== 'undefined' ? SFX : null;
        const audio = bank && bank[name];
        if (!audio || typeof playSound !== 'function') return;
        playSound(audio);
    } catch (e) { /* audio not ready yet */ }
}

// True when the player asked for less motion (system setting) or turned effects off.
function isLyraMotionReduced() {
    if (lyraReducedMotionQuery && lyraReducedMotionQuery.matches) return true;
    return typeof miningVisualsEnabled !== 'undefined' && !miningVisualsEnabled;
}

function applyLyraMotionClass(el) {
    if (!el) return;
    el.classList.toggle('lyra-reduced-motion', isLyraMotionReduced());
}

// Words shown in the stream: fewer on narrow screens so the DOM stays small.
function computeLyraVisibleWordWindow() {
    const width = Math.max(240, Number(window.innerWidth) || 1280);
    return Math.max(6, Math.min(LYRA_VISIBLE_WORD_WINDOW, Math.floor(width / 44)));
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
    label.textContent = lyraStoryLoadingState.label || 'Loading book...';
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
            label: 'Loading book...',
            meta: totalBytes ? `${formatMiningNumber(totalBytes)} bytes` : 'Reading file',
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
            label: 'Loading book...',
            meta: totalBytes > 0
                ? `${Math.round((received / totalBytes) * 100)}% downloaded`
                : `${formatMiningNumber(received)} bytes downloaded`,
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
        label: 'Loading book...',
        meta: `Opening ${book.name}`,
    });
    try {
        const rawText = await fetchLyraStoryPayload(book, options);
        setLyraStoryLoadingState({
            active: true,
            progress: 62,
            label: 'Preparing words...',
            meta: 'Splitting into words',
        });
        const payload = JSON.parse(rawText);
        let words = [];
        if (Array.isArray(payload)) {
            words = payload.filter((word) => typeof word === 'string' && word.length > 0);
            setLyraStoryLoadingState({
                active: true,
                progress: 100,
                label: 'Loading book...',
                meta: `${formatMiningNumber(words.length)} words ready`,
            });
        } else if (payload && typeof payload.text === 'string') {
            words = await tokenizeLyraStoryTextInChunks(payload.text, 5000, (processed) => {
                const progress = Math.min(100, 62 + (Math.min(processed, 50000) / 50000) * 38);
                setLyraStoryLoadingState({
                    active: true,
                    progress,
                    label: 'Preparing words...',
                    meta: `${formatMiningNumber(processed)} words processed`,
                });
            });
        } else if (typeof payload === 'string') {
            words = await tokenizeLyraStoryTextInChunks(payload, 5000, (processed) => {
                const progress = Math.min(100, 62 + (Math.min(processed, 50000) / 50000) * 38);
                setLyraStoryLoadingState({
                    active: true,
                    progress,
                    label: 'Preparing words...',
                    meta: `${formatMiningNumber(processed)} words processed`,
                });
            });
        }
        if (words.length > 0) {
            lyraStoryLibraryCache.set(book.id, words);
            lyraChapterStartsCache.set(book.id, computeLyraChapterStarts(words));
        }
        setLyraStoryLoadingState({
            active: true,
            progress: 100,
            label: 'Loading book...',
            meta: `${formatMiningNumber(words.length)} words ready`,
        });
        setTimeout(() => {
            if (lyraStoryLoadingState.progress >= 100) {
                setLyraStoryLoadingState({ active: false, progress: 0, meta: '0%', label: 'Loading book...' });
            }
        }, 180);
        return words;
    } catch (error) {
        setLyraStoryLoadingState({ active: false, progress: 0, meta: '0%', label: 'Loading book...' });
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
    const chapterOption = document.getElementById('lyra-story-reset-chapter');
    if (chapterOption) chapterOption.hidden = !lyraBookHasChapters();
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

// Chapter starts are word indexes where a heading word (CHAPTER, ADVENTURE, PART, BOOK) is
// followed by a roman or arabic numeral. Index 0 always counts as the first chapter.
// Computed once per book when it loads; the story files are data and are never executed.
const LYRA_HEADING_WORDS = new Set(['CHAPTER', 'ADVENTURE', 'PART', 'BOOK']);
const LYRA_ROMAN_NUMERAL = /^(?=[IVXLC])M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})[.:]?$/;
const LYRA_ARABIC_NUMERAL = /^\d{1,3}[.:]?$/;

function computeLyraChapterStarts(words) {
    const starts = [0];
    if (!Array.isArray(words)) return starts;
    for (let i = 1; i < words.length - 1; i++) {
        const word = String(words[i] || '');
        const bare = word.replace(/[^A-Za-z]/g, '');
        if (!LYRA_HEADING_WORDS.has(bare) || word !== word.toUpperCase()) continue;
        const next = String(words[i + 1] || '');
        if (LYRA_ROMAN_NUMERAL.test(next) || LYRA_ARABIC_NUMERAL.test(next)) starts.push(i);
    }
    return starts;
}

function getLyraChapterStarts(bookId = getLyraCurrentStoryBookId()) {
    const cached = lyraChapterStartsCache.get(bookId);
    if (cached) return cached;
    const words = lyraStoryLibraryCache.get(bookId);
    if (!words || !words.length) return [0];
    const starts = computeLyraChapterStarts(words);
    lyraChapterStartsCache.set(bookId, starts);
    return starts;
}

function lyraBookHasChapters(bookId = getLyraCurrentStoryBookId()) {
    return getLyraChapterStarts(bookId).length > 1;
}

function getLyraCurrentChapterStartIndex() {
    const storyWords = getLyraCurrentStoryWords();
    const currentIndex = Math.max(0, Math.floor(Number(lyraMiningState && lyraMiningState.currentStoryProgress) || 0));
    if (!storyWords.length || currentIndex <= 0) return 0;
    const starts = getLyraChapterStarts();
    let result = 0;
    for (const start of starts) {
        // A player sitting exactly on a chapter heading restarts the chapter before it.
        if (start < currentIndex) result = start;
        else break;
    }
    return result;
}

// Chapter number (1-based) that ends at this word index, or 0 if none does.
function getLyraChapterEndingAt(progressIndex, bookId = getLyraCurrentStoryBookId()) {
    const starts = getLyraChapterStarts(bookId);
    if (starts.length <= 1) return 0;
    const words = lyraStoryLibraryCache.get(bookId) || [];
    const idx = starts.indexOf(progressIndex);
    if (idx > 0) return idx;
    if (words.length && progressIndex === words.length) return starts.length;
    return 0;
}

function restartLyraStoryProgress(scope) {
    const api = getMiningApi();
    if (!api || !lyraMiningState || typeof api.setCurrentStoryProgress !== 'function') return;
    const targetIndex = scope === 'book' ? 0 : getLyraCurrentChapterStartIndex();
    const updated = api.setCurrentStoryProgress(lyraMiningState, targetIndex);
    removeLyraMilestoneSplash();
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
    renderLyraWordStream(true);
    renderLyraMiningHud();
    renderLyraMiningSidebar();
    updateLyraStats();
    if (isLyraGateOpen()) startLyraStatsInterval();
    focusLyraInput();
    showUiMessage(
        scope === 'book' ? 'Back to the first word of the book.' : 'Back to the start of this chapter.',
        'info',
        1800,
        'top-right',
    );
}
window.restartLyraStoryProgress = restartLyraStoryProgress;

function ensureLyraWordsBuffer(minWordCount = 120) {
    const storyWords = getLyraCurrentStoryWords();
    if (storyWords.length) {
        const desiredCount = Math.max(1, Math.min(lyraVisibleWordWindow, minWordCount));
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
    lyraVisibleWordWindow = computeLyraVisibleWordWindow();
    lyraStreamRenderKey = '';
    lyraLastKeyAt = 0;
    const storyBaseIndex = Math.max(0, Math.floor(Number(lyraMiningState && lyraMiningState.currentStoryProgress) || 0));
    lyraGateState = {
        words: getLyraStoryWindow(storyBaseIndex, lyraVisibleWordWindow),
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

// Hot path (called per animation frame): reads the already-sanitized state directly.
function isLyraOverloadActive() {
    return !!(lyraMiningState && Number(lyraMiningState.overloadEndsAt) > Date.now());
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
    const api = getMiningApi();
    const value = api && typeof api.getComboMultiplier === 'function'
        ? api.getComboMultiplier(lyraGateState.comboStreak)
        : Math.min(1.45, 1 + (Math.max(0, lyraGateState.comboStreak) * 0.03));
    return value.toFixed(2);
}

// One wallet. The mining state owns the crystal count; the top-bar badge ("skill points")
// is a mirror of it. Anything that changed the mirror while Lyra was closed (a level-up
// bonus, a shop purchase) is applied as a difference, never by overwriting the wallet.
function reconcileLyraWallet(state) {
    const api = getMiningApi();
    if (!api) return null;
    const normalized = api.recalculateDerivedState(state || api.loadMiningState());
    const mirror = Math.max(0, Math.floor(Number(typeof getSkillPoints === 'function' ? getSkillPoints() : 0) || 0));
    const lastMirror = normalized.walletMirror;
    if (lastMirror == null) {
        // First run with the shared wallet: keep whichever count is larger so nobody loses crystals.
        normalized.totalAetherCrystals = Math.max(normalized.totalAetherCrystals, mirror);
    } else if (mirror !== lastMirror) {
        normalized.totalAetherCrystals = Math.max(0, normalized.totalAetherCrystals + (mirror - lastMirror));
    }
    normalized.walletMirror = normalized.totalAetherCrystals;
    lyraMiningState = api.saveMiningState(normalized);
    pushLyraWalletMirror();
    return lyraMiningState;
}

// Copies the wallet to the badge (mirror) and records what was copied.
function pushLyraWalletMirror() {
    if (!lyraMiningState) return;
    const crystals = Math.max(0, Math.floor(Number(lyraMiningState.totalAetherCrystals) || 0));
    if (lyraMiningState.walletMirror !== crystals) {
        lyraMiningState.walletMirror = crystals;
        const api = getMiningApi();
        if (api) lyraMiningState = api.saveMiningState(lyraMiningState);
    }
    if (typeof setSkillPoints === 'function' && getSkillPoints() !== crystals) setSkillPoints(crystals);
    if (typeof updateSkillDisplay === 'function') updateSkillDisplay();
    if (typeof scheduleProgressSync === 'function') scheduleProgressSync();
}

function syncLyraWalletFromMiningState(prevCrystalCount = null) {
    if (!lyraMiningState) return;
    const nextCrystals = Math.max(0, Math.floor(Number(lyraMiningState.totalAetherCrystals) || 0));
    if (prevCrystalCount == null || nextCrystals !== Math.floor(Number(prevCrystalCount) || 0)) {
        pushLyraWalletMirror();
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
    const scene = document.getElementById('lyra-scene');
    if (scene) scene.style.setProperty('--lyra-asteroid-size', `${displaySize}px`);
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

// Drones sit at left/top 0 and move with a transform only (no layout work per frame).
// The orbit radius is scaled down on small scenes so drones stay inside the picture.
function positionLyraDroneElement(drone, orbit, anchors, ts = performance.now()) {
    if (!drone || !orbit || !anchors) return;
    const radiusScale = Math.max(0.45, Math.min(1, (anchors.sceneWidth || 600) / 520));
    const wobble = Math.sin((ts / 1000) * orbit.wobbleSpeed + orbit.phase) * orbit.wobbleAmp;
    const radius = (orbit.radius + wobble) * radiusScale;
    const x = anchors.asteroidCenterX + Math.cos(orbit.angle) * radius;
    const bob = Math.sin((ts / 1000) * orbit.bobSpeed + orbit.phase * 1.7) * orbit.bobAmp;
    const y = anchors.asteroidCenterY + Math.sin(orbit.angle) * (radius * orbit.verticalScale) + bob;
    const facing = (Math.atan2(anchors.asteroidCenterY - y, anchors.asteroidCenterX - x) * 180 / Math.PI) + 90;
    drone.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) rotate(${facing.toFixed(2)}deg)`;
    orbit.x = x;
    orbit.y = y;
}

function updateLyraDroneOrbitFrame(ts) {
    const layer = document.getElementById('lyra-drone-layer');
    const anchors = getLyraSceneAnchors();
    const drones = layer ? layer.children : [];
    if (!layer || !anchors || drones.length === 0 || isLyraMotionReduced()) {
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
    if (isLyraMotionReduced()) {
        // Reduced motion: park each drone on its orbit once, no animation loop.
        const anchors = getLyraSceneAnchors();
        const drones = document.querySelectorAll('#lyra-drone-layer .lyra-drone');
        drones.forEach((drone, i) => positionLyraDroneElement(drone, lyraDroneOrbitState[i], anchors, 0));
        return;
    }
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
    const anchors = getLyraSceneAnchors();
    const drones = [...document.querySelectorAll('#lyra-drone-layer .lyra-drone')];
    if (!laserLayer || !anchors || drones.length === 0) return;
    const popupValues = Array.isArray(options.popupValues) ? options.popupValues : [];
    const isCritical = !!options.isCritical;
    const isOverloadActive = !!options.isOverloadActive;

    for (const [index, drone] of drones.entries()) {
        // Drone positions come from the orbit state written by the last animation frame.
        const orbit = lyraDroneOrbitState[index];
        const x = orbit ? Number(orbit.x) : NaN;
        const y = orbit ? Number(orbit.y) : NaN;
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
    if (!scene || isLyraMotionReduced()) return;
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
        // Two strokes instead of a shadow blur: a dark outline for contrast and a thin
        // coloured halo. Blurred shadows are the most expensive thing a 2D canvas can draw.
        ctx.lineJoin = 'round';
        ctx.lineWidth = popup.isCritical ? 8 : 6;
        ctx.strokeStyle = popup.isCritical ? 'rgba(255, 77, 90, 0.28)' : 'rgba(125, 211, 252, 0.22)';
        ctx.strokeText(popup.text, 0, 0);
        ctx.lineWidth = popup.isCritical ? 4 : 3;
        ctx.strokeStyle = 'rgba(8, 15, 40, 0.8)';
        ctx.strokeText(popup.text, 0, 0);
        ctx.fillStyle = popup.color;
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
    if (isLyraMotionReduced()) return;
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
    const next = ['systems', 'library', 'firmware', 'statistics'].includes(tabId) ? tabId : 'systems';
    const changed = next !== lyraSidebarTab;
    lyraSidebarTab = next;
    document.querySelectorAll('#lyra-upgrades-sidebar .lyra-sidebar-tab').forEach((button) => {
        const isActive = button.dataset.lyraTab === lyraSidebarTab;
        if (button.classList.contains('active') !== isActive) button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    document.querySelectorAll('#lyra-upgrades-sidebar .lyra-sidebar-panel').forEach((panel) => {
        const isActive = panel.id === `lyra-panel-${lyraSidebarTab}`;
        if (panel.classList.contains('active') !== isActive) panel.classList.toggle('active', isActive);
    });
    // Only the visible tab is rendered; the others are built when the player opens them.
    if (changed || !document.getElementById(`lyra-panel-${lyraSidebarTab}`)?.childElementCount) {
        renderLyraSidebarPanel(lyraSidebarTab);
    }
}
window.setLyraSidebarTab = setLyraSidebarTab;

function renderLyraSidebarPanel(tabId) {
    if (tabId === 'library') renderLyraLibraryPanel();
    else if (tabId === 'firmware') renderLyraDroneSpecializationPanel();
    else if (tabId === 'statistics') renderLyraStatisticsPanel();
    else renderLyraSystemsPanel();
}

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
        removeLyraMilestoneSplash();
        resetLyraGateState();
        resetLyraSceneForNextAsteroid();
        renderLyraWordStream(true);
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
                    <div class="lyra-library-title">Books</div>
                    <div class="lyra-specialization-status">Story mode</div>
                </div>
                <div class="lyra-library-copy">Type your way through a public-domain book. Your place is saved after every word, so you always pick up where you left off.</div>
                <div class="lyra-library-books">
                    ${books.map((book) => {
        if (book.locked) {
            return `
                            <button type="button" class="lyra-library-book" disabled>
                                <strong>More books later</strong>
                                <span>Not available yet</span>
                                <small>More public-domain books will appear here.</small>
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
                            <small>${savedProgress > 0 ? `Continue at word ${formatMiningNumber(savedProgress + 1)}` : 'Start from the beginning'}</small>
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
    const unlockLevel = Math.max(1, Number(api.DRONE_TYPE_UNLOCK_LEVEL) || 10);
    const unlocked = dronesLevel >= unlockLevel;
    const currentSpec = lyraMiningState.droneSpecialization || '';
    if (!unlocked) {
        const lockedHtml = `
            <div class="lyra-specialization-card locked">
                <div class="lyra-specialization-head">
                    <div class="lyra-specialization-label">Drone types</div>
                    <div class="lyra-specialization-status">Locked</div>
                </div>
                <div class="lyra-specialization-desc">Get Helper drones to level ${unlockLevel} (now ${dronesLevel}) to choose a drone type: Swarm, Precision or Salvage.</div>
            </div>
        `;
        setLyraPanelHtml(panel, lockedHtml);
        return;
    }
    const html = `
        <div class="lyra-specialization-panel">
        <div class="lyra-specialization-card">
            <div class="lyra-specialization-head">
                <div class="lyra-specialization-label">Drone types</div>
                <div class="lyra-specialization-status">${currentSpec ? 'Chosen' : 'Pick one'}</div>
            </div>
            <div class="lyra-specialization-desc">Each type changes how your helper drones hit. You can switch any time.</div>
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
                        <span>${specLocked ? `Needs Helper drones level ${needLevel}` : escapeHtml(spec.description)}</span>
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
    if (!panel.childElementCount || !lyraStatsChipEls) {
        // Build the panel once; after that only the numbers change (setLyraText).
        panel.innerHTML = `
        <div class="lyra-statistics-panel">
            <div class="lyra-stat-card">
                <div class="lyra-stat-card-title">Stats</div>
                <div class="lyra-stat-grid">
                    <div class="lyra-stat-chip"><span>Hits per second</span><strong data-lyra-stat="dps">0</strong></div>
                    <div class="lyra-stat-chip"><span>Bonus hit chance</span><strong data-lyra-stat="crit">0%</strong></div>
                    <div class="lyra-stat-chip"><span>Bonus hit damage</span><strong data-lyra-stat="critx">2.0x</strong></div>
                    <div class="lyra-stat-chip"><span>Accuracy</span><strong data-lyra-stat="acc">100%</strong></div>
                </div>
            </div>
            <div class="lyra-stat-card">
                <div class="lyra-stat-card-title">Power boost</div>
                <div class="lyra-stat-grid">
                    <div class="lyra-stat-chip"><span>Status</span><strong data-lyra-stat="boost">Charging</strong></div>
                    <div class="lyra-stat-chip"><span>Charge</span><strong data-lyra-stat="charge">0%</strong></div>
                    <div class="lyra-stat-chip"><span>Letters in a row</span><strong data-lyra-stat="streak">0</strong></div>
                    <div class="lyra-stat-chip"><span>Total hits</span><strong data-lyra-stat="total">0</strong></div>
                </div>
            </div>
        </div>`;
        lyraStatsChipEls = {};
        panel.querySelectorAll('[data-lyra-stat]').forEach((el) => { lyraStatsChipEls[el.dataset.lyraStat] = el; });
    }
    const effectiveStats = getLyraEffectiveMiningStats();
    const displayDps = getLyraDisplayedDps(effectiveStats);
    const overloadMeter = effectiveStats ? Math.round(effectiveStats.overloadMeter) : 0;
    const overloadState = effectiveStats && effectiveStats.overloadActive ? 'On' : overloadMeter >= 100 ? 'Ready' : 'Charging';
    const c = lyraStatsChipEls;
    setLyraText(c.dps, formatMiningNumber(displayDps));
    setLyraText(c.crit, `${Math.round((lyraMiningState.critChance || 0) * 100)}%`);
    setLyraText(c.critx, `${Number(lyraMiningState.critMultiplier || 0).toFixed(1)}x`);
    setLyraText(c.acc, `${Math.round(getLyraAccuracyRatio() * 100)}%`);
    setLyraText(c.boost, overloadState);
    setLyraText(c.charge, `${overloadMeter}%`);
    setLyraText(c.streak, String(lyraGateState.comboStreak));
    setLyraText(c.total, formatMiningNumber(lyraMiningState.totalDamageDealt || 0));
}

function renderLyraMiningSidebar() {
    const crystalsEl = document.getElementById('lyra-sidebar-crystals');
    const layerEl = document.getElementById('lyra-sidebar-layer');
    const dpsEl = document.getElementById('lyra-sidebar-dps');
    if (!lyraMiningState) return;
    const api = getMiningApi();
    if (!api) return;
    const wallet = Math.max(0, Math.floor(Number(lyraMiningState.totalAetherCrystals) || 0));
    const displayDps = getLyraDisplayedDps(getLyraEffectiveMiningStats());
    setLyraText(crystalsEl, formatMiningNumber(wallet));
    setLyraText(layerEl, formatMiningNumber((Number(lyraMiningState.currentLayer) || 0) + 1));
    setLyraText(dpsEl, formatMiningNumber(displayDps));
    renderLyraSidebarPanel(lyraSidebarTab);
}

function renderLyraSystemsPanel() {
    const systemsPanel = document.getElementById('lyra-panel-systems');
    if (!systemsPanel || !lyraMiningState) return;
    const api = getMiningApi();
    if (!api) return;
    const wallet = Math.max(0, Math.floor(Number(lyraMiningState.totalAetherCrystals) || 0));
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
            ? `${Number(selectedEffect.dps || 0).toFixed(1)} drone hits per second`
            : selectedUpgrade.id === 'laser_drills'
                ? `+${formatMiningNumber(selectedEffect.baseDamageBonus || 0)} damage per letter`
                : selectedUpgrade.id === 'buffer_optimizations'
                    ? `+${Math.round((selectedEffect.wpmMultiplierBonus || 0) * 100)}% speed damage, +${Math.round((selectedEffect.crystalYieldBonus || 0) * 100)}% crystals`
                    : selectedUpgrade.id === 'neural_focus'
                        ? `${Math.round((0.05 + (selectedEffect.critChanceBonus || 0)) * 100)}% bonus-hit chance`
                        : `+${Math.round((selectedEffect.droneDamageBonus || 0) * 100)}% drone damage`;
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
                        <span>Next level</span>
                        <strong>${escapeHtml(selectedEffectText)}</strong>
                    </div>
                    <div class="lyra-upgrade-detail-chip">
                        <span>Cost</span>
                        <strong>${formatMiningNumber(selectedCost)} crystals</strong>
                    </div>
                </div>
                <button type="button" class="lyra-upgrade-buy${selectedAffordable ? ' can-afford' : ''}" onclick="purchaseLyraMiningUpgrade('${selectedUpgrade.id}', this)" ${selectedAffordable ? '' : 'disabled'}>
                    ${selectedLevel >= selectedUpgrade.maxLevel ? 'Top level reached' : selectedAffordable ? `Buy for ${formatMiningNumber(selectedCost)}` : `Need ${formatMiningNumber(Math.max(0, selectedCost - wallet))} more`}
                </button>
            </div>
        ` : ''}
        </div>
    `;
    setLyraPanelHtml(systemsPanel, systemsHtml);
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
    if (statusEl) setLyraText(statusEl, active ? `${(remainingMs / 1000).toFixed(1)}s` : `${Math.round(meter)}%`);
    if (hintEl) {
        hintEl.classList.toggle('lyra-overload-charging', hintState === 'charging');
        setLyraText(hintEl, hintState === 'charging' ? 'Charging' : hintState === 'ready' ? 'Ready (press Tab)' : 'On');
    }
    if (triggerEl) {
        triggerEl.disabled = !ready;
        triggerEl.classList.toggle('ready', ready);
        setLyraText(triggerEl, active ? 'On' : 'Turn on');
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
    const progressText = `Layer ${formatMiningNumber((Number(lyraMiningState.currentLayer) || 0) + 1)} · ${formatMiningNumber(hp)} of ${formatMiningNumber(maxHp)} hits left · Combo ${comboText}`;
    setLyraText(progressEl, progressText);
    setLyraText(hpEl, `${formatMiningNumber(hp)} / ${formatMiningNumber(maxHp)}`);
    setLyraText(dpsEl, formatMiningNumber(displayDps));
    setLyraText(comboEl, comboText);
    renderLyraNextCrystalBar(hp, maxHp);
    updateLyraAsteroidVisualState();
    updateLyraOverloadVisualState(effectiveStats);
    renderLyraMiningDrones();
    renderLyraMiningSidebar();
}

// Expected damage from one typed word at the player's current speed (cached per WPM/layer).
function getLyraExpectedDamagePerWord() {
    const api = getMiningApi();
    if (!api || !lyraMiningState) return 0;
    const wpm = Math.max(25, getLyraCurrentWpm() || 40);
    const layer = Number(lyraMiningState.currentLayer) || 0;
    const key = `${wpm}:${layer}:${lyraMiningState.upgrades && lyraMiningState.upgrades.laser_drills}:${lyraMiningState.upgrades && lyraMiningState.upgrades.buffer_optimizations}`;
    if (lyraNextCrystalEstimate.key === key) return lyraNextCrystalEstimate.perWord;
    const effects = api.getUpgradeEffects(lyraMiningState.upgrades);
    const accuracy = getLyraAccuracyRatio();
    const common = {
        wpm,
        accuracy,
        sessionAccuracy: accuracy,
        combo: 12,
        bufferBonus: effects.wpmMultiplierBonus,
        activeUpgradeBonus: effects.baseDamageBonus,
        critChance: 0,
        critMultiplier: 1,
        isOverloadActive: false,
        rollForCrit: false,
    };
    const perChar = api.calculateDamage({ ...common, charactersTyped: 1 }).activeDamage;
    const completion = api.calculateDamage({ ...common, charactersTyped: 5 }).activeDamage;
    const perWord = Math.max(1, perChar * 5 + completion);
    lyraNextCrystalEstimate = { key, perWord };
    return perWord;
}

function renderLyraNextCrystalBar(hp, maxHp) {
    const fill = document.getElementById('lyra-next-crystal-fill');
    const label = document.getElementById('lyra-next-crystal-label');
    if (!fill || !label || !lyraMiningState) return;
    const api = getMiningApi();
    const ratio = Math.max(0, Math.min(1, 1 - (hp / Math.max(1, maxHp))));
    const width = `${(ratio * 100).toFixed(1)}%`;
    if (fill.style.width !== width) fill.style.width = width;
    const perWord = getLyraExpectedDamagePerWord();
    const words = perWord > 0 ? Math.max(1, Math.ceil(hp / perWord)) : 0;
    const reward = api && typeof api.getLayerCrystalReward === 'function'
        ? api.getLayerCrystalReward(lyraMiningState.currentLayer, lyraMiningState.upgrades)
        : 1;
    setLyraText(label, words > 0
        ? `About ${words} ${words === 1 ? 'word' : 'words'} to the next ${reward} ${reward === 1 ? 'crystal' : 'crystals'}`
        : `Next layer pays ${reward} crystals`);
}

// persist=false skips the localStorage write (the word handler saves once per word instead);
// a shattered layer always saves because it changes the wallet.
function applyLyraMiningDamage(damageAmount, source = 'typing', persist = true) {
    const api = getMiningApi();
    if (!api || !lyraMiningState) return null;
    const prevCrystals = lyraMiningState.totalAetherCrystals;
    const applied = api.applyDamageToState(lyraMiningState, damageAmount, { source, skipSave: !persist });
    lyraMiningState = applied.state;
    recordLyraDamageBurst(damageAmount, source);
    if (applied.result && applied.result.shatteredLayers > 0) {
        if (!persist) lyraMiningState = api.saveMiningState(lyraMiningState);
        syncLyraWalletFromMiningState(prevCrystals);
        recordLyraLayerMilestone(applied.result.shatteredLayers);
        triggerLyraAsteroidCycle();
    }
    renderLyraMiningHud();
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
        if (ticked.passiveCritApplied && !ticked.overloadActive) triggerLyraCriticalShake();
    }
    if (ticked.result && ticked.result.shatteredLayers > 0) {
        recordLyraLayerMilestone(ticked.result.shatteredLayers);
        if (!lyraGateState.cycleBusy) triggerLyraAsteroidCycle();
    }
}

function purchaseLyraMiningUpgrade(upgradeId, buttonEl = null) {
    const api = getMiningApi();
    if (!api) return;
    reconcileLyraWallet(lyraMiningState);
    const purchased = api.purchaseMiningUpgrade(lyraMiningState, upgradeId);
    lyraMiningState = purchased.state;
    if (!purchased.ok) {
        lyraPlaySound('below50');
        showUiMessage(purchased.error || 'Could not buy that.', 'error', 1600, 'top-left');
        renderLyraMiningHud();
        return;
    }
    pushLyraWalletMirror();
    lyraPlaySound('purchase1');
    lyraPanelHtmlCache['lyra-panel-systems'] = '';
    renderLyraMiningHud();
    triggerLyraPurchaseFeedback(buttonEl);
    const def = api.getUpgradeDefinition(upgradeId);
    showUiMessage(`${def ? def.name : 'Upgrade'} is now level ${purchased.level}.`, 'success', 1500, 'top-left');
}
window.purchaseLyraMiningUpgrade = purchaseLyraMiningUpgrade;

function setLyraDroneSpecialization(specId) {
    const api = getMiningApi();
    if (!api || !lyraMiningState || typeof api.setDroneSpecialization !== 'function') return;
    const result = api.setDroneSpecialization(lyraMiningState, specId);
    lyraMiningState = result.state;
    renderLyraMiningHud();
    lyraPanelHtmlCache['lyra-panel-firmware'] = '';
    renderLyraSidebarPanel('firmware');
    if (!result.ok) {
        lyraPlaySound('below50');
        showUiMessage(result.error || 'Could not change the drone type.', 'error', 1800, 'top-left');
        return;
    }
    lyraPlaySound('purchase1');
    showUiMessage(`${api.getDroneSpecializationDefinition(specId)?.name || 'New drone type'} ready.`, 'success', 1600, 'top-left');
}
window.setLyraDroneSpecialization = setLyraDroneSpecialization;

function triggerLyraOverload(source = 'key') {
    const api = getMiningApi();
    if (!api || !lyraMiningState || typeof api.activateOverload !== 'function') return false;
    const result = api.activateOverload(lyraMiningState, Date.now());
    lyraMiningState = result.state;
    renderLyraMiningHud();
    if (!result.ok) return false;
    lyraPlaySound('ding');
    triggerLyraCriticalShake();
    if (source !== 'tick') showUiMessage('Power boost on: every word is a bonus hit and drones hit 3x for 10 seconds.', 'success', 1800, 'top-left');
    return true;
}

// Words still needed before the power boost is charged.
function getLyraWordsToOverload() {
    const api = getMiningApi();
    const perWord = Math.max(0.01, Number(api && api.OVERLOAD_CHARGE_PER_WORD) || 2);
    const meter = Math.max(0, Math.min(100, Number(lyraMiningState && lyraMiningState.overloadMeter) || 0));
    return Math.max(0, Math.ceil((100 - meter) / perWord));
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
        reconcileLyraWallet(api.loadMiningState());
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
        renderLyraWordStream(true);
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
    sectorWrapRectCache = null;
    if (!isLyraGateOpen()) return;
    resizeLyraPopupCanvas();
    updateLyraShipAim();
    const nextWindow = computeLyraVisibleWordWindow();
    if (nextWindow !== lyraVisibleWordWindow) {
        lyraVisibleWordWindow = nextWindow;
        ensureLyraWordsBuffer(lyraVisibleWordWindow);
        renderLyraWordStream(true);
    }
});

// Full render (all slots) when the word list changed or force=true; otherwise only the
// active word's letters are touched, which is what happens on every keystroke.
function renderLyraWordStream(force = false) {
    const stream = document.getElementById('lyra-quote-display');
    if (!stream) return;
    ensureLyraWordsBuffer(lyraVisibleWordWindow);
    const renderKey = `${lyraGateState.storyBaseIndex}:${lyraGateState.words.length}:${lyraGateState.words[0] || ''}:${lyraVisibleWordWindow}`;
    if (!force && renderKey === lyraStreamRenderKey && stream.childElementCount > 0) {
        renderLyraActiveWord();
        return;
    }
    lyraStreamRenderKey = renderKey;
    if (lyraWordSlots.length !== lyraVisibleWordWindow || stream.childElementCount === 0) {
        lyraWordSlots = [];
        lyraCharSpans = [];
        stream.innerHTML = '';
        for (let slotIndex = 0; slotIndex < lyraVisibleWordWindow; slotIndex++) {
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
    renderLyraMiningHud();
    renderLyraStoryMeta();
    if (isLyraStoryComplete()) showLyraStoryCompleteSplash();
    updateLyraStoryResetMenu();
    if (stream.scrollLeft !== 0) stream.scrollLeft = 0;
}

// Updates only the letters of the word being typed.
function renderLyraActiveWord() {
    const slot = lyraWordSlots[0];
    if (!slot) return;
    const word = String(lyraGateState.words[0] || '');
    const typed = String(lyraGateState.typed || '');
    for (let i = 0; i < word.length && i < slot.charEls.length; i++) {
        const span = slot.charEls[i];
        let className;
        if (i < typed.length) className = lyraCharsMatch(typed[i], word[i]) ? 'char-correct' : 'char-incorrect';
        else if (i === typed.length) className = 'char-cursor';
        else className = 'char-untyped';
        if (span.className !== className) span.className = className;
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
    const paint = () => {
        lyraParallaxFrame = 0;
        const e = lyraParallaxEvent;
        lyraParallaxEvent = null;
        const anchors = getLyraSceneAnchors();
        if (!e || !anchors || !anchors.sceneWidth || !anchors.sceneHeight || isLyraMotionReduced()) return;
        const rx = ((e.clientX - anchors.sceneLeft) / anchors.sceneWidth - 0.5);
        const ry = ((e.clientY - anchors.sceneTop) / anchors.sceneHeight - 0.5);
        stars.style.transform = `translate(${(-rx * 14).toFixed(1)}px, ${(-ry * 8).toFixed(1)}px)`;
    };
    scene.addEventListener('mousemove', (e) => {
        lyraParallaxEvent = { clientX: e.clientX, clientY: e.clientY };
        if (!lyraParallaxFrame) lyraParallaxFrame = requestAnimationFrame(paint);
    }, { passive: true });
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
        sceneLeft: sRect.left,
        sceneTop: sRect.top,
        sceneWidth: sRect.width,
        sceneHeight: sRect.height,
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
    if (!isLyraGateOpen() || isLyraMotionReduced()) return;
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
    if (!isLyraGateOpen() || isLyraMotionReduced()) return;
    const chunkLayer = document.getElementById('lyra-chunk-layer');
    const anchors = getLyraSceneAnchors();
    if (!chunkLayer || !anchors) return;
    if (chunkLayer.childElementCount > 24) return; // keep the chunk count bounded during fast typing
    const cx = anchors.asteroidCenterX;
    const cy = anchors.asteroidCenterY;
    const radius = anchors.asteroidRadius * 0.95;
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
    const reduced = isLyraMotionReduced();
    for (let i = 0; i < (reduced ? 0 : 14); i++) {
        const px = document.createElement('span');
        px.className = 'lyra-explosion-pixel';
        px.style.left = `${(anchors.asteroidCenterX + (Math.random() - 0.5) * 26).toFixed(2)}px`;
        px.style.top = `${(anchors.asteroidCenterY + (Math.random() - 0.5) * 20).toFixed(2)}px`;
        px.style.setProperty('--dx', `${((Math.random() - 0.5) * 120).toFixed(2)}px`);
        px.style.setProperty('--dy', `${((Math.random() - 0.5) * 84).toFixed(2)}px`);
        explosionLayer.appendChild(px);
        setTimeout(() => px.remove(), 720);
    }
    for (let i = 0; i < (reduced ? 6 : 16); i++) {
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
        renderLyraWordStream(true);
        focusLyraInput();
    }, 1600);
}

// ---- Story milestones: chapter checkpoints, layer checkpoints and the sector clear ----

function getLyraMilestones(bookId = getLyraCurrentStoryBookId()) {
    if (!lyraMiningState) return { chapters: 0, layers: 0, checkpoints: 0 };
    if (!lyraMiningState.milestones || typeof lyraMiningState.milestones !== 'object') lyraMiningState.milestones = {};
    const entry = lyraMiningState.milestones[bookId];
    if (entry && typeof entry === 'object') return entry;
    lyraMiningState.milestones[bookId] = { chapters: 0, layers: 0, checkpoints: 0 };
    return lyraMiningState.milestones[bookId];
}

function awardLyraBonusCrystals(amount) {
    const api = getMiningApi();
    if (!api || !lyraMiningState) return 0;
    const bonus = Math.max(0, Math.floor(Number(amount) || 0));
    if (!bonus) return 0;
    lyraMiningState.totalAetherCrystals = Math.max(0, Math.floor(Number(lyraMiningState.totalAetherCrystals) || 0)) + bonus;
    lyraMiningState = api.saveMiningState(lyraMiningState);
    pushLyraWalletMirror();
    renderLyraMiningHud();
    return bonus;
}

function removeLyraMilestoneSplash() {
    if (lyraMilestoneTimer) { clearTimeout(lyraMilestoneTimer); lyraMilestoneTimer = null; }
    document.querySelectorAll('.lyra-milestone-splash').forEach((el) => el.remove());
}

// Short, non-blocking splash. Typing keeps working underneath it.
function showLyraMilestoneSplash({ title, subtitle, bonus = 0, big = false, holdMs = 2600 }) {
    const wrap = document.querySelector('.lyra-gate-wrap');
    if (!wrap || !isLyraGateOpen()) return;
    removeLyraMilestoneSplash();
    const splash = document.createElement('div');
    splash.className = `lyra-milestone-splash${big ? ' big' : ''}`;
    splash.setAttribute('role', 'status');
    splash.innerHTML = `
        <div class="lyra-milestone-title">${escapeHtml(title)}</div>
        ${subtitle ? `<div class="lyra-milestone-subtitle">${escapeHtml(subtitle)}</div>` : ''}
        ${bonus > 0 ? `<div class="lyra-milestone-bonus">+${formatMiningNumber(bonus)} crystals</div>` : ''}
    `;
    wrap.appendChild(splash);
    lyraMilestoneTimer = setTimeout(() => {
        lyraMilestoneTimer = null;
        splash.classList.add('leaving');
        setTimeout(() => splash.remove(), 400);
    }, holdMs);
}

// Called once per checkpoint (a finished chapter, or 15 shattered layers in a book with no chapters).
function recordLyraCheckpoint(label) {
    const m = getLyraMilestones();
    m.checkpoints = (Number(m.checkpoints) || 0) + 1;
    const bonus = LYRA_CHECKPOINT_BONUS_BASE + LYRA_CHECKPOINT_BONUS_STEP * m.checkpoints;
    const alreadyCleared = isSectorCleared('lyra');
    const clearsNow = !alreadyCleared && m.checkpoints >= LYRA_CHAPTERS_TO_CLEAR;
    awardLyraBonusCrystals(bonus + (clearsNow ? LYRA_SECTOR_CLEAR_BONUS : 0));
    lyraPlaySound('completed');
    if (clearsNow) {
        markSectorCleared('lyra');
        showLyraMilestoneSplash({
            title: 'Lyra Gate cleared',
            subtitle: `${label}. The sector is marked cleared on the story map. Keep reading for more crystals.`,
            bonus: bonus + LYRA_SECTOR_CLEAR_BONUS,
            big: true,
            holdMs: 4200,
        });
        return;
    }
    const left = Math.max(0, LYRA_CHAPTERS_TO_CLEAR - m.checkpoints);
    showLyraMilestoneSplash({
        title: label,
        subtitle: alreadyCleared ? 'Bonus crystals for finishing it.' : `${left} more to clear this sector.`,
        bonus,
    });
}

// After the story moved to word index `progress`: did that finish a chapter?
function checkLyraChapterCheckpoint(progress) {
    const chapter = getLyraChapterEndingAt(progress);
    if (!chapter) return;
    const m = getLyraMilestones();
    if ((Number(m.chapters) || 0) >= chapter) return; // already credited (restart of a finished chapter)
    m.chapters = chapter;
    recordLyraCheckpoint(`Chapter ${chapter} complete`);
}

// Books without chapter headings use shattered layers instead.
function recordLyraLayerMilestone(shatteredLayers) {
    if (!lyraMiningState || !shatteredLayers) return;
    const m = getLyraMilestones();
    const before = Number(m.layers) || 0;
    m.layers = before + shatteredLayers;
    if (lyraBookHasChapters()) return;
    const beforeCheckpoints = Math.floor(before / LYRA_ASTEROIDS_TO_CLEAR);
    const afterCheckpoints = Math.floor(m.layers / LYRA_ASTEROIDS_TO_CLEAR);
    if (afterCheckpoints > beforeCheckpoints) {
        recordLyraCheckpoint(`Checkpoint ${afterCheckpoints}: ${m.layers} layers mined in this book`);
    }
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
        <div class="lyra-clear-title">Book finished</div>
        <div class="lyra-clear-subtitle">You reached the end of ${escapeHtml(currentBook ? currentBook.name : 'this book')}</div>
        <div class="lyra-clear-actions">
            <button onclick="restartLyraStoryProgress('book')">Read it again</button>
            ${nextBook ? `<button onclick="selectLyraStoryBook('${escapeHtml(nextBook.id)}')">Next: ${escapeHtml(nextBook.name)}</button>` : ''}
            <button onclick="closeLyraGate()">Back to map</button>
        </div>
    `;
    wrap.appendChild(splash);
    checkLyraChapterCheckpoint(getLyraCurrentStoryWords().length);
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
        // Tab only fires the power boost. It never restarts the session.
        playKeypressSound('Tab', e);
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return true;
        if (triggerLyraOverload('tab')) return true;
        if (isLyraOverloadActive()) {
            showUiMessage('Power boost is already on.', 'info', 1200, 'top-left');
        } else {
            const left = getLyraWordsToOverload();
            showUiMessage(`Power boost not charged. ${left} more ${left === 1 ? 'word' : 'words'} to go.`, 'info', 1400, 'top-left');
        }
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
        renderLyraActiveWord();
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
            if (miningLaserSoundEnabled) lyraPlaySound('laser');
            lyraGateState.totalCompleted += 1;
            const api = getMiningApi();
            let finishedProgress = -1;
            if (api && lyraMiningState) {
                // Everything below changes the state in memory; one save at the end of the word.
                if (typeof api.setCurrentStoryProgress === 'function' && getLyraCurrentStoryWords().length > 0) {
                    finishedProgress = Math.max(0, Number(lyraMiningState.currentStoryProgress) || 0) + 1;
                    const storyAdvance = api.setCurrentStoryProgress(lyraMiningState, finishedProgress, { skipSave: true });
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
                const appliedCompletion = applyLyraMiningDamage(completionDamage.activeDamage, 'typing', false);
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
                    const charged = api.addOverloadCharge(lyraMiningState, api.OVERLOAD_CHARGE_PER_WORD || 2, { skipSave: true });
                    lyraMiningState = charged.state;
                }
                lyraMiningState = api.saveMiningState(lyraMiningState);
                renderLyraMiningHud();
            }
            lyraGateState.storyBaseIndex += 1;
            if (lyraGateState.words.length > 0) lyraGateState.words.shift();
            ensureLyraWordsBuffer(lyraVisibleWordWindow);
            lyraGateState.typed = '';
            renderLyraWordStream();
            if (finishedProgress > 0) checkLyraChapterCheckpoint(finishedProgress);
            return true;
        }
        lyraGateState.typed = '';
        lyraGateState.comboStreak = 0;
        showUiMessage('Finish the word (fix any wrong letters) before pressing space.', 'info', 1000, 'top-right');
        renderLyraActiveWord();
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
    // Feed the weak-key tracker so Story mode typing improves drills too.
    const keyNow = performance.now();
    if (window.AdaptivePractice && /[a-z]/i.test(expected)) {
        try {
            AdaptivePractice.recordKeystroke({
                expected,
                typed: lyraKey,
                prevChar: nextIndex > 0 ? currentWord[nextIndex - 1] : ' ',
                msSincePrev: lyraLastKeyAt ? keyNow - lyraLastKeyAt : null,
            });
        } catch (err) { /* tracker is optional */ }
    }
    lyraLastKeyAt = keyNow;
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
            const applied = applyLyraMiningDamage(damageInfo.activeDamage, 'typing', false);
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
    renderLyraActiveWord();
    renderLyraMiningHud();
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
        clearLyraPendingTimeouts();
        // Nothing can be typed until setup finishes (lyraSetupInFlight); the real reset happens
        // in the ready callback below, once the saved place in the book is known.
        lyraGateState.typed = '';
        lyraGateState.cycleBusy = false;
        invalidateLyraSceneAnchors();
        lyraPanelHtmlCache = {};
        lyraStatsChipEls = null;
        applyLyraMotionClass(modal);
        const popupCanvasEl = document.getElementById('lyra-popup-canvas');
        if (popupCanvasEl) delete popupCanvasEl.dataset.lyraSized;
        if (lyraCommunityFlushInterval) clearInterval(lyraCommunityFlushInterval);
        lyraCommunityFlushInterval = setInterval(flushLyraCommunityDamage, LYRA_COMMUNITY_FLUSH_MS);
        runLyraSetup(() => {
            resetLyraGateState();
            resetLyraSceneForNextAsteroid();
            renderLyraWordStream(true);
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
    closeLyraStoryResetMenu();
    removeLyraMilestoneSplash();
    // Save once on the way out (per-letter damage is kept in memory between words).
    const api = getMiningApi();
    if (api && lyraMiningState) {
        lyraMiningState = api.saveMiningState(lyraMiningState);
        pushLyraWalletMirror();
    }
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
    if (!event || event.target !== document.getElementById('lyra-gate-modal')) return;
    if (lyraStoryResetMenuOpen) { closeLyraStoryResetMenu(); return; }
    // A half-typed word means the click was most likely a slip; keep the gate open.
    if (lyraGateState.typed.length > 0) {
        focusLyraInput();
        return;
    }
    closeLyraGate();
}

// Escape closes the restart menu first; only a second Escape closes the gate.
// Runs in the capture phase so it sees the key before the global Escape handler.
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isLyraGateOpen() || !lyraStoryResetMenuOpen) return;
    event.preventDefault();
    event.stopPropagation();
    closeLyraStoryResetMenu();
    focusLyraInput();
}, true);

// Save mining progress if the tab is hidden or closed mid-word.
document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !isLyraGateOpen()) return;
    const api = getMiningApi();
    if (api && lyraMiningState) lyraMiningState = api.saveMiningState(lyraMiningState);
});

// XP for an Orion Bulwark run. Also used by the results card inside Orion itself.
function handleOrionRunComplete(result) {
    const r = result || {};
    const xp = window.OrionMode && typeof OrionMode.xpForResult === 'function'
        ? OrionMode.xpForResult(r)
        : Math.min(300, Math.max(5, Math.round((r.score || 0) / 10 + (r.wave || 0) * 15 + (r.wordsDestroyed || 0))));
    let levelUp = null;
    if (typeof addXP === 'function') {
        const xpResult = addXP(xp);
        if (xpResult && xpResult.levelUp) levelUp = xpResult.level;
    }
    if (levelUp) showUiMessage(`Level ${levelUp}!`, 'success', 2600, 'top-right');
    return { xp, levelUp };
}
window.handleOrionRunComplete = handleOrionRunComplete;

function openOrionFromStoryMap() {
    if (!window.OrionMode) return false;
    closeSectorMap();
    setTimeout(() => OrionMode.open({
        wordPool: typeof WORD_LIST !== 'undefined' ? WORD_LIST : undefined,
        onExit: () => { openSectorMap(); },
        onRunComplete: handleOrionRunComplete,
    }), 60);
    return true;
}

function describeSectorStatus(node) {
    if (!node) return '';
    if (node.placeholder) return 'Coming later';
    if (isSectorCleared(node.id)) return 'Cleared';
    if (node.isAccessible) return 'Ready to play';
    return `Reach level ${Math.max(1, Number(node.requiredLevel) || 1)}`;
}

function handleSectorSystemSelect(node) {
    if (!node) return;
    if (node.placeholder) {
        showUiMessage(`${node.name} is coming later.`, 'info', 1800, 'top-right');
        return;
    }
    if (!node.isAccessible) {
        showUiMessage(`${node.name} opens at level ${Math.max(1, Number(node.requiredLevel) || 1)}. Finish a few runs to level up.`, 'info', 2400, 'top-right');
        return;
    }
    if (node.id === 'lyra') {
        closeSectorMap();
        setTimeout(() => {
            openLyraGate();
        }, 60);
        return;
    }
    if (node.id === 'orion' && openOrionFromStoryMap()) return;
    showUiMessage(`${node.name} is coming later.`, 'info', 1800, 'top-right');
}

function handleSectorSystemSelectById(systemId) {
    const source = Array.isArray(sectorMapResolvedSystems) && sectorMapResolvedSystems.length
        ? sectorMapResolvedSystems
        : SECTOR_MAP_SYSTEMS;
    const node = source.find((s) => String(s.id) === String(systemId));
    if (!node) return;
    handleSectorSystemSelect(node);
}

// Two sectors are real games today. The other five are placeholders shown greyed as "Coming later".
// Opening a sector depends on player level only; there is no typing-speed gate.
const SECTOR_MAP_SYSTEMS = [
    { id: 'lyra', name: 'Lyra Gate', blurb: 'Type a book, mine the asteroid', x: 150, y: 480, difficulty: 'easy', requiredLevel: 1, unlocked: true, links: ['orion'] },
    { id: 'orion', name: 'Orion Bulwark', blurb: 'Shoot down falling words', x: 300, y: 390, difficulty: 'easy', requiredLevel: 2, unlocked: false, links: ['perseus', 'vega'] },
    { id: 'perseus', name: 'Perseus Spine', blurb: 'Coming later', x: 470, y: 450, difficulty: 'medium', requiredLevel: 4, unlocked: false, placeholder: true, links: ['vega', 'antares'] },
    { id: 'vega', name: 'Vega Expanse', blurb: 'Coming later', x: 520, y: 280, difficulty: 'medium', requiredLevel: 6, unlocked: false, placeholder: true, links: ['antares', 'helios'] },
    { id: 'antares', name: 'Antares Rift', blurb: 'Coming later', x: 700, y: 380, difficulty: 'medium', requiredLevel: 8, unlocked: false, placeholder: true, links: ['helios', 'zenith'] },
    { id: 'helios', name: 'Helios Crown', blurb: 'Coming later', x: 810, y: 240, difficulty: 'high', requiredLevel: 10, unlocked: false, placeholder: true, links: ['zenith'] },
    { id: 'zenith', name: 'Zenith Core', blurb: 'Coming later', x: 1030, y: 310, difficulty: 'high', requiredLevel: 12, unlocked: false, placeholder: true, links: [] },
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
    const source = Array.isArray(sectorMapResolvedSystems) && sectorMapResolvedSystems.length ? sectorMapResolvedSystems : [];
    const node = systemId ? source.find((entry) => entry.id === systemId) : null;
    const text = node
        ? `${node.name}: ${node.blurb}. ${describeSectorStatus(node)}.`
        : 'Click a bright star to play it. Grey stars open as you level up or are coming later.';
    setLyraText(body, text);
}

function positionSectorNodeHoverBubble(event) {
    if (!event) return;
    const bubble = document.getElementById('sector-node-hover-bubble');
    if (!bubble) return;
    const rect = getSectorWrapRect();
    if (!rect || !rect.width || !rect.height) return;
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
    const cleared = isSectorCleared(node.id);
    const accessText = describeSectorStatus(node);
    bubble.classList.toggle('is-ready', !!node.isAccessible && !node.placeholder);
    bubble.innerHTML = `<strong>${escapeHtml(node.name)}</strong><br>${escapeHtml(node.blurb || '')}<br>Status: <strong style="${cleared ? 'color:#86efac' : ''}">${escapeHtml(accessText)}</strong>`;
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
    const systems = SECTOR_MAP_SYSTEMS.map((node) => {
        const levelOk = !!node.unlocked || playerLevel >= Math.max(1, Number(node.requiredLevel) || 1);
        return {
            ...node,
            pathUnlocked: levelOk,
            wpmQualified: true,
            isAccessible: levelOk && !node.placeholder,
        };
    });
    sectorMapResolvedSystems = systems;
    applyLyraMotionClass(document.getElementById('sector-map-modal'));
    renderSectorList(systems);

    const starCount = isLyraMotionReduced() ? 60 : 100 + Math.floor(Math.random() * 51);
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
        g.setAttribute('class', `sector-node ${node.isAccessible ? 'is-unlocked' : 'is-locked'}${node.placeholder ? ' is-placeholder' : ''} ${importanceClass}`);
        g.setAttribute('tabindex', node.placeholder ? '-1' : '0');
        g.setAttribute('role', 'button');
        g.setAttribute('aria-label', `${node.name}: ${node.blurb}. ${describeSectorStatus(node)}`);
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

        // Every node carries its name and its status so the map explains itself.
        const nameLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        nameLabel.setAttribute('x', String(node.x));
        nameLabel.setAttribute('y', String(node.y - style.hr - 10));
        nameLabel.setAttribute('text-anchor', 'middle');
        nameLabel.setAttribute('class', 'sector-node-name');
        nameLabel.textContent = node.name;
        g.appendChild(nameLabel);
        const statusLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        statusLabel.setAttribute('x', String(node.x));
        statusLabel.setAttribute('y', String(node.y + style.hr + 16));
        statusLabel.setAttribute('text-anchor', 'middle');
        statusLabel.setAttribute('class', `sector-node-status${isSectorCleared(node.id) ? ' is-cleared' : ''}`);
        statusLabel.textContent = describeSectorStatus(node);
        g.appendChild(statusLabel);

        // Cleared tick mark
        if (isSectorCleared(node.id)) {
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

// Phone-width view of the same sectors: a list of big buttons instead of small dots.
function renderSectorList(systems) {
    const list = document.getElementById('sector-map-list');
    if (!list) return;
    const html = systems.map((node) => {
        const status = describeSectorStatus(node);
        const cleared = isSectorCleared(node.id);
        const state = node.placeholder ? 'placeholder' : node.isAccessible ? 'ready' : 'locked';
        return `
            <button type="button" class="sector-list-item is-${state}${cleared ? ' is-cleared' : ''}" data-sector-id="${escapeHtml(node.id)}" ${node.placeholder ? 'disabled' : ''}>
                <span class="sector-list-orb" aria-hidden="true"></span>
                <span class="sector-list-text">
                    <strong>${escapeHtml(node.name)}</strong>
                    <span>${escapeHtml(node.blurb || '')}</span>
                </span>
                <span class="sector-list-status">${escapeHtml(status)}</span>
            </button>`;
    }).join('');
    if (list.innerHTML !== html) list.innerHTML = html;
    if (!list.dataset.clickBound) {
        list.dataset.clickBound = '1';
        list.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target.closest('.sector-list-item') : null;
            if (target && target.dataset.sectorId) handleSectorSystemSelectById(target.dataset.sectorId);
        });
    }
}

function getSectorWrapRect() {
    if (sectorWrapRectCache) return sectorWrapRectCache;
    const wrap = document.querySelector('#sector-map-modal .sector-map-wrap');
    if (!wrap) return null;
    const rect = wrap.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) sectorWrapRectCache = rect;
    return rect;
}

// One paint per animation frame, using a cached box for the map.
function updateSectorStarsParallaxFromMouse(event) {
    if (!event) return;
    sectorParallaxEvent = { clientX: event.clientX, clientY: event.clientY };
    if (sectorParallaxFrame) return;
    sectorParallaxFrame = requestAnimationFrame(() => {
        sectorParallaxFrame = 0;
        const e = sectorParallaxEvent;
        sectorParallaxEvent = null;
        const starsLayer = document.getElementById('sector-map-stars');
        const rect = getSectorWrapRect();
        if (!e || !starsLayer || !rect || !rect.width || !rect.height || isLyraMotionReduced()) return;
        const relX = ((e.clientX - rect.left) / rect.width) - 0.5;
        const relY = ((e.clientY - rect.top) / rect.height) - 0.5;
        starsLayer.setAttribute('transform', `translate(${(-relX * 16).toFixed(2)} ${(-relY * 10).toFixed(2)})`);
    });
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
    wrap.addEventListener('mousemove', updateSectorStarsParallaxFromMouse, { passive: true });
    wrap.addEventListener('mouseleave', resetSectorStarsParallax);
}

function openSectorMap() {
    const modal = document.getElementById('sector-map-modal');
    if (!modal) return;
    sectorWrapRectCache = null;
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
