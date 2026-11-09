'use strict';
/* Job templates the desk is allowed to submit. Each one is a real queue job:
 * run/r42.js or run/gen.js, plan deepURSx3, and the v47 pins already used by run/r116_jobs.js.
 * One growth, so a person can queue a check without launching a multi-hour sweep.
 * Phones and browsers do not run these; a worker process does. */
const V47 = ['pl.lr@cortex=0.2', 'P.granN=32000', 'P.granKmin=3', 'P.granK=4', 'P.granW=60', 'P.granLrT=100000', 'P.granLrLate=0.05', 'P.fastEngine=1'].join(',');
const REQ = ['run/r42.js', 'run/gen.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/lib.js'];
const SCRIPTS = new Set(['run/r42.js', 'run/gen.js']);

const TEMPLATES = [
  {
    id: 'read-book-short',
    title: 'Short reading check',
    plain: 'One growth of the current v47 brain reads 3,000 characters of the book and scores how well it predicts the next letter.',
    where: 'Runs on a Windows or Linux worker that allows about 2 GB (linux-pc does). A phone limited to 1 GB will skip it. A browser cannot run it.',
    estHours: 0.2,
    build(seed) {
      const task = { env: 'seq', params: { source: 'book', nSyms: 3000, evalSyms: 500 } };
      return runJob('read-book-short', seed, 'run/r42.js', task, null, 'Short reading check, v47, one growth, book 3,000 characters');
    },
  },
  {
    id: 'order3',
    title: 'Order-3 pattern',
    plain: 'One growth of the current v47 brain on the order-3 sequence task the queue already uses.',
    where: 'Runs on a Windows or Linux worker that allows about 2 GB. Not on a phone browser.',
    estHours: 0.15,
    build(seed) {
      const task = { env: 'seq', params: { source: 'order3', K: 8, readIn: 0.01 } };
      return runJob('order3', seed, 'run/r42.js', task, null, 'Order-3 pattern, v47, one growth');
    },
  },
  {
    id: 'seqchoice',
    title: 'Sequence choice',
    plain: 'One growth of the current v47 brain on the sequence-choice task (order-2, 1,000 symbols).',
    where: 'Runs on a Windows or Linux worker that allows about 2 GB. Not on a phone browser.',
    estHours: 0.15,
    build(seed) {
      const task = { env: 'seqchoice', params: { source: 'order2', nSyms: 1000 } };
      return runJob('seqchoice', seed, 'run/r42.js', task, null, 'Sequence choice, v47, one growth, order-2');
    },
  },
  {
    id: 'generate-short',
    title: 'Short generation sample',
    plain: 'One growth lives a short book passage, then writes 200 characters on its own. The score is distinct 4-grams, the same measure as the latest generation tests.',
    where: 'Runs on a Windows or Linux worker that allows about 2 GB. Not on a phone browser.',
    estHours: 0.25,
    build(seed) {
      const task = { env: 'seq', params: { source: 'book', nSyms: 3000, evalSyms: 500, genSyms: 200 } };
      return runJob('generate-short', seed, 'run/gen.js', task, { BB_GEN_MEAN: 'distinct4' }, 'Short generation sample, v47, one growth, 200 characters');
    },
  },
];

function runJob(slug, seed, script, task, extraEnv, title) {
  if (!SCRIPTS.has(script)) throw new Error('unsupported script');
  const id = 'desk-' + slug + '-g' + seed;
  const args = ['deepURSx3', JSON.stringify(task), '1', V47, String(seed), '--force'];
  const env = Object.assign({ BB_OUT: 'results/phone/' + id + '.jsonl' }, extraEnv || {});
  return {
    id, question: 'desk', track: 'neuro', kind: 'runs', requires: REQ.slice(), title,
    priority: 0.5, estHours: (TEMPLATES.find(t => t.id === slug) || {}).estHours || 0.2,
    slotHours: (TEMPLATES.find(t => t.id === slug) || {}).estHours || 0.2,
    phone: false, memGB: 2,
    accept: { note: title + '. Submitted from the desk. One growth, seed ' + seed + ', v47 pins from R116. Not a phone or browser run.' },
    runs: [{ script, args, label: title + ' g' + seed, env }],
  };
}

function listTemplates() {
  return TEMPLATES.map(t => ({ id: t.id, title: t.title, plain: t.plain, where: t.where, estHours: t.estHours, runsOn: 'windows-or-linux-worker' }));
}

function buildTemplate(id, seed) {
  const t = TEMPLATES.find(x => x.id === id);
  if (!t) { const e = new Error('Unknown test. Pick one of the tests on the page.'); e.code = 'template'; throw e; }
  const n = +seed;
  if (!Number.isInteger(n) || n < 0 || n > 1000000) { const e = new Error('Growth number must be a whole number from 0 to 1000000.'); e.code = 'seed'; throw e; }
  const job = t.build(n);
  assertJob(job);
  return job;
}

function assertJob(j) {
  if (!j || !/^desk-[a-z0-9-]+$/.test(j.id)) throw new Error('refusing a test id outside the desk');
  if (j.kind !== 'runs' || !Array.isArray(j.runs) || !j.runs.length) throw new Error('desk tests are run lists');
  for (const r of j.runs) {
    if (!SCRIPTS.has(r.script)) throw new Error('refusing script ' + r.script);
    if (!Array.isArray(r.args) || r.args.some(a => typeof a !== 'string' || /[\0\n]/.test(a))) throw new Error('bad arguments');
  }
  return j;
}

module.exports = { TEMPLATES, V47, SCRIPTS, listTemplates, buildTemplate, assertJob };
