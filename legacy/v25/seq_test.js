// Sequence prediction with lifetime learning: accuracy (whole lifetime, first and last quarter) and bits per
// symbol, against chance and the optimal predictor (cycle / markov / order2 / text).
//   [CASES='cycle:4,cycle:8,markov:8,order2:6,text'] [NG=6] [NS=200] [PLAN=predictK|predictKL|predictK2|predictK2L|predictK2XL|predictK2XT|predictK2XN|predictK2XM|predictK2XS|predictK2XG] [TUNE='{"rule":"rstdp"}'] [PP='{"det":0.8}']
//   (predictK2 / predictK2L switch on the env's two-phase clock, clock2)
//   [NOLEARN=1] node seq_test.js [brain.json]
// Each case: NG growths (fresh developmental noise) x 1 lifetime each (a new random sequence rule per lifetime).
'use strict';
const fs = require('fs'), path = require('path');
const SA = require('./js/node_load.js')();
const NG = +(process.env.NG || 6), NS = +(process.env.NS || 200), TUNE = JSON.parse(process.env.TUNE || '{}'), PP = JSON.parse(process.env.PP || '{}');
const cases = (process.env.CASES || 'cycle:4,cycle:8,markov:8').split(',');
if (process.env.NOLEARN) SA.params.plasticity = false;
const file = process.argv[2];
console.log(`${file ? path.basename(file) : 'plan ' + (process.env.PLAN || 'predictK') + ' ' + JSON.stringify(TUNE)}  ${NG} growths x ${NS} symbols${process.env.NOLEARN ? '  (plasticity OFF)' : ''}`);
console.log('case         | accuracy  first q  last q | bits  calSoft calCount idealBits | chance  ideal counter (all / last q)  1st-order opt  optimal | (unigram)');
for (const cs of cases) {
  const [source, K] = cs.split(':');
  const PLAN = process.env.PLAN || 'predictK', two = /^predictK2/.test(PLAN);   // the second-order plans need the two-phase clock
  const env = SA.setEnv('seq', Object.assign({ source, K: +(K || 4), nSyms: NS, clock2: two }, PP));
  let d; if (file) d = SA.brainFromFile(fs.readFileSync(file, 'utf8')).genome;
  else d = PLAN === 'predictKL' ? SA.createPredictPlan(Object.assign({}, SA.PREDICT_LARGE, TUNE)) : PLAN === 'predictK' ? SA.createPredictPlan(TUNE)
         : PLAN === 'predictK2' ? SA.createPredict2Plan(TUNE) : PLAN === 'predictK2L' ? SA.createPredict2Plan(Object.assign({}, SA.PREDICT2_LARGE, TUNE)) : PLAN === 'predictK2XL' ? SA.createPredict2Plan(Object.assign({}, SA.PREDICT2_XL, TUNE)) : PLAN === 'predictK2XT' ? SA.createPredict2Plan(Object.assign({}, SA.PREDICT2_XT, TUNE)) : PLAN === 'predictK2XN' ? SA.createPredict2Plan(Object.assign({}, SA.PREDICT2_XN, TUNE)) : PLAN === 'predictK2XM' ? SA.createPredict2Plan(Object.assign({}, SA.PREDICT2_XM, TUNE)) : PLAN === 'predictK2XS' ? SA.createPredict2Plan(Object.assign({}, SA.PREDICT2_XS, TUNE)) : PLAN === 'predictK2XG' ? SA.createPredict2Plan(Object.assign({}, SA.PREDICT2_XG, TUNE)) : SA.planFor(PLAN, env).make();
  let acc = 0, f = 0, l = 0, bits = 0, id = 0, idl = 0, bs = 0, bc = 0, ib = 0, st;
  for (let g = 0; g < NG; g++) { const b = SA.growCell(d, { seed: 100 + g * 7919, spec: env.spec }), a = SA.runEpisode(d, 555 + g, b, env); st = a.task.stats();
    acc += st.accuracy; f += st.firstQuarter; l += st.lastQuarter; bits += st.bits; id += st.idealOnline; idl += st.idealLast; bs += st.bitsSoft; bc += st.bitsCount; ib += st.idealBits; }
  console.log(`${cs.padEnd(12)} |  ${(acc / NG).toFixed(3)}    ${(f / NG).toFixed(3)}   ${(l / NG).toFixed(3)} | ${(bits / NG).toFixed(2)}  ${(bs / NG).toFixed(2)}    ${(bc / NG).toFixed(2)}     ${(ib / NG).toFixed(2)}     | ${st.chance.toFixed(3)}   ${(id / NG).toFixed(3)} / ${(idl / NG).toFixed(3)}              ${st.firstOrder.toFixed(3)}         ${st.optimal.toFixed(3)}` +
              (st.unigram ? ` | (${st.unigram.toFixed(3)})` : ''));
}
