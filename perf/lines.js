const fs=require('fs');const d=process.argv[2];const f=fs.readdirSync(d)[0];const p=JSON.parse(fs.readFileSync(d+'/'+f));
const L={};let tot=0;for(const n of p.nodes){(n.positionTicks||[]).forEach(t=>{const k=n.callFrame.url.split('/').slice(-1)[0]+':'+t.line;L[k]=(L[k]||0)+t.ticks;});}
const all=p.samples.length;Object.entries(L).sort((a,b)=>b[1]-a[1]).slice(0,22).forEach(([k,v])=>console.log((100*v/all).toFixed(1).padStart(5)+'% '+k));
