// record C-cell spike vectors in the hold window per symbol; offline: what could an ideal readout on these features do?
const SA=require('/workspace/spiking-arena/js/node_load.js')();
const NS=+(process.env.NS||1000), G=+(process.env.NG||1); const T=Object.assign({},SA.PREDICT2_XL,JSON.parse(process.env.TUNE||'{}')); const B=T.bands;
const names=['top','M','X','R','M2','X2','C','P']; const PH=+(process.env.PH||6);
const res={}; const add=(k,v)=>{res[k]=(res[k]||0)+v/G;};
for(let g=0;g<G;g++){
const env=SA.setEnv('seq',{source:'text',nSyms:NS,clock2:true}); const K=env.spec.outputs.length;
const d=SA.createPredict2Plan(T); const b=SA.growCell(d,{seed:100+g*7919,spec:env.spec}); const N=b.N,h0=b.nIn,h1=h0+b.nHid;
const bandOf=i=>{const y=b.pos[i][1]; let k=0; while(k<7&&y<B[k])k++; return names[k];};
const C=[]; for(let i=h0;i<h1;i++) if(bandOf(i)==='C') C.push(i);
const a=new SA.Agent(d,555+g,b,env); const task=a.task; const recs=[]; let sp=new Float32Array(N), lastPos=0;
while(!a.done){ const ph=task.phaseT, pos=task.pos; a.tick(n=>{ if(ph>=PH) for(const i of C) sp[i]+=n.spiked[i]; });
  if(task.pos!==pos){ recs.push({cur:task.seq[pos],prev:pos>0?task.seq[pos-1]:-1,tgt:task.seq[pos+1],f:C.filter(i=>sp[i]>0).map(i=>[i,sp[i]])}); sp=new Float32Array(N);} }
const st=task.stats(); add('net acc',st.accuracy); add('net lastq',st.lastQuarter);
// readouts
const n=recs.length, q3=Math.floor(n*3/4);
function run(pred){ let c=0,cl=0; const cnt=new Map(); recs.forEach((r,j)=>{ const p=pred(r,cnt); const ok=p===r.tgt; c+=ok; if(j>=q3) cl+=ok; pred.upd(r,cnt); }); return [c/n, cl/(n-q3)]; }
const argmax=v=>{let b=0;for(let i=1;i<v.length;i++) if(v[i]>v[b]) b=i; return v[b]>0?b:-1;};
const row=(cnt,k)=>{ if(!cnt.has(k)) cnt.set(k,new Float64Array(K)); return cnt.get(k); };
// ideal 2nd / 1st counters
const p2=(r,cnt)=>argmax(row(cnt,'2:'+r.prev+','+r.cur)); p2.upd=(r,cnt)=>row(cnt,'2:'+r.prev+','+r.cur)[r.tgt]++;
const p1=(r,cnt)=>argmax(row(cnt,'1:'+r.cur)); p1.upd=(r,cnt)=>row(cnt,'1:'+r.cur)[r.tgt]++;
// sum of per-cell normalized successor distributions (what the net approximates)
const ps=(r,cnt)=>{ const v=new Float64Array(K); for(const [i,s] of r.f){ const R=row(cnt,i); let t=0; for(const x of R) t+=x; if(t>0) for(let k=0;k<K;k++) v[k]+=s*R[k]/t; } return argmax(v); };
ps.upd=(r,cnt)=>{ for(const [i] of r.f) row(cnt,i)[r.tgt]++; };
// pattern as context key (most specific possible with these cells)
const key=r=>'p:'+r.f.map(x=>x[0]).join(',');
const pp=(r,cnt)=>argmax(row(cnt,key(r))); pp.upd=(r,cnt)=>row(cnt,key(r))[r.tgt]++;

const prob=(R,k,a)=>{let t=0;for(const x of R)t+=x; return (R[k]+a)/(t+K*a);};
const mk=(wf)=>{ const f=(r,cnt)=>{ const v=new Float64Array(K); for(const [i,s] of r.f){ const R=row(cnt,i); let t=0; for(const x of R) t+=x; if(t<=0) continue; const w=wf(i,R,t,cnt); for(let k=0;k<K;k++) v[k]+=w*R[k]/t; } return argmax(v); };
  f.upd=(r,cnt)=>{ for(const [i] of r.f){ const R=row(cnt,i); const A=row(cnt,'acc'+i); A[0]=A[0]*AD+prob(R,r.tgt,0.5)*(1-AD); A[1]=A[1]*AD+(1-AD); R[r.tgt]++; } }; return f; };
const AD=+(process.env.AD||0.9);
const pTrust=mk((i,R,t,cnt)=>{const A=row(cnt,'acc'+i); return A[1]>0?Math.pow(A[0]/A[1],+(process.env.GAM||2)):0;});
const pMax=mk((i,R,t)=>{let m=0;for(const x of R)m=Math.max(m,x); return Math.pow(m/t,2);});
const pSq=(r,cnt)=>{ const v=new Float64Array(K); for(const [i,s] of r.f){ const R=row(cnt,i); let t=0; for(const x of R) t+=x; if(t>0) for(let k=0;k<K;k++) v[k]+=Math.pow(R[k]/t,3); } return argmax(v); }; pSq.upd=ps.upd;
const pLog=(r,cnt)=>{ const v=new Float64Array(K); for(const [i,s] of r.f){ const R=row(cnt,i); for(let k=0;k<K;k++) v[k]+=Math.log(prob(R,k,0.1)); } return argmax(v.map(x=>x+1e3)); }; pLog.upd=ps.upd;

const gen=(gam,wpow,cnt0)=>{ const f=(r,cnt)=>{ const v=new Float64Array(K); for(const [i,s] of r.f){ const R=row(cnt,i); let t=0; for(const x of R) t+=x; if(t<=0) continue; let s2=0; for(const x of R) s2+=(x/t)*(x/t); const w=Math.pow(s2,wpow)*t/(t+cnt0); let z=0; for(const x of R) z+=Math.pow(x/t,gam); for(let k=0;k<K;k++) v[k]+=w*Math.pow(R[k]/t,gam)/z; } return argmax(v); }; f.upd=ps.upd; return f; };
const extra=[];
const trustM=(wpow)=>{ const f=(r,cnt)=>{ const v=new Float64Array(K); for(const [i,s] of r.f){ const R=row(cnt,i); let t=0; for(const x of R) t+=x; if(t<=0) continue; const A=row(cnt,'tm'+i); const w=Math.pow(A[0]/A[1],wpow); for(let k=0;k<K;k++) v[k]+=w*R[k]/t; } return argmax(v); };
  f.upd=(r,cnt)=>{ for(const [i] of r.f){ const R=row(cnt,i); let t=0; for(const x of R) t+=x; const A=row(cnt,'tm'+i); const pr=t>0?R[r.tgt]/t:1/K; A[0]+=pr; A[1]+=1; R[r.tgt]++; } }; return f; };
for(const wp of [2,4,8,16]) extra.push(['trustMean'+wp, trustM(wp)]);

const ema=(al,wpow)=>{ const f=(r,cnt)=>{ const v=new Float64Array(K); for(const [i,s] of r.f){ if(!cnt.has(i)) continue; const R=cnt.get(i); let s2=0; for(const x of R) s2+=x*x; const w=Math.pow(s2,wpow); for(let k=0;k<K;k++) v[k]+=w*R[k]; } return argmax(v); };
  f.upd=(r,cnt)=>{ for(const [i] of r.f){ if(!cnt.has(i)) cnt.set(i,new Float64Array(K).fill(1/K)); const R=cnt.get(i); R[r.tgt]+=al; for(let k=0;k<K;k++) R[k]/=(1+al); } }; return f; };
for(const al of [0.05,0.1,0.2,0.4]) for(const wp of [0,2,4,8]) extra.push(['ema'+al+'w'+wp, ema(al,wp)]);
 for(const g of [1]) for(const wp of [4,8,16]) for(const c0 of [0]) extra.push(['g'+g+'w'+wp+'c'+c0, gen(g,wp,c0)]);
for(const [nm,f] of extra.concat([['ideal2',p2]]).concat([['ideal1',p1],['sumCells',ps],['patternKey',pp],['trust',pTrust],['maxConf',pMax],['cube',pSq],['logprod',pLog]])){ const [x,y]=run(f); add(nm+' acc',x); add(nm+' lastq',y); }
// cell purity: per cell fraction of its firing symbols in its top (prev,cur) context; and per context #cells
const cc=new Map(), ctxCells=new Map(); for(const r of recs){ const ctx=r.prev+','+r.cur; for(const [i] of r.f){ const m=row(cc,i); /*reuse*/ if(!cc.get('c'+i)) cc.set('c'+i,new Map()); const mm=cc.get('c'+i); mm.set(ctx,(mm.get(ctx)||0)+1);} 
  if(!ctxCells.has(ctx)) ctxCells.set(ctx,[]); ctxCells.get(ctx).push(r.f.length); }
const hasM2=new Set(); for(const i of C){ for(let q=h0;q<h1;q++) if(b.W[q*N+i]>0&&bandOf(q)==='M2'){hasM2.add(i);break;} }
{ let p2=0,n2=0,p1=0,n1=0; for(const [k,mm] of cc) if(typeof k==='string'&&k[0]==='c'){ const i=+k.slice(1); let t=0,mx=0; for(const v of mm.values()){t+=v; mx=Math.max(mx,v);} if(hasM2.has(i)){p2+=mx/t;n2++;} else {p1+=mx/t;n1++;} }
  add('2nd cells firing',n2); add('2nd purity',p2/n2); add('1st cells firing',n1); add('1st purity',p1/n1);
  let f2=0; for(const r of recs) f2+=r.f.filter(x=>hasM2.has(x[0])).length; add('2nd cells/symbol',f2/n); let none=0; for(const r of recs) if(!r.f.some(x=>hasM2.has(x[0]))) none++; add('symbols w/o 2nd cell',none/n); }
let pur=0,np=0,curPur=0; for(const [k,mm] of cc) if(typeof k==='string'&&k[0]==='c'){ let t=0,mx=0; const byCur=new Map(); for(const [ctx,v] of mm){t+=v; mx=Math.max(mx,v); const c=ctx.split(',')[1]; byCur.set(c,(byCur.get(c)||0)+v);} pur+=mx/t; curPur+=Math.max(...byCur.values())/t; np++; }
add('cells firing',np); add('purity(top ctx)',pur/np); add('purity(cur sym)',curPur/np);
let fc=0; for(const r of recs) fc+=r.f.length; add('cells/symbol',fc/n); add('C cells',C.length);
}
for(const k in res) console.log(k.padEnd(18),res[k].toFixed(3));
