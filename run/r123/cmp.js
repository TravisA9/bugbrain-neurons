// node sw/cmp.js K -> score per size: si0 / si1 / rg (n, mean, min) + health highlights for rg
const fs=require('fs'), K=process.argv[2]||4, G=[5,11,23,37,51,64,78,91];
const ld=(f,si,t)=>G.map(g=>`sw/out/K${K}_f${f}_si${si}_g${g}${t?'_'+t:''}.json`).filter(p=>fs.existsSync(p)).map(p=>JSON.parse(fs.readFileSync(p)));
const s=R=>R.length?`${(R.reduce((a,r)=>a+r.score,0)/R.length).toFixed(3)} (n${R.length}, min ${Math.min(...R.map(r=>r.score)).toFixed(2)})`:'-';
const m=(R,fn)=>R.length?(R.reduce((a,r)=>a+fn(r),0)/R.length):NaN;
const reg=(r,n)=>r.regions.find(x=>x.name===n);
console.log(`| size | si=0 | si=1 | relGrowth | rg silentIn | rg orphans | rg cortex E/I | rg ctx runaway (max of 3) | rg mix cell rate |`); console.log('|---|---|---|---|---|---|---|---|---|');
for(const f of [1,1.05,1.15,1.2,1.25,1.35,1.5,1.75,2,2.5,3,4]){ const A=ld(f,0,''),B=ld(f,1,''),C=ld(f,0,'rg');
  console.log(`| ${f}x | ${s(A)} | ${s(B)} | ${s(C)} | ${m(C,r=>r.devStats.reduce((a,d)=>a+d.silentIn,0)).toFixed(1)} | ${m(C,r=>r.devStats[0].orphanOut).toFixed(2)} | ${m(C,r=>reg(r,'cortex').EI).toFixed(2)} | ${m(C,r=>Math.max(...['context','context 2','context 3'].map(n=>reg(r,n).runawaySubFrac))).toFixed(2)} | ${m(C,r=>{const t=Object.entries(r.types).filter(([k])=>k.startsWith('cortex:21')&&k.includes('m'));return t.length?t[0][1].rate:NaN}).toFixed(4)} |`); }
