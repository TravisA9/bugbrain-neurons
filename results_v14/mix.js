// offline: would a sparse mixing layer (random conjunctions of C cells) recover the per-cell summation loss?
const SA=require('/workspace/spiking-arena/js/node_load.js')();
const NS=+(process.env.NS||1000), G=+(process.env.NG||1); const T=Object.assign({},SA.PREDICT2_XN,JSON.parse(process.env.TUNE||'{}')); const B=T.bands;
const names=['top','M','X','R','M2','X2','C','P']; const res={}; const add=(k,v)=>{res[k]=(res[k]||0)+v/G;};
const CFG=JSON.parse(process.env.CFG||'[{"nG":2000,"k":4,"dx":0.1,"th":2}]');
for(let g=0;g<G;g++){
const env=SA.setEnv('seq',{source:'text',nSyms:NS,clock2:true}); const K=env.spec.outputs.length;
const d=SA.createPredict2Plan(T); const b=SA.growCell(d,{seed:100+g*7919,spec:env.spec}); const N=b.N,h0=b.nIn,h1=h0+b.nHid;
const bandOf=i=>{const y=b.pos[i][1]; let k=0; while(k<7&&y<B[k])k++; return names[k];};
const C=[]; for(let i=h0;i<h1;i++) if(bandOf(i)==='C') C.push(i);
const a=new SA.Agent(d,555+g,b,env); const task=a.task; const recs=[]; let sp=new Float32Array(N);
while(!a.done){ const ph=task.phaseT,pos=task.pos; a.tick(n=>{ if(ph>=6) for(const i of C) sp[i]+=n.spiked[i]; });
  if(task.pos!==pos){ recs.push({tgt:task.seq[pos+1],act:C.filter(i=>sp[i]>0)}); sp=new Float32Array(N);} }
add('net lastq',task.stats().lastQuarter);
const n=recs.length,q3=Math.floor(n*3/4);
const argmax=v=>{let b=0;for(let i=1;i<v.length;i++) if(v[i]>v[b]) b=i; return v[b]>0?b:-1;};
// readout: per feature counts, weight = sharpness^p (and trust mean)
function evalFeat(feats,pw){ const cnt=new Map(); let cl=0,c=0; feats.forEach((F,j)=>{ const v=new Float64Array(K); for(const f of F){ const R=cnt.get(f); if(!R) continue; let t=0,s2=0; for(const x of R)t+=x; for(const x of R) s2+=(x/t)**2; const w=Math.pow(s2,pw); for(let k=0;k<K;k++) v[k]+=w*R[k]/t; }
  const ok=argmax(v)===recs[j].tgt; c+=ok; if(j>=q3) cl+=ok; for(const f of F){ if(!cnt.has(f)) cnt.set(f,new Float64Array(K)); cnt.get(f)[recs[j].tgt]++; } }); return [c/n, cl/(n-q3)]; }
const rng=SA.mulberry32(7+g);
const Cfe=recs.map(r=>r.act.map(i=>'c'+i));
for(const pw of [0,8]) add(`C only p${pw} lastq`, evalFeat(Cfe,pw)[1]);
for(const cfg of CFG){ // G cells: random centre x, k inputs among C cells with |x-xc|<dx (any row), fire if >= th inputs active
  const xs=C.map(i=>b.pos[i][0]); const Gin=[];
  for(let q=0;q<cfg.nG;q++){ const xc=rng()*2-1; const cand=C.filter((i,j)=>Math.abs(xs[j]-xc)<cfg.dx); if(cand.length<cfg.k) continue; const ins=[]; while(ins.length<cfg.k){ const c=cand[Math.floor(rng()*cand.length)]; if(!ins.includes(c)) ins.push(c);} Gin.push(ins); }
  const Gfe=recs.map(r=>{ const A=new Set(r.act); const out=[]; Gin.forEach((ins,q)=>{ let s=0; for(const c of ins) if(A.has(c)) s++; if(s>=cfg.th) out.push('g'+q); }); return out; });
  let act=0, cov=0; for(const F of Gfe){ act+=F.length; if(F.length) cov++; } const tag=JSON.stringify(cfg);
  add(tag+' G/sym',act/n); add(tag+' sparsity',act/n/Gin.length); add(tag+' coverage',cov/n);
  for(const pw of [0,8]){ add(tag+` G only p${pw}`, evalFeat(Gfe,pw)[1]); add(tag+` C+G p${pw}`, evalFeat(Gfe.map((F,j)=>F.concat(Cfe[j])),pw)[1]); }
} }
for(const k in res) console.log(k.padEnd(48),res[k].toFixed(3));
