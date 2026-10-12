// v7 (legacy/v7) vs current: identical growth + scores for v7 genomes in cue/recall/bug/text
const OLD=require('/workspace/spiking-arena/legacy/v7/js/node_load.js')(), NEW=require('/workspace/spiking-arena/js/node_load.js')(), fs=require('fs');
const C='/workspace/spiking-arena/champions/'; let bad=0, n=0;
const cases=[['cue','plan memory',null],['cue','plan v1',null],['bug','plan v3',null],['text','plan v1',null]];
for(const f of fs.readdirSync(C+'v7')) cases.push([null,f,C+'v7/'+f]);
for(const f of ['v3-s1.json','v2-s2.json']) cases.push([null,f,C+'v6/'+f]);
for(const [env0,name,file] of cases){
  let a,b,env=env0,ep={},epn={};
  if(file){const o=fs.readFileSync(file,'utf8'); const ra=OLD.brainFromFile(o), rb=NEW.brainFromFile(o); a=ra.genome;b=rb.genome;env=ra.env;ep=ra.envParams||{}; epn=rb.envParams||{}; }
  OLD.setEnv(env,ep); NEW.setEnv(env,epn); if(!file){const pl=name.split(' ')[1]; a=OLD.PLANS[pl].make(); b=NEW.PLANS[pl].make();}
  if(env==='recall'){OLD.envParams.recall.K=4;}
  const eo=OLD.currentEnv(), en=NEW.currentEnv();
  for(const seed of [undefined,4242]){
    const ga=OLD.growCell(a,{seed,spec:eo.spec}), gb=NEW.growCell(b,{seed,spec:en.spec}); n++;
    let same=ga.N===gb.N; if(same) for(let i=0;i<ga.W.length;i++) if(ga.W[i]!==gb.W[i]){same=false;break;}
    if(same) for(let i=0;i<ga.N;i++) if(ga.thresh[i]!==gb.thresh[i]||ga.leak[i]!==gb.leak[i]) same=false;
    let sa=0,sb=0; if(same){ for(const ep2 of [7,99]){ const x=OLD.runEpisode(a,ep2,ga,eo,3000), y=NEW.runEpisode(b,ep2,gb,en,3000); sa+=x.task.fitness(); sb+=y.task.fitness(); } }
    if(!same||sa!==sb){bad++; console.log('DIFF',env,name,seed,ga.N,gb.N,sa,sb);}
  }
}
console.log(bad?'DIFFERENCES '+bad:'ALL IDENTICAL ('+n+' growths)');
