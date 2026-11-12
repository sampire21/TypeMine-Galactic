function showResults(capturedElapsed) {
    resultsPendingOpen = false;
    clearInterval(timerHandle);
    timerHandle = null;
    clearMiningLaserOverlay();

    const elapsedRaw = capturedElapsed != null ? capturedElapsed : getElapsed();
    const elapsed  = isTimedMode() ? Math.min(elapsedRaw, RANDOM_WORDS_DURATION) : elapsedRaw;
    const wpm      = getWPM(elapsed);
    const rawWpm   = getRawWPM(elapsed);
    const accuracy = getAccuracy() ?? 0;
    const consistency = getConsistency();
    const time     = Math.round(elapsed);
    let correctChars = 0;
    for (let i = 0; i < currentIndex; i++) {
        if (typedChars[i] === currentQuote[i]) correctChars++;
    }
    const incorrectChars = Math.max(0, currentIndex - correctChars);
    const totalCharsForDisplay = isTimedMode() ? currentIndex : currentQuote.length;
    const sampleValues = wpmSamples.map(s => s.wpm).filter(v => v > 0);
    const peakWpm = sampleValues.length > 0 ? Math.max(...sampleValues) : wpm;
    const avgWpm = sampleValues.length > 0
        ? Math.round(sampleValues.reduce((acc, v) => acc + v, 0) / sampleValues.length)
        : wpm;
    const errorRate = currentIndex > 0 ? Math.round((incorrectChars / currentIndex) * 100) : 0;
    const completedAttempt = typedChars.slice(0, currentIndex);
    const completedKey = getTestKey();
    const completedTimeline = attemptTimeline.length > 0
        ? attemptTimeline.map(p => ({ t: p.t, index: p.index }))
        : [{ t: 0, index: 0 }, { t: Math.max(elapsed, 0.1), index: currentIndex }];
    lastAttemptByTest.set(completedKey, completedAttempt);
    lastTimelineByTest.set(completedKey, completedTimeline);
    // Cap ghost Maps to prevent unbounded memory growth from random-word tests
    if (lastAttemptByTest.size > 50) {
        const oldest = lastAttemptByTest.keys().next().value;
        lastAttemptByTest.delete(oldest);
        lastTimelineByTest.delete(oldest);
    }
    lastCompletedTestKey = completedKey;
    lastCompletedAttempt = completedAttempt.slice();
    lastCompletedTimeline = completedTimeline.map(p => ({ t: p.t, index: p.index }));

    let subtitle = 'Test complete';
    if      (wpm >= 100) subtitle = 'Incredible speed!';
    else if (wpm >= 80)  subtitle = 'Outstanding!';
    else if (wpm >= 60)  subtitle = 'Great job!';
    else if (wpm >= 50)  subtitle = 'Nice work!';
    else                 subtitle = 'Not bad! Keep practicing to improve your speed.';

    document.getElementById('result-subtitle').textContent = subtitle;
    document.getElementById('final-wpm').textContent       = wpm;
    document.getElementById('final-accuracy').textContent  = accuracy + '%';
    document.getElementById('final-time').textContent      = time + 's';
    document.getElementById('final-raw-wpm').textContent   = rawWpm;
    document.getElementById('final-consistency').textContent = consistency + '%';
    document.getElementById('final-mistakes').textContent  = mistakeCount;
    document.getElementById('final-keystrokes').textContent = `${keyStrokes} (+${backspaces} bksp)`;
    document.getElementById('final-characters').textContent = `${correctChars}/${incorrectChars}/${totalCharsForDisplay}`;
    document.getElementById('final-test-type').textContent = getModeLabel();
    document.getElementById('final-peak-wpm').textContent = peakWpm;
    document.getElementById('final-avg-wpm').textContent = avgWpm;
    document.getElementById('final-error-rate').textContent = errorRate + '%';
    if (window.AdaptivePractice) AdaptivePractice.commitRun();
    if (window.RunAnalysis) {
        try {
            RunAnalysis.render(document.getElementById('run-analysis-container'), {
                quote: currentQuote,
                typedChars: typedChars.slice(0, currentIndex),
                timeline: completedTimeline,
                wpmSamples,
                keyHeatmap: window.AdaptivePractice ? AdaptivePractice.getKeyHeatmap() : undefined,
            });
        } catch (err) { console.warn('Run analysis failed', err); }
    }

    const rank = getPopulationRank(wpm);
    document.getElementById('rank-label').textContent   = `Faster than ~${rank.percentile}% of the population`;
    document.getElementById('rank-caption').textContent = rank.tier;
    setTimeout(() => {
        document.getElementById('rank-bar').style.width   = rank.percentile + '%';
        document.getElementById('rank-marker').style.left = rank.percentile + '%';
    }, 100);

    // Snapshot tracked challenge progress before this result is recorded.
    const progressBefore = {
        dailyQuotes: getDailyModeCount('quotes'),
        dailyWords: getDailyModeCount('words'),
        dailyWords30: getDailyModeCount('words30'),
        weeklyWords: getWeeklyWordTotal(),
        weeklyClimber: getWeeklyConsistentClimberStreak(),
        weeklyAboveAvg: getWeeklyAboveAverageCount(),
        communityWords: getCommunityWeeklyGoalState().words,
    };

    // Check for personal best BEFORE saving (so comparison is against previous bests)
    const prevHistory = loadHistory();
    const prevBest    = prevHistory.length > 0 ? Math.max(...prevHistory.map(h => h.wpm)) : 0;
    const prevBestForMode = prevHistory.filter(h => h.mode === currentMode).reduce((best, h) => Math.max(best, h.wpm), 0);
    const isModePB = wpm > prevBestForMode;
    const isSessionPB = wpm > sessionBestWpm;
    if (isSessionPB) sessionBestWpm = wpm;

    // Save to local history. Best-per-mode runs auto-submit when logged in.
    const typedAttempt = typedChars.slice(0, currentIndex).join('').trim();
    const typedWordTokens = typedAttempt ? (typedAttempt.match(/\S+/g) || []) : [];
    const typedWords = typedWordTokens.length;
    const communityDamage = computeCommunityDamage(typedWords, typedAttempt, currentQuote);
    const scoreEntry = {
        wpm,
        rawWpm,
        consistency,
        accuracy,
        time,
        mode: currentMode,
        bibleMode: currentMode === 'quotes' && bibleModeEnabled,
        text: currentQuote,
        date: Date.now(),
        typedWords
    };
    recordLifetimeRunStats({
        wpm,
        typedWords,
        timeSeconds: time,
        bibleMode: scoreEntry.bibleMode === true,
    });
    saveToHistory(scoreEntry);
    addCommunityWeeklyWords(communityDamage);
    submitCommunityContribution(communityDamage);
    renderHistory();
    const passiveDailyCompletions = completePassiveDailyChallengesIfEligible();
    const passiveWeeklyCompletions = completePassiveWeeklyChallengesIfEligible();
    const progressAfter = {
        dailyQuotes: getDailyModeCount('quotes'),
        dailyWords: getDailyModeCount('words'),
        dailyWords30: getDailyModeCount('words30'),
        weeklyWords: getWeeklyWordTotal(),
        weeklyClimber: getWeeklyConsistentClimberStreak(),
        weeklyAboveAvg: getWeeklyAboveAverageCount(),
        communityWords: getCommunityWeeklyGoalState().words,
    };
    const progressIncreases = [];
    if (progressAfter.dailyQuotes > progressBefore.dailyQuotes) {
        const gain = progressAfter.dailyQuotes - progressBefore.dailyQuotes;
        progressIncreases.push({
            challengeId: 'daily_quotes_5',
            label: `The Chronicler: ${Math.min(progressAfter.dailyQuotes, 5)}/5`,
            gainText: `+${gain} test${gain === 1 ? '' : 's'}`,
            completed: progressAfter.dailyQuotes >= 5
        });
    }
    if (progressAfter.dailyWords > progressBefore.dailyWords) {
        const gain = progressAfter.dailyWords - progressBefore.dailyWords;
        progressIncreases.push({
            challengeId: 'daily_words_5',
            label: `Neural Link Stabilizer: ${Math.min(progressAfter.dailyWords, 5)}/5`,
            gainText: `+${gain} test${gain === 1 ? '' : 's'}`,
            completed: progressAfter.dailyWords >= 5
        });
    }
    if (progressAfter.dailyWords30 > progressBefore.dailyWords30) {
        const gain = progressAfter.dailyWords30 - progressBefore.dailyWords30;
        progressIncreases.push({
            challengeId: 'daily_words30_5',
            label: `The Quick-Draw: ${Math.min(progressAfter.dailyWords30, 5)}/5`,
            gainText: `+${gain} test${gain === 1 ? '' : 's'}`,
            completed: progressAfter.dailyWords30 >= 5
        });
    }
    if (progressAfter.weeklyWords > progressBefore.weeklyWords) {
        const gain = progressAfter.weeklyWords - progressBefore.weeklyWords;
        progressIncreases.push({
            challengeId: 'marathon',
            label: `The Marathon: ${Math.min(progressAfter.weeklyWords, 10000)}/10,000`,
            gainText: `+${gain.toLocaleString()} words`,
            completed: progressAfter.weeklyWords >= 10000
        });
    }
    if (progressAfter.weeklyClimber > progressBefore.weeklyClimber) {
        const gain = progressAfter.weeklyClimber - progressBefore.weeklyClimber;
        progressIncreases.push({
            challengeId: 'consistent_climber',
            label: `Consistent Climber: ${Math.min(progressAfter.weeklyClimber, 10)}/10`,
            gainText: `+${gain} streak`,
            completed: progressAfter.weeklyClimber >= 10
        });
    }
    if (progressAfter.weeklyAboveAvg > progressBefore.weeklyAboveAvg) {
        const gain = progressAfter.weeklyAboveAvg - progressBefore.weeklyAboveAvg;
        progressIncreases.push({
            challengeId: 'above_average',
            label: `Above Average: ${Math.min(progressAfter.weeklyAboveAvg, 5)}/5`,
            gainText: `+${gain} run${gain === 1 ? '' : 's'}`,
            completed: progressAfter.weeklyAboveAvg >= 5
        });
    }
    if (progressAfter.communityWords > progressBefore.communityWords) {
        const gain = progressAfter.communityWords - progressBefore.communityWords;
        progressIncreases.push({
            challengeId: 'community_goal',
            label: `Community Goal: ${progressAfter.communityWords.toLocaleString()} total damage`,
            gainText: `+${gain.toLocaleString()} damage`,
            isCommunity: true,
            completed: progressAfter.communityWords >= COMMUNITY_FLEET_TOTAL_HEALTH
        });
    }
    const activeProgressIncreases = progressIncreases.filter(item => !item.completed);
    const progressHtml = activeProgressIncreases.length > 0
        ? `<div class="challenge-progress-lines"><div class="challenge-progress-title">Active Challenge Progress</div>${activeProgressIncreases.map(item => `<button type="button" class="challenge-progress-line${item.isCommunity ? ' community' : ''}" title="Jump to this challenge" onclick="jumpToChallengeFromProgress('${escapeHtml(item.challengeId)}')"><span class="challenge-progress-main">${escapeHtml(item.label)}</span><span class="challenge-progress-gain">${escapeHtml(item.gainText || '')}</span>${item.isCommunity ? `<span class="challenge-progress-mini-battle" aria-hidden="true"><span class="ship">🚀</span><span class="laser"></span><span class="ship enemy">👾</span></span>` : ''}</button>`).join('')}</div>`
        : '';

    // Persist PB ghost timeline so future sessions can race against it
    if (isModePB) {
        try {
            const ghostKey = currentMode === 'quotes'
                ? 'sampire-ghost-quotes-' + btoa(encodeURIComponent(currentQuote)).slice(0, 40)
                : 'sampire-ghost-' + currentMode;
            localStorage.setItem(ghostKey, JSON.stringify(completedTimeline));
        } catch(e) {}
    }

    // Play the appropriate completion sound
    if (wpm > prevBest) {
        playSound(SFX.personalBest);
        runPersonalBestCelebration();
    } else if (wpm < 50) {
        playSound(SFX.below50);
    } else {
        playSound(SFX.completed);
    }

    drawResultChart();

    // ── Challenge evaluation ──────────────────────────────────────────────
    const banner = document.getElementById('challenge-result-banner');
    const titleEl = document.getElementById('result-title');
    if (activeChallengeId) {
        const cid = activeChallengeId;
        activeChallengeId = null;
        returnToDailyAfterResult = true;
        let passed = false;
        if (cid === 'sprint')       passed = wpm >= 100;
        else if (cid === 'nobackspace') passed = accuracy >= NO_BACKSPACE_MIN_ACC;
        else if (cid === 'perfectionist') passed = mistakeCount === 0;
        else if (cid === 'marathon') passed = getWeeklyWordTotal() >= 10000;
        else if (cid === 'consistent_climber') passed = getWeeklyConsistentClimberStreak() >= 10;
        else if (cid === 'rival_week') {
            const target = getCachedWeeklyRivalTarget();
            passed = target ? wpm > target : false;
        }
        else if (cid === 'above_average') passed = getWeeklyAboveAverageCount() >= 5;
        const def = CHALLENGES.find(c => c.id === cid) || WEEKLY_CHALLENGES.find(c => c.id === cid);
        let xpGained = 0;
        const isWeeklyChallenge = WEEKLY_CHALLENGES.some(c => c.id === cid);
        const alreadyComplete = isWeeklyChallenge ? getWeeklyCompletions().includes(cid) : getDailyCompletions().includes(cid);
        if (passed && !alreadyComplete) {
            if (isWeeklyChallenge) markWeeklyChallengeComplete(cid);
            else markChallengeComplete(cid);
            const multiplier = getXPMultiplier();
            const earnedXp = Math.round(def.xp * multiplier);
            const xpResult = addXP(earnedXp);
            xpGained = earnedXp;
            updateStreak();
            if (xpResult.levelUp) {
                subtitle = `Level up! Lv ${xpResult.level} – ${getLevelName(xpResult.level)}!`;
                document.getElementById('result-subtitle').textContent = subtitle;
            }
        }
        showNewBadges(checkBadges(wpm, passed, cid));
        if (titleEl) titleEl.textContent = passed ? 'Challenge Passed!' : 'Challenge Failed';
        if (banner) {
            banner.style.display = 'flex';
            if (passed) {
                banner.className = 'challenge-banner pass';
                banner.innerHTML = xpGained > 0
                    ? `&#10003; Complete! <span class="xp-gained">+${xpGained} XP</span>${progressHtml}`
                    : `&#10003; Complete! <span style="color:#6b7280;font-weight:400">(already earned ${isWeeklyChallenge ? 'this week' : 'today'})</span>${progressHtml}`;
            } else {
                banner.className = 'challenge-banner fail';
                const why = cid === 'sprint'
                    ? `${wpm} WPM (need 100)`
                    : cid === 'nobackspace' ? `${accuracy}% accuracy (need ${NO_BACKSPACE_MIN_ACC}%)`
                    : cid === 'marathon' ? `${Math.min(getWeeklyWordTotal(), 10000)} / 10,000 words this week`
                    : cid === 'consistent_climber' ? `${Math.min(getWeeklyConsistentClimberStreak(), 10)} / 10 consecutive tests`
                    : cid === 'rival_week' ? `${wpm} WPM (${Math.round(getCachedWeeklyRivalTarget() || 0)} target)`
                    : cid === 'above_average' ? `${Math.min(getWeeklyAboveAverageCount(), 5)} / 5 tests above ${Math.round(getAverageWpmBaseline() * 1.05 || 0)} WPM`
                    : 'Errors detected';
                banner.innerHTML = `&#10007; Failed &mdash; ${escapeHtml(why)}${progressHtml}`;
            }
        }
    } else {
        returnToDailyAfterResult = false;
        if (titleEl) titleEl.textContent = 'Well done!';
        const passiveItems = [...passiveDailyCompletions, ...passiveWeeklyCompletions];
        if (banner && (passiveItems.length > 0 || progressIncreases.length > 0)) {
            banner.style.display = 'flex';
            banner.className = 'challenge-banner pass';
            const itemsHtml = passiveItems.map(item =>
                item.xpGained > 0
                    ? `&#10003; Complete: ${escapeHtml(item.name)} <span class="xp-gained">+${item.xpGained} XP</span>`
                    : `&#10003; Complete: ${escapeHtml(item.name)}`
            ).join('<br>');
            banner.innerHTML = `${itemsHtml}${itemsHtml && progressHtml ? '<br>' : ''}${progressHtml}`;
        } else if (banner) {
            banner.style.display = 'none';
        }
        showNewBadges(checkBadges(wpm, false, null));
    }

    resultOverlay.classList.add('show');
    const communityMode = getCommunityBoostDefinition();
    if (communityMode && communityMode.mode === currentMode) {
        if (communityMode.id === 'targeted_weakness') {
            const bonusWords = Number(communityModeRuntime && communityModeRuntime.xzBonusWords) || 0;
            if (bonusWords > 0) {
                document.getElementById('result-subtitle').textContent = `${subtitle} + ${bonusWords * 2} bonus fleet damage`;
            }
        } else if (communityMode.id === 'kinetic_shielding') {
            const dodges = Number(communityModeRuntime && communityModeRuntime.dodges) || 0;
            if (dodges > 0) {
                const pct = Math.round((Number(communityModeRuntime && communityModeRuntime.damageMultiplier) || 1) * 100);
                document.getElementById('result-subtitle').textContent = `${subtitle} + Kinetic Shielding ${dodges}/5 dodges (${pct}% damage)`;
            }
        }
    }
    // Adaptive drills are personalized practice, so they stay off the public leaderboard.
    if (isModePB && currentUser && currentMode !== 'adaptive') {
        saveScoreToCloud(scoreEntry).then(result => {
            if (!result.ok && !/best run/i.test(String(result.error || ''))) {
                setAuthNote(`Cloud save failed: ${result.error || 'please try again.'}`, true);
            }
        });
    } else if (!currentUser && isSessionPB && wpm >= 100) {
        saveGuestScoreToLeaderboard(scoreEntry, isSessionPB);
    }
}

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
