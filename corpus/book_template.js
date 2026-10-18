/* =====================================================================
 * envs/book.js (R60, I66): a real text corpus for long-life next-character prediction (seq env, source "book").
 * 13 public-domain children's books from Project Gutenberg (Aesop for Children, Grimm, Andersen, Oz, Peter Pan, Wind in the Willows,
 * Pinocchio, Just So Stories, Alice, Black Beauty, The Secret Garden, Heidi, The Happy Prince), Gutenberg header/footer removed,
 * lowercased and reduced to the fables alphabet (24 symbols: a-z without j q x z, space, full stop):
 * j->g, qu->kw, q->k, x->ks, z->s, . ! ? ; : -> full stop, apostrophes dropped, other characters -> space.
 * TRAIN = the first ~95 % of every book (@TRN@ chars); HELD = the last ~5 % of every book (@HLD@ chars), never in TRAIN.
 * Node / Termux only (run/engine.js and js/node_load.js load it); index.html does not, so the app is unchanged.
 * Rebuild: node corpus/build_book.js (downloads + cleans; same output).
 * ===================================================================== */
(function () {
"use strict";
const TRAIN = @TRAIN@;
const HELD = @HELD@;
const ALPHA = " .abcdefghiklmnoprstuvwy".split("");
let bg = null;
function bigram() { if (bg) return bg; const K = ALPHA.length, I = new Map(ALPHA.map((c, i) => [c, i])), n = Array.from({ length: K }, () => new Float64Array(K)), u = new Float64Array(K), L = TRAIN.length;
  for (let i = 0; i + 1 < L; i++) { n[I.get(TRAIN[i])][I.get(TRAIN[i + 1])]++; u[I.get(TRAIN[i])]++; }
  let hit = 0, bits = 0, N = 0; for (const row of n) { let t = 0, m = 0; for (const x of row) { t += x; if (x > m) m = x; } if (!t) continue; hit += m; N += t; for (const x of row) if (x) bits -= x * Math.log2(x / t); }
  let um = 0, ub = 0; for (const x of u) { if (x > um) um = x; if (x) ub -= x / N * Math.log2(x / N); }
  return (bg = { acc: hit / N, bpc: bits / N, uniAcc: um / N, uniBpc: ub }); }
SpikingArena.book = { TRAIN, HELD, ALPHA, bigram };
})();
