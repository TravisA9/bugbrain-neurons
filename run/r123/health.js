// node sw/health.js K -> onset table for size-invariant health metrics, both arms. onset = first size with paired |t|>=3, |d|>1x seed SD and >10% of |1x|;
// persistent onset = first size from which every larger size also departs (same sign).
const fs=require('fs'), K=process.argv[2]||'4', F=[1,1.25,1.5,1.75,2,2.5,3,4], G=[5,11,23,37,51,64,78,91];
const R=['cortex','context','context 2','context 3'];
const keys=['score','silentOut','outFirstMed','output.rate','output.dead','output.plWPerRecv','dev.cortex.silentIn','dev.context.silentIn','dev.cortex.trophDeathFrac','dev.cortex.orphanOut','dev.cortex.outInMean','mixInhD*pool'];
for(const r of R) for(const k of ['rate','dead','alwaysOn','runawaySubFrac','EI','E','I','mixI','inDegMean','inDegPMeanRecv','outDegMean','plWPerSyn','plWPerRecv','plDwPerRecv','plOnPerRecvPerSlot','plSatFrac','plZeroFrac','psthPeak']) keys.push(r+'.'+k);
const peak=ps=>{ let b=-1,m=-1; for(let i=12;i<ps.length;i++) if(ps[i]>m){m=ps[i];b=i;} return b-12; };
function M(r){ const m={score:r.score,silentOut:r.silentOutFrac,outFirstMed:r.outFirstMed,'mixInhD*pool':r.mixInhD*r.mixPool};
  for(const d of r.devStats){ m[`dev.${d.name}.silentIn`]=d.silentIn; m[`dev.${d.name}.orphanOut`]=d.orphanOut; m[`dev.${d.name}.outInMean`]=d.outInMean; m[`dev.${d.name}.trophDeathFrac`]=d.trophicDeaths/d.neurons; }
  for(const x of r.regions){ for(const k in x) if(typeof x[k]==='number') m[x.name+'.'+k]=x[k]; m[x.name+'.psthPeak']=peak(x.psth); } return m; }
const st=v=>{const n=v.length,m=v.reduce((a,b)=>a+b,0)/n; return {n,m,sd:Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/Math.max(1,n-1))};};
const fmt=x=>x==null||!isFinite(x)?'-':Math.abs(x)>=1000?x.toFixed(0):Math.abs(x)>=10?x.toFixed(1):Math.abs(x)>=1?x.toFixed(2):x.toFixed(3);
const out=[];
for(const si of [0,1]){ const D={}; for(const f of F) D[f]=G.map(g=>{const p=`sw/out/K${K}_f${f}_si${si}_g${g}.json`; return fs.existsSync(p)?M(JSON.parse(fs.readFileSync(p))):null;});
  out.push(`\n### K${K}, scaleInvariant=${si}: health metrics (mean over 8 seeds) and drift onset vs 1x`);
  out.push('| metric | '+F.map(f=>f+'x').join(' | ')+' | first onset | persistent onset |'); out.push('|---'.repeat(F.length+3)+'|');
  for(const k of keys){ const b=D[1].map(m=>m?m[k]:null); if(b.every(x=>x==null)) continue; const sb=st(b.filter(x=>x!=null&&isFinite(x)));
    const dep={}, means=[];
    for(const f of F){ const v=D[f].map(m=>m?m[k]:null); const vv=v.filter(x=>x!=null&&isFinite(x)); means.push(vv.length?st(vv).m:null); if(f===1) continue;
      const d=[]; for(let i=0;i<G.length;i++) if(v[i]!=null&&b[i]!=null&&isFinite(v[i])&&isFinite(b[i])) d.push(v[i]-b[i]); if(d.length<4) continue;
      const s=st(d), t=s.sd>0?s.m/(s.sd/Math.sqrt(s.n)):(s.m!==0?Math.sign(s.m)*1e9:0);
      dep[f]=(Math.abs(t)>=3 && Math.abs(s.m)>sb.sd && Math.abs(s.m)>0.1*Math.max(Math.abs(sb.m),1e-3))?Math.sign(s.m):0; }
    const first=F.slice(1).find(f=>dep[f]); let pers=null; for(let q=F.length-1;q>=1;q--){ const f=F[q]; if(dep[f]&&(q===F.length-1||(pers!=null&&dep[F[q+1]]===dep[f]))) pers=f; else break; }
    out.push(`| ${k} | ${means.map(fmt).join(' | ')} | ${first?first+'x '+(dep[first]>0?'↑':'↓'):'-'} | ${pers?pers+'x':'-'} |`); } }
fs.writeFileSync(`sw/health_K${K}.md`,out.join('\n')); console.log(out.join('\n'));
