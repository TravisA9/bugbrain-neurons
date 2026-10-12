// Load the engine + environments into Node (same files, same order as index.html).
// const SA = require('./js/node_load.js')();   // fresh, isolated instance each call
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const FILES = ['core/base.js', 'core/io.js', 'core/develop.js', 'core/regions.js', 'core/plans.js', 'core/net.js', 'core/files.js', 'core/agent.js', 'core/evolve.js',
               'envs/bug.js', 'envs/memory.js', 'envs/text.js', 'envs/sequence.js', 'envs/bandit.js', 'envs/reward_evolved.js'];
module.exports = function load(extra) {
  const ctx = vm.createContext({ console, performance, Math, Date, JSON, setTimeout });
  for (const f of FILES.concat(extra || [])) {
    const p = path.isAbsolute(f) ? f : path.join(__dirname, f);
    if (!fs.existsSync(p)) continue;
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: p });
  }
  return ctx.SpikingArena;
};
module.exports.FILES = FILES;
