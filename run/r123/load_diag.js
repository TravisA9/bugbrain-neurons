// Diagnostic loader: same files as js/node_load.js, but develop.js gets an IN-MEMORY passive hook before the trophic kill
// (records each neuron's trophic level / trophMin and its output targets; draws no random numbers, changes no decision).
// No core file is modified.
const fs=require('fs'), path=require('path'), vm=require('vm'), FILES=require('../js/node_load.js').FILES;
module.exports=function(){ const ctx=vm.createContext({console,performance,Math,Date,JSON,setTimeout,__TROPH:[]});
  for(const f of FILES){ const p=path.join(__dirname,'../js',f); let src=fs.readFileSync(p,'utf8');
    if(f==='core/develop.js'){ const anchor='    for (const c of neurons) if (tro.get(c.id) < sc.trophMin) { kill(';
      if(!src.includes(anchor)) throw new Error('anchor missing');
      src=src.replace(anchor,`    { const oT=new Map(), oW=new Map(), oI=new Map(); for (const s of live) if (s.pre >= 0 && typeof s.post === 'string') { oT.set(s.pre,(oT.get(s.pre)||0)+1); oI.set(s.post,(oI.get(s.post)||0)+Math.abs(s.w)); }
      const per={}; for (const s of live) if (s.pre >= 0 && typeof s.post === 'string') { const q=per[s.post]||(per[s.post]={n:0,maxShare:0,nAbove:0,w:[]}); const sh=Math.abs(s.w)/oI.get(s.post); q.n++; if(sh>q.maxShare)q.maxShare=sh; q.w.push(sh); }
      for (const k in per) { const q=per[k]; q.nAbove=q.w.filter(x=>x>=sc.trophMin).length; q.medShare=q.w.sort((a,b)=>a-b)[q.w.length>>1]; delete q.w; }
      globalThis.__TROPH.push({ nOut, trophMin: sc.trophMin, trophHid: sc.trophHid, perOut: per, cells: neurons.map(c => [tro.get(c.id) / sc.trophMin, oT.get(c.id) || 0]) }); }
` + anchor); }
    vm.runInContext(src,ctx,{filename:p}); }
  ctx.SpikingArena.__ctx=ctx; return ctx.SpikingArena; };
