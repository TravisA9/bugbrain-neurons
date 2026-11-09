'use strict';
const fs = require('fs'), path = require('path');
const Curriculum = require('./curriculum.js');
const SF = require('./engine.js');
let n = 0;
function check(ok, what) { n++; if (!ok) { console.error('FAIL ' + what); process.exitCode = 1; } else console.log('ok   ' + what); }

const engine = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8');
check(engine.indexOf('0.91') < 0 && engine.indexOf('heldOutPromotion') >= 0, 'phase changes use held-out promotion instead of a flat 0.91 gate');
const best = { synthetic: true, heldOut: 0.7, meanSpikes: 4, score: 0.2 };
check(SF.heldOutPromotion(best) === true, 'a held-out score can promote when spikes stay small');
check(SF.heldOutPromotion({ synthetic: true, score: 0.99, meanSpikes: 1 }) === false, 'a high search score without a held-out field does not promote');

const digits = Curriculum.digitLevel(3);
check(digits.nist === false && digits.note.indexOf('not N-MNIST') >= 0, 'digit rasters are not claimed to be N-MNIST');
check(digits.train.raw !== undefined && digits.heldOut.score <= digits.heldOut.raw, 'combined digit score keeps the raw metric and can be lower');
const cartA = Curriculum.cartLevel(2);
const cartB = Curriculum.cartLevel(2);
check(JSON.stringify(cartA) === JSON.stringify(cartB), 'cart-pole rollouts repeat for a seed');
check(cartA.frozenRule && cartA.heldOut.raw >= 0 && cartA.heldOut.raw <= 1, 'cart-pole reports a raw balance fraction');

const report = Curriculum.run(1);
check(report.levels.map(row => row.id).join(',') === 'coincidence,sequence,scenario-vision,scenario-sequence,scenario-graph,scenario-control,digits,cart-pole', 'levels run from toy tasks through scenarios to digits and cart-pole');
check(report.levels.every(row => row.heldOut && row.train && row.heldOut.raw !== undefined), 'every level has a separate held-out score');
console.log(n + ' checks');
