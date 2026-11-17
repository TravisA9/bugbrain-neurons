// R122: in free-running generation, does the full hidden state (set of active cells per symbol slot) re-enter an identical state? node gstate.js <genDump.json> <lifeDump base (gran mask)>
const fs = require('fs'), G = JSON.parse(fs.readFileSync(process.argv[2])), A = ' .abcdefghiklmnoprstuvwy', s = G.gen.map(i => A[i]).join(''), act = G.act.map(a => a.join(','));
const gr = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3] + '.json')).gran : null;
const first = new Map(); let cyc = null; for (let t = 0; t < act.length; t++) { if (first.has(act[t])) { cyc = { t0: first.get(act[t]), t1: t, period: t - first.get(act[t]) }; break; } first.set(act[t], t); }
const tl = s.slice(-200); let per = 0; for (let p = 1; p <= 100 && !per; p++) { let ok = 1; for (let i = p; i < tl.length; i++) if (tl[i] !== tl[i - p]) { ok = 0; break; } if (ok) per = p; }
let symStart = -1; if (per) for (let t = 0; t + per < s.length; t++) if (s.slice(t) === s.slice(t + per) + s.slice(s.length - per, s.length).slice(0, 0) || s.slice(t, s.length - per) === s.slice(t + per)) { symStart = t; break; }
const jac = (a, b) => { const A1 = new Set(G.act[a]), B1 = new Set(G.act[b]); let i = 0; for (const x of A1) if (B1.has(x)) i++; return i / (A1.size + B1.size - i); };
const jl = []; if (per) for (let t = s.length - 3 * per; t < s.length; t++) if (t - per >= 0) jl.push(jac(t, t - per));
const diff = []; if (per) { const t = s.length - 1, a = new Set(G.act[t]), b = new Set(G.act[t - per]); let ga = 0, na = 0; for (const x of a) if (!b.has(x)) { if (gr && gr[x]) ga++; else na++; } for (const x of b) if (!a.has(x)) { if (gr && gr[x]) ga++; else na++; } diff.push({ granDiff: ga, otherDiff: na, size: a.size }); }
console.log(JSON.stringify({ sample: s.slice(0, 80), textPeriod: per, textLoopFrom: symStart, firstExactStateRepeat: cyc, jaccardInLoop: jl.length ? +(jl.reduce((x, y) => x + y) / jl.length).toFixed(4) : null, minJ: jl.length ? +Math.min(...jl).toFixed(4) : null, diff }));
