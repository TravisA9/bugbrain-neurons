// perf/verify.js [out.json]: fixed-seed fingerprints (growth W hash, final ws hash, fitness) for several tasks/seeds
const L=require((process.env.ROOT||'..')+'/run/lib.js'),SA=L.SA,crypto=require('crypto'),fs=require('fs');
const H=a=>crypto.createHash('sha1').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex').slice(0,12);
const T=[['text','seq',{source:'text',nSyms:1000}],['order3','seq',{source:'order3',nSyms:1000}],['fables','seq',{source:'fables',nSyms:1000}],['order2','seqchoice',{source:'order2',nSyms:1000}],['bandit','bandit',{}]];
const seeds=(process.env.SEEDS||'11,23,37').split(',').map(Number),out={};let gms=0,lms=0;
for(const [n,e,p] of T){const env=L.setupTask({name:n,env:e,params:p});const dp=env.defaultPlan;const pn=typeof dp==='function'?dp(env.P||p):(dp||'unifiedR');const plan=e==='bandit'?'unifiedR':'deepURSx3';
 for(const s of seeds){const g=SA.PLANS[plan].make();let t=performance.now();const b=SA.growCell(g,{seed:s,spec:env.spec});gms+=performance.now()-t;
  const W=b.W instanceof Float32Array||b.W instanceof Float64Array?b.W:Float64Array.from(b.W);t=performance.now();
  const a=new SA.Agent(g,s,b,env);while(!a.done)a.tick();lms+=performance.now()-t;const ws=a.net.ws;
  out[n+'/'+s]=[plan,H(W),H(ws),a.fitness];}}
const f=process.argv[2];if(f)fs.writeFileSync(f,JSON.stringify(out,null,0));
console.log(JSON.stringify(out).length,'growMs',gms.toFixed(0),'lifeMs',lms.toFixed(0));
