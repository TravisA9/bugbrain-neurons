const f=+process.argv[2], si=+process.argv[3], g=+(process.argv[4]||5);
const S=require('../js/node_load.js')(); S.params.scaleInvariant=si; S.params.granN=128;
const envP=Object.assign({},S.recommendedEnvParams('seq',{source:'order3',K:8},['source']),{nSyms:160});
const E=S.setEnv('seq',envP); const D=S.PLANS.deepURSx3.make(); D.regions.forEach(R=>{R.g.sc.sizeF=f;});
let t=Date.now(); const b=S.growCell(D,{seed:g,spec:E.spec}); const tg=Date.now()-t; t=Date.now();
const a=S.runEpisode(D,g+2,b,E); console.log(JSON.stringify({f,si,g,N:b.N,score:a.task.score(),tg,tr:Date.now()-t,rss:process.memoryUsage().rss/1e9, names:D.regions.map(r=>r.name||r.id), bkeys:Object.keys(b), netkeys:Object.keys(a.net).slice(0,80)}));
