// in-memory hook (core untouched): dump per-row tag expression for the region's sensors' tags, before trophic competition
const fs=require('fs'), path=require('path'), vm=require('vm'), FILES=require('../js/node_load.js').FILES;
const f=+process.argv[2], g=+(process.argv[3]||5), want=process.argv[4]||'goC0';
const ctx=vm.createContext({console,performance,Math,Date,JSON,setTimeout,__TD:[]});
for(const fl of FILES){ const p=path.join(__dirname,'../js',fl); let src=fs.readFileSync(p,'utf8');
  if(fl==='core/develop.js'){ const a='  // 4. neurotrophic competition'; if(!src.includes(a)) throw 'anchor';
    src=src.replace(a,`  globalThis.__TD.push({GS, IN: IN.map(x=>({name:x.name,tag:x.tag,at:x.at})), theta: sc.theta, eyeReach: sc.eyeReach, rIn: sc.rIn, cells: neurons.map(c=>({j:c.j,i:c.i,o:Array.from(c.o)})), tagOut: [0,1,2,3,4,5,6,7,8].map(t=>tagOut(t))});\n`+a); }
  vm.runInContext(src,ctx,{filename:p}); }
const S=ctx.SpikingArena; S.params.granN=128; const envP=Object.assign({},S.recommendedEnvParams('seq',{source:'order3'},['source']),{nSyms:160}); const E=S.setEnv('seq',envP);
const D=S.PLANS.deepURSx3.make(); D.regions.forEach(R=>{R.g.sc.sizeF=f;}); S.growCell(D,{seed:g,spec:E.spec});
for(const [ri,td] of ctx.__TD.entries()){ const inp=td.IN.find(x=>x.name===want); if(!inp) continue; const ti=td.tagOut[Math.min(8,inp.tag)];
  const rows={}; for(const c of td.cells){ const r=rows[c.j]||(rows[c.j]={n:0,max:0,above:0}); r.n++; const v=c.o[ti]; if(v>r.max) r.max=v; if(v>td.theta) r.above++; }
  const sy=j=>(-1+(j+0.5)*2/td.GS).toFixed(3);
  console.log(`region#${ri} GS ${td.GS} input ${want} tag ${inp.tag} at ${JSON.stringify(inp.at)} theta ${td.theta} eyeReach ${td.eyeReach} rIn ${td.rIn}`);
  console.log(Object.keys(rows).map(Number).sort((a,b)=>a-b).filter(j=>rows[j].max>0.05).map(j=>`row ${j} y ${sy(j)} n ${rows[j].n} maxTag ${rows[j].max.toFixed(3)} above ${rows[j].above}`).join('\n')); }
