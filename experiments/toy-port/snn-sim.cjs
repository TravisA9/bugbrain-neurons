// Minimal SNN simulator for *.snn.json (one tick per character), plus a fidelity check against the Toy.
// node snn-sim.cjs [snn.json] [model.json]
const fs=require('fs');
function loadSNN(file){const e=JSON.parse(fs.readFileSync(file,'utf8'));
  const cells=e.neurons.filter(n=>n.type==='cell').map(n=>({...n,taps:[],votes:[]})),byId=new Map(cells.map(c=>[c.id,c]));
  const inCh=new Map(e.neurons.filter(n=>n.type==='input').map(n=>[n.id,n.char]));
  for(const s of e.synapses){const c=byId.get(s.post);if(inCh.has(s.pre))c.taps.push({letter:true,ch:inCh.get(s.pre),delay:s.delay});else c.taps.push({letter:false,id:s.pre,delay:s.delay});}
  for(const r of e.readout)byId.get(r.pre).votes.push([r.char,r.votes]);
  // Topological order: a delay-0 synapse from another cell must be evaluated first in the same tick.
  const order=new Map(),ord=c=>{if(order.has(c.id))return order.get(c.id);order.set(c.id,0);let o=0;for(const t of c.taps)if(!t.letter&&t.delay===0&&byId.has(t.id))o=Math.max(o,1+ord(byId.get(t.id)));order.set(c.id,o);return o;};
  cells.forEach(ord);cells.sort((a,b)=>order.get(a.id)-order.get(b.id));
  for(const c of cells){c.idx=0;const ch=c.votes.filter(([,n])=>n>=2).sort((a,b)=>b[1]-a[1]);const tot=c.votes.reduce((s,[,n])=>s+n,0);c.vote=ch.length?{char:ch[0][0],conf:ch[0][1]/tot,total:tot}:null;}
  cells.forEach((c,i)=>c.idx=i);
  return {e,cells,byId,soft:e.neuronModel.softFire,cfg:e.ftConfig||{}};}
function run(net,text,trace=null){const {cells,soft:frac,cfg}=net,N=cells.length,R=64;
  const hard=Array.from({length:R},()=>new Uint8Array(N)),sft=Array.from({length:R},()=>new Uint8Array(N));
  const idxOf=new Map(cells.map(c=>[c.id,c.idx]));for(const c of cells)for(const t of c.taps)if(!t.letter)t.i=idxOf.get(t.id);
  let hist='';const out=[];
  for(let t=0;t<text.length;t++){hist+=text[t];const H=hist.length,h=hard[t%R],s=sft[t%R];h.fill(0);s.fill(0);
    const at=(arr,d,i)=>d<=t&&d<R&&arr[(t-d)%R][i]===1;
    const active=[],softA=[],context=[];
    for(const c of cells){const n=c.taps.length;if(!n)continue;let sum=0,loose=0,trig=false;
      for(const tp of c.taps){const ok=tp.letter?(tp.delay<H&&hist[H-1-tp.delay]===tp.ch):(tp.i!==undefined&&at(hard,tp.delay,tp.i));
        const near=ok||(!tp.letter&&frac<1&&tp.i!==undefined&&at(sft,tp.delay,tp.i));if(ok)sum++;if(near){loose++;if(tp.delay===0)trig=true;}}
      if(sum<n){if(frac<1&&trig&&n>=3&&loose>=Math.ceil(frac*n)){s[c.idx]=1;const p=softA[c.span-1];if(!p||c.count>p.count)softA[c.span-1]=c;}continue;}
      h[c.idx]=1;if(c.abstract){context.push(c);continue;}const p=active[c.span-1];if(!p||c.count>p.count)active[c.span-1]=c;}
    if(trace)trace.push(cells.filter(c=>h[c.idx]).map(c=>c.id));out.push(readout(active,softA.filter(Boolean),context,cfg));}
  return out;}
function readout(active,soft,context,cfg){let exact=null;
  for(let d=active.length-1;d>=1&&!exact;d--){const c=active[d];if(c&&c.vote)exact={...c.vote,cell:c};}
  if(exact&&cfg.softOutrank!==false&&exact.conf<(cfg.outrankConf??0.8)){let best=null;
    for(const list of [context,soft])for(const c of list){const v=c.vote;if(c.span<=exact.cell.span||!v||v.total<4||v.conf<(cfg.outrankConf??0.8)||v.conf<exact.conf+0.1)continue;
      if(!best||v.conf>best.conf||(v.conf===best.conf&&c.span>best.cell.span))best={...v,cell:c};}
    if(best)return best.char;}
  if(exact)return exact.char;
  for(const list of [context,soft])for(let i=list.length-1;i>=0;i--)if(list[i].vote)return list[i].vote.char;
  return null;}
module.exports={loadSNN,run};
if(require.main===module){const H=require('./harness.cjs');
  const snnFile=process.argv[2]||'models/baseline-frozen.snn.json',modelFile=process.argv[3]||'models/baseline-frozen.json';
  const net=loadSNN(snnFile),{api}=H.loadModel(modelFile);
  const res={};for(const [name,text] of [['dialogue',H.dialogueText(api)],['largeTail',H.largeText(1500,40)]]){
    const t0=Date.now(),snn=run(net,text),toy=api.ftPredictProbe(text);let agree=0,hitS=0,hitT=0;const fails=[];
    for(let i=0;i<text.length;i++){if(snn[i]===toy[i])agree++;else if(fails.length<8)fails.push({at:i,ctx:JSON.stringify(text.slice(Math.max(0,i-16),i+1)),toy:toy[i],snn:snn[i]});
      if(i+1<text.length){if(snn[i]===text[i+1])hitS++;if(toy[i]===text[i+1])hitT++;}}
    res[name]={chars:text.length,agreePct:+(100*agree/text.length).toFixed(2),snnAcc:+(100*hitS/(text.length-1)).toFixed(1),toyAcc:+(100*hitT/(text.length-1)).toFixed(1),secs:+((Date.now()-t0)/1000).toFixed(1),fails};}
  const ok=Object.values(res).every(r=>r.agreePct>=99);console.log(JSON.stringify(res,null,1));console.log(ok?'SNN FIDELITY PASS (>=99%)':'SNN FIDELITY FAIL');process.exitCode=ok?0:1;}
