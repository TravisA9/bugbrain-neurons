const fs=require('fs'),path=require('path');const out={};
for(const dir of ['r42','r43'])for(const f of fs.readdirSync(path.join(__dirname,'..',dir))){const m=f.match(/^(?:scale|r43)_(.+)_(text|o3)_(\d+)\.json$/);if(!m)continue;
 let j;try{j=JSON.parse(fs.readFileSync(path.join(__dirname,'..',dir,f),'utf8'))}catch(e){console.log('ERR',f);continue}
 const k=m[1]+' '+m[2];(out[k]=out[k]||{s:[],st:[]});out[k].s.push(...j.scores);out[k].st.push(j.stats);}
const base={};for(const k in out){const o=out[k],n=o.s.length,mu=o.s.reduce((a,b)=>a+b)/n,se=Math.sqrt(o.s.reduce((a,b)=>a+(b-mu)**2,0)/n/n);
 const av=q=>o.st.reduce((a,s)=>a+s[q],0)/o.st.length;
 console.log(k.padEnd(22),n,mu.toFixed(3),'±'+se.toFixed(3),'last',av('lastQuarter').toFixed(3),'acc',av('accuracy').toFixed(3),'bF1',av('bF1').toFixed(3),'bits',av('bits').toFixed(3));}
const get=(k)=>{const fs2=[];return out[k]?.s};
console.log('paired vs predictK3:');for(const k in out){const t=k.split(' ')[1],b=out['predictK3 '+t];if(!b||k.startsWith('predictK3')||!/slow|deep|vote|word/.test(k))continue;
 const d=out[k].s.map((x,i)=>x-b.s[i]),n=d.length,mu=d.reduce((a,b)=>a+b)/n,se=Math.sqrt(d.reduce((a,x)=>a+(x-mu)**2,0)/(n-1)/n),w=d.filter(x=>x>0).length;
 console.log(k.padEnd(22),'diff',mu.toFixed(3),'se',se.toFixed(3),'t',(mu/se).toFixed(1),'wins',w+'/'+n);}
