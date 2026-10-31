'use strict';
// Agreement of the Feature–Time port with the reference discrete simulator.
//   node experiments/toy-port/verify.js [baseline-frozen.snn.json] [sample-dialogue.txt]
// Exit code 0 when next-letter agreement is at least 99% and the extra checks pass.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { loadSNN, run } = require('./snn-sim.cjs');
const { loadFeatureTime, V_REST, V_THRESH, SPIKE_MV } = require('./toy_net');

const root = path.join(__dirname, '..', '..');
const modelPath = process.argv[2] || path.join(__dirname, 'baseline-frozen.snn.json');
const samplePath = process.argv[3] || path.join(__dirname, 'sample-dialogue.txt');

function sha16(buf) { return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16); }
function pct(n, d) { return d ? +(100 * n / d).toFixed(2) : 0; }
function sameIds(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function samePreds(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function main() {
  const text = fs.readFileSync(samplePath, 'utf8');
  if (!text.length) { console.error('sample text is empty'); process.exitCode = 1; return; }
  const modelBuf = fs.readFileSync(modelPath);
  const doc = JSON.parse(modelBuf.toString('utf8'));

  const SA = require(path.join(root, 'js', 'node_load.js'))();
  const lifOk = SA.V_REST === V_REST && SA.V_THRESH === V_THRESH && SPIKE_MV === V_THRESH - V_REST;

  const t0 = Date.now();
  const oracleNet = loadSNN(modelPath);
  const oracleTrace = [];
  const oracle = run(oracleNet, text, oracleTrace);
  const port = loadFeatureTime(modelPath);
  const preds = port.predict(text, { trace: true, outTrace: true });
  const hardTrace = port.hardTrace;

  let agree = 0, spikeAgree = 0, hitP = 0, hitO = 0;
  const mismatches = [], spikeFails = [];
  for (let i = 0; i < text.length; i++) {
    if (preds[i] === oracle[i]) agree++;
    else if (mismatches.length < 8) mismatches.push({
      at: i, ctx: text.slice(Math.max(0, i - 24), i + 1), port: preds[i], reference: oracle[i],
    });
    if (sameIds(hardTrace[i], oracleTrace[i])) spikeAgree++;
    else if (spikeFails.length < 3) spikeFails.push({ at: i, port: hardTrace[i].length, reference: oracleTrace[i].length });
    if (i + 1 < text.length) {
      if (preds[i] === text[i + 1]) hitP++;
      if (oracle[i] === text[i + 1]) hitO++;
    }
  }

  // One-hot output spike of the winning character, read with the engine's WTA decoder.
  let wtaOk = true, wtaBad = null;
  for (let i = 0; i < text.length; i++) {
    const spikes = port.outTrace[i];
    const decoded = SA.Dec.wta(spikes);
    const expect = preds[i] == null ? -1 : port.outIndex.get(preds[i]);
    if (decoded !== expect) { wtaOk = false; wtaBad = { at: i, decoded, expect, pred: preds[i] }; break; }
  }

  // Diagnostic only: sum exported readout weights of the hard-firing cells and take the max.
  // The Toy does not predict this way; the gap shows why span competition is the readout.
  const byCell = new Map();
  for (const r of doc.readout) {
    let list = byCell.get(r.pre);
    if (!list) byCell.set(r.pre, list = []);
    list.push(r);
  }
  const outChars = port.outputs.map(o => o.char);
  let wAgree = 0;
  for (let i = 0; i < text.length; i++) {
    const score = new Map();
    for (const id of hardTrace[i]) {
      const list = byCell.get(id);
      if (!list) continue;
      for (const r of list) score.set(r.char, (score.get(r.char) || 0) + r.weight);
    }
    let best = null, bv = 0;
    for (const ch of outChars) { const v = score.get(ch) || 0; if (v > bv) { bv = v; best = ch; } }
    if (best === oracle[i]) wAgree++;
  }

  const fine = [];
  let fineOk = true;
  for (const sub of [2, 3]) {
    const t1 = Date.now();
    const fp = port.predictFine(text, sub);
    const idle = port.idleSpikes;
    const ok = samePreds(fp, preds) && idle === 0;
    if (!ok) fineOk = false;
    fine.push({ substeps: sub, agreePct: pct(fp.filter((p, i) => p === preds[i]).length, text.length), idleSpikes: idle, secs: +((Date.now() - t1) / 1000).toFixed(2), ok });
  }

  port.reset();
  const streamed = new Array(text.length);
  for (let i = 0; i < text.length; i++) streamed[i] = port.step(text[i]);
  const streamOk = samePreds(streamed, preds);
  const again = port.predict(text);
  const deterministic = samePreds(again, preds);

  const agreePct = pct(agree, text.length);
  const spikePct = pct(spikeAgree, text.length);
  const ok = lifOk && wtaOk && fineOk && streamOk && deterministic && agreePct >= 99 && spikePct >= 99;

  const report = {
    model: path.basename(modelPath),
    modelSha256_16: sha16(modelBuf),
    sample: path.basename(samplePath),
    sampleSha256_16: sha16(text),
    chars: text.length,
    net: port.summary(),
    agreePct,
    agree: agree,
    spikeAgreePct: spikePct,
    portNextPct: pct(hitP, text.length - 1),
    referenceNextPct: pct(hitO, text.length - 1),
    weightSumWtaPct: pct(wAgree, text.length),
    lifOk, wtaOk, wtaBad, streamOk, deterministic,
    fine,
    mismatches, spikeFails: spikeFails.length ? spikeFails : undefined,
    secs: +((Date.now() - t0) / 1000).toFixed(2),
    pass: ok,
  };
  const outFile = path.join(__dirname, 'agreement.json');
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  console.log(ok ? 'FEATURE-TIME PORT PASS (>=99%)' : 'FEATURE-TIME PORT FAIL');
  process.exitCode = ok ? 0 : 1;
}

main();
