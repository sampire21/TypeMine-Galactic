'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const store = {};
global.window = global;
global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
};
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'adaptive-practice.js'), 'utf8'));
const AP = window.AdaptivePractice;
assert(AP, 'AdaptivePractice exposed');

const letters = 'abcdefghijklmnoprstuvwxyz'.split('');
function ks(expected, typed, prevChar, ms) { AP.recordKeystroke({ expected, typed, prevChar, msSincePrev: ms }); }
for (let round = 0; round < 40; round++) {
    letters.forEach((c, i) => ks(c, c, letters[(i + 3) % letters.length], 150 + (i % 5) * 5));
    ks('q', round % 2 ? 'w' : 'q', 'a', 520);
    ks('h', 'h', 't', 480);       // 'th' slow
    ks('h', round % 3 ? 'h' : 'g', 't', 500);
    ks('x', 'x', 'e', 9000);      // pause: ignored for timing
}
AP.commitRun();
assert(store['sampire-adaptive-stats-v1'], 'persisted under sampire-adaptive- key');

assert.strictEqual(AP.getWeakKeys(1)[0], 'q', 'q weakest key');
assert(AP.getWeakBigrams(3).includes('th'), 'th among weakest bigrams');
const hm = AP.getKeyHeatmap();
assert(hm.q.accuracy < hm.a.accuracy && hm.q.avgMs > hm.a.avgMs && hm.q.samples >= 40);
assert(hm.x.avgMs === null || hm.x.avgMs < 2000, 'pauses ignored');

const pool = ['the','this','that','quiz','quit','queen','cat','dog','sun','run','map','top','bed','red','pen','fox','jam','lip','hot','win',
    'cup','bag','hat','map','pin','nap','sit','tan','van','wax','yes','zip','ant','bus','cow','den','eel','fig','gum','hen'];
const drill = AP.generateDrill({ wordCount: 200, wordPool: pool });
const words = drill.split(' ');
assert.strictEqual(words.length, 200);
assert(words.every(w => pool.includes(w)), 'only real pool words');
const rate = a => a.filter(w => /q|th/.test(w)).length / a.length;
const baseRate = rate(pool);
assert(rate(words) > baseRate * 1.8, `drill enriched (${rate(words)} vs ${baseRate})`);
assert(words.some(w => !/q|th/.test(w)), 'random portion remains');

AP.reset();
assert.deepStrictEqual(AP.getWeakKeys(3), []);
assert(!store['sampire-adaptive-stats-v1']);
console.log('adaptive-practice tests passed');
