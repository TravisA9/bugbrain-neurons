// Size-sweep health probe (no core edits): node sw/probe.js f si g [K] [extraJSON]
// Grows deepURSx3 exactly as test_core block 2 (seq order3, nSyms 160, granN 128), runs one episode, wraps net.step on the instance.
const fs=require('fs');
const f=+process.argv[2], si=+process.argv[3], g=+process.argv[4], K=+(process.argv[5]||0), extra=JSON.parse(process.argv[6]||'{}');
const S=require('../js/node_load.js')(); S.params.scaleInvariant=si; S.params.granN=128;
for(const k in (extra.params||{})) S.params[k]=extra.params[k];
const from={source:'order3'}; if(K) from.K=K;
const envP=Object.assign({},S.recommendedEnvParams('seq',from,K?['source','K']:['source']),{nSyms:160});
const E=S.setEnv('seq',envP); const D=S.PLANS.deepURSx3.make(); D.regions.forEach(R=>{R.g.sc.sizeF=f; for(const k in (extra.sc||{})) R.g.sc[k]=extra.sc[k];});
const t0=Date.now(); const b=S.growCell(D,{seed:g,spec:E.spec}); const tGrow=Date.now()-t0;
const a=new S.Agent(D,g+2,b,E), net=a.net, N=net.N, nIn=b.nIn, o0=b.nIn+b.nHid, o1=o0+b.nOut;
const rNames=b.regions.map(r=>r.name), RN=rNames.length+2, IN_=rNames.length, OUT_=rNames.length+1, names=rNames.concat(['input','output']);
const reg=new Uint8Array(N); for(let i=0;i<N;i++) reg[i]= i<nIn?IN_: i>=o0&&i<o1?OUT_: b.region[i];
const SUB=S.params.lifeSub>0?S.params.lifeSub:S.params.substeps, task=a.task, SLOT=task.slot, NB=SLOT*SUB, ON=task.c2*SUB, RT=envP.readTicks;
// static structure (at birth of the net)
const st=net.start, po=net.posts, pr=net.pres, isP=net.isPlastic, ws0=Float32Array.from(net.ws);
const inDeg=new Int32Array(N), inDegP=new Int32Array(N), inDegI=new Int32Array(N), sE0=new Float64Array(N), sI0=new Float64Array(N), outDeg=new Int32Array(N);
for(let i=0;i<N;i++) outDeg[i]=st[i+1]-st[i];
for(let k=0;k<po.length;k++){const j=po[k],w=ws0[k]; inDeg[j]++; if(isP[k]) inDegP[j]++; if(w<0){inDegI[j]++; sI0[j]-=w;} else sE0[j]+=w;}
// dynamics accumulators
const cnt=new Float64Array(N), tcnt=new Float64Array(N), tmark=new Int32Array(N).fill(-1), Ein=new Float64Array(N), Iin=new Float64Array(N);
const psth=Array.from({length:RN},()=>new Float64Array(NB)), regCells=new Float64Array(RN); for(let i=0;i<N;i++) regCells[reg[i]]++;
const Q=4, regQ=Array.from({length:RN},()=>new Float64Array(Q)), maxFrac=new Float64Array(RN), runSub=new Float64Array(RN), slotSp=new Float64Array(RN), quietSlots=new Float64Array(RN);
const plOn=new Float64Array(RN), regSub=new Float64Array(RN); let mixI=0, rcvI=0, outReadSp=0, silentOut=0, outFirst=[], nSlots=0, tick=0, bin=0, subs=0, curFirst=-1;
const mixL=net.mixList? new Uint8Array(N):null; if(mixL) for(const i of net.mixList) mixL[i]=1;
const rcvL=net.rcv? net.isRcv:null, toR=net.toRcv, rp=net.p, rDiv=rp.rcvDiv||0, rInh=rp.rcvInh||0, tmpR=new Float64Array(N), touched=[];
const TL=net.tgtList, plat=net.plat, PLT=rp.plateau;
const st0=net.step.bind(net); const qOf=()=>Math.min(Q-1,Math.floor(task.pos*Q/envP.nSyms));
net.step=function(){ st0(); subs++; const spk=net.spk, n=net.nSpk, ws=net.ws; const rs=regSub; rs.fill(0); let S2=0, nMix=0;
  for(let s=0;s<n;s++){const i=spk[s], r=reg[i]; cnt[i]++; if(tmark[i]!==tick){tmark[i]=tick; tcnt[i]++;} rs[r]++; psth[r][bin]++;
    if(net.mixPre) nMix+=net.mixPre[i];
    for(let k=st[i],e=st[i+1];k<e;k++){const j=po[k], w=ws[k]; if(w>=0){ if(rDiv>0&&toR&&toR[k]){ if(tmpR[j]===0) touched.push(j); tmpR[j]+=w; S2+=w; } else Ein[j]+=w; } else Iin[j]-=w;}
    if(i>=o0&&i<o1){ if(curFirst<0&&bin>=ON) curFirst=bin-ON; if(task.phaseT>=SLOT-RT) outReadSp++; } }
  if(rDiv>0){const fR=rDiv*net.rcv.length/(rp.rcvSig+S2); for(const j of touched){Ein[j]+=tmpR[j]*fR; tmpR[j]=0;} touched.length=0;}
  if(nMix){ if(net.mlS){const S_=net.mlS,P_=net.mlP,D_=net.mlD; for(let s=0;s<n;s++){const i=spk[s]; for(let k=S_[i],e=S_[i+1];k<e;k++) Iin[P_[k]]+=D_[k];}} else mixI+=net.mixInhD*nMix; }
  if(rInh>0&&net.rcv) rcvI+=rInh*net.poolTr;
  if(plat){ if(TL){for(let q=0;q<TL.length;q++){const i=TL[q]; if(plat[i]===PLT) plOn[reg[i]]++;}} else for(let i=nIn;i<N;i++) if(plat[i]===PLT) plOn[reg[i]]++; }
  const q=qOf(); for(let r=0;r<RN;r++){ const fr=rs[r]/regCells[r]; regQ[r][q]+=rs[r]; slotSp[r]+=rs[r]; if(fr>maxFrac[r]) maxFrac[r]=fr; if(fr>0.2) runSub[r]++; }
  bin++; };
let qSub=new Float64Array(Q);
while(!task.done){ const ph=task.phaseT; bin=ph*SUB; if(ph===0){ slotSp.fill(0); curFirst=-1; outReadSp=0; }
  const q=qOf(); a.tick(); tick++; qSub[q]+=SUB;
  if(task.phaseT===0){ nSlots++; for(let r=0;r<RN;r++) if(slotSp[r]===0) quietSlots[r]++; if(outReadSp===0) silentOut++; if(curFirst>=0) outFirst.push(curFirst); } }
const score=task.score(), T=subs, wMax=S.params.wMax;
// end-of-life weights
const ws=net.ws, w0=net.w0; const R=[];
for(let r=0;r<RN;r++) R.push({name:names[r],cells:regCells[r],syn:0,inDegMean:0,inDegMax:0,inDegPMean:0,inDegPMax:0,inDegIMean:0,outDegMean:0,outDegMax:0,sE0:0,sI0:0,
  rate:0,rateTick:0,dead:0,alwaysOn:0,hiRate:0,E:0,I:0,mixI:0,rcvI:0,EIcells:[],plSyn:0,plSat:0,plZero:0,plDw:0,plChanged:0,plW:0,plW0:0,plRecv:0,plOn:plOn[r],lrF8:0,nLr:0,
  maxFrac:maxFrac[r],runawaySubFrac:runSub[r]/T,quietSlotFrac:quietSlots[r]/nSlots,rateQ:Array.from(regQ[r],(v,q)=>v/regCells[r]/qSub[q]),psth:Array.from(psth[r],v=>v/regCells[r]/nSlots)});
for(let i=0;i<N;i++){const x=R[reg[i]]; x.syn+=inDeg[i]; x.inDegMean+=inDeg[i]; if(inDeg[i]>x.inDegMax)x.inDegMax=inDeg[i]; x.inDegPMean+=inDegP[i]; if(inDegP[i]>x.inDegPMax)x.inDegPMax=inDegP[i]; x.inDegIMean+=inDegI[i];
  x.outDegMean+=outDeg[i]; if(outDeg[i]>x.outDegMax)x.outDegMax=outDeg[i]; x.sE0+=sE0[i]; x.sI0+=sI0[i];
  const rt=cnt[i]/T, rk=tcnt[i]/tick; x.rate+=rt; x.rateTick+=rk; if(cnt[i]===0)x.dead++; if(rk>0.5)x.alwaysOn++; if(rt>0.25)x.hiRate++;
  let ii=Iin[i]+(mixL&&mixL[i]?mixI:0)+(rcvL&&rcvL[i]?rcvI:0); x.E+=Ein[i]/T; x.I+=ii/T; x.mixI+=(mixL&&mixL[i]?mixI:0)/T; x.rcvI+=(rcvL&&rcvL[i]?rcvI:0)/T;
  if(Ein[i]+ii>0) x.EIcells.push(Ein[i]/(ii+1e-9)); if(inDegP[i]>0){x.plRecv++; if(net.lrF8){x.lrF8+=net.lrF8[i]; x.nLr++;}} }
for(let k=0;k<po.length;k++) if(isP[k]&&w0[k]>0){const x=R[reg[po[k]]], w=ws[k]; x.plSyn++; if(w>=wMax*0.99)x.plSat++; if(w<=1e-6)x.plZero++; const d=Math.abs(w-w0[k]); x.plDw+=d; if(d>1e-6)x.plChanged++; x.plW+=w; x.plW0+=w0[k];}
for(const x of R){const c=x.cells||1; for(const k of ['inDegMean','inDegPMean','inDegIMean','outDegMean','sE0','sI0','rate','rateTick','E','I','mixI','rcvI']) x[k]/=c; x.dead/=c; x.alwaysOn/=c; x.hiRate/=c;
  x.EI=x.I>0?x.E/x.I:null; const v=x.EIcells.sort((p,q)=>p-q); x.EImed=v.length?v[v.length>>1]:null; delete x.EIcells; x.inDegPMeanRecv=x.plRecv?x.inDegPMean*c/x.plRecv:0;
  x.plSatFrac=x.plSyn?x.plSat/x.plSyn:0; x.plZeroFrac=x.plSyn?x.plZero/x.plSyn:0; x.plDwPerSyn=x.plSyn?x.plDw/x.plSyn:0; x.plDwPerRecv=x.plRecv?x.plDw/x.plRecv:0; x.plChangedFrac=x.plSyn?x.plChanged/x.plSyn:0;
  x.plWPerSyn=x.plSyn?x.plW/x.plSyn:0; x.plWPerRecv=x.plRecv?x.plW/x.plRecv:0; x.plW0PerRecv=x.plRecv?x.plW0/x.plRecv:0; x.plOnPerRecvPerSlot=x.plRecv?x.plOn/x.plRecv/nSlots:0; x.lrF8=x.nLr?x.lrF8/x.nLr:null;}
const TY={}; for(let i=nIn;i<o0;i++){const key=names[reg[i]]+':'+b.cellType[i]+(b.gran&&b.gran[i]?'g':'')+(b.mix&&b.mix[i]?'m':'')+(b.slow&&b.slow[i]?'s':''); const t=TY[key]||(TY[key]={n:0,rate:0,dead:0,on:0,E:0,I:0,inP:0,inD:0,inI:0,outD:0,dw:0});
  t.n++; t.rate+=cnt[i]/T; if(cnt[i]===0)t.dead++; if(tcnt[i]/tick>0.5)t.on++; t.E+=Ein[i]/T; t.I+=(Iin[i]+(mixL&&mixL[i]?mixI:0)+(rcvL&&rcvL[i]?rcvI:0))/T; t.inP+=inDegP[i]; t.inD+=inDeg[i]; t.inI+=inDegI[i]; t.outD+=outDeg[i];}
for(const k in TY){const t=TY[k]; for(const q of ['rate','dead','on','E','I','inP','inD','inI','outD']) t[q]/=t.n;}
outFirst.sort((p,q)=>p-q);
const res={f,si,g,K:envP.K,extra,score,N,nHid:b.nHid,syn:po.length,nSlots,ticks:tick,subs:T,tGrow,tLife:Date.now()-t0-tGrow,rssGB:process.memoryUsage().rss/1e9,
  silentOutFrac:silentOut/nSlots,outFirstMed:outFirst.length?outFirst[outFirst.length>>1]:null,outFirstFrac:outFirst.length/nSlots,mixInhD:net.mixInhD,mixPool:net.mixPre?net.mixPre.reduce((s,v)=>s+v,0):0,
  rcvDiv:rDiv,rcvInh:rInh,devStats:b.regions.map(r=>Object.assign({name:r.name},r.devStats,{cones:undefined})),regions:R,types:TY,acc:task.stats?undefined:undefined};
fs.writeFileSync(process.env.OUT||`sw/out/K${envP.K}_f${f}_si${si}_g${g}${extra.tag?'_'+extra.tag:''}.json`,JSON.stringify(res));
console.log(`done f=${f} si=${si} g=${g} K=${envP.K} score=${score.toFixed(3)} N=${N} rss=${res.rssGB.toFixed(2)} t=${((Date.now()-t0)/1000).toFixed(0)}s`);
