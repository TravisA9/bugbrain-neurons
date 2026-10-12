// readouts computed from the network's own current C->P weights (column-summed) vs the network's spiking output
const SA=require('/workspace/spiking-arena/js/node_load.js')();
const NS=+(process.env.NS||1000), G=+(process.env.NG||1); const T=Object.assign({},SA.PREDICT2_XL,JSON.parse(process.env.TUNE||'{}')); const B=T.bands;
let D,H0; const names=['top','M','X','R','M2','X2','C','P']; const res={}; const add=(k,v)=>{res[k]=(res[k]||0)+v/G;};
for(let g=0;g<G;g++){
const env=SA.setEnv('seq',{source:'text',nSyms:NS,clock2:true}); const K=env.spec.outputs.length;
const d=SA.createPredict2Plan(T); const b=SA.growCell(d,{seed:100+g*7919,spec:env.spec}); const N=b.N,h0=b.nIn,h1=h0+b.nHid;
const bandOf=i=>{const y=b.pos[i][1]; let k=0; while(k<7&&y<B[k])k++; return names[k];};
const a=new SA.Agent(d,555+g,b,env); const net=a.net; const task=a.task;
// column of each P cell = the output its strongest output synapse goes to
const colOf=new Int32Array(N).fill(-1); const o0=N-K;
for(let i=h0;i<h1;i++){ let bk=-1,bw=0; for(let k=net.start[i];k<net.start[i+1];k++){ const p=net.posts[k]; if(p>=o0 && net.ws[k]>bw){bw=net.ws[k]; bk=p-o0;} } if(bandOf(i)==='P') colOf[i]=bk; }
const C=[]; for(let i=h0;i<h1;i++) if(bandOf(i)==='C') C.push(i);
let sp=new Float32Array(N); const seenCtx=new Set(); let pc6=new Float64Array(K), pc7=new Float64Array(K); H0={p6:[],p7:[]}; const H={lin:[],conf2:[],conf4:[],net:[],p6:[],p7:[]}; D={tie:0,zero:0,cur:0,linOkNetBad:0,linColRank:[0,0,0,0,0],n:0,maxc:0};
while(!a.done){ const ph=task.phaseT,pos=task.pos; a.tick(n=>{ if(ph>=6) for(const i of C) sp[i]+=n.spiked[i]; if(ph>=6) for(let i=h0;i<h1;i++) if(colOf[i]>=0&&n.spiked[i]){ pc6[colOf[i]]++; if(ph>=7) pc7[colOf[i]]++; } });
 if(task.pos!==pos){ const tgt=task.seq[pos+1]; const vl=new Float64Array(K),v2=new Float64Array(K),v4=new Float64Array(K);
  for(const i of C){ if(!sp[i]) continue; const col=new Float64Array(K); let s=0; for(let k=net.start[i];k<net.start[i+1];k++){ const c=colOf[net.posts[k]]; if(c>=0){col[c]+=net.ws[k]; s+=net.ws[k];} }
    if(s<=0) continue; let s2=0; for(const x of col) s2+=(x/s)**2; for(let c=0;c<K;c++){ vl[c]+=sp[i]*col[c]; v2[c]+=sp[i]*col[c]/s*s2**2; v4[c]+=sp[i]*col[c]/s*s2**8; } }
  const am=v=>{let b=0;for(let i=1;i<v.length;i++) if(v[i]>v[b]) b=i; return b;};
  H.lin.push(am(vl)===tgt); { const L=am(vl); const m7=Math.max(...pc7); if(!D.h) D.h={sat:0,top2tie:0,linLowP:0,nP:0,linZero:0}; D.h.nP++; const srt=Array.from(pc7).sort((x,y)=>y-x); if(srt[0]===srt[1]) D.h.top2tie++; const nC=C.filter(i=>sp[i]>0).length, sC=C.reduce((t,i)=>t+sp[i],0); let drv=0; for(const i of C){ if(!sp[i]) continue; for(let k=net.start[i];k<net.start[i+1];k++) if(colOf[net.posts[k]]===L) drv+=sp[i]*net.ws[k]; }
  const key=pc7[L]===0?'z':'nz'; D.h[key+'n']=(D.h[key+'n']||0)+1; D.h[key+'cells']=(D.h[key+'cells']||0)+nC; D.h[key+'spk']=(D.h[key+'spk']||0)+sC; D.h[key+'drv']=(D.h[key+'drv']||0)+drv; D.h[key+'seen']=(D.h[key+'seen']||0)+(seenCtx.has(task.seq[pos-1]+','+task.seq[pos])?1:0); seenCtx.add(task.seq[pos-1]+','+task.seq[pos]);
  if(pc7[L]===0) D.h.linZero++; if(am(pc7)!==L) D.h.linLowP++; if(!D.cellsPer){ D.cellsPer=new Array(K).fill(0); for(let i=h0;i<h1;i++) if(colOf[i]>=0) D.cellsPer[colOf[i]]++; } if(m7>=0.9*D.cellsPer[am(pc7)]*12) D.h.sat++; }
  H.p6.push(am(pc6)===tgt); H.p7.push(am(pc7)===tgt); pc6=new Float64Array(K); pc7=new Float64Array(K);
  { const cn=Array.from(task.lastCounts); const mx=Math.max(...cn); D.n++; D.maxc+=mx; if(mx===0) D.zero++; else if(cn.filter(x=>x===mx).length>1) D.tie++; const cur=task.seq[pos]; if(mx>0&&cn[cur]===mx) D.cur++;
    const L=am(vl); if(L===tgt && task.hits[task.hits.length-1]!==1){ D.linOkNetBad++; const r=cn.filter(x=>x>cn[L]).length; D.linColRank[Math.min(4,r)]++; } } H.conf2.push(am(v2)===tgt); H.conf4.push(am(v4)===tgt); H.net.push(task.hits[task.hits.length-1]===1); sp=new Float32Array(N); } }
for(const k in H){ const h=H[k], n=h.length, q=Math.floor(n*3/4); add(k+' acc', h.filter(x=>x).length/n); add(k+' lastq', h.slice(q).filter(x=>x).length/(n-q)); }
}
for(const k of ['z','nz']){ const n=D.h[k+'n']; console.log(k,'n',n,'cells',(D.h[k+'cells']/n).toFixed(1),'spk',(D.h[k+'spk']/n).toFixed(1),'drv',(D.h[k+'drv']/n).toFixed(1),'seenCtx',(D.h[k+'seen']/n).toFixed(2)); } console.log(JSON.stringify(D)); for(const k in res) console.log(k.padEnd(14),res[k].toFixed(3));
