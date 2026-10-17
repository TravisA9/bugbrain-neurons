const fs=require('fs');const d=process.argv[2];const f=fs.readdirSync(d)[0];const p=JSON.parse(fs.readFileSync(d+'/'+f));
const self={};const dt={};p.samples.forEach((id,i)=>dt[id]=(dt[id]||0)+(p.timeDeltas[i]||0));
let tot=0;for(const n of p.nodes){const c=n.callFrame;const k=c.functionName+' '+c.url.split('/').slice(-2).join('/')+':'+(c.lineNumber+1);const t=dt[n.id]||0;self[k]=(self[k]||0)+t;tot+=t;}
Object.entries(self).sort((a,b)=>b[1]-a[1]).slice(0,14).forEach(([k,v])=>console.log((100*v/tot).toFixed(1).padStart(5)+'% '+k));
