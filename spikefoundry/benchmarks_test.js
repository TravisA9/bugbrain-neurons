'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const B = require('./benchmarks.js');
let n = 0;
function check(ok, what) { n++; if (!ok) { console.error('FAIL ' + what); process.exitCode = 1; } else console.log('ok   ' + what); }

const subset = B.digitSubset(1);
check(subset.source === 'subset' && subset.train.length === 2 && subset.heldOut.length === 2, 'the MNIST test subset is a fixed pair of drawings');
const rate = B.spikeImage(B.ONE, 'rate');
const latency = B.spikeImage(B.ONE, 'latency');
check(JSON.stringify(rate) !== JSON.stringify(latency), 'rate and latency encodings of the same drawing differ');
const levelA = B.mnistLevel(B.loudGenome(), 4);
const levelB = B.mnistLevel(B.loudGenome(), 4);
check(JSON.stringify(levelA) === JSON.stringify(levelB) && levelA.nist === false, 'the subset MNIST score repeats and is not claimed as the full dataset');

const bytes = Buffer.from('mnist-bytes');
check(B.verifySha256(bytes, B.sha256(bytes)) && !B.verifySha256(bytes, 'ab'), 'a download is kept only when the sha256 matches');
const labels = Buffer.alloc(10);
labels.writeUInt32BE(2049, 0);
labels.writeUInt32BE(2, 4);
labels[8] = 7;
labels[9] = 1;
check(B.parseIdxLabels(labels).join(',') === '7,1', 'IDX labels parse from the MNIST header');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnist-'));
const good = Buffer.from('ok-bytes');
const fetched = B.fetchMnist(dir, () => good, { 'sample.gz': { url: 'https://example.test/sample.gz', sha256: B.sha256(good) } });
check(fetched.ok === true && fs.existsSync(path.join(dir, 'sample.gz')), 'a file that matches sha256 is cached');
let rejected = false;
try { B.fetchMnist(dir, () => Buffer.from('nope'), { 'bad.gz': { url: 'https://example.test/bad.gz', sha256: B.sha256(good) } }); } catch (e) { rejected = e.code === 'mnist-hash'; }
check(rejected, 'a MNIST file with the wrong sha256 is refused');

const hook = B.fetchNmnist(dir);
check(hook.available === false && hook.reason.indexOf('not downloaded') >= 0, 'N-MNIST stays a verified-cache hook and is not fetched');

const quiet = B.cartLevel(3, B.silentGenome());
const loud = B.cartLevel(3, B.loudGenome());
const again = B.cartLevel(3, B.loudGenome());
check(JSON.stringify(loud.heldOut) === JSON.stringify(again.heldOut), 'closed-loop cart-pole repeats for the same genome and seed');
check(quiet.sampleForces.join(',') !== loud.sampleForces.join(','), 'the frozen network chooses the push, so two genomes can act differently');
check(loud.closedLoop === true && loud.frozenRule === 'frozen SNN controller', 'cart-pole is marked as a frozen closed-loop controller');
console.log(n + ' checks');
