// R94 (Oct 25 2026): v44 adopted = deepURSx3 with an 8000-cell granule layer and mixed 3/4-letter claws (plan gene d.gran K 4 / Kmin 3).
// Pins every pending deepURSx3 run that leaves the granule claw count (and / or the granule count) to the default, so it keeps its v43 meaning:
//   no P.granK= -> append P.granK=3 (P.granK without P.granKmin = every granule takes 3 claws, exactly v43);  no P.granN= -> append P.granN=4000
//   (y140 only: P.granN=2000, its v41 meaning). Runs with P.granN=0 (no granule layer) are untouched. Bit-identical: checked on the box
//   (text1000 g2360: pinned v43 7.655 = published y174b v43; v44 default 7.625 = published granN8000 Kmix34).
// usage: node run/r94_pin.js <dir of job json files>   (rewrites in place; prints the jobs changed)
const fs = require('fs'), path = require('path'), dir = process.argv[2];
const pin = (s, id) => { if (/(^|,)P\.granN=0(,|$)/.test(s)) return s; const add = [];
  if (!/(^|,)P\.granN=/.test(s)) add.push(/^y140/.test(id) ? 'P.granN=2000' : 'P.granN=4000'); if (!/(^|,)P\.granK=/.test(s)) add.push('P.granK=3');
  if (!add.length) return s; return /,P\.fastEngine=1$/.test(s) ? s.replace(/,P\.fastEngine=1$/, ',' + add.join(',') + ',P.fastEngine=1') : s + ',' + add.join(','); };
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const p = path.join(dir, f), j = JSON.parse(fs.readFileSync(p, 'utf8')); let n = 0;
  for (const r of j.runs || []) if (r.args && r.args[0] === 'deepURSx3') { const v = pin(r.args[3], j.id); if (v !== r.args[3]) { r.args[3] = v; n++; } }
  if (n) { j.title += ' [R94: pinned to v43 claws = P.granK=3]'; fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n'); console.log(j.id, n, 'runs pinned'); } }
