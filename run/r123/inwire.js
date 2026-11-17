const S=require('../js/node_load.js')(); const f=+process.argv[2], si=+(process.argv[3]||0), g=+(process.argv[4]||5); S.params.scaleInvariant=si; S.params.granN=128;
const envP=Object.assign({},S.recommendedEnvParams('seq',{source:'order3'},['source']),{nSyms:160}); const E=S.setEnv('seq',envP);
const D=S.PLANS.deepURSx3.make(); D.regions.forEach(R=>{R.g.sc.sizeF=f;}); const b=S.growCell(D,{seed:g,spec:E.spec});
const net=new S.SpikingNet(b); const names=b.regions.map(r=>r.name); const rows=[];
for(let i=0;i<b.nIn;i++){ const c={}; for(let k=net.start[i];k<net.start[i+1];k++){ const j=net.posts[k]; const r=j>=b.nIn+b.nHid?'out':names[b.region[j]]+':'+b.cellType[j]; c[r]=(c[r]||0)+1; } rows.push(i+' '+(E.spec.inputs[i].name||E.spec.inputs[i].label||'')+' '+JSON.stringify(c)); }
console.log(rows.join('\n'));
