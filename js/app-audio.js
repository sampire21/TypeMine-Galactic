function playThemeSoundtrack() {
    if (musicMuted) return;
    const track = themeMusic[activeMusicTheme] || themeMusic.dark;
    if (!track.paused && !track.ended) {
        musicNeedsUserGesture = false;
        return;
    }
    track.play()
        .then(() => { musicNeedsUserGesture = false; })
        .catch(() => { musicNeedsUserGesture = true; });
}

function stopThemeSoundtracks() {
    Object.values(themeMusic).forEach((track) => {
        track.pause();
    });
}

function clampAudioVolume(value, fallback = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return Math.max(0, Math.min(1, Number(fallback) || 0));
    return Math.max(0, Math.min(1, n));
}

function getVolumePercent(volume) {
    return `${Math.round(clampAudioVolume(volume, 0) * 100)}%`;
}

function updateMusicVolumeUI() {
    const slider = document.getElementById('music-volume-slider');
    const valueEl = document.getElementById('music-volume-value');
    const pct = Math.round(musicVolume * 100);
    if (slider) slider.value = String(pct);
    if (valueEl) valueEl.textContent = `${pct}%`;
}

function applyMusicVolume() {
    Object.values(themeMusic).forEach((track) => {
        track.volume = musicVolume;
    });
    soundscapePreviewAudio.volume = musicVolume;
    updateMusicVolumeUI();
}

function setMusicVolume(value) {
    musicVolume = clampAudioVolume(value, DEFAULT_MUSIC_VOLUME);
    applyMusicVolume();
    try { localStorage.setItem(MUSIC_VOLUME_KEY, String(musicVolume)); } catch (e) {}
    flushProgressSyncNow();
}

function handleMusicVolumeInput(event) {
    const raw = Number(event && event.target && event.target.value);
    setMusicVolume(raw / 100);
}

function updateMusicToggleUi() {
    const state = document.getElementById('music-state');
    const btn = document.getElementById('music-toggle');
    if (!state) return;
    state.textContent = musicMuted ? '✗' : '✓';
    state.classList.toggle('on', !musicMuted);
    state.classList.toggle('off', musicMuted);
    if (btn) {
        btn.classList.toggle('active', !musicMuted);
        btn.classList.toggle('inactive', musicMuted);
    }
}

function updateMusicMenuUI() {
    document.querySelectorAll('#music-menu .music-option[data-theme]').forEach((btn) => {
        const theme = String(btn.dataset.theme || '');
        const isActive = theme === activeMusicTheme;
        btn.classList.toggle('active', isActive);
        btn.onmouseenter = null;
        btn.onmouseleave = null;
        btn.onfocus = null;
        btn.onblur = null;
        if (theme === 'universe') {
            const locked = !isSkillUnlocked('soundscapes');
            btn.classList.toggle('locked', locked);
            btn.title = '';
            if (locked) {
                btn.onmouseenter = (event) => {
                    updateLastPointerPositionFromEvent(event);
                    showUnlockShopHintNearCursor('Unlock in the shop!');
                };
                btn.onmouseleave = hideUnlockShopHint;
                btn.onfocus = () => showUnlockShopHintNearCursor('Unlock in the shop!');
                btn.onblur = hideUnlockShopHint;
            }
        } else {
            btn.classList.remove('locked');
            btn.title = '';
        }
    });
}

function openMusicMenu() {
    const menu = document.getElementById('music-menu');
    if (!menu) return;
    menu.classList.add('show');
    menu.setAttribute('aria-hidden', 'false');
    updateMusicMenuUI();
    updateMusicVolumeUI();
}

function closeMusicMenu() {
    const menu = document.getElementById('music-menu');
    if (!menu) return;
    menu.classList.remove('show');
    menu.setAttribute('aria-hidden', 'true');
}

function toggleMusicMenu(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const menu = document.getElementById('music-menu');
    if (!menu) return;
    if (menu.classList.contains('show')) closeMusicMenu();
    else openMusicMenu();
}

function hideUnlockShopHint() {
    if (unlockShopHintTimer) {
        clearTimeout(unlockShopHintTimer);
        unlockShopHintTimer = null;
    }
    if (unlockShopHintEl && unlockShopHintEl.parentNode) unlockShopHintEl.parentNode.removeChild(unlockShopHintEl);
    unlockShopHintEl = null;
}

function showUnlockShopHintNearCursor(message = 'Unlock in the shop!', autoHideMs = 0) {
    hideUnlockShopHint();
    const hint = document.createElement('button');
    hint.type = 'button';
    hint.className = 'unlock-shop-hint';
    hint.textContent = message;
    const x = Number.isFinite(lastPointerX) ? lastPointerX : (window.innerWidth * 0.5);
    const y = Number.isFinite(lastPointerY) ? lastPointerY : (window.innerHeight * 0.5);
    hint.style.left = `${x + 12}px`;
    hint.style.top = `${y + 12}px`;
    hint.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        hideUnlockShopHint();
        closeMusicMenu();
        closeKeySoundMenu();
        openSkills();
    });
    document.body.appendChild(hint);
    const rect = hint.getBoundingClientRect();
    const pad = 10;
    let left = x + 12;
    let top = y + 12;
    if (left + rect.width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - rect.width - pad);
    if (top + rect.height > window.innerHeight - pad) top = Math.max(pad, y - rect.height - 12);
    hint.style.left = `${left}px`;
    hint.style.top = `${top}px`;
    unlockShopHintEl = hint;
    if (autoHideMs > 0) unlockShopHintTimer = setTimeout(hideUnlockShopHint, autoHideMs);
}

function selectMusicTheme(theme, event = null) {
    updateLastPointerPositionFromEvent(event);
    if (theme === 'universe' && !isSkillUnlocked('soundscapes')) {
        showUnlockShopHintNearCursor('Unlock in the shop!', 2600);
        return;
    }
    hideUnlockShopHint();
    setActiveMusicTheme(theme);
    updateMusicMenuUI();
    closeMusicMenu();
}

function toggleMusicMuteFromMenu() {
    toggleMusic();
    updateMusicMenuUI();
}

function setActiveMusicTheme(theme) {
    let resolved = theme === 'universe' ? 'universe' : 'dark';
    if (resolved === 'universe' && !isRewardActive('soundscapes')) {
        resolved = 'dark';
    }
    if (activeMusicTheme === resolved) return;
    activeMusicTheme = resolved;
    try { localStorage.setItem('sampire-active-soundscape', activeMusicTheme); } catch (e) {}
    if (!musicMuted) {
        stopThemeSoundtracks();
        playThemeSoundtrack();
    }
    updateMusicMenuUI();
}

function toggleMusic() {
    musicMuted = !musicMuted;
    if (musicMuted) {
        musicNeedsUserGesture = false;
        stopThemeSoundtracks();
    } else {
        playThemeSoundtrack();
    }
    updateMusicToggleUi();
    try { localStorage.setItem('sampire-music-muted', musicMuted ? '1' : '0'); } catch(e) {}
    flushProgressSyncNow();
}

async function shareSite() {
    const url = 'https://type.sherathia.com';
    let copied = false;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(url);
            copied = true;
        }
    } catch {}
    if (!copied) {
        try {
            const ta = document.createElement('textarea');
            ta.value = url;
            ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed;left:-9999px;opacity:0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            copied = document.execCommand('copy');
            ta.remove();
        } catch {}
    }
    if (copied) {
        showUiMessage('Link copied to clipboard! Thanks for sharing!', 'success', 2600, 'top-left');
    } else {
        showUiMessage('Unable to copy link. Please copy manually: https://type.sherathia.com', 'error', 3200, 'top-left');
    }
}

function setKeySoundToggleUI() {
    const label = document.getElementById('keysound-label');
    const state = document.getElementById('keysound-state');
    const btn = document.getElementById('keysound-toggle');
    if (label) label.textContent = 'Key Sounds';
    if (!state) return;
    state.textContent = keySoundsEnabled ? '✓' : '✗';
    state.classList.toggle('on', keySoundsEnabled);
    state.classList.toggle('off', !keySoundsEnabled);
    if (btn) {
        btn.classList.toggle('active', keySoundsEnabled);
        btn.classList.toggle('inactive', !keySoundsEnabled);
    }
}

function updateKeySoundPackMenuUI() {
    document.querySelectorAll('#keysound-menu .keysound-option[data-pack]').forEach((btn) => {
        const pack = String(btn.dataset.pack || '');
        const unlocked = isKeySoundPackUnlocked(pack);
        const isDefault = pack === KEY_SOUND_DEFAULT_PACK;
        btn.classList.toggle('active', pack === keySoundPackName);
        btn.classList.toggle('locked', !unlocked);
        btn.title = '';
        btn.onmouseenter = null;
        btn.onmouseleave = null;
        btn.onfocus = null;
        btn.onblur = null;
        if (!unlocked) {
            btn.onmouseenter = (event) => {
                updateLastPointerPositionFromEvent(event);
                showUnlockShopHintNearCursor('Unlock in the shop!');
            };
            btn.onmouseleave = hideUnlockShopHint;
            btn.onfocus = () => showUnlockShopHintNearCursor('Unlock in the shop!');
            btn.onblur = hideUnlockShopHint;
        }
        if (isDefault) btn.title = 'Default pack';
    });
}

function updateKeySoundVolumeUI() {
    const slider = document.getElementById('keysound-volume-slider');
    const valueEl = document.getElementById('keysound-volume-value');
    const pct = Math.round(keySoundVolume * 100);
    if (slider) slider.value = String(pct);
    if (valueEl) valueEl.textContent = `${pct}%`;
}

function applyKeySoundVolume() {
    keySoundPools.forEach((entry) => {
        if (!entry || !Array.isArray(entry.pool)) return;
        entry.pool.forEach((audio) => { audio.volume = keySoundVolume; });
    });
    updateKeySoundVolumeUI();
}

function setKeySoundVolume(value) {
    keySoundVolume = clampAudioVolume(value, DEFAULT_KEY_SOUND_VOLUME);
    applyKeySoundVolume();
    try { localStorage.setItem(KEY_SOUND_VOLUME_KEY, String(keySoundVolume)); } catch (e) {}
    flushProgressSyncNow();
}

function handleKeySoundVolumeInput(event) {
    const raw = Number(event && event.target && event.target.value);
    setKeySoundVolume(raw / 100);
}

function openKeySoundMenu() {
    const menu = document.getElementById('keysound-menu');
    if (!menu) return;
    menu.classList.add('show');
    menu.setAttribute('aria-hidden', 'false');
    updateKeySoundPackMenuUI();
    updateKeySoundVolumeUI();
}

function closeKeySoundMenu() {
    const menu = document.getElementById('keysound-menu');
    if (!menu) return;
    menu.classList.remove('show');
    menu.setAttribute('aria-hidden', 'true');
}

function toggleKeySoundMenu(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const menu = document.getElementById('keysound-menu');
    if (!menu) return;
    if (menu.classList.contains('show')) closeKeySoundMenu();
    else openKeySoundMenu();
}

function selectKeySoundPack(packName, event = null) {
    updateLastPointerPositionFromEvent(event);
    if (!isKeySoundPackUnlocked(packName)) {
        showUnlockShopHintNearCursor('Unlock in the shop!', 2600);
        return;
    }
    hideUnlockShopHint();
    setKeySoundPack(packName);
    keySoundsEnabled = true;
    setKeySoundToggleUI();
    updateKeySoundPackMenuUI();
    try { localStorage.setItem('sampire-key-sounds-enabled', '1'); } catch (e) {}
    closeKeySoundMenu();
}
window.selectKeySoundPack = selectKeySoundPack;

function toggleKeySounds() {
    keySoundsEnabled = !keySoundsEnabled;
    setKeySoundToggleUI();
    try { localStorage.setItem('sampire-key-sounds-enabled', keySoundsEnabled ? '1' : '0'); } catch (e) {}
    closeKeySoundMenu();
}

function resolveKeySoundFilename(key) {
    if (key === 'Backspace') return 'backspace.wav';
    if (key === 'Tab') return 'tab.wav';
    if (key === 'Enter') return 'enter.wav';
    if (key === ' ') return 'space.wav';
    if (key === '[') return '[.wav';
    if (key === ']') return '].wav';
    const lower = (key || '').toLowerCase();
    if (/^[a-z]$/.test(lower)) return `${lower}.wav`;
    return 'a.wav';
}

function getKeySoundBase() {
    return `${KEY_SOUND_BASE_ROOT}/${keySoundPackName}`;
}

function getKeySoundBaseForPack(packName) {
    return `${KEY_SOUND_BASE_ROOT}/${String(packName || '').trim()}`;
}

function getKeyCodeForSoundPack(event, key) {
    // Most downloadable keyboard packs use Linux evdev-style key codes in `defines`.
    const evdevByCode = {
        Backquote: 41,
        Digit1: 2, Digit2: 3, Digit3: 4, Digit4: 5, Digit5: 6,
        Digit6: 7, Digit7: 8, Digit8: 9, Digit9: 10, Digit0: 11,
        Minus: 12, Equal: 13, Backspace: 14,
        Tab: 15,
        KeyQ: 16, KeyW: 17, KeyE: 18, KeyR: 19, KeyT: 20, KeyY: 21,
        KeyU: 22, KeyI: 23, KeyO: 24, KeyP: 25, BracketLeft: 26, BracketRight: 27,
        Enter: 28,
        CapsLock: 58,
        KeyA: 30, KeyS: 31, KeyD: 32, KeyF: 33, KeyG: 34, KeyH: 35, KeyJ: 36, KeyK: 37, KeyL: 38,
        Semicolon: 39, Quote: 40,
        ShiftLeft: 42,
        KeyZ: 44, KeyX: 45, KeyC: 46, KeyV: 47, KeyB: 48, KeyN: 49, KeyM: 50,
        Comma: 51, Period: 52, Slash: 53, ShiftRight: 54,
        Space: 57,
    };
    const code = String(event && event.code || '');
    if (code && Object.prototype.hasOwnProperty.call(evdevByCode, code)) {
        return String(evdevByCode[code]);
    }
    const k = String(key || '');
    const evdevByKey = {
        '`': 41, '1': 2, '2': 3, '3': 4, '4': 5, '5': 6, '6': 7, '7': 8, '8': 9, '9': 10, '0': 11,
        '-': 12, '=': 13, Backspace: 14, Tab: 15, q: 16, w: 17, e: 18, r: 19, t: 20, y: 21, u: 22, i: 23, o: 24, p: 25,
        '[': 26, ']': 27, Enter: 28, a: 30, s: 31, d: 32, f: 33, g: 34, h: 35, j: 36, k: 37, l: 38,
        ';': 39, "'": 40, z: 44, x: 45, c: 46, v: 47, b: 48, n: 49, m: 50, ',': 51, '.': 52, '/': 53, ' ': 57,
    };
    const lower = k.length === 1 ? k.toLowerCase() : k;
    if (Object.prototype.hasOwnProperty.call(evdevByKey, lower)) return String(evdevByKey[lower]);
    if (k === 'CapsLock') return '58';
    if (k === 'Shift') return '42';
    return '';
}

function getOrCreateKeySoundPool(path) {
    if (!keySoundPools.has(path)) {
        keySoundPools.set(path, {
            pool: Array.from({length: KEY_SOUND_POOL_SIZE}, () => {
                const a = new Audio(path);
                a.preload = 'auto';
                a.volume = keySoundVolume;
                return a;
            }),
            i: 0
        });
    }
    return keySoundPools.get(path);
}

function playAudioSpriteSegment(path, startMs, durationMs) {
    const entry = getOrCreateKeySoundPool(path);
    const audio = entry.pool[entry.i];
    entry.i = (entry.i + 1) % KEY_SOUND_POOL_SIZE;
    audio.volume = keySoundVolume;
    if (audio.__spriteStopTimer) clearTimeout(audio.__spriteStopTimer);
    try {
        audio.currentTime = Math.max(0, Number(startMs || 0) / 1000);
    } catch (e) {
        audio.currentTime = 0;
    }
    audio.play().catch(() => {});
    const stopAfter = Math.max(16, Math.floor(Number(durationMs || 0)));
    audio.__spriteStopTimer = setTimeout(() => {
        try { audio.pause(); } catch (e) {}
    }, stopAfter + 16);
}

function resolveConfigBasedKeySoundSpec(key, event) {
    const cfg = keySoundPackConfig;
    if (!cfg || !cfg.defines || typeof cfg.defines !== 'object') return null;
    const keyCode = getKeyCodeForSoundPack(event, key);
    if (!keyCode) return null;
    const define = cfg.defines[keyCode];
    if (define == null) return null;
    if (cfg.key_define_type === 'single') {
        if (!Array.isArray(define) || define.length < 2) return null;
        return {
            type: 'single',
            path: `${getKeySoundBase()}/${String(cfg.sound || 'sound.ogg')}`,
            startMs: Math.max(0, Number(define[0]) || 0),
            durationMs: Math.max(1, Number(define[1]) || 1),
        };
    }
    if (typeof define === 'string' && define.trim()) {
        return { type: 'multi', path: `${getKeySoundBase()}/${define.trim()}` };
    }
    return null;
}

function resolveConfigBasedKeySoundSpecForPack(key, event, cfg, packName) {
    if (!cfg || !cfg.defines || typeof cfg.defines !== 'object') return null;
    const keyCode = getKeyCodeForSoundPack(event, key);
    if (!keyCode) return null;
    const define = cfg.defines[keyCode];
    if (define == null) return null;
    const base = getKeySoundBaseForPack(packName);
    if (cfg.key_define_type === 'single') {
        if (!Array.isArray(define) || define.length < 2) return null;
        return {
            type: 'single',
            path: `${base}/${String(cfg.sound || 'sound.ogg')}`,
            startMs: Math.max(0, Number(define[0]) || 0),
            durationMs: Math.max(1, Number(define[1]) || 1),
        };
    }
    if (typeof define === 'string' && define.trim()) {
        return { type: 'multi', path: `${base}/${define.trim()}` };
    }
    return null;
}

function setKeySoundPack(packName) {
    const safe = String(packName || '').trim();
    if (!safe) return;
    if (!isKeySoundPackUnlocked(safe)) return;
    keySoundPackName = safe;
    keySoundPackConfig = null;
    keySoundPackLoadPromise = null;
    keySoundPackLoadAttempted = false;
    keySoundPools.clear();
    try { localStorage.setItem(KEY_SOUND_PACK_KEY, safe); } catch (e) {}
    loadKeySoundPackConfig();
}
window.setKeySoundPack = setKeySoundPack;

async function loadKeySoundPackConfig() {
    if (keySoundPackLoadPromise) return keySoundPackLoadPromise;
    keySoundPackLoadAttempted = true;
    keySoundPackLoadPromise = (async () => {
        try {
            const out = await fetch(`${getKeySoundBase()}/config.json`, { cache: 'no-store' });
            if (!out.ok) {
                keySoundPackConfig = null;
                return null;
            }
            const cfg = await out.json();
            keySoundPackConfig = {
                key_define_type: String(cfg && cfg.key_define_type || 'multi').toLowerCase(),
                sound: String(cfg && cfg.sound || 'sound.ogg'),
                defines: (cfg && cfg.defines && typeof cfg.defines === 'object' && !Array.isArray(cfg.defines)) ? cfg.defines : {},
            };
            return keySoundPackConfig;
        } catch (e) {
            keySoundPackConfig = null;
            return null;
        }
    })();
    return keySoundPackLoadPromise;
}

async function loadKeySoundPackConfigByName(packName) {
    const safe = String(packName || '').trim();
    if (!safe) return null;
    if (keySoundPackConfigCache.has(safe)) return keySoundPackConfigCache.get(safe);
    try {
        const out = await fetch(`${getKeySoundBaseForPack(safe)}/config.json`, { cache: 'no-store' });
        if (!out.ok) {
            keySoundPackConfigCache.set(safe, null);
            return null;
        }
        const cfg = await out.json();
        const parsed = {
            key_define_type: String(cfg && cfg.key_define_type || 'multi').toLowerCase(),
            sound: String(cfg && cfg.sound || 'sound.ogg'),
            defines: (cfg && cfg.defines && typeof cfg.defines === 'object' && !Array.isArray(cfg.defines)) ? cfg.defines : {},
        };
        keySoundPackConfigCache.set(safe, parsed);
        return parsed;
    } catch (e) {
        keySoundPackConfigCache.set(safe, null);
        return null;
    }
}

function playKeypressSoundForPack(packName, key, event = null, cfgOverride = null) {
    const safePack = String(packName || '').trim();
    if (!safePack) return;
    const cfg = cfgOverride || keySoundPackConfigCache.get(safePack) || null;
    const spec = resolveConfigBasedKeySoundSpecForPack(key, event, cfg, safePack);
    if (spec && spec.type === 'single') {
        playAudioSpriteSegment(spec.path, spec.startMs, spec.durationMs);
        return;
    }
    const path = spec && spec.type === 'multi'
        ? spec.path
        : `${getKeySoundBaseForPack(safePack)}/${resolveKeySoundFilename(key)}`;
    const entry = getOrCreateKeySoundPool(path);
    const audio = entry.pool[entry.i];
    entry.i = (entry.i + 1) % KEY_SOUND_POOL_SIZE;
    audio.volume = keySoundVolume;
    audio.currentTime = 0;
    audio.play().catch(() => {});
}

function handleShopKeySoundPreviewKeydown(event, packName) {
    if (!event) return;
    event.stopPropagation();
    const key = String(event.key || '');
    if (!key) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (key === 'Escape') return;
    if (key === 'Tab') {
        event.preventDefault();
    }
    if (key.length !== 1 && key !== 'Backspace' && key !== 'Enter' && key !== 'Tab' && key !== ' ') return;
    playKeypressSoundForPack(packName, key, event);
    if (!keySoundPackConfigCache.has(String(packName || '').trim())) {
        loadKeySoundPackConfigByName(packName).then((cfg) => {
            if (!cfg) return;
            playKeypressSoundForPack(packName, key, event, cfg);
        });
    }
}

function playKeypressSound(key, event = null) {
    if (!keySoundsEnabled) return;
    if (!keySoundPackLoadAttempted) loadKeySoundPackConfig();
    const spec = resolveConfigBasedKeySoundSpec(key, event);
    if (spec && spec.type === 'single') {
        playAudioSpriteSegment(spec.path, spec.startMs, spec.durationMs);
        return;
    }
    const path = spec && spec.type === 'multi'
        ? spec.path
        : `${getKeySoundBase()}/${resolveKeySoundFilename(key)}`;
    const entry = getOrCreateKeySoundPool(path);
    const audio = entry.pool[entry.i];
    entry.i = (entry.i + 1) % KEY_SOUND_POOL_SIZE;
    audio.volume = keySoundVolume;
    audio.currentTime = 0;
    audio.play().catch(() => {});
}


function retryThemeMusicAfterGesture() {
    if (musicMuted || !musicNeedsUserGesture) return;
    const track = themeMusic[activeMusicTheme] || themeMusic.dark;
    if (track && !track.paused && !track.ended) {
        musicNeedsUserGesture = false;
        return;
    }
    playThemeSoundtrack();
}

// ── Sound Effects ───────────────────────────────────────────────────────────
const SFX = {
    newTest:      new Audio('Sound Effects/New Test.wav'),
    restartTest:  new Audio('Sound Effects/Restart Test.wav'),
    tryAgain:     new Audio('Sound Effects/Try Again.wav'),
    completed:    new Audio('Sound Effects/Test Completed.wav'),
    personalBest: new Audio('Sound Effects/New Personal Best.wav'),
    clearHistory: new Audio('Sound Effects/Clear History.wav'),
    changeMode:   new Audio('Sound Effects/Change Mode.wav'),
    below50:      new Audio('Sound Effects/Below 50 WPM.wav'),
    purchase1:    new Audio('Sound Effects/Purchase 1.mp3'),
    laser:        new Audio('Sound Effects/laser.mp3'),
    ding:         new Audio('Sound Effects/Ding.wav'),
    logon:        new Audio('Sound Effects/Logon.wav'),
};

Object.values(SFX).forEach((audio) => {
    if (!audio) return;
    audio.preload = 'auto';
    try { audio.load(); } catch (e) {}
});

function playSound(audio) {
    audio.currentTime = 0;
    audio.play().catch(() => {}); // silently ignore autoplay policy blocks
}

function playOneShotSound(path, volume = 1) {
    if (!path) return;
    const audio = new Audio(path);
    audio.preload = 'auto';
    audio.volume = Math.max(0, Math.min(1, Number(volume) || 0));
    audio.currentTime = 0;
    audio.play().catch(() => {});
}

function runPersonalBestCelebration() {
    const overlay = document.getElementById('pb-celebration');
    if (!overlay) return;
    overlay.innerHTML = '<div class="pb-banner">New Personal Best!</div>';

    const colors = ['#ff5252', '#ffca28', '#66bb6a', '#42a5f5', '#ab47bc', '#26c6da'];
    const pieces = 42;
    for (let i = 0; i < pieces; i++) {
        const piece = document.createElement('span');
        piece.className = 'pb-confetti';
        piece.style.left = (Math.random() * 100).toFixed(2) + '%';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = (Math.random() * 0.35).toFixed(2) + 's';
        piece.style.animationDuration = (1.2 + Math.random() * 0.9).toFixed(2) + 's';
        piece.style.width = (6 + Math.random() * 5).toFixed(0) + 'px';
        piece.style.height = (8 + Math.random() * 8).toFixed(0) + 'px';
        overlay.appendChild(piece);
    }

    overlay.classList.add('show');
    if (pbFxTimeout) clearTimeout(pbFxTimeout);
    pbFxTimeout = setTimeout(() => {
        overlay.classList.remove('show');
        overlay.innerHTML = '<div class="pb-banner">New Personal Best!</div>';
    }, 2100);
}


// ── Daily Challenges & XP ────────────────────────────────────────────────────
const XP_KEY    = 'sampire-xp';
const LIFETIME_CHALLENGES_KEY = 'sampire-lifetime-challenges-completed';
const DAILY_KEY = 'sampire-daily';
const DAILY_V2_KEY = 'sampire-daily-v2';
const WEEKLY_KEY = 'sampire-weekly';
const WEEKLY_RIVAL_KEY = 'sampire-weekly-rival-target';
const COMMUNITY_WEEKLY_GOAL_KEY = 'sampire-community-weekly-goal';
const COMMUNITY_WEEKLY_CONTRIB_KEY = 'sampire-community-weekly-contrib';
const SKILL_POINTS_KEY = 'sampire-skill-points';
const SKILLS_KEY = 'sampire-skills';
const REWARD_SETTINGS_KEY = 'sampire-reward-settings';
const XP_PER_LEVEL = 500;
const COMMUNITY_FLEET_LEVELS = [
    { id: 'scout', name: 'The Scout', health: 10000 },
    { id: 'fighter', name: 'The Fighter', health: 20000 },
    { id: 'mothership', name: 'The Mothership', health: 30000 },
];
const COMMUNITY_FLEET_TOTAL_HEALTH = COMMUNITY_FLEET_LEVELS.reduce((sum, level) => sum + level.health, 0);
let rivalTargetRefreshInFlight = false;

const CHALLENGES = [
    {
        id: 'nobackspace',
        name: 'No Backspace',
        desc: `Type a 100-word passage with at least ${NO_BACKSPACE_MIN_ACC}% accuracy. Backspace is disabled.`,
        difficulty: 'Medium', diffClass: 'diff-medium',
        xp: 100,
    },
    {
        id: 'sprint',
        name: 'The Sprint',
        desc: '30-second burst — reach 100 WPM.',
        difficulty: 'Hard', diffClass: 'diff-hard',
        xp: 150,
    },
    {
        id: 'perfectionist',
        name: 'The Perfectionist',
        desc: 'Complete a short quote (20–30 words) with zero mistakes. Any error fails immediately.',
        difficulty: 'Expert', diffClass: 'diff-expert',
        xp: 200,
    },
    {
        id: 'daily_quotes_5',
        name: 'The Chronicler',
        desc: 'Complete 5 Quotes Tests.',
        difficulty: 'Easy', diffClass: 'diff-easy',
        xp: 50,
        passive: true,
        target: 5,
        mode: 'quotes',
    },
    {
        id: 'daily_words_5',
        name: 'Neural Link Stabilizer',
        desc: 'Complete 5 Random Words Tests.',
        difficulty: 'Easy', diffClass: 'diff-easy',
        xp: 50,
        passive: true,
        target: 5,
        mode: 'words',
    },
    {
        id: 'daily_words30_5',
        name: 'The Quick-Draw',
        desc: 'Complete 5 Words 30 Seconds Tests.',
        difficulty: 'Easy', diffClass: 'diff-easy',
        xp: 50,
        passive: true,
        target: 5,
        mode: 'words30',
    },
];

const WEEKLY_CHALLENGES = [
    {
        id: 'marathon',
        name: 'The Marathon',
        desc: 'Accumulate a total of 10,000 typed words over the course of the week.',
        difficulty: 'Hard', diffClass: 'diff-hard',
        xp: 250,
    },
    {
        id: 'consistent_climber',
        name: 'Consistent Climber',
        desc: 'Maintain a WPM within 5% of your personal best for 10 consecutive tests.',
        difficulty: 'Expert', diffClass: 'diff-expert',
        xp: 300,
    },
    {
        id: 'rival_week',
        name: 'Rival Week',
        desc: 'Beat the median community WPM score from the previous week.',
        difficulty: 'Hard', diffClass: 'diff-hard',
        xp: 300,
    },
    {
        id: 'above_average',
        name: 'Above Average',
        desc: 'Score at least 5% above your average WPM in 5 tests this week.',
        difficulty: 'Hard', diffClass: 'diff-hard',
        xp: 250,
    },
];

let activeChallengeId   = null;
let returnToDailyAfterResult = false;
