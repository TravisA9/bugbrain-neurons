const root=process.env.ROOT||'/workspace/spiking-arena';
const SA=require(root+'/js/node_load.js')();
const cases=[['K2 24',{K:6,source:'order2'},{}],['K2L 36',{source:'text'},Object.assign({},SA.PREDICT2_LARGE)],['K2 60',{source:'text'},Object.assign({},SA.PREDICT2_LARGE,{grid:60,maxCells:3300,nSeed:31})]];
for(const [name,pp,T] of cases){ if(process.env.ONLY&&!name.includes(process.env.ONLY))continue;
 const env=SA.setEnv('seq',Object.assign({nSyms:+(process.env.NS||60),clock2:true},pp)); const d=SA.createPredict2Plan(T);
 let t0=Date.now(); const b=SA.growCell(d,{seed:100,spec:env.spec}); const tg=Date.now()-t0;
 t0=Date.now(); const a=SA.runEpisode(d,5,b,env); const ts=Date.now()-t0; const ticks=a.ticks||a.task.t;
 let syn=0; for(let i=0;i<b.W.length;i++) if(b.W[i]) syn++;
 console.log(name,'N',b.N,'syn',syn,'grow ms',tg,'sim ms',ts,'ticks',ticks,'ticks/s',(ticks/ts*1000).toFixed(0),'acc',a.task.stats().accuracy.toFixed(3),'bits',a.task.stats().bits.toFixed(4)); }
