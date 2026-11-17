const fs=require('fs'); const G=[5,11,23,37,51,64,78,91];
for(const f of [2.5,4]){ console.log(`\n${f}x | arm | n | score mean | per-seed | orphans | trophic deaths`);
 for(const [si,tag] of [[0,''],[0,'trophF'],[0,'cone'],[0,'div'],[0,'net'],[0,'thin'],[1,''],[1,'noTroph']]){
  const R=G.map(g=>{const p=`sw/out/K4_f${f}_si${si}_g${g}${tag?'_'+tag:''}.json`; return fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):null;}).filter(Boolean); if(!R.length) continue;
  const m=R.reduce((a,r)=>a+r.score,0)/R.length;
  console.log(`| ${si?'si=1':'si=0'}${tag?' +'+tag:''} | ${R.length} | ${m.toFixed(3)} | ${R.map(r=>r.score.toFixed(2)).join(' ')} | ${(R.reduce((a,r)=>a+r.devStats[0].orphanOut,0)/R.length).toFixed(2)} | ${(R.reduce((a,r)=>a+r.devStats[0].trophicDeaths,0)/R.length).toFixed(0)} |`); } }
