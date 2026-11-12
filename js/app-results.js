// ── Results screen ───────────────────────────────────────────────────────────
// One accessor for the finished run's numbers (uses window.getRunStats() from the engine
// when it exists), the counted-run rule, rewards, and the results card.

const RESULT_MODE_LABELS = { quotes: 'Quotes', words: 'Random words', words30: 'Timed', adaptive: 'Weak-key drill', community: 'Bonus round', daily: 'Challenge' };
let lastResultSlowKeys = [];
let lastResultCtaAction = null;

// Accepts the engine's getRunStats() shape or the local one; anything missing is filled from the globals.
function normalizeRunStats(s) {
    const n = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const has = (v) => v !== undefined && v !== null;
    const sampleValues = wpmSamples.map(x => x.wpm).filter(v => v > 0);
    const typedAttempt = has(s.typedAttempt) ? String(s.typedAttempt) : typedChars.slice(0, currentIndex).join('').trim();
    return {
        elapsed: n(s.elapsed), wpm: Math.round(n(s.wpm)), rawWpm: Math.round(n(s.rawWpm)), accuracy: Math.round(n(s.accuracy)),
        consistency: Math.round(n(s.consistency, 100)), time: Math.round(n(s.time, n(s.elapsed))),
        correctChars: n(s.correctChars),
        incorrectChars: has(s.uncorrected) ? n(s.uncorrected) : n(s.incorrectChars),
        totalChars: has(s.totalChars) ? n(s.totalChars) : (isTimedMode() ? currentIndex : currentQuote.length),
        keyStrokes: has(s.keystrokes) ? n(s.keystrokes) : n(s.keyStrokes), backspaces: n(s.backspaces), mistakes: n(s.mistakes),
        typedWords: n(s.typedWords), correctWords: has(s.correctWords) ? n(s.correctWords) : countCorrectWords(currentQuote, typedChars, currentIndex),
        peakWpm: Math.round(has(s.peakWpm) ? n(s.peakWpm) : (sampleValues.length ? Math.max(...sampleValues) : n(s.wpm))),
        avgWpm: Math.round(has(s.avgWpm) ? n(s.avgWpm) : averageOfSeries(Array.isArray(s.burstSeries) && s.burstSeries.length ? s.burstSeries : sampleValues.map(v => ({ wpm: v })), n(s.wpm))),
        typedAttempt, timeline: Array.isArray(s.timeline) ? s.timeline : [],
    };
}

function averageOfSeries(series, fallback) {
    const vals = series.map(x => Number(x && x.wpm)).filter(v => Number.isFinite(v) && v > 0);
    return vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : fallback;
}

// Words fully typed with every letter right.
function countCorrectWords(quote, typed, upTo) {
    let correct = 0;
    let i = 0;
    const len = String(quote).length;
    while (i < len) {
        while (i < len && quote[i] === ' ') i++;
        const start = i;
        while (i < len && quote[i] !== ' ') i++;
        if (i > start && i <= upTo) {
            let ok = true;
            for (let k = start; k < i; k++) { if (typed[k] !== quote[k]) { ok = false; break; } }
            if (ok) correct++;
        }
    }
    return correct;
}

function collectRunStats(capturedElapsed) {
    if (typeof window.getRunStats === 'function') {
        try {
            const s = window.getRunStats(capturedElapsed);
            if (s && typeof s === 'object' && Number.isFinite(Number(s.wpm))) return normalizeRunStats(s);
        } catch (e) { console.warn('getRunStats failed, computing locally', e); }
    }
    const elapsedRaw = capturedElapsed != null ? capturedElapsed : getElapsed();
    const elapsed = isTimedMode() ? Math.min(elapsedRaw, RANDOM_WORDS_DURATION) : elapsedRaw;
    let correctChars = 0;
    for (let i = 0; i < currentIndex; i++) if (typedChars[i] === currentQuote[i]) correctChars++;
    const incorrectChars = Math.max(0, currentIndex - correctChars);
    const sampleValues = wpmSamples.map(s => s.wpm).filter(v => v > 0);
    const wpm = getWPM(elapsed);
    const typedAttempt = typedChars.slice(0, currentIndex).join('').trim();
    const typedWords = typedAttempt ? (typedAttempt.match(/\S+/g) || []).length : 0;
    const timeline = attemptTimeline.length > 0
        ? attemptTimeline.map(p => ({ t: p.t, index: p.index }))
        : [{ t: 0, index: 0 }, { t: Math.max(elapsed, 0.1), index: currentIndex }];
    return normalizeRunStats({
        elapsed, wpm, rawWpm: getRawWPM(elapsed), accuracy: getAccuracy() ?? 0, consistency: getConsistency(), time: Math.round(elapsed),
        correctChars, incorrectChars, totalChars: isTimedMode() ? currentIndex : currentQuote.length,
        keyStrokes, backspaces, mistakes: mistakeCount, typedWords, correctWords: countCorrectWords(currentQuote, typedChars, currentIndex),
        peakWpm: sampleValues.length ? Math.max(...sampleValues) : wpm,
        avgWpm: sampleValues.length ? sampleValues.reduce((a, v) => a + v, 0) / sampleValues.length : wpm,
        typedAttempt, timeline,
    });
}

// Counted: accuracy 50% or better and at least 10 words typed right. Ranked: a believable speed.
function isRunCounted(s) { return s.accuracy >= 50 && s.correctWords >= 10; }
function isRunPlausible(s) {
    if (s.wpm > 300) return false;
    if (!(s.time > 0)) return s.wpm <= 10;
    return s.wpm <= (s.typedWords / (s.time / 60)) * 2.5 + 10;
}

function getResultModeLabel() {
    if (activeChallengeId === 'nobackspace') return 'No backspace challenge';
    if (activeChallengeId) return `Challenge: ${String(activeChallengeId).replace(/_/g, ' ')}`;
    if (currentMode === 'quotes' && bibleModeEnabled) return 'Bible verses';
    return RESULT_MODE_LABELS[currentMode] || String(currentMode || 'Run');
}

function setResultText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// Counts the big WPM number up over about a third of a second, starting from a quarter of the value
// so the number is never zero while it moves. Only the orb animates; other numbers are set at once.
function tickUpNumber(el, target, suffix = '') {
    if (!el) return;
    const end = Number(target) || 0;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || end < 4) { el.textContent = `${end}${suffix}`; return; }
    const from = Math.max(1, Math.round(end * 0.25));
    el.textContent = `${from}${suffix}`;
    const start = performance.now();
    const dur = 350;
    const step = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = `${Math.round(from + (end - from) * eased)}${suffix}`;
        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

function renderResultRewards(rewards, counted, notCountedReason) {
    const host = document.getElementById('result-rewards');
    if (!host) return;
    if (!counted) {
        host.innerHTML = `<div class="result-rewards-title">Rewards this run</div><div class="result-not-counted" id="result-not-counted">${escapeHtml(notCountedReason)}</div>`;
        return;
    }
    host.innerHTML = `<div class="result-rewards-title">Rewards this run</div><ul class="result-rewards-list" id="result-rewards-list">${rewards.map(r => `<li class="reward-${escapeHtml(r.kind)}">${escapeHtml(r.text)}</li>`).join('')}</ul>`;
}

function renderResultGoals() {
    const host = document.getElementById('result-goals');
    if (!host) return;
    const quests = getTodaysDailyQuests();
    host.innerHTML = `<div class="result-goals-title">Today's goals</div><div class="result-goals-rows">${quests.map(q => renderQuestRow(q, getQuestStatus(q), { compact: true })).join('')}</div>`;
}

function renderResultCta() {
    const primary = document.getElementById('result-cta-btn');
    if (!primary) return;
    const nearest = getNearestIncompleteQuest();
    if (nearest) {
        primary.textContent = nearest.text;
        lastResultCtaAction = nearest.action;
        primary.style.display = '';
    } else {
        primary.textContent = 'All goals done today. One more run for XP?';
        lastResultCtaAction = () => startQuestMode();
        primary.style.display = '';
    }
}

function runResultCta() {
    if (typeof lastResultCtaAction === 'function') lastResultCtaAction();
    else startQuestMode();
}
window.runResultCta = runResultCta;

// Starts a one-minute Weak keys drill built around the slow keys from this run.
function startDrillFromResults() {
    const keys = lastResultSlowKeys.slice();
    try {
        if (window.AdaptivePractice && typeof AdaptivePractice.setFocusKeys === 'function') AdaptivePractice.setFocusKeys(keys);
    } catch (e) {}
    window.adaptiveFocusKeys = keys;
    closeResults();
    setMode('adaptive');
}
window.startDrillFromResults = startDrillFromResults;

function computeSlowKeysForRun(quote, typed, timeline) {
    try {
        const internal = window.RunAnalysis && RunAnalysis._internal;
        if (!internal) return [];
        const keyData = internal.computeKeyStats(quote, typed, timeline);
        if (window.AdaptivePractice) {
            const heat = AdaptivePractice.getKeyHeatmap();
            Object.keys(heat || {}).forEach(c => { if (/^[a-zA-Z]$/.test(c)) keyData[c.toLowerCase()] = heat[c]; });
        }
        return internal.slowestLetters(keyData, 3).map(x => (typeof x === 'string' ? x : (x && (x.c || x.id)) || '')).filter(Boolean);
    } catch (e) { return []; }
}

function announceResult(text) {
    const live = document.getElementById('result-announce');
    if (!live) return;
    live.textContent = '';
    setTimeout(() => { live.textContent = text; }, 50);
}

function openResultsOverlay() {
    if (typeof openModal === 'function') openModal(resultOverlay);
    else resultOverlay.classList.add('show');
    const cta = document.getElementById('result-cta-btn');
    if (cta) { try { cta.focus({ preventScroll: true }); } catch (e) {} }
    const card = resultOverlay.querySelector('.result-card');
    if (card) card.scrollTop = 0;
}

function showResults(capturedElapsed) {
    resultsPendingOpen = false;
    clearInterval(timerHandle);
    timerHandle = null;
    clearMiningLaserOverlay();

    const s = collectRunStats(capturedElapsed);
    const { wpm, rawWpm, accuracy, consistency, time } = s;
    const completedAttempt = typedChars.slice(0, currentIndex);
    const completedKey = getTestKey();
    const completedTimeline = s.timeline.length ? s.timeline : [{ t: 0, index: 0 }, { t: Math.max(s.elapsed, 0.1), index: currentIndex }];
    lastAttemptByTest.set(completedKey, completedAttempt);
    lastTimelineByTest.set(completedKey, completedTimeline);
    if (lastAttemptByTest.size > 50) {
        const oldest = lastAttemptByTest.keys().next().value;
        lastAttemptByTest.delete(oldest);
        lastTimelineByTest.delete(oldest);
    }
    lastCompletedTestKey = completedKey;
    lastCompletedAttempt = completedAttempt.slice();
    lastCompletedTimeline = completedTimeline.map(p => ({ t: p.t, index: p.index }));

    const counted = isRunCounted(s);
    const ranked = counted && isRunPlausible(s);
    const notCountedReason = !counted
        ? 'Not counted (accuracy under 50% or fewer than 10 words)'
        : (!ranked ? 'Unranked: this speed could not be verified, so it stays off the leaderboard and your bests.' : '');
    const modeLabel = getResultModeLabel();

    // Bests before this run is recorded.
    const prevHistory = loadHistory();
    const lifetimeBefore = getLifetimeStatsSummary();
    const prevBest = Math.max(lifetimeBefore.bestWpm, ...prevHistory.map(h => Number(h.wpm) || 0), 0);
    const prevBestForMode = prevHistory.filter(h => h.mode === currentMode).reduce((best, h) => Math.max(best, Number(h.wpm) || 0), 0);
    const isPB = ranked && prevBest > 0 && wpm > prevBest;
    const isModePB = ranked && (prevBestForMode > 0 ? wpm > prevBestForMode : prevBest > 0);
    const isFirstRun = counted && prevBest <= 0;
    const isSessionPB = ranked && wpm > sessionBestWpm;
    if (isSessionPB) sessionBestWpm = wpm;
    const avgBefore = getSevenDayAverageWpm();
    const levelBefore = getLevel(getTotalXP());
    const crystalsBefore = getSkillPoints();

    // Numbers first.
    setResultText('result-mode-label', modeLabel);
    tickUpNumber(document.getElementById('final-wpm'), wpm);
    setResultText('final-accuracy', `${accuracy}%`);
    setResultText('final-time', `${time}s`);
    setResultText('final-raw-wpm', String(rawWpm));
    setResultText('final-consistency', `${consistency}%`);
    setResultText('final-mistakes', String(s.mistakes));
    setResultText('final-error-rate', `${s.incorrectChars} (${currentIndex > 0 ? Math.round((s.incorrectChars / currentIndex) * 100) : 0}%)`);
    setResultText('final-keystrokes', `${s.keyStrokes} (${s.backspaces} backspaces)`);
    setResultText('final-characters', `${s.correctChars} / ${s.incorrectChars} / ${s.totalChars}`);
    setResultText('final-test-type', modeLabel);
    setResultText('final-peak-wpm', String(s.peakWpm));
    setResultText('final-avg-wpm', String(s.avgWpm));

    if (window.AdaptivePractice) AdaptivePractice.commitRun();
    lastResultSlowKeys = computeSlowKeysForRun(currentQuote, completedAttempt, completedTimeline);
    const drillBtn = document.getElementById('result-drill-btn');
    if (drillBtn) {
        drillBtn.style.display = lastResultSlowKeys.length ? '' : 'none';
        drillBtn.textContent = lastResultSlowKeys.length ? `Drill these keys (1 min): ${lastResultSlowKeys.join(', ')}` : 'Drill these keys (1 min)';
    }
    if (window.RunAnalysis) {
        try {
            try { if (localStorage.getItem('sampire-run-analysis-open') === null) localStorage.setItem('sampire-run-analysis-open', '1'); } catch (e) {}
            RunAnalysis.render(document.getElementById('run-analysis-container'), {
                quote: currentQuote,
                typedChars: completedAttempt,
                timeline: completedTimeline,
                wpmSamples,
                keyHeatmap: window.AdaptivePractice ? AdaptivePractice.getKeyHeatmap() : undefined,
            });
        } catch (err) { console.warn('Run analysis failed', err); }
    }

    const rank = getPopulationRank(wpm);
    setResultText('rank-label', `Faster than about ${rank.percentile}% of people`);
    setResultText('rank-caption', rank.tier);
    setTimeout(() => {
        const bar = document.getElementById('rank-bar');
        const marker = document.getElementById('rank-marker');
        if (bar) bar.style.width = rank.percentile + '%';
        if (marker) marker.style.left = rank.percentile + '%';
    }, 100);

    // ── Record the run and pay rewards ──
    const rewards = [];
    let xpEarned = 0;
    let questCompletions = [];
    let newBadges = [];
    let multiplier = 1;
    const scoreEntry = {
        wpm, rawWpm, consistency, accuracy, time,
        mode: currentMode,
        bibleMode: currentMode === 'quotes' && bibleModeEnabled,
        text: currentQuote,
        date: Date.now(),
        typedWords: s.typedWords,
        typedChars: s.correctChars, // the count the WPM was computed from (five per word)
        keystrokes: s.keyStrokes,
        mistakes: s.mistakes,
        backspaces: s.backspaces,
    };
    let weeklyFacts = null;
    if (counted) {
        const streakInfo = updateStreak();
        multiplier = getXPMultiplier();
        recordLifetimeRunStats({ wpm: ranked ? wpm : 0, typedWords: s.typedWords, timeSeconds: time, bibleMode: scoreEntry.bibleMode === true });
        if (ranked) saveToHistory(scoreEntry);
        weeklyFacts = recordCountedRun({ wpm: ranked ? wpm : 0, accuracy, mode: currentMode, typedWords: s.typedWords });
        const communityDamage = computeCommunityDamage(s.typedWords, s.typedAttempt, currentQuote);
        addCommunityWeeklyWords(communityDamage);
        submitCommunityContribution(communityDamage);
        renderHistory();

        xpEarned = computeRunXP({ wpm: ranked ? wpm : 0, accuracy, isPB, isModePB, multiplier });
        addXP(xpEarned);
        rewards.push({ kind: 'xp', text: `+${xpEarned} XP for this run${multiplier > 1 ? ` (${formatMultiplier(multiplier)} streak bonus)` : ''}` });
        if (streakInfo.isNewDay) rewards.push({ kind: 'streak', text: streakInfo.freezeUsed ? `Streak freeze used. Day ${streakInfo.streak} of your streak.` : `Day ${streakInfo.streak} of your played streak` });

        // Active challenge (No backspace) pass or fail.
        if (activeChallengeId) {
            const cid = activeChallengeId;
            activeChallengeId = null;
            returnToDailyAfterResult = true;
            const def = findQuestDef(cid);
            let passed = false;
            if (cid === 'nobackspace') passed = accuracy >= NO_BACKSPACE_MIN_ACC;
            else if (cid === 'perfectionist') passed = s.mistakes === 0;
            else if (cid === 'sprint') passed = wpm >= 100;
            const already = getDailyCompletions().includes(cid);
            if (passed && def && !already) {
                markChallengeComplete(cid);
                const xp = Math.round(def.xp * multiplier);
                addXP(xp);
                questCompletions.push({ id: cid, name: def.name, xpGained: xp, weekly: false });
            }
            const banner = document.getElementById('challenge-result-banner');
            if (banner) {
                banner.style.display = 'flex';
                banner.className = `challenge-banner ${passed ? 'pass' : 'fail'}`;
                banner.textContent = passed
                    ? (already ? `${def ? def.name : cid}: passed again (already earned today)` : `${def ? def.name : cid}: passed`)
                    : `${def ? def.name : cid}: not passed. ${cid === 'nobackspace' ? `${accuracy}% accuracy (need ${NO_BACKSPACE_MIN_ACC}%)` : ''}`;
            }
        } else {
            returnToDailyAfterResult = false;
            const banner = document.getElementById('challenge-result-banner');
            if (banner) { banner.style.display = 'none'; banner.textContent = ''; }
        }

        questCompletions = questCompletions.concat(completeEligibleQuests(multiplier));
        for (const q of questCompletions) rewards.push({ kind: 'quest', text: `${q.weekly ? 'Weekly quest' : 'Quest'} done: ${q.name} +${q.xpGained} XP` });
        newBadges = checkBadges({ wpm, accuracy }, multiplier);
        for (const id of newBadges) {
            const def = BADGE_DEFS.find(b => b.id === id);
            rewards.push({ kind: 'badge', text: `Badge earned: ${def ? def.name : id} +${lastBadgeXpById[id] || BADGE_XP} XP` });
        }
        const crystalsAfter = getSkillPoints();
        const crystalGain = crystalsAfter - crystalsBefore;
        if (crystalGain > 0) rewards.push({ kind: 'crystal', text: `+${crystalGain} crystal${crystalGain === 1 ? '' : 's'} (${getLevel(getTotalXP()) > levelBefore ? 'level up' : `every ${CRYSTALS_PER_WORDS} words typed`})` });
        const levelAfter = getLevel(getTotalXP());
        if (levelAfter > levelBefore) rewards.push({ kind: 'level', text: `Level ${levelAfter}: ${getLevelName(levelAfter)}` });
    } else {
        if (activeChallengeId) { activeChallengeId = null; returnToDailyAfterResult = true; }
        else returnToDailyAfterResult = false;
        const banner = document.getElementById('challenge-result-banner');
        if (banner) { banner.style.display = 'none'; banner.textContent = ''; }
    }
    showNewBadges(newBadges);
    renderResultRewards(rewards, counted, notCountedReason);
    if (!counted) {
        const nc = document.getElementById('result-not-counted');
        if (nc) nc.textContent = notCountedReason;
    } else if (!ranked) {
        const host = document.getElementById('result-rewards');
        if (host) host.insertAdjacentHTML('beforeend', `<div class="result-not-counted" id="result-not-counted">${escapeHtml(notCountedReason)}</div>`);
    }
    renderResultGoals();
    renderResultCta();
    renderGoalsStrip();
    updateXPDisplay();
    if (xpEarned > 0) animateXpGain(xpEarned);

    // Title, subtitle and PB banners.
    const titleEl = document.getElementById('result-title');
    let subtitle;
    if (!counted) subtitle = `${wpm} WPM. ${notCountedReason}.`;
    else if (!ranked) subtitle = `${wpm} WPM, unranked. Words and quests still count.`;
    else if (isPB) subtitle = `New best! ${wpm} WPM, ${wpm - prevBest} above your old best of ${prevBest}.`;
    else if (isFirstRun) subtitle = `Your first counted run: ${wpm} WPM. Your average starts here.`;
    else if (avgBefore > 0) {
        const diff = wpm - Math.round(avgBefore);
        subtitle = diff === 0 ? `${wpm} WPM, right on your average.` : `${wpm} WPM, ${Math.abs(diff)} ${diff > 0 ? 'above' : 'below'} your average.`;
    } else subtitle = `${wpm} WPM.`;
    setResultText('result-subtitle', subtitle);
    if (titleEl) titleEl.textContent = !counted ? 'Run finished' : (isPB ? 'New personal best' : 'Run finished');
    const pbBanner = document.getElementById('result-pb-banner');
    if (pbBanner) {
        if (isPB) { pbBanner.className = 'result-pb-banner all-time'; pbBanner.textContent = `New all-time best: ${wpm} WPM`; pbBanner.style.display = ''; }
        else if (isModePB && prevBestForMode > 0) { pbBanner.className = 'result-pb-banner mode'; pbBanner.textContent = `New best in ${modeLabel}: ${wpm} WPM (was ${prevBestForMode})`; pbBanner.style.display = ''; }
        else { pbBanner.style.display = 'none'; pbBanner.textContent = ''; }
    }
    const weekWords = getWeeklyWordTotal();
    setResultText('result-week-words', counted ? `Your words this week: ${weekWords.toLocaleString()}` : '');

    // Sound.
    if (isPB) { playSound(SFX.personalBest); runPersonalBestCelebration(); }
    else if (wpm < 50) playSound(SFX.below50);
    else playSound(SFX.completed);
    drawResultChart();

    // Hand-off for other code (share card, friends, leaderboard).
    window.lastRunSummary = {
        wpm, rawWpm, accuracy, consistency, time, mode: currentMode, modeLabel, date: scoreEntry.date,
        isPB, isModePB, counted, ranked, xpEarned, typedWords: s.typedWords, text: currentQuote,
        typedChars: s.correctChars, keystrokes: s.keyStrokes, mistakes: s.mistakes, backspaces: s.backspaces,
        rewards: rewards.map(r => r.text), questCompletions, newBadges,
    };
    try { document.dispatchEvent(new CustomEvent('typemine:run-finished', { detail: window.lastRunSummary })); } catch (e) {}

    openResultsOverlay();
    announceResult(`Run finished. ${wpm} words per minute, ${accuracy} percent accuracy, ${time} seconds. ${counted ? `${xpEarned} XP earned.` : notCountedReason}`);

    const levelAfter = getLevel(getTotalXP());
    if (counted && levelAfter > levelBefore) showLevelUpOverlay({ level: levelAfter, prevLevel: levelBefore });
    const recap = takePendingWeeklyRecap();
    if (recap) showWeeklyRecap(recap);

    // Leaderboard: logged-in players send mode bests and weekly mode bests; weak-key drills stay private.
    if (ranked && currentUser && currentMode !== 'adaptive' && (isModePB || (weeklyFacts && weeklyFacts.isWeeklyModeBest))) {
        saveScoreToCloud(scoreEntry).then(result => {
            if (!result.ok && !/best run/i.test(String(result.error || ''))) {
                setAuthNote(`Cloud save failed: ${result.error || 'please try again.'}`, true);
            } else if (result.ok && result.flagged) {
                showUiMessage('Under review: this run was saved but is being checked before it goes on the leaderboard.', 'info', 3200, 'top-left');
            } else if (result.ok && result.ranked === false) {
                showUiMessage('Unranked: this run was saved but does not go on the leaderboard.', 'info', 3000, 'top-left');
            }
        });
    } else if (ranked && !currentUser && isSessionPB && wpm >= 100) {
        saveGuestScoreToLeaderboard(scoreEntry, isSessionPB);
    }
}

// Keyboard inside the results dialog: Space = new text, Tab = try again, Escape = close.
(function wireResultsOverlay() {
    if (!resultOverlay) return;
    resultOverlay.addEventListener('keydown', (e) => {
        if (!resultOverlay.classList.contains('show')) return;
        const tag = (e.target && e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); newTest(); }
        else if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); tryAgain(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeResults(); }
    });
    // Other code closes the overlay by removing "show"; keep the modal stack and focus in step.
    try {
        new MutationObserver(() => {
            if (!resultOverlay.classList.contains('show') && typeof activeModalEl !== 'undefined' && activeModalEl === resultOverlay) closeModal(resultOverlay);
        }).observe(resultOverlay, { attributes: true, attributeFilter: ['class'] });
    } catch (e) {}
})();

// ── Input handling ─────────────────────────────────────────────────────────
// Finish a timed test once the limit is reached. Returns true if the limit was hit.
function finishTimedOverrun() {
    if (!(startTime && isTimedMode() && getElapsed() >= RANDOM_WORDS_DURATION)) return false;
    if (!isComplete) {
        isComplete = true;
        resultsPendingOpen = true;
        clearInterval(timerHandle);
        timerHandle = null;
        timerEl.textContent = '0s';
        showResults();
    }
    return true;
}
