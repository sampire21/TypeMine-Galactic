'use strict';
// Plain node unit tests for js/mining-mode.js (the Lyra Gate mining economy).
// Run: node tests/mining-mode.test.js
const assert = require('assert');
const api = require('../js/mining-mode.js');

const WPM = 60;
const ACC = 0.97;
const CYCLE_SEC = 1.6; // the shatter animation blocks typing for this long per layer
const AVG_WORD_LEN = 5;

function emptyUpgrades() {
    return Object.fromEntries(api.MINING_UPGRADES.map((u) => [u.id, 0]));
}

// Expected damage from one typed word at the given speed, without random crits.
function expectedDamagePerWord(upgrades, wpm, critChance, critMultiplier) {
    const eff = api.getUpgradeEffects(upgrades);
    let perCharTotal = 0;
    for (let streak = 0; streak < 33; streak++) { // a 3% error rate resets the combo about every 33 letters
        perCharTotal += api.calculateDamage({
            charactersTyped: 1, wpm, accuracy: ACC, sessionAccuracy: ACC, combo: streak,
            bufferBonus: eff.wpmMultiplierBonus, activeUpgradeBonus: eff.baseDamageBonus,
            critChance, critMultiplier, rollForCrit: false,
        }).activeDamage;
    }
    const completion = api.calculateDamage({
        charactersTyped: AVG_WORD_LEN, wpm, accuracy: ACC, sessionAccuracy: ACC, combo: 16,
        bufferBonus: eff.wpmMultiplierBonus, activeUpgradeBonus: eff.baseDamageBonus,
        critChance, critMultiplier, rollForCrit: false,
    }).activeDamage;
    const expectedCompletion = completion * (1 + Math.min(1, critChance) * (critMultiplier - 1));
    return (perCharTotal / 33) * AVG_WORD_LEN + expectedCompletion * ACC;
}

function crystalsPerMinute(upgrades, layer, wpm) {
    const st = api.recalculateDerivedState({ ...api.createDefaultMiningState(), upgrades, currentLayer: layer });
    const perWord = expectedDamagePerWord(upgrades, wpm, st.critChance, st.critMultiplier);
    const damagePerMin = perWord * wpm + st.dps * 60;
    const hp = api.getLayerMaxHp(layer);
    const reward = api.getLayerCrystalReward(layer, upgrades);
    const layersPerMin = damagePerMin / hp;
    const cycleLoss = 1 + (layersPerMin * CYCLE_SEC) / 60;
    return { crystalsPerMin: (layersPerMin * reward) / cycleLoss, layersPerMin: layersPerMin / cycleLoss };
}

// ---- balance: hits per layer and crystals per layer ----
assert.ok(Math.abs(api.LAYER_HP_GROWTH - 1.1) < 1e-9, 'layers grow 10% per layer');
for (let layer = 5; layer < 40; layer++) {
    const ratio = api.getLayerMaxHp(layer + 1) / api.getLayerMaxHp(layer);
    assert.ok(ratio > 1.09 && ratio < 1.11, `layer ${layer} growth ${ratio}`);
}
for (let layer = 0; layer <= 40; layer++) {
    const hp = api.getLayerMaxHp(layer);
    const reward = api.getLayerCrystalReward(layer, emptyUpgrades());
    assert.ok(Math.abs(reward - hp / 60) <= 0.5 + 1e-9, `reward ${reward} tracks hp/60 at layer ${layer} (hp ${hp})`);
}

// ---- balance: crystals per minute never falls below a floor across layers 0-40 at 60 WPM ----
const FLOOR = 20;
for (let layer = 0; layer <= 40; layer++) {
    const r = crystalsPerMinute(emptyUpgrades(), layer, WPM);
    assert.ok(r.crystalsPerMin >= FLOOR, `layer ${layer}: ${r.crystalsPerMin.toFixed(1)} crystals/min is below ${FLOOR}`);
}

// ---- balance: upgrade curve limits ----
for (const u of api.MINING_UPGRADES) {
    assert.ok(u.costScale >= 1.15 && u.costScale <= 1.3, `${u.id} costScale ${u.costScale}`);
    assert.ok(u.maxLevel >= 15 && u.maxLevel <= 20, `${u.id} maxLevel ${u.maxLevel}`);
    for (let l = 1; l < u.maxLevel; l++) assert.ok(api.getUpgradeCost(u.id, l) > api.getUpgradeCost(u.id, l - 1));
}

// ---- balance: a greedy player at 60 WPM maxes everything in under 20 hours, drone types within ~1h ----
{
    const upgrades = emptyUpgrades();
    let crystals = 0, minutes = 0, layer = 0, droneTenAt = null;
    const allMaxed = () => api.MINING_UPGRADES.every((u) => upgrades[u.id] >= u.maxLevel);
    while (!allMaxed() && minutes < 60 * 40) {
        const r = crystalsPerMinute(upgrades, Math.floor(layer), WPM);
        crystals += r.crystalsPerMin; layer += r.layersPerMin; minutes++;
        for (;;) {
            const options = api.MINING_UPGRADES
                .filter((u) => upgrades[u.id] < u.maxLevel)
                .map((u) => ({ u, cost: api.getUpgradeCost(u.id, upgrades[u.id]) }))
                .sort((a, b) => a.cost - b.cost);
            if (!options.length || crystals < options[0].cost) break;
            crystals -= options[0].cost; upgrades[options[0].u.id]++;
            if (options[0].u.id === 'automated_drones' && upgrades.automated_drones === api.DRONE_TYPE_UNLOCK_LEVEL && droneTenAt == null) droneTenAt = minutes;
        }
    }
    assert.ok(allMaxed(), 'everything can be maxed');
    assert.ok(minutes / 60 < 20, `maxing everything took ${(minutes / 60).toFixed(1)} hours`);
    assert.ok(droneTenAt != null && droneTenAt <= 90, `drone types reached at minute ${droneTenAt}`);
    const totalCost = api.MINING_UPGRADES.reduce((sum, u) => {
        let c = 0; for (let l = 0; l < u.maxLevel; l++) c += api.getUpgradeCost(u.id, l); return sum + c;
    }, 0);
    console.log(`balance: max everything = ${totalCost} crystals, ${(minutes / 60).toFixed(1)} h at ${WPM} WPM; drone types at minute ${droneTenAt}`);
}

// ---- idle income is meaningful at a reachable drone level ----
{
    const st = api.recalculateDerivedState({ ...api.createDefaultMiningState(), upgrades: { ...emptyUpgrades(), automated_drones: 10 } });
    const typingPerMin = expectedDamagePerWord(emptyUpgrades(), WPM, 0.05, 2) * WPM;
    assert.ok(st.dps * 60 >= typingPerMin * 0.25, `drone damage ${st.dps * 60}/min vs typing ${typingPerMin.toFixed(0)}/min`);
    const faster = api.recalculateDerivedState({ ...api.createDefaultMiningState(), upgrades: { ...emptyUpgrades(), automated_drones: 10, overclocked_actuators: 5 } });
    assert.ok(Math.abs(faster.dps - st.dps * 1.5) < 0.05, '"Faster drones" raises drone damage by 10% per level');
}

// ---- combo multiplier is clamped ----
assert.strictEqual(api.getComboMultiplier(0), 1);
assert.strictEqual(api.getComboMultiplier(5), 1.15);
assert.strictEqual(api.getComboMultiplier(100), api.COMBO_CAP);
assert.strictEqual(api.calculateDamage({ charactersTyped: 5, wpm: 60, accuracy: 1, combo: 400, rollForCrit: false }).breakdown.comboMultiplier, api.COMBO_CAP);

// ---- applyDamageToState across several layers ----
{
    const base = api.createDefaultMiningState();
    const hp0 = api.getLayerMaxHp(0), hp1 = api.getLayerMaxHp(1), hp2 = api.getLayerMaxHp(2);
    const damage = hp0 + hp1 + 10;
    const { state, result } = api.applyDamageToState(base, damage, { now: base.lastTickAt, source: 'typing', skipSave: true });
    assert.strictEqual(result.shatteredLayers, 2);
    assert.strictEqual(result.startLayer, 0);
    assert.strictEqual(state.currentLayer, 2);
    assert.strictEqual(state.asteroidMaxHP, hp2);
    assert.strictEqual(state.asteroidHP, hp2 - 10);
    const expectedCrystals = api.getLayerCrystalReward(0, base.upgrades) + api.getLayerCrystalReward(1, base.upgrades);
    assert.strictEqual(result.crystalsEarned, expectedCrystals);
    assert.strictEqual(state.totalAetherCrystals, expectedCrystals);
    assert.strictEqual(state.totalDamageDealt, damage);
    assert.strictEqual(state.communityContribution.pendingDamage, damage);
    // exact kill of one layer
    const exact = api.applyDamageToState(base, hp0, { now: base.lastTickAt, skipSave: true });
    assert.strictEqual(exact.result.shatteredLayers, 1);
    assert.strictEqual(exact.state.asteroidHP, hp1);
    // zero damage touches nothing
    const none = api.applyDamageToState(base, 0, { now: base.lastTickAt, skipSave: true });
    assert.strictEqual(none.result.shatteredLayers, 0);
    assert.strictEqual(none.state.asteroidHP, hp0);
}

// ---- overload (power boost): charge, activate, tick multiplier is 3x and applied once ----
{
    let st = { ...api.createDefaultMiningState(), upgrades: { ...emptyUpgrades(), automated_drones: 10 } };
    st = api.recalculateDerivedState(st);
    const t0 = 1_000_000;
    st.lastTickAt = t0;
    assert.strictEqual(api.activateOverload(st, t0).ok, false, 'cannot activate without charge');
    for (let i = 0; i < 50; i++) st = api.addOverloadCharge(st, api.OVERLOAD_CHARGE_PER_WORD, { skipSave: true }).state;
    assert.strictEqual(st.overloadMeter, 100);
    const activated = api.activateOverload(st, t0);
    assert.strictEqual(activated.ok, true);
    st = activated.state;
    assert.strictEqual(st.overloadMeter, 0);
    assert.strictEqual(st.overloadEndsAt, t0 + api.OVERLOAD_DURATION_MS);
    assert.strictEqual(api.isOverloadActive(st, t0 + 1), true);
    assert.strictEqual(api.isOverloadActive(st, t0 + api.OVERLOAD_DURATION_MS + 1), false);
    // a 2 s tick during the boost deals dps * 2 s * 3, no extra crit multiplier
    const ticked = api.tickMiningState(st, t0 + 2000);
    assert.ok(Math.abs(ticked.idleDamage - st.dps * 2 * api.OVERLOAD_PASSIVE_MULTIPLIER) < 0.05, `boost tick ${ticked.idleDamage} vs ${st.dps * 6}`);
    assert.strictEqual(ticked.overloadActive, true);
    assert.strictEqual(ticked.passiveCritApplied, true);
    assert.strictEqual(ticked.effectiveDps, Math.round(st.dps * 3 * 100) / 100);
    // a tick that straddles the end of the boost: 3x only for the boosted part
    const lateStart = { ...ticked.state, lastTickAt: t0 + 9000 };
    const straddle = api.tickMiningState(lateStart, t0 + 11000);
    assert.ok(Math.abs(straddle.idleDamage - (st.dps * 1 * 3 + st.dps * 1)) < 0.05, `straddle ${straddle.idleDamage}`);
    assert.strictEqual(straddle.overloadActive, false);
    // getEffectiveMiningStats agrees with the tick
    assert.strictEqual(api.getEffectiveMiningStats(st, t0 + 1).effectiveDps, Math.round(st.dps * 3 * 100) / 100);
}

// ---- state carries the wallet mirror and milestones, and sanitizes junk ----
{
    const st = api.recalculateDerivedState({ walletMirror: '12', milestones: { 'alice-in-wonderland': { chapters: '2', layers: 7.9, checkpoints: -1 }, bogus: { chapters: 9 } } });
    assert.strictEqual(st.walletMirror, 12);
    assert.deepStrictEqual(st.milestones, { 'alice-in-wonderland': { chapters: 2, layers: 7, checkpoints: 0 } });
    assert.strictEqual(api.recalculateDerivedState({}).walletMirror, null);
}

console.log('mining-mode tests passed');
