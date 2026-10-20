// R71 box screen: node screen.js <list|run> ; resumable (skips finished outputs). Run list printed as TSV for xargs.
const fs = require('fs');
const book = (n) => JSON.stringify({ env: 'seq', params: { source: 'book', nSyms: n, evalSyms: 2000 } });
const FAB = n => JSON.stringify({ env: 'seq', params: { source: 'fables', nSyms: n, readIn: 0.01 } });
const ORD = K => JSON.stringify({ env: 'seq', params: { source: 'order3', K, readIn: 0.01 } }), TXT = JSON.stringify({ env: 'seq', params: { source: 'text', nSyms: 1000, readIn: 0.01 } });
const SC = s => JSON.stringify({ env: 'seqchoice', params: { source: s, nSyms: 1000 } });
const T = { o3: ORD(8), t1: TXT, so2: SC('order2'), scy: SC('cycle'), f4: FAB(4000), b10: book(10000), b30: book(30000), ban: JSON.stringify({ env: 'bandit', params: { K: 6, C: 3, switchEvery: 40 } }), cue: JSON.stringify({ env: 'cue', params: { mapping: 'random', delay: 40 } }) };
const ARMS = (process.env.ARMS ? JSON.parse(process.env.ARMS) : null) || {
  cxN: 'sc.sizeF@cortex=4,sc.sizeNorm@cortex=4,P.fanRef=840,P.fanRefR=126,pl.lr@cortex=0.1,P.fastEngine=1',
  cxF2: 'sc.sizeF@cortex=4,P.fanRef=840,P.fanRefR=126,pl.lr@cortex=0.2,P.fastEngine=1',
  c450: 'sc.sizeF@cortex=4,P.fanRef=450,pl.lr@cortex=0.2,P.fastEngine=1', cx4L2: 'sc.sizeF@cortex=4,pl.lr@cortex=0.2,P.fastEngine=1' };
const G = (process.env.GS || '0,1,2,3,4,5,6,7').split(',');
const lines = [];
for (const tk of Object.keys(T).filter(k => !process.env.TK || process.env.TK.split(',').includes(k))) for (const g of G) for (const a of Object.keys(ARMS)) {
  const o = `/workspace/r76/scr/${a}_${tk}_g${g}.json`; let ok = false; try { ok = !!JSON.parse(fs.readFileSync(o, 'utf8')).scores; } catch (e) {}
  if (!ok) lines.push([o, ARMS[a], T[tk], g].join('\t')); }
process.stdout.write(lines.join('\n') + (lines.length ? '\n' : ''));
