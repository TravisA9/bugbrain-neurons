// node sw/troph.js si f1,f2,.. -> growth-only trophic margin per size (cortex region = the output region), 8 seeds
const L=require('./load_diag.js'); const [si,fs_]=process.argv.slice(2); const out=[];
for(const f of fs_.split(',').map(Number)) for(const g of [5,11,23,37,51,64,78,91]){
  const S=L(); S.params.scaleInvariant=+si; S.params.granN=128;
  const envP=Object.assign({},S.recommendedEnvParams('seq',{source:'order3'},['source']),{nSyms:160}); const E=S.setEnv('seq',envP);
  const D=S.PLANS.deepURSx3.make(); D.regions.forEach(R=>{R.g.sc.sizeF=f;}); const b=S.growCell(D,{seed:g,spec:E.spec});
  const T=S.__ctx.__TROPH, cx=T.find(t=>t.nOut>0);   // the output (cortex) region's trophic stage
  const proj=cx.cells.filter(c=>c[1]>0).map(c=>c[0]).sort((a,b)=>a-b), oth=cx.cells.filter(c=>c[1]===0).map(c=>c[0]).sort((a,b)=>a-b);
  const q=(a,p)=>a.length?a[Math.min(a.length-1,Math.floor(p*a.length))]:null;
  const r={f,si:+si,g,nOutProj:proj.length,projBelow:proj.filter(x=>x<1).length,projMin:q(proj,0),projP10:q(proj,0.1),projMed:q(proj,0.5),projMax:q(proj,1),othBelow:oth.filter(x=>x<1).length,othN:oth.length,
    perOut:Object.values(cx.perOut).map(o=>({n:o.n,maxShare:+(o.maxShare/cx.trophMin).toFixed(3),medShare:+(o.medShare/cx.trophMin).toFixed(3),nAbove:o.nAbove})),orphan:b.regions[0].devStats.orphanOut,deaths:b.regions[0].devStats.trophicDeaths,
    otherRegions:T.filter(t=>t.nOut===0).map(t=>t.cells.filter(c=>c[0]<1).length)};
  out.push(r); console.log(JSON.stringify(r)); }
require('fs').writeFileSync(`sw/out/troph_si${si}_${fs_.replace(/,/g,'-')}.json`,JSON.stringify(out));
