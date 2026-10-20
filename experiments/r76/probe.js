// R76 scaling probe: node probe.js <out.json> <r42 args...>; wraps SpikingNet.step, analyses the longest-lived net at exit
const path=require('path'), fs=require('fs'), CODE=process.env.CODE||'/workspace/r70/code';
const OUT=process.argv[2]; process.argv.splice(2,1);
const L=require(CODE+'/run/lib.js'), SA=L.SA, NP=SA.SpikingNet.prototype, st0=NP.step, nets=[];
const WIN=+(process.env.WIN||60);
NP.step=function(){ const r=st0.call(this); let P=this.__p; if(!P){ P=this.__p={n:0,cnt:new Float64Array(this.N),oc:null,win:[],cur:null}; nets.push(this);
    const g=this.g; P.o0=g.nIn+g.nHid; P.o1=g.nIn+g.nHid+g.nOut; P.cur=new Float64Array(g.nOut); }
  P.n++; const spk=this.spk, n=this.nSpk, c=P.cnt; for(let s=0;s<n;s++){const i=spk[s]; c[i]++; if(i>=P.o0&&i<P.o1)P.cur[i-P.o0]++;}
  if(P.n%WIN===0){ P.win.push(Array.from(P.cur)); P.cur.fill(0);} return r; };
process.on('exit',()=>{ const net=nets.reduce((a,b)=>b.__p.n>a.__p.n?b:a,nets[0]); fs.writeFileSync(OUT,JSON.stringify(analyse(net))); });
function analyse(net){ const g=net.g,P=net.__p,N=net.N,T=P.n,names=(g.regionNames||(g.regions||[]).map(r=>r.name||r.R&&r.R.name)||[]);
  const nIn=g.nIn,o0=P.o0,o1=P.o1, reg=i=> i<nIn?'input': i>=o0&&i<o1?'output': (names[g.region[i]]||('r'+g.region[i])).replace(/[0-9 ]+$/,'');
  const R={}, get=k=>R[k]||(R[k]={cells:0,rate:0,plIn:0,plRecv:0,plW:0,plW0:0,exD:0,inD:0,drift:0,plSyn:0,exIn:0,inIn:0});
  for(let i=0;i<N;i++){const r=get(reg(i)); r.cells++; r.rate+=P.cnt[i]/T;}
  const ws=net.ws,w0=net.w0,pr=net.pres,po=net.posts,isP=net.isPlastic, rate=i=>P.cnt[i]/T;
  const rp=new Float64Array(N),rw=new Float64Array(N);
  for(let k=0;k<ws.length;k++){const j=po[k], r=get(reg(j)), w=ws[k], d=rate(pr[k])*w; if(w>0){r.exD+=d;r.exIn++;}else{r.inD-=d;r.inIn++;}
    if(isP[k]&&w0[k]>0){rp[j]++;rw[j]+=w;r.plW0+=w0[k];r.drift+=Math.abs(w-w0[k]);r.plSyn++;}}
  for(let j=0;j<N;j++) if(rp[j]){const r=get(reg(j)); r.plRecv++; r.plIn+=rp[j]; r.plW+=rw[j];}
  for(const k in R){const r=R[k]; r.rate/=r.cells; r.exD/=r.cells; r.inD/=r.cells; r.EI=r.inD>0?r.exD/r.inD:null;
    r.plInPerRecv=r.plRecv?r.plIn/r.plRecv:0; r.plWPerRecv=r.plRecv?r.plW/r.plRecv:0; r.plWperSyn=r.plSyn?r.plW/r.plSyn:0; r.stepPerSyn=r.plSyn?r.drift/r.plSyn:0; r.dWperRecv=r.plRecv?r.drift/r.plRecv:0;}
  // output response: per window distribution
  let H=0,nz=0,am=new Set(),tot=new Float64Array(o1-o0); for(const v of P.win){const s=v.reduce((a,b)=>a+b,0); v.forEach((x,i)=>tot[i]+=x); if(!s) continue; nz++; let h=0; for(const x of v) if(x) h-=x/s*Math.log2(x/s); H+=h; am.add(v.indexOf(Math.max(...v)));}
  const ts=tot.reduce((a,b)=>a+b,0); let Ht=0; for(const x of tot) if(x) Ht-=x/ts*Math.log2(x/ts);
  // between-window variability of the normalised output vector
  let vr=0; if(nz>1){const m=new Float64Array(o1-o0), V=P.win.filter(v=>v.some(x=>x)).map(v=>{const s=v.reduce((a,b)=>a+b,0);return v.map(x=>x/s);}); V.forEach(v=>v.forEach((x,i)=>m[i]+=x/V.length)); V.forEach(v=>v.forEach((x,i)=>vr+=(x-m[i])**2/V.length));}
  return {ticks:T,regions:R,out:{nOut:o1-o0,silentFrac:1-nz/P.win.length,winEntropy:nz?H/nz:0,totEntropy:Ht,maxEntropy:Math.log2(o1-o0),distinctArgmax:am.size,respVar:vr,spikesPerWin:ts/P.win.length}};
}
require(CODE+'/run/r42.js');
