// "one letter behind?" diagnosis: [BASE=PREDICT2_XG] [TUNE='{...}'] [PP='{...}'] [NG=8] [S0=1] [NS=1000] node results_v16/echo.js
// (a) timeline: output spikes per slot phase for the column of the current, previous and next symbol and the mean other column
// (b) scored predictions (end of slot): share equal to the current symbol (echo), the previous symbol, the actual next;
//     the same for the online ideal first-order (bigram) and second-order counters; corpus base rates; first vs last quarter
const SA=require('/workspace/spiking-arena/js/node_load.js')();
const NS=+(process.env.NS||1000), NG=+(process.env.NG||8), S0=+(process.env.S0||1);
const T=Object.assign({},SA[process.env.BASE||'PREDICT2_XG'],JSON.parse(process.env.TUNE||'{}'));
const R={}, add=(k,v)=>{R[k]=(R[k]||0)+v/NG;}; let tl=null;
for(let g=0;g<NG;g++){
  const env=SA.setEnv('seq',Object.assign({source:'text',nSyms:NS,clock2:true},JSON.parse(process.env.PP||'{}')));
  const d=SA.createPredict2Plan(T), b=SA.growCell(d,{seed:S0+g,spec:env.spec}), a=new SA.Agent(d,1000+S0+g,b,env), task=a.task, K=task.K, sq=task.seq, L=task.slot;
  if(!tl) tl=Array.from({length:L},()=>[0,0,0,0,0]);
  const preds=[];
  while(!a.done){ const ph=task.phaseT, pos=task.pos; a.tick(); const o=a.out.spikes;
    if(pos>=1&&pos+1<sq.length){ const c=sq[pos],p=sq[pos-1],n=sq[pos+1]; let oth=0; for(let k=0;k<K;k++) oth+=o[k]; oth-=o[c]; if(n!==c) oth-=o[n]; if(p!==c&&p!==n) oth-=o[p];
      const no=K-1-(n!==c)-(p!==c&&p!==n); const w=1/NG/(NS-2); tl[ph][0]+=o[c]*w; tl[ph][1]+=(n!==c?o[n]:0)*w; tl[ph][2]+=(p!==c&&p!==n?o[p]:0)*w; tl[ph][3]+=oth/no*w; tl[ph][4]+=(task.phaseT===0?0:0); }
    if(task.pos!==pos) preds.push([pos, task.recent[task.recent.length-1][1]]); }
  { const st=task.stats(); add('stats: acc',st.accuracy); add('stats: last q',st.lastQuarter); add('stats: calSoft',st.bitsSoft); add('stats: calCount',st.bitsCount); }
  // online ideal counters
  const t1=new Map(), t2=new Map(), mf=m=>{ if(!m) return -1; let b=-1,bk=-1; for(const [k,v] of m) if(v>b){b=v;bk=k;} return bk; }, inc=(M,k,x)=>{ if(!M.has(k)) M.set(k,new Map()); const m=M.get(k); m.set(x,(m.get(x)||0)+1); };
  const qs=[[0,0.25,'first q'],[0.75,1,'last q'],[0,1,'all']];
  const rows=preds.map(([pos,k])=>{ const c=sq[pos], p=pos>0?sq[pos-1]:-1, n=sq[pos+1]; const i1=mf(t1.get(c)), i2=mf(t2.get(p+','+c)); const r={k,c,p,n,i1,i2:i2>=0?i2:i1}; inc(t1,c,n); inc(t2,p+','+c,n); return r; });
  for(const [a0,a1,nm] of qs){ const s=rows.slice(Math.floor(a0*rows.length),Math.floor(a1*rows.length)), m=s.length, f=fn=>s.filter(fn).length/m;
    add(nm+' net: =next',f(r=>r.k===r.n)); add(nm+' net: =current',f(r=>r.k===r.c)); add(nm+' net: =previous',f(r=>r.k===r.p&&r.p!==r.c));
    add(nm+' net: =current & wrong',f(r=>r.k===r.c&&r.k!==r.n)); add(nm+' net: =previous & wrong',f(r=>r.k===r.p&&r.p!==r.c&&r.k!==r.n));
    add(nm+' corpus: next=current',f(r=>r.n===r.c)); add(nm+' corpus: next=previous',f(r=>r.n===r.p&&r.p!==r.c));
    add(nm+' bigram: =next',f(r=>r.i1===r.n)); add(nm+' bigram: =current',f(r=>r.i1===r.c)); add(nm+' 2nd-order: =next',f(r=>r.i2===r.n)); add(nm+' 2nd-order: =current',f(r=>r.i2===r.c)); }
}
for(const k in R) console.log(k.padEnd(30),R[k].toFixed(3));
console.log('timeline: output spikes per tick by slot phase (0 GO2, 1 GO1, 2-5 symbol = teacher, 6-9 read window)\nphase  current  next  previous  other-mean');
tl.forEach((r,ph)=>console.log(String(ph).padEnd(6),r[0].toFixed(3).padStart(7),r[1].toFixed(3).padStart(6),r[2].toFixed(3).padStart(8),r[3].toFixed(3).padStart(10)));
