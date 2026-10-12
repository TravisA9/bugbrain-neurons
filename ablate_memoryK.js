// Mechanism ablation of the memoryK plan: [ENV=recall|cue] [K=8] [NG=40] node ablate_memoryK.js
// A growth fails if pass < 0.9 over 2 episodes x 20 trials (delay 20).
const SA=require('./js/node_load.js')();
const K=+(process.env.K||8); const env=SA.setEnv(process.env.ENV||'recall',{K,delay:20});
const NG=+(process.env.NG||40);
const rows=[['memoryK (all mechanisms)',{}],['no synaptic scaling (normE, normI off)',{normE:0,normI:0}],['no excitatory scaling (normE off)',{normE:0}],['no inhibitory scaling (normI off)',{normI:0}],
 ['no growth-until-satisfied',{satisfy:0}],['continuous labels (no input-instructed identity)',{snap:0}],['less redundancy (9 progenitors, short clock)',{nSeed:9,tc:0.2}],
 ['+ juvenile homeostasis on',{homeo:1}],['no topographic matching (topoW 0)',{topoW:0}]];
for(const [name,t] of rows){ const d=SA.createMemoryKPlan(t); let fail=0,ps=0,hid=0;
  for(let k=0;k<NG;k++){const b=SA.growCell(d,{seed:100000+k*7919,spec:env.spec}); hid+=b.nHid; let c=0,n=0; for(let e=0;e<2;e++){const a=SA.runEpisode(d,555000+e,b,env); c+=a.task.correct; n+=a.task.seq.length;} ps+=c/n; if(c/n<0.9) fail++;}
  console.log(`${name.padEnd(50)} failed growths ${String(fail).padStart(3)}/${NG}  mean pass ${(ps/NG).toFixed(3)}  hidden ${(hid/NG).toFixed(0)}`); }
