// current (v18, growth viewer + passive recorder) vs legacy/v18: identical growth (W, thresholds) and episode stats, many plans/envs/seeds
const A=require('/workspace/spiking-arena/js/node_load.js')(), B=require('/workspace/spiking-arena/legacy/v18/js/node_load.js')();
const crypto=require('crypto'); const h=x=>crypto.createHash('md5').update(Buffer.from(x.buffer,x.byteOffset,x.byteLength)).digest('hex');
const cases=[['v3h','bug',{episodeTicks:300}],['v1','bug',{episodeTicks:200}],['memoryK','recall',{nTrials:4}],['memory','cue',{nTrials:4}],['predictK','seq',{source:'cycle',K:6,nSyms:60}],
 ['predictK','seq',{source:'markov',K:8,nSyms:60}],['predictK2','seq',{source:'order2',K:6,nSyms:60,clock2:true}],['predictKL','seq',{source:'text',nSyms:30}],['predictK2L','seq',{source:'text',nSyms:20,clock2:true}],['predictK2XL','seq',{source:'text',nSyms:30,clock2:true}],['predictK2XT','seq',{source:'text',nSyms:30,clock2:true}],['predictK2XN','seq',{source:'text',nSyms:30,clock2:true}],['predictK2XM','seq',{source:'text',nSyms:30,clock2:true}],['predictK2XS','seq',{source:'text',nSyms:30,clock2:true}],['predictK2XG','seq',{source:'text',nSyms:30,clock2:true}],['v1','text',{}]];
let bad=0;
for(const [pl,env,pp] of cases) for(const sd of [1,2]){
 const ea=A.setEnv(env,pp), eb=B.setEnv(env,pp); const da=A.PLANS[pl].make(), db=B.PLANS[pl].make();
 const ga=A.growCell(da,{seed:sd,spec:ea.spec}), gb=B.growCell(db,{seed:sd,spec:eb.spec});
 const wOk=h(ga.W)===h(gb.W) && JSON.stringify(Array.from(ga.thresh||[]))===JSON.stringify(Array.from(gb.thresh||[]));
 const ra=A.runEpisode(da,9+sd,ga,ea), rb=B.runEpisode(db,9+sd,gb,eb);
 const sa=JSON.stringify(ra.task.stats?ra.task.stats():ra.fitness), sb=JSON.stringify(rb.task.stats?rb.task.stats():rb.fitness);
 const ok=wOk&&sa===sb&&ra.net.spikeCount===rb.net.spikeCount&&h(ra.net.ws)===h(rb.net.ws)&&h(ra.net.v)===h(rb.net.v); if(!ok){bad++; console.log('DIFF',pl,env,sd,wOk,sa===sb,ra.net.spikeCount,rb.net.spikeCount);} }
console.log(bad?'NOT IDENTICAL '+bad:'v18 equivalence: ALL IDENTICAL');
