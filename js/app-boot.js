// ── Boot: runs after every other app-*.js file has been parsed ──
// ── Boot ───────────────────────────────────────────────────────────────────
snapshotCriticalStorageOnce();
const storedMusicMuted = localStorage.getItem('sampire-music-muted');
musicMuted = storedMusicMuted === null ? false : storedMusicMuted === '1';
setMusicVolume(localStorage.getItem(MUSIC_VOLUME_KEY));
const storedActiveSoundscape = localStorage.getItem('sampire-active-soundscape');
activeMusicTheme = (storedActiveSoundscape === 'universe' && isRewardActive('soundscapes')) ? 'universe' : 'dark';
updateMusicToggleUi();
updateMusicMenuUI();
const storedKeySoundsEnabled = localStorage.getItem('sampire-key-sounds-enabled');
keySoundsEnabled = storedKeySoundsEnabled === null ? true : storedKeySoundsEnabled === '1';
setKeySoundVolume(localStorage.getItem(KEY_SOUND_VOLUME_KEY));
const storedBibleMode = localStorage.getItem(BIBLE_MODE_KEY);
bibleModeEnabled = storedBibleMode === '1';
const storedKeySoundPack = localStorage.getItem(KEY_SOUND_PACK_KEY);
keySoundPackName = storedKeySoundPack ? String(storedKeySoundPack) : KEY_SOUND_DEFAULT_PACK;
if (!isKeySoundPackUnlocked(keySoundPackName)) {
    keySoundPackName = KEY_SOUND_DEFAULT_PACK;
    try { localStorage.setItem(KEY_SOUND_PACK_KEY, keySoundPackName); } catch (e) {}
}
loadKeySoundPackConfig();
setKeySoundToggleUI();
updateKeySoundPackMenuUI();
updateBibleModeUi();
if (!musicMuted) playThemeSoundtrack();

document.addEventListener('pointerdown', retryThemeMusicAfterGesture, { passive: true });
document.addEventListener('keydown', retryThemeMusicAfterGesture);
window.addEventListener('focus', retryThemeMusicAfterGesture);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) retryThemeMusicAfterGesture();
    if (document.hidden) flushProgressSyncNow();
});
window.addEventListener('pagehide', () => {
    flushProgressSyncNow();
});
window.addEventListener('scroll', updateScrollHeaderState, { passive: true });
updateScrollHeaderState();

bindAuthInputEvents();
setupLeaderboardHoverHandlers();
setupPwaInstallPrompt();
loadGhostCursorPreference();
loadMiningVisualsPreference();
loadMiningLaserSoundPreference();
updateGhostToggleButton();
updateMiningFxToggleButton();
updateSectorMapButtonVisibility();
initializeEntrySplash();
renderHistory();
newTest();
sfxReady = true; // enable sounds after initial load
updateAuthUi();
updateXPDisplay();
restoreSession().then(() => {
    refreshLeaderboard();
    if (currentUser) refreshCloudProgress();
    if (!currentUser) void resolveGuestLocation();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}
