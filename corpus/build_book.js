// corpus/build_book.js (R60): rebuild js/envs/book.js from Project Gutenberg (public domain).  node corpus/build_book.js [rawDir]
// Downloads the 13 books (cached in rawDir, default corpus/raw, not committed), cleans them to the 24-symbol fables alphabet,
// holds out the last ~5 % of every book (cut at a sentence end), fills corpus/book_template.js -> js/envs/book.js.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ids = [19994, 2591, 1597, 55, 16, 289, 500, 2781, 11, 271, 113, 1448, 902];
const RAW = path.resolve(process.argv[2] || path.join(__dirname, 'raw')), ALPHA = ' .abcdefghiklmnoprstuvwy'.split('');
fs.mkdirSync(RAW, { recursive: true });
for (const id of ids) { const f = path.join(RAW, `pg${id}.txt`); if (!fs.existsSync(f)) cp.execFileSync('curl', ['-sSL', '-m', '120', '-o', f, `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`]); }
const clean = t => { const a = t.indexOf('*** START OF'), b = t.indexOf('*** END OF'); t = t.slice(t.indexOf('\n', a) + 1, b > 0 ? b : undefined);
  return t.replace(/\[Illustration[^\]]*\]/gi, ' ').replace(/\r/g, '').toLowerCase()
    .replace(/[àáâä]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i').replace(/[òóôö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/ç/g, 'c').replace(/æ/g, 'ae').replace(/œ/g, 'oe')
    .replace(/['’‘]/g, '').replace(/[.!?;:]+/g, '.').replace(/qu/g, 'kw').replace(/q/g, 'k').replace(/x/g, 'ks').replace(/z/g, 's').replace(/j/g, 'g')
    .replace(/[^a-z.]+/g, ' ').replace(/ *\. */g, '. ').replace(/(\. )+/g, '. ').replace(/ +/g, ' ').trim(); };
const train = [], held = [];
for (const id of ids) { const t = clean(fs.readFileSync(path.join(RAW, `pg${id}.txt`), 'utf8')); const cut = t.indexOf('. ', Math.floor(t.length * 0.95)) + 2; train.push(t.slice(0, cut)); held.push(t.slice(cut)); }
const TR = train.join(' '), HE = held.join(' ');
if ([...new Set(TR + HE)].some(c => !ALPHA.includes(c))) throw new Error('symbol outside the alphabet');
const out = fs.readFileSync(path.join(__dirname, 'book_template.js'), 'utf8').replace('@TRN@', TR.length).replace('@HLD@', HE.length)
  .replace('@TRAIN@', () => JSON.stringify(TR)).replace('@HELD@', () => JSON.stringify(HE));
fs.writeFileSync(path.join(__dirname, '..', 'js', 'envs', 'book.js'), out); console.log('train', TR.length, 'held', HE.length);
