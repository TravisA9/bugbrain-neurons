// growth-only fine size scan: node sw/scan.js si seed -> per size: grid, cone, silentIn per region, orphanOut, trophic deaths, sensorFail
const S0=require('../js/node_load.js'); const [si,g]=process.argv.slice(2).map(Number); const out=[];
for(const f of process.argv[4].split(",").map(Number)){ const S=S0(); S.params.scaleInvariant=si; S.params.granN=128;
  const envP=Object.assign({},S.recommendedEnvParams('seq',{source:'order3'},['source']),{nSyms:160}); const E=S.setEnv('seq',envP);
  const D=S.PLANS.deepURSx3.make(); D.regions.forEach(R=>{R.g.sc.sizeF=f;}); const b=S.growCell(D,{seed:g,spec:E.spec});
  const q=Math.sqrt(f), grid=Math.round(60*q), cone=si?Math.ceil(3*q-1e-9):Math.max(1,Math.round(3*q));
  const r={f,si,g,grid,cone,N:b.N,regs:b.regions.map(x=>({n:x.name,silentIn:x.devStats.silentIn,orphan:x.devStats.orphanOut,tD:x.devStats.trophicDeaths,sF:x.devStats.cones.sensorFail,sensor:x.devStats.cones.sensor,outIn:x.devStats.outInMean}))};
  out.push(r); console.log(JSON.stringify(r)); }
require('fs').writeFileSync(`sw/out/scanL_si${si}_g${g}.json`,JSON.stringify(out));
