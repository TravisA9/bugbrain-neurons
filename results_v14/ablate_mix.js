// ablation of the mixing layer of predictK2XM: [S0=1] [PP='{"readIn":0.01}'] [NG=8] [NS=1000] node results_v14/ablate_mix.js
//   full | noG (G -> P synapses removed) | noC (C -> P synapses removed: mixing layer only) | per-growth G sparsity / coverage
//   (v15: + sparsity over the symbol phases 2-9 (slot) and selectivity: context purity, cross-validated next-symbol accuracy of
      // (G events = G spikes in the read phases 6-9) G events vs current / pair)
const SA=require('/workspace/spiking-arena/js/node_load.js')();
const NS=+(process.env.NS||1000), NG=+(process.env.NG||8), S0=+(process.env.S0||1), MODES=(process.env.MODES||'full,noG,noC').split(',');
const T=Object.assign({},SA.PREDICT2_XM,JSON.parse(process.env.TUNE||'{}')), B=T.bands, names=['top','M','X','R','M2','X2','C','G','P'];
const res={}; const add=(k,v)=>{res[k]=(res[k]||0)+v/NG;};
for(let g=0;g<NG;g++){
  const env=SA.setEnv('seq',Object.assign({source:'text',nSyms:NS,clock2:true},JSON.parse(process.env.PP||'{}')));
  const d=SA.createPredict2Plan(T); const b0=SA.growCell(d,{seed:S0+g,spec:env.spec}); const N=b0.N,h0=b0.nIn,h1=h0+b0.nHid;
  const bandOf=i=>{const y=b0.pos[i][1]; let k=0; while(k<B.length&&y<B[k])k++; return names[k];};
  for(const mode of MODES){
    const b=Object.assign({},b0,{W:Float32Array.from(b0.W)});
    for(let i=h0;i<h1;i++){ const bd=bandOf(i); if((mode==='noG'&&bd==='G')||(mode==='noC'&&bd==='C')) for(let p=h0;p<N;p++) if(bandOf(p)==='P'&&b.P[i*N+p]) b.W[i*N+p]=0; }
    const a=new SA.Agent(d,6+S0+g,b,env); const G=[]; for(let i=h0;i<h1;i++) if(b.mix&&b.mix[i]) G.push(i);
    let sp=new Uint8Array(N), sw=new Uint8Array(N), act=0, actW=0, cov=0, n=0; const ev=[];   // ev: [pos, G cells that fired in the slot]
    while(!a.done){ const ph=a.task.phaseT,pos=a.task.pos; a.tick(nn=>{ for(const i of G) if(nn.spiked[i]&&ph>=2){ sw[i]=1; if(ph>=6) sp[i]=1; } });
      if(a.task.pos!==pos){ let k=0,kw=0; const f=[]; for(const i of G){ k+=sp[i]; kw+=sw[i]; if(sp[i]) f.push(i); } act+=k; actW+=kw; if(k) cov++; n++; ev.push([pos,f]); sp.fill(0); sw.fill(0);} }
    const st=a.task.stats(); add(mode+' acc',st.accuracy); add(mode+' lastq',st.lastQuarter); add(mode+' calSoft',st.bitsSoft); add(mode+' calCount',st.bitsCount);
    if(mode==='full'){ add('G cells',G.length); add('G active/symbol',act/n); add('G sparsity',act/n/G.length); add('G coverage',cov/n); add('G sparsity slot',actW/n/G.length);
      // selectivity (v15): per G cell, purity of its (current, previous) context; cross-validated next-symbol accuracy of
      // (G events = G spikes in the read phases 6-9)
      // "G fired -> its most frequent next symbol" vs the current-symbol and (current, previous) predictors, on G events
      const sq=a.task.seq, half=ev.length>>1, mf=m=>{let b=-1,bk=null;for(const [k,v] of m) if(v>b){b=v;bk=k;} return bk;}, inc=(M,k,x)=>{if(!M.has(k))M.set(k,new Map()); const m=M.get(k); m.set(x,(m.get(x)||0)+1);};
      const tG=new Map(), tC=new Map(), tP=new Map(), ctx=new Map(), cc=new Map();
      for(let e=0;e<ev.length;e++){ const [p,f]=ev[e]; if(p<1||p+1>=sq.length) continue; const c=sq[p], pr=sq[p-1], nx=sq[p+1];
        for(const i of f){ inc(ctx,i,c+','+pr); inc(cc,i,c); }
        if(e<half){ inc(tC,c,nx); inc(tP,c+','+pr,nx); for(const i of f) inc(tG,i,nx); } }
      const purity=M=>{ let pur=0,np=0; for(const [i,m] of M){ let t=0,b=0; for(const v of m.values()){t+=v; if(v>b)b=v;} if(t>=5){pur+=b/t; np++;} } return np?pur/np:0; };
      let nE=0,aG=0,aC=0,aP=0; for(let e=half;e<ev.length;e++){ const [p,f]=ev[e]; if(p<1||p+1>=sq.length) continue; const c=sq[p], pr=sq[p-1], nx=sq[p+1];
        for(const i of f){ if(!tG.has(i)) continue; nE++; aG+=mf(tG.get(i))===nx; aC+=tC.has(c)&&mf(tC.get(c))===nx; aP+=tP.has(c+','+pr)&&mf(tP.get(c+','+pr))===nx; } }
      add('G cur purity',purity(cc)); add('G ctx purity',purity(ctx)); add('G pred acc',nE?aG/nE:0); add('cur pred acc@G',nE?aC/nE:0); add('pair pred acc@G',nE?aP/nE:0); }
  } }
for(const k in res) console.log(k.padEnd(18),res[k].toFixed(3));
