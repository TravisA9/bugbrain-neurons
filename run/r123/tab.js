// node sw/tab.js K si regex [tagSuffix] -> mean (sd) per size for matching metric keys
const fs=require('fs'); const [K,si,re,tag]=process.argv.slice(2); const F=[1,1.25,1.5,1.75,2,2.5,3,4], G=[5,11,23,37,51,64,78,91];
const src=fs.readFileSync('sw/ana.js','utf8'); const mfn=new Function('return '+src.match(/function metrics[\s\S]*?\n  return m; }/)[0].replace(/^function metrics/,'function'))();
const peak=ps=>{ let b=-1,m=-1; for(let i=12;i<ps.length;i++) if(ps[i]>m){m=ps[i];b=i;} return b-12; };
const half=ps=>{ const base=ps.slice(0,12).reduce((a,b)=>Math.min(a,b),1e9), pk=Math.max(...ps.slice(12)); for(let i=12;i<ps.length;i++) if(ps[i]>=base+0.5*(pk-base)) return i-12; return null; };
globalThis.peak=peak; globalThis.half=half;
const D={}; for(const f of F) D[f]=G.map(g=>{const p=`sw/out/K${K}_f${f}_si${si}_g${g}${tag?'_'+tag:''}.json`; if(!fs.existsSync(p)&&tag&&f===1) {const q=`sw/out/K${K}_f1_si0_g${g}.json`; return fs.existsSync(q)?mfn(JSON.parse(fs.readFileSync(q))):null;} return fs.existsSync(p)?mfn(JSON.parse(fs.readFileSync(p))):null;});
const keys=new Set(); for(const f of F) for(const m of D[f]) if(m) Object.keys(m).forEach(k=>{ if(new RegExp(re).test(k)) keys.add(k); });
const fmt=x=>x==null||!isFinite(x)?'-':Math.abs(x)>=1000?x.toFixed(0):Math.abs(x)>=10?x.toFixed(1):Math.abs(x)>=1?x.toFixed(2):x.toFixed(3);
console.log('| metric (K'+K+' si'+si+(tag?' '+tag:'')+') | '+F.map(f=>f+'x').join(' | ')+' |'); console.log('|---'.repeat(F.length+1)+'|');
for(const k of [...keys].sort()){ const row=F.map(f=>{const v=D[f].filter(Boolean).map(m=>m[k]).filter(x=>x!=null&&isFinite(x)); if(!v.length) return '-'; const mu=v.reduce((a,b)=>a+b,0)/v.length, sd=Math.sqrt(v.reduce((a,b)=>a+(b-mu)**2,0)/Math.max(1,v.length-1)); return fmt(mu)+(process.env.SD?' ('+fmt(sd)+')':''); }); console.log(`| ${k} | ${row.join(' | ')} |`); }
