// compare plans on text with fresh seeds: [BASE=PREDICT2_XM] [TUNE='{...}'] [PP='{"readIn":0.01}'] [S0=20] [NG=8] [NS=1000] node results_v15/cmp.js
// prints mean acc / last quarter / calSoft / calCount, ticks/s, N, growth ms
const SA=require('/workspace/spiking-arena/js/node_load.js')();
const NS=+(process.env.NS||1000), NG=+(process.env.NG||8), S0=+(process.env.S0||20);
const T=Object.assign({},SA[process.env.BASE||'PREDICT2_XM'],JSON.parse(process.env.TUNE||'{}'));
let r={acc:0,lastq:0,calSoft:0,calCount:0,tps:0,N:0,grow:0};
for(let g=0;g<NG;g++){ const env=SA.setEnv('seq',Object.assign({source:'text',nSyms:NS,clock2:true},JSON.parse(process.env.PP||'{}')));
  const d=SA.createPredict2Plan(T); let t0=Date.now(); const b=SA.growCell(d,{seed:S0+g,spec:env.spec}); const tg=Date.now()-t0;
  t0=Date.now(); const a=SA.runEpisode(d,1000+S0+g,b,env); const ts=Date.now()-t0, st=a.task.stats();
  r.acc+=st.accuracy/NG; r.lastq+=st.lastQuarter/NG; r.calSoft+=st.bitsSoft/NG; r.calCount+=st.bitsCount/NG; r.tps+=a.task.t/ts*1000/NG; r.N+=b.N/NG; r.grow+=tg/NG; }
console.log(Object.entries(r).map(([k,v])=>k+' '+(v<10?v.toFixed(3):v.toFixed(0))).join('  '));
