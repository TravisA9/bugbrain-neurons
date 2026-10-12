// What the browser shows after "Reset" / "Evolve": the watched brain is a MUTANT of the default plan (generation 0) or a
// champion, not the plan itself. [NM=12] [NS=400] [PLAN=predictK2XG | TUNE='{"teachAHP":3}' (on top of PREDICT2_XG)] [PP='{"readTicks":3}'] node results_v16/mutants.js
// per brain: accuracy, last quarter, share of predictions = current symbol (echo), = previous symbol, silent ('·')
const SA=require('/workspace/spiking-arena/js/node_load.js')();
const NM=+(process.env.NM||12), NS=+(process.env.NS||400), plan=process.env.PLAN||'predictK2XG';
const mk=()=>process.env.TUNE?SA.createPredict2Plan(Object.assign({},SA.PREDICT2_XG,JSON.parse(process.env.TUNE))):SA.PLANS[plan].make();
const env=SA.setEnv('seq',Object.assign({source:'text',nSyms:NS,clock2:true},JSON.parse(process.env.PP||'{}'))); const r=SA.mulberry32(12345); const sum={};
console.log('brain        acc   lastq  =cur  =prev  silent');
for(let m=-1;m<NM;m++){ const g=m<0?mk():SA.mutateCell(mk(),r);
  const b=SA.growCell(g,{seed:m+2,spec:env.spec}), a=new SA.Agent(g,50+m,b,env), T=a.task, sq=T.seq; let n=0,ec=0,pv=0,si=0;
  while(!a.done){ const pos=T.pos; a.tick(); if(T.pos!==pos&&pos>0){ const k=T.recent[T.recent.length-1][1]; n++; if(k===sq[pos]) ec++; else if(k===sq[pos-1]) pv++; if(T.lastCounts.every(v=>v===0)) si++; } }
  const st=T.stats(), row=[st.accuracy,st.lastQuarter,ec/n,pv/n,si/n];
  console.log((m<0?'plan':'mutant '+m).padEnd(12),row.map(v=>v.toFixed(3)).join('  '));
  if(m>=0) row.forEach((v,i)=>sum[i]=(sum[i]||0)+v/NM); }
console.log('mutant mean ',Object.values(sum).map(v=>v.toFixed(3)).join('  '));
