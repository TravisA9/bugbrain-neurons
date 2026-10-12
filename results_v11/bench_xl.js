// predictK2XL (60x60, text): grow with v11, then simulate the same brain with v11 and with legacy/v10's net
const A=require('/workspace/spiking-arena/js/node_load.js')(), B=require('/workspace/spiking-arena/legacy/v10/js/node_load.js')();
const NS=+(process.env.NS||60);
const envA=A.setEnv('seq',{source:'text',nSyms:NS,clock2:true}); const d=A.createPredict2Plan(A.PREDICT2_XL);
let t0=Date.now(); const b=A.growCell(d,{seed:100,spec:envA.spec}); const tg=Date.now()-t0;
const bj=JSON.parse(JSON.stringify(b)); let syn=0; for(const w of b.W) if(w) syn++;
t0=Date.now(); const a=A.runEpisode(d,5,b,envA); const ta=Date.now()-t0;
const envB=B.setEnv('seq',{source:'text',nSyms:NS,clock2:true}); const b2=Object.assign({},bj); for(const k in b) if(ArrayBuffer.isView(b[k])) b2[k]=new b[k].constructor(Object.values(bj[k]));
t0=Date.now(); const c=B.runEpisode(d,5,b2,envB); const tb=Date.now()-t0;
console.log('K2XL 60 N',b.N,'syn',syn,'grow ms (v11)',tg,'sim ms v10',tb,'v11',ta,'ticks',NS*10,'ticks/s v10',(NS*10/tb*1000).toFixed(0),'v11',(NS*10/ta*1000).toFixed(0),'acc v10/v11',c.task.stats().accuracy.toFixed(3),a.task.stats().accuracy.toFixed(3));
