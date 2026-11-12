function handleTypingBackspace(wordMode, e) {
    if (activeChallengeId === 'nobackspace') return;
    playKeypressSound('Backspace', e);
    if (currentIndex > 0) {
        if (wordMode) {
            // Delete entire previous word: skip back through spaces, then through non-spaces
            let target = currentIndex - 1;
            while (target > 0 && currentQuote[target] === ' ') target--;
            while (target > 0 && currentQuote[target - 1] !== ' ') target--;
            const count = currentIndex - target;
            for (let i = 0; i < count; i++) { typedChars.pop(); }
            backspaces += count;
            currentIndex = target;
            renderQuote();
        } else {
            const prevIdx = currentIndex;
            backspaces++;
            currentIndex--;
            typedChars.pop();
            if (charSpans.length === currentQuote.length) {
                updateCharSpan(prevIdx);      // old cursor -> untyped
                updateCharSpan(currentIndex);  // new cursor position
            } else {
                renderQuote();
            }
        }
        recordAttemptTimelinePoint();
        syncTypingViewportScroll();
        updateStats();
    }
}

// Shared per-character logic for keydown and the hidden input path
let adaptiveLastKeyAt = 0;
if (window.RunAnalysis) RunAnalysis.ghostDelta.mount(document.getElementById('ghost-delta-slot'));

function updateGhostDelta(elapsedMs) {
    if (!window.RunAnalysis || !ghostCursorEnabled || !ghostTimeline.length || !startTime) return;
    RunAnalysis.ghostDelta.update({
        currentIndex,
        elapsedMs: elapsedMs != null ? elapsedMs : Date.now() - startTime,
        ghostTimeline,
    });
}

function processTypedChar(rawCh, e) {
    if (isComplete) return;
    const ch = normalizeTypedChar(rawCh);
    if (ch === ' ' && !startTime) return; // idle: let document handler call newTest()
    const expected = currentQuote[currentIndex];
    const matches = typedCharMatches(ch, expected);
    // Store the target char when equivalent so every downstream comparison stays strict
    const stored = matches ? expected : ch;

    // Perfectionist: any wrong key = instant fail
    if (activeChallengeId === 'perfectionist' && !matches) {
        showChallengeFail();
        return;
    }

    playKeypressSound(ch, e);

    if (!startTime) startTimer();

    if (isTimedMode()) extendWordBuffer();

    const apNow = performance.now();
    if (window.AdaptivePractice && /[a-z]/i.test(expected || '')) {
        AdaptivePractice.recordKeystroke({
            expected,
            typed: ch,
            prevChar: currentQuote[currentIndex - 1] || '',
            msSincePrev: adaptiveLastKeyAt ? apNow - adaptiveLastKeyAt : null,
        });
    }
    adaptiveLastKeyAt = apNow;

    keyStrokes++;
    if (!matches) mistakeCount++;
    const prevIdx = currentIndex;
    typedChars[currentIndex] = stored;
    currentIndex++;
    recordAttemptTimelinePoint();
    updateGhostDelta();

    if (charSpans.length === currentQuote.length) {
        updateCharSpan(prevIdx);    // just typed → correct/incorrect
        updateCharSpan(currentIndex); // new cursor position
    } else {
        renderQuote(); // fallback for post-extension rebuilds
    }
    maybeTriggerMiningShatter(prevIdx);
    if (ch !== ' ' && typedChars[prevIdx] === currentQuote[prevIdx]) emitMiningLaserShotAtWord(prevIdx);
    syncTypingViewportScroll();
    emitNebulaTrailAtCursor();
    emitXzLaserAtCursor(ch);
    updateStats();

    if (!isTimedMode() && currentIndex === currentQuote.length) {
        isComplete = true;
        resultsPendingOpen = true;
        const _capturedElapsed = getElapsed();
        setTimeout(() => { if (resultsPendingOpen) showResults(_capturedElapsed); }, 400);
    }
}

function handleTypingKeydown(e) {
    if (isSplashScreenOpen()) {
        e.preventDefault();
        return;
    }
    // IME / dead key / Android soft keyboard: the text arrives via input or compositionend
    if (isImeKeydown(e)) return;
    if (isPrintableKeyEvent(e)) {
        // The matching input event (if any) must not be processed a second time
        keydownHandledInput = true;
        setTimeout(() => { keydownHandledInput = false; }, 0);
    }
    if (isLyraGateOpen()) {
        if (handleLyraGateKeydown(e)) return;
    }
    if (isComplete) return;

    if (finishTimedOverrun()) {
        e.preventDefault();
        return;
    }

    if (e.key === 'Tab') {
        playKeypressSound('Tab', e);
        e.preventDefault();
        e.stopPropagation();
        restart();
        return;
    }

    if (e.key === 'Backspace') {
        e.preventDefault();
        handleTypingBackspace(e.ctrlKey || e.metaKey, e);
        return;
    }

    if (!isPrintableKeyEvent(e)) return;
    if (e.repeat) return; // ignore key-held repeats — each character must be a deliberate press
    if (e.key === ' ' && !startTime) { e.preventDefault(); return; } // idle: let document handler call newTest()

    e.preventDefault();
    processTypedChar(e.key, e);
    setTimeout(() => { resetHiddenInput(); }, 0);
}

function isTypingIntentKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    return e.key.length === 1 || e.key === 'Backspace' || e.key === 'Tab';
}

function isUserTextEntryTarget(target) {
    if (!target) return false;
    if (target === hiddenInput) return false;
    const tag = (target.tagName || '').toLowerCase();
    if (target.isContentEditable) return true;
    if (tag === 'textarea' || tag === 'select') return true;
    if (tag !== 'input') return false;
    const type = (target.type || 'text').toLowerCase();
    return type !== 'button' && type !== 'submit' && type !== 'reset' && type !== 'checkbox' && type !== 'radio' && type !== 'range' && type !== 'file' && type !== 'color';
}

hiddenInput.addEventListener('keydown', handleTypingKeydown);
hiddenInput.addEventListener('paste', (e) => e.preventDefault());
hiddenInput.addEventListener('drop', (e) => e.preventDefault());
hiddenInput.addEventListener('beforeinput', (e) => {
    if (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop') e.preventDefault();
});

hiddenInput.addEventListener('blur',  () => {
    quoteDisplay.classList.remove('focused');
    if (lyraQuoteDisplay) lyraQuoteDisplay.classList.remove('focused');
});
hiddenInput.addEventListener('focus', () => {
    if (!hiddenInput.value) resetHiddenInput();
    if (isLyraGateOpen()) {
        quoteDisplay.classList.remove('focused');
        if (lyraQuoteDisplay) lyraQuoteDisplay.classList.add('focused');
    } else {
        if (lyraQuoteDisplay) lyraQuoteDisplay.classList.remove('focused');
        quoteDisplay.classList.add('focused');
    }
});
document.getElementById('lyra-gate-modal')?.addEventListener('pointerdown', () => {
    if (isLyraGateOpen()) setTimeout(() => focusLyraInput(), 0);
});

// ── Mobile virtual keyboard detection ──────────────────────────────────────
(function initMobileSupport() {
    const isTouchDevice = matchMedia('(pointer: coarse)').matches;
    if (!isTouchDevice) return;

    // Update hint text for mobile users
    const hintEl = document.getElementById('hint');
    if (hintEl) hintEl.textContent = 'Tap the text above to begin · Buttons below to restart';

    // Virtual keyboard detection via visualViewport API
    if (window.visualViewport) {
        let vkOpen = false;
        const VK_THRESHOLD = 150; // pixels of height reduction to consider keyboard open
        const checkVK = () => {
            const heightDiff = window.innerHeight - window.visualViewport.height;
            const nowOpen = heightDiff > VK_THRESHOLD;
            if (nowOpen !== vkOpen) {
                vkOpen = nowOpen;
                document.body.classList.toggle('vk-open', vkOpen);
                if (vkOpen) {
                    // Scroll the quote display into view
                    requestAnimationFrame(() => {
                        const qd = document.getElementById('quote-display');
                        if (qd) qd.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    });
                }
            }
        };
        window.visualViewport.addEventListener('resize', checkVK);
        window.visualViewport.addEventListener('scroll', checkVK);
    }
})();

// ── Hidden input path (all devices): soft keyboards, IME, dead keys ────────
// Characters that keydown did not handle (IME, dead keys, Android) arrive via
// 'input' / 'compositionend' and are fed through the same per-character logic.
function makeSyntheticKeyEvent(key) {
    return { key, preventDefault() {}, stopPropagation() {}, ctrlKey: false, metaKey: false, altKey: false, repeat: false };
}

function processInputBackspace() {
    if (isSplashScreenOpen()) return;
    if (isLyraGateOpen()) { handleLyraGateKeydown(makeSyntheticKeyEvent('Backspace')); return; }
    if (isComplete) return;
    handleTypingBackspace(false, null);
}

function processInputText(text) {
    if (isSplashScreenOpen()) return;
    const lyraOpen = isLyraGateOpen();
    if (!lyraOpen && isComplete) return;
    // Limit a single event (swipe, autocorrect) to the rest of the current word plus 1
    let remaining;
    if (lyraOpen) {
        remaining = (lyraGateState.words[0] || '').length - lyraGateState.typed.length;
    } else {
        const nextSpace = currentQuote.indexOf(' ', currentIndex);
        remaining = (nextSpace < 0 ? currentQuote.length : nextSpace) - currentIndex;
    }
    const cap = Math.max(remaining, 0) + 1;
    const chars = Array.from(String(text || '').split(HIDDEN_INPUT_SENTINEL).join(''))
        .filter(ch => ch.charCodeAt(0) >= 32)
        .slice(0, cap);
    for (const ch of chars) {
        if (lyraOpen) {
            handleLyraGateKeydown(makeSyntheticKeyEvent(ch));
            continue;
        }
        if (finishTimedOverrun()) break;
        processTypedChar(ch, null);
        if (isComplete) break;
    }
}

let lastInputCommit = { text: '', time: 0 };
function commitInputText(text) {
    const now = performance.now();
    // compositionend and a trailing input event can both report the same text
    if (text && text === lastInputCommit.text && now - lastInputCommit.time < 50) return;
    lastInputCommit = { text, time: now };
    processInputText(text);
}

hiddenInput.addEventListener('input', (e) => {
    if (e.isComposing) return; // wait for compositionend
    if (e.inputType && e.inputType.indexOf('delete') === 0) {
        // Gboard often sends keyCode 229 / 'Unidentified' for Backspace
        if (e.inputType === 'deleteContentBackward') processInputBackspace();
        resetHiddenInput();
        return;
    }
    if (!keydownHandledInput) commitInputText(hiddenInput.value);
    resetHiddenInput();
});
hiddenInput.addEventListener('compositionend', (e) => {
    if (e.data) commitInputText(e.data);
    resetHiddenInput();
});

document.addEventListener('keydown', handleModalFocusTrap);
document.addEventListener('keydown', (e) => {
    if (window.OrionMode && OrionMode.isOpen()) return; // Orion Bulwark owns the keyboard
    const resultsOpen = resultOverlay.classList.contains('show');
    const activeEl = document.activeElement;
    if (isSplashScreenOpen()) {
        const isModifierOnly = e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta' || e.key === 'AltGraph';
        const isAdvanceKey = !isModifierOnly && e.key !== 'Escape';
        if (isAdvanceKey && !isSplashOptionsVisible() && !isSplashGuideVisible()) {
            e.preventDefault();
            e.stopPropagation();
            playUiCue(SFX.ding);
            revealSplashOptions();
            return;
        }
        if (isAdvanceKey && isSplashGuideVisible()) {
            e.preventDefault();
            e.stopPropagation();
            continueFromSplashGuide();
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeLoginModal();
            closeSignupModal();
            if (isSplashGuideVisible()) revealSplashOptions();
            else showSplashPrompt();
            return;
        }
        if (activeEl === hiddenInput) {
            e.preventDefault();
            e.stopPropagation();
        }
        return;
    }
    if (isLyraGateOpen()) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeLyraGate();
            return;
        }
        // While Lyra is open, suppress global typing-test hotkeys (space/tab/new test/restart).
        if (isTypingIntentKey(e) || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            if (activeEl !== hiddenInput) {
                focusLyraInput();
                handleLyraGateKeydown(e);
            }
            return;
        }
        if (activeEl !== hiddenInput && isTypingIntentKey(e)) {
            e.preventDefault();
            focusLyraInput();
            handleLyraGateKeydown(e);
            return;
        }
    }

    // Do not hijack keyboard input while user is typing in UI form fields.
    if (isUserTextEntryTarget(activeEl)) return;

    if (resultsPendingOpen && e.key === ' ') {
        e.preventDefault();
        return;
    }

    // Spacebar = new test when idle, complete, or results showing
    if (e.key === ' ' && (isComplete || resultsOpen || !startTime)) {
        e.preventDefault();
        newTest();
        return;
    }

    if (isComplete || resultsOpen) {
        if (e.key === 'Tab') {
            playKeypressSound('Tab', e);
            e.preventDefault();
            tryAgain();
            return;
        }
    }

    if (e.key === 'Tab') { e.preventDefault(); restart(); return; }

    // If focus was lost (e.g., after clicking UI controls), first typing key should
    // immediately re-focus the hidden input and continue the test.
    if (!resultsOpen && activeEl !== hiddenInput && isTypingIntentKey(e)) {
        e.preventDefault();
        focusInput();
        handleTypingKeydown(e);
        return;
    }

    if (e.key === 'Escape') {
        if (resultOverlay.classList.contains('show')) closeResults();
        closeLeaderboard();
        closeSkills();
        closeInventory();
        closeAccountManagement();
        closeDeleteAccountConfirm();
        closeSignupModal();
        closeLoginModal();
        closeAdminPanel();
        closeCommunityHub();
        closeSectorMap();
        closeLyraGate();
        closeLifetimeStatsModal();
        closeMissionBriefing();
        closeKeySoundMenu();
        closeMusicMenu();
    }
});

document.addEventListener('pointerdown', (e) => {
    updateLastPointerPositionFromEvent(e);
    const keyWrap = document.getElementById('keysound-wrap');
    const musicWrap = document.getElementById('music-wrap');
    if (keyWrap && keyWrap.contains(e.target)) return;
    if (musicWrap && musicWrap.contains(e.target)) return;
    if (unlockShopHintEl && unlockShopHintEl.contains(e.target)) return;
    hideUnlockShopHint();
    closeKeySoundMenu();
    closeMusicMenu();
});
function updateLastPointerPositionFromEvent(event) {
    if (!event) return;
    if (Number.isFinite(event.clientX)) lastPointerX = event.clientX;
    if (Number.isFinite(event.clientY)) lastPointerY = event.clientY;
}
document.addEventListener('pointermove', updateLastPointerPositionFromEvent, { passive: true });

// ── Theme Soundtracks ────────────────────────────────────────────────────────
const themeMusic = {
    dark: new Audio('Sound Effects/Dark Main Theme.mp3'),
    universe: new Audio('Sound Effects/Your Own Personal Universe.mp3'),
};
const soundscapePreviewAudio = new Audio('Sound Effects/Your Own Personal Universe.mp3');
const MUSIC_VOLUME_KEY = 'sampire-music-volume';
const KEY_SOUND_VOLUME_KEY = 'sampire-key-sound-volume';
const DEFAULT_MUSIC_VOLUME = 0.25;
const DEFAULT_KEY_SOUND_VOLUME = 1;

themeMusic.dark.loop = true;
themeMusic.dark.volume = DEFAULT_MUSIC_VOLUME;
themeMusic.universe.loop = true;
themeMusic.universe.volume = DEFAULT_MUSIC_VOLUME;
themeMusic.dark.preload = 'auto';
themeMusic.universe.preload = 'auto';
soundscapePreviewAudio.loop = false;
soundscapePreviewAudio.preload = 'auto';
soundscapePreviewAudio.volume = DEFAULT_MUSIC_VOLUME;

let musicMuted = false;
let musicNeedsUserGesture = false;
let keySoundsEnabled = false;
let musicVolume = DEFAULT_MUSIC_VOLUME;
let keySoundVolume = DEFAULT_KEY_SOUND_VOLUME;
let activeMusicTheme = 'dark';
let rewardPreviewTimer = null;
let rewardSoundPreviewPlaying = false;
let auraPreviewVisible = false;
let nebulaPreviewVisible = false;
let shopPurchaseFxKey = '';
let shopPurchaseFxExpiresAt = 0;
let unlockShopHintEl = null;
let unlockShopHintTimer = null;
let lastPointerX = window.innerWidth * 0.5;
let lastPointerY = window.innerHeight * 0.5;
const KEY_SOUND_BASE_ROOT = 'Sound Effects';
const KEY_SOUND_DEFAULT_PACK = 'nk-cream';
const KEY_SOUND_PACK_KEY = 'sampire-key-sound-pack';
const SHOP_KEY_SOUND_PACKS = [
    { id: 'cherrymx-blue-abs', label: 'Cherry MX Blues', icon: '🔊', desc: 'Clicky and crisp keystrokes.', cost: 1 },
    { id: 'Buckling Springs', label: 'Buckling Springs', icon: '🔔', desc: 'Classic spring-loaded keyboard snap.', cost: 1 },
    { id: 'Cherry MX Blacks', label: 'Cherry MX Blacks', icon: '🎹', desc: 'Deep and solid keypress profile.', cost: 1 },
    { id: 'Cherry MX Browns', label: 'Cherry MX Browns', icon: '⌨️', desc: 'Balanced tactile keyboard sound.', cost: 1 },
    { id: 'Cherry MX Reds', label: 'Cherry MX Reds', icon: '🎧', desc: 'Smooth linear key sound profile.', cost: 1 },
];
const keySoundPools = new Map();
const KEY_SOUND_POOL_SIZE = 4;
let keySoundPackName = KEY_SOUND_DEFAULT_PACK;
let keySoundPackConfig = null;
let keySoundPackLoadPromise = null;
let keySoundPackLoadAttempted = false;
const keySoundPackConfigCache = new Map();
let pbFxTimeout = null;
