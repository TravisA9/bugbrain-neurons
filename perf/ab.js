// node perf/ab.js <repoRoot> <task>: lifetime CPU ms (user+sys) of one fixed-seed growth, 3 lifetimes
const root=process.argv[2],task=process.argv[3];const L=require(root+'/run/lib.js'),SA=L.SA;
const T={text:{name:'text',env:'seq',params:{source:'text',nSyms:1000}},order3:{name:'order3',env:'seq',params:{source:'order3',nSyms:1000}},bandit:{name:'bandit',env:'bandit',params:{}}}[task];
const env=L.setupTask(T),g=SA.PLANS[task==='bandit'?'unifiedR':'deepURSx3'].make(),b=SA.growCell(g,{seed:11,spec:env.spec});
let best=1e9,fit;for(let r=0;r<3;r++){const c0=process.cpuUsage();const a=new SA.Agent(g,1,b,env);while(!a.done)a.tick();const c=process.cpuUsage(c0);best=Math.min(best,(c.user+c.system)/1000);fit=a.fitness;}
console.log(task,root.includes('perf')?'NEW':'OLD',best.toFixed(0)+'ms',fit);
