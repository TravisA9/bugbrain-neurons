// Hunger / request variants: orphan outputs, silent inputs, failed growths, score.
//   [NG=30] [NE=2] [CASES=recall4:memoryK,bug:v3,cue:memory,...] [VARS='{"off":{},"hunger1":{"hunger":1}}'] node hunger_test.js
const SA=require('./js/node_load.js')();
const NG=+(process.env.NG||30), NE=+(process.env.NE||2);
const cases=(process.env.CASES||'recall4:memoryK').split(',');
const variants=JSON.parse(process.env.VARS||'{"off":{},"hunger1":{"hunger":1},"hunger2":{"hunger":2},"request1":{"request":1},"both":{"hunger":1,"request":1}}');
for(const cs of cases){const [e,plan,file]=cs.split(':'); let env; if(e.startsWith('recall')) env=SA.setEnv('recall',{K:+e.slice(6),delay:20}); else env=SA.setEnv(e,e==='cue'?{delay:20}:{});
 base = plan.endsWith('.json') ? SA.brainFromFile(require('fs').readFileSync(plan,'utf8')).genome : SA.planFor(plan,env).make();
 for(const [vn,v] of Object.entries(variants)){ const d=SA.cloneCell(base); Object.assign(d.sc,v);
  let oo=0,on=0,si=0,ni=0,fail=0,ps=0,sc=0,hs=0;
  for(let k=0;k<NG;k++){const b=SA.growCell(d,{seed:100000+k*7919,spec:env.spec}); const st=b.devStats; oo+=st.orphanOut; on+=st.nOut; si+=st.silentIn; ni+=st.nInUsed; hs+=st.hungerSyn;
   let c=0,n=0,s=0; for(let q=0;q<NE;q++){const a=SA.runEpisode(d,555000+q,b,env); s+=a.task.fitness(); if(a.task&&a.task.seq){c+=a.task.correct; n+=a.task.seq.length;}} sc+=s/NE;
   if(n){ps+=c/n; if(c/n<0.9) fail++;}}
  console.log(`${(cs.split('/').pop()).padEnd(22)} ${vn.padEnd(10)} orphan outputs ${(100*oo/on).toFixed(1).padStart(5)}%  silent inputs ${(100*si/ni).toFixed(1).padStart(5)}%  hunger syn ${(hs/NG).toFixed(1).padStart(5)}  score ${(sc/NG).toFixed(2).padStart(7)}${e!=='bug'&&e!=='text'?`  failed ${String(fail).padStart(2)}/${NG} pass ${(ps/NG).toFixed(3)}`:''}`);}}
