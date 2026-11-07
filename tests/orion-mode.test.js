const assert = require('assert');
const OM = require('../js/orion-mode.js')._internal;

// wave config scaling
const w1 = OM.waveConfig(1), w4 = OM.waveConfig(4), w9 = OM.waveConfig(9);
assert.ok(w4.speed > w1.speed && w9.speed > w4.speed);
assert.ok(w4.spawnInterval < w1.spawnInterval && w9.spawnInterval >= 0.55);
assert.ok(w9.minLen > w1.minLen && w9.maxLen <= 12);
assert.ok(w4.count > w1.count);
assert.strictEqual(OM.waveConfig(100).minLen, 9);
assert.strictEqual(OM.waveConfig(0).wave, 1);
[1, 2, 3, 4, 6, 9].forEach(n => assert.strictEqual(OM.waveConfig(n).dreadnought, false));
[5, 10, 15].forEach(n => assert.strictEqual(OM.waveConfig(n).dreadnought, true));

// combo + scoring
assert.strictEqual(OM.comboAfterClean(1), 1.1);
let c = 1; for (let i = 0; i < 100; i++) c = OM.comboAfterClean(c);
assert.strictEqual(c, 4);
assert.strictEqual(OM.comboAfterMiss(), 1);
assert.strictEqual(OM.scoreForWord(5, 1), 5);
assert.strictEqual(OM.scoreForWord(5, 2.5), 13);
assert.strictEqual(OM.scoreForWord(10, 9), 40);
assert.strictEqual(OM.scoreForWord(10, 0), 10);

// wpm / accuracy
assert.strictEqual(OM.calcWpm(300, 60), 60);
assert.strictEqual(OM.calcWpm(10, 0), 0);
assert.strictEqual(OM.calcAccuracy(9, 10), 90);
assert.strictEqual(OM.calcAccuracy(0, 0), 100);
assert.ok(Math.abs(OM.clampDt(5) - 0.05) < 1e-9 && OM.clampDt(-1) === 0);

// target selection: closest to station (largest y) starting with letter
const words = [
  { text: 'alpha', y: 100 }, { text: 'apple', y: 300 }, { text: 'beta', y: 400 },
  { text: 'amber', y: 500, dead: true }, { text: 'Axis', y: 200 }
];
assert.strictEqual(OM.selectTarget(words, 'a').text, 'apple');
assert.strictEqual(OM.selectTarget(words, 'A').text, 'apple');
assert.strictEqual(OM.selectTarget(words, 'b').text, 'beta');
assert.strictEqual(OM.selectTarget(words, 'z'), null);
console.log('orion-mode tests passed');
