// node sw/ana.js K [tagFilter]  -> score table + onset table (paired vs 1x, same seed)
const fs=require('fs'), K=process.argv[2]||'4';
const F=[1,1.25,1.5,1.75,2,2.5,3,4], G=[5,11,23,37,51,64,78,91];
const load=(f,si,g)=>{const p=`sw/out/K${K}_f${f}_si${si}_g${g}.json`; return fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):null;};
const peak=ps=>{ let b=-1,m=-1; for(let i=12;i<ps.length;i++) if(ps[i]>m){m=ps[i];b=i;} return b-12; };
const half=ps=>{ const base=ps.slice(0,12).reduce((a,b)=>Math.min(a,b),1e9), pk=Math.max(...ps.slice(12)); for(let i=12;i<ps.length;i++) if(ps[i]>=base+0.5*(pk-base)) return i-12; return null; };
function metrics(r){ const m={score:r.score,N:r.N,silentOut:r.silentOutFrac,outFirstMed:r.outFirstMed,outFirstFrac:r.outFirstFrac,mixInhD:r.mixInhD,mixPool:r.mixPool,'mixInhD*pool':r.mixInhD*r.mixPool};
  for(const d of r.devStats){ for(const k of ['cells','neurons','apoptosis','trophicDeaths','survivors','synapses','outInMean','orphanOut','outCov']) if(d[k]!=null) m[`dev.${d.name}.${k}`]=d[k];
    if(d.neurons) m[`dev.${d.name}.trophDeathFrac`]=d.trophicDeaths/d.neurons; }
  for(const x of r.regions){ if(x.name==='input') continue; for(const k of ['cells','inDegMean','inDegMax','inDegPMeanRecv','inDegPMax','inDegIMean','outDegMean','outDegMax','sE0','sI0','rate','dead','alwaysOn','hiRate','E','I','EI','EImed','mixI','plSatFrac','plZeroFrac','plDwPerSyn','plDwPerRecv','plChangedFrac','plWPerSyn','plWPerRecv','plW0PerRecv','plOnPerRecvPerSlot','maxFrac','runawaySubFrac','quietSlotFrac','lrF8'])
      if(x[k]!=null) m[`${x.name}.${k}`]=x[k];
    m[`${x.name}.psthPeak`]=peak(x.psth); m[`${x.name}.psthHalf`]=half(x.psth); m[`${x.name}.rateQ4/Q1`]=x.rateQ[0]>0?x.rateQ[3]/x.rateQ[0]:null; }
  for(const k in r.types){ const t=r.types[k]; for(const q of ['rate','dead','E','I','inP','inD','n']) m[`T.${k}.${q}`]=t[q]; if(t.I>0) m[`T.${k}.EI`]=t.E/t.I; }
  return m; }
const out=[]; const P=s=>out.push(s);
const data={}; for(const si of [0,1]) for(const f of F) data[si+'_'+f]=G.map(g=>{const r=load(f,si,g); return r?metrics(r):null;});
P(`## Score vs size, K${K} (task.score(), 8 seeds g 5..91, episode seed g+2)`);
P('| size | si=0 mean | si=0 min-max | zeros | si=0 N | si=1 mean | si=1 min-max | si=1 N |'); P('|---|---|---|---|---|---|---|---|');
const st=v=>{v=v.filter(x=>x!=null); const n=v.length, m=v.reduce((a,b)=>a+b,0)/n; return {n,m,sd:Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/Math.max(1,n-1)),min:Math.min(...v),max:Math.max(...v)}; };
for(const f of F){ const a=data['0_'+f].filter(Boolean), b=data['1_'+f].filter(Boolean); const sa=st(a.map(x=>x.score)), sb=b.length?st(b.map(x=>x.score)):null;
  P(`| ${f}x | ${sa.m.toFixed(3)} (n${sa.n}) | ${sa.min.toFixed(3)}-${sa.max.toFixed(3)} | ${a.filter(x=>x.score===0).length} | ${st(a.map(x=>x.N)).m.toFixed(0)} | ${sb?sb.m.toFixed(3)+' (n'+sb.n+')':'-'} | ${sb?sb.min.toFixed(3)+'-'+sb.max.toFixed(3):'-'} | ${b.length?st(b.map(x=>x.N)).m.toFixed(0):'-'} |`); }
// onsets
for(const si of [0,1]){ P(`\n## Onset table, scaleInvariant=${si} (paired vs 1x same seed; onset = smallest size with |paired t|>=3 and |diff| > 1x seed SD and >5% of |1x mean|; ratio = mean_f / mean_1x)`);
  P('| metric | 1x mean ± sd | onset | ratio 1.5x | 2x | 3x | 4x | first-drift sign |'); P('|---|---|---|---|---|---|---|---|');
  const keys=new Set(); for(const m of data[si+'_1']) if(m) Object.keys(m).forEach(k=>keys.add(k));
  const rows=[];
  for(const k of keys){ const b=data[si+'_1'].map(m=>m?m[k]:null); const sb=st(b.filter(x=>x!=null&&isFinite(x))); if(!sb.n) continue;
    let onset=null, sign=''; const ratio={};
    for(const f of F.slice(1)){ const v=data[si+'_'+f].map(m=>m?m[k]:null); const d=[]; for(let i=0;i<G.length;i++) if(v[i]!=null&&b[i]!=null&&isFinite(v[i])&&isFinite(b[i])) d.push(v[i]-b[i]);
      if(d.length<4) continue; const sd=st(d); const t=sd.sd>0?sd.m/(sd.sd/Math.sqrt(sd.n)):(sd.m!==0?Infinity*Math.sign(sd.m):0); const vm=st(v.filter(x=>x!=null&&isFinite(x))).m; ratio[f]=sb.m!==0?vm/sb.m:null;
      if(onset==null && Math.abs(t)>=3 && Math.abs(sd.m)>sb.sd && Math.abs(sd.m)>0.05*Math.abs(sb.m)) { onset=f; sign=sd.m>0?'up':'down'; } }
    rows.push({k,s:`| ${k} | ${sb.m.toPrecision(4)} ± ${sb.sd.toPrecision(2)} | ${onset||'-'} | ${[1.5,2,3,4].map(f=>ratio[f]!=null?ratio[f].toFixed(2):'-').join(' | ')} | ${sign} |`,onset:onset||99}); }
  rows.sort((a,b)=>a.onset-b.onset||a.k.localeCompare(b.k)); rows.forEach(r=>P(r.s)); }
fs.writeFileSync(`sw/ana_K${K}.md`,out.join('\n')); console.log(out.slice(0,14).join('\n'));
