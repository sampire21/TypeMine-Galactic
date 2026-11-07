const assert = require('assert');
const RA = require('../js/run-analysis.js')._internal;

// Word WPM: "aa bb" typed at 0.1s/char, "bb" slower
const quote = 'aa bb cc';
const tl = [{t:0,index:0},{t:.1,index:1},{t:.2,index:2},{t:.3,index:3},{t:.8,index:4},{t:1.3,index:5},{t:1.4,index:6},{t:1.5,index:7},{t:1.6,index:8}];
const typed = quote.split(''); typed[4] = 'x';
const ws = RA.computeWordStats(quote, typed, tl);
assert.strictEqual(ws.length, 3);
assert.deepStrictEqual(ws.map(w => w.errors), [0, 1, 0]);
assert.ok(ws[1].wpm < ws[0].wpm && ws[1].wpm < ws[2].wpm, 'bb slowest');
assert.strictEqual(RA.slowestWords(ws, 1)[0].word, 'bb');
assert.strictEqual(ws[0].wpm, 120);

// Ghost delta: ghost types 1 char / 0.5s
const ghost = []; for (let i = 0; i <= 10; i++) ghost.push({ t: i * 0.5, index: i });
const g = RA.createGhostTracker();
let r = g.update(0, 0, ghost);
assert.deepStrictEqual(r, { deltaChars: 0, deltaMs: 0 });
r = g.update(4, 1000, ghost); // ghost at idx 2 at 1s; reached idx 4 at 2s -> 1s ahead
assert.strictEqual(r.deltaChars, 2);
assert.strictEqual(r.deltaMs, 1000);
r = g.update(4, 3000, ghost); // ghost idx 6; behind by 1s
assert.strictEqual(r.deltaChars, -2);
assert.strictEqual(r.deltaMs, -1000);
// backspace moves pointer back correctly
r = g.update(2, 3100, ghost);
assert.strictEqual(r.deltaMs, -2100);
// past the ghost's end
r = g.update(10, 6000, ghost);
assert.strictEqual(r.deltaChars, 0);
assert.strictEqual(r.deltaMs, -1000);
r = g.update(12, 7000, ghost);
assert.ok(r.deltaMs <= 2000 && r.deltaChars === 2);
// pointer is monotone in normal play (amortized O(1)): result matches fresh tracker
const g2 = RA.createGhostTracker();
for (let i = 0; i <= 20; i++) {
  const a = g2.update(i / 2 | 0, i * 250, ghost), b = RA.createGhostTracker().update(i / 2 | 0, i * 250, ghost);
  assert.deepStrictEqual(a, b);
}
g.reset();
assert.deepStrictEqual(g.update(3, 100, []), { deltaChars: 0, deltaMs: 0 });
console.log('run-analysis tests passed');
