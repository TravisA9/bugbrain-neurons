// v8 equivalence check: old genomes grow and score identically in v9 vs legacy/v8.  node results_v9/equiv8.js
const fs=require('fs'),path=require('path');
const O=require(path.join(__dirname,'..','legacy/v8/js/node_load.js'))(), Nw=require(path.join(__dirname,'..','js/node_load.js'))();
const files=['champions/v8/k8-memoryK-s2.json','champions/v8/cue-memoryK-s3.json','champions/v8/bug-v3h-s1.json','champions/v8/cue-memory-s1.json','champions/v7/cue-memory-s1.json','champions/v6/v3-s1.json'].map(f=>path.join(__dirname,'..',f));
let n=0;
for(const f of files){const t=fs.readFileSync(f,'utf8'); const a=O.brainFromFile(t), b=Nw.brainFromFile(t); O.setEnv(a.env,a.envParams||{}); Nw.setEnv(b.env,b.envParams||{});
 const eo=O.currentEnv(), en=Nw.currentEnv();
 for(const sd of [1,2,3]){ const ga=O.growCell(a.genome,{seed:sd,spec:eo.spec}), gb=Nw.growCell(b.genome,{seed:sd,spec:en.spec});
  if(ga.N!==gb.N) throw new Error(f+' N differs'); for(let i=0;i<ga.W.length;i++) if(ga.W[i]!==gb.W[i]) throw new Error(f+' W differs');
  const sa=O.runEpisode(a.genome,7+sd,ga,eo,3000).task.fitness(), sb=Nw.runEpisode(b.genome,7+sd,gb,en,3000).task.fitness(); if(sa!==sb) throw new Error(f+' score differs '+sa+' '+sb); n++; }}
for(const pl of ['memoryK','memory','v3','v3h','v1']){ for(const e of ['cue','bug']){ O.setEnv(e,{}); Nw.setEnv(e,{}); const da=O.PLANS[pl].make(), db=Nw.PLANS[pl].make();
  const ga=O.growCell(da,{seed:5,spec:O.currentEnv().spec}), gb=Nw.growCell(db,{seed:5,spec:Nw.currentEnv().spec}); for(let i=0;i<ga.W.length;i++) if(ga.W[i]!==gb.W[i]) throw new Error(pl+' '+e+' W differs');
  if(O.runEpisode(da,9,ga,O.currentEnv(),2000).task.fitness()!==Nw.runEpisode(db,9,gb,Nw.currentEnv(),2000).task.fitness()) throw new Error(pl+' score'); n++; } }
console.log('v8 equivalence: ALL IDENTICAL ('+n+' growth+episode checks)');
