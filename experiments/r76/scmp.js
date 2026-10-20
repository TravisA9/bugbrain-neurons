const fs=require('fs'),D='/workspace/r76/scr/',A={};for(const f of fs.readdirSync(D))if(/\.json$/.test(f)){const m=f.match(/^(\w+?)_(\w+)_g(\d+)\.json$/);try{const r=JSON.parse(fs.readFileSync(D+f));(A[m[1]]=A[m[1]]||{})[m[2]]=Object.assign((A[m[1]]||{})[m[2]]||{},{[m[3]]:r.mean});}catch(e){}}
const T=['o3','t1','so2','scy','f4','b10','b30','ban','cue'];
const cmp=(a,b)=>T.map(t=>{const x=(A[a]||{})[t]||{},y=(A[b]||{})[t]||{},g=Object.keys(x).filter(k=>k in y),d=g.map(k=>x[k]-y[k]);if(!g.length)return t+' -';const m=d.reduce((p,q)=>p+q,0)/d.length,s=Math.sqrt(d.reduce((p,q)=>p+(q-m)**2,0)/Math.max(1,d.length-1))/Math.sqrt(d.length);return `${t} ${m>=0?'+':''}${m.toFixed(3)}±${s.toFixed(3)}(${g.length})`;}).join('  ');
const mean=a=>T.map(t=>{const x=Object.values((A[a]||{})[t]||{});return t+' '+(x.length?(x.reduce((p,q)=>p+q,0)/x.length).toFixed(3):'-')}).join('  ');
for(const a of Object.keys(A).sort())console.log('mean',a.padEnd(4),mean(a));
for(const [a,b] of [['v2','x1'],['c2','v2'],['cr2','c2'],['cr2','x1'],['v4','x1'],['c4','v4'],['cr4','c4'],['cr4','x1']])console.log((a+' vs '+b).padEnd(12),cmp(a,b));
