const SA=require('/workspace/spiking-arena/js/node_load.js')();
const NS=+(process.env.NS||600); const env=SA.setEnv('seq',{source:'text',nSyms:NS,clock2:true});
// usage: [TUNE='{...}'] [NG=2] [NS=600] node results_v11/abl.js  (default: plan predictK2XL)
const T=Object.assign({},SA.PREDICT2_XL,JSON.parse(process.env.TUNE||'{}')); const B=T.bands; const d=SA.createPredict2Plan(T);
const names=['top','M','X','R','M2','X2','C','P'];
for (const mode of ['all','no1st','only1st']) { let acc=0,last=0,bits=0; const G=+(process.env.NG||2);
 for (let g=0; g<G; g++){ const b=SA.growCell(d,{seed:100+g*7919,spec:env.spec}); const N=b.N,h0=b.nIn,h1=h0+b.nHid;
 const bandOf=i=>{const y=b.pos[i][1]; let k=0; while(k<7&&y<B[k])k++; return names[k];};
 for(let i=h0;i<h1;i++) if(bandOf(i)==='C'){ let m2=false; for(let q=h0;q<h1;q++) if(b.W[q*N+i]>0&&bandOf(q)==='M2') m2=true;
   const kill = mode==='no1st' ? !m2 : mode==='only1st' ? m2 : false; if(kill) for(let c=0;c<N;c++) if(bandOf(c)==='P') b.W[i*N+c]=0; }
 const a=SA.runEpisode(d,555+g,b,env); const s=a.task.stats(); acc+=s.accuracy/G; last+=s.lastQuarter/G; bits+=s.bitsSoft/G; }
 console.log(mode,'acc',acc.toFixed(3),'last q',last.toFixed(3),'calSoft',bits.toFixed(2)); }
