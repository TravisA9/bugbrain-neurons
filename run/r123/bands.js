const S=require('../js/node_load.js')(); const f=+process.argv[2], si=+(process.argv[3]||0), g=+(process.argv[4]||5); S.params.scaleInvariant=si; S.params.granN=128;
const envP=Object.assign({},S.recommendedEnvParams('seq',{source:'order3'},['source']),{nSyms:160}); const E=S.setEnv('seq',envP);
const D=S.PLANS.deepURSx3.make(); D.regions.forEach(R=>{R.g.sc.sizeF=f;}); const b=S.growCell(D,{seed:g,spec:E.spec});
const names=b.regions.map(r=>r.name), T={};
for(let i=b.nIn;i<b.nIn+b.nHid;i++){ const k=names[b.region[i]]+':'+b.cellType[i]; const t=T[k]||(T[k]={n:0,ys:{}}); t.n++; const y=b.pos[i][1].toFixed(3); t.ys[y]=(t.ys[y]||0)+1; }
for(const k in T){ const ys=Object.keys(T[k].ys).map(Number).sort((a,c)=>a-c); console.log(k,T[k].n,'rows',ys.length,'y',ys.length<=6?ys.join(','):ys[0]+'..'+ys[ys.length-1]); }
console.log('devStats silentIn',b.regions.map(r=>r.name+':'+r.devStats.silentIn).join(' '));
