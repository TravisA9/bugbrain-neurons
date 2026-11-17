const S=require('../js/node_load.js')(); S.params.granN=128;
const envP=Object.assign({},S.recommendedEnvParams('seq',{source:'order3',K:8},['source']),{nSyms:160});
const E=S.setEnv('seq',envP); const D=S.PLANS.deepURSx3.make();
const b=S.growCell(D,{seed:5,spec:E.spec});
console.log(JSON.stringify({nIn:b.nIn,nHid:b.nHid,nOut:b.nOut,N:b.N,regions:b.regions,outRegion:b.outRegion,typeInfo:b.typeInfo,areas:b.areas,tracts:b.tracts&&b.tracts.slice(0,30)}).slice(0,3000));
const cnt={}; for(let i=0;i<b.N;i++){const k=b.region[i]+':'+b.cellType[i]+':'+(b.gran&&b.gran[i]?'g':'')+(b.slow&&b.slow[i]?'s':'')+(b.mix&&b.mix[i]?'m':''); cnt[k]=(cnt[k]||0)+1;} console.log(cnt);
console.log(envP, S.params.substeps, Object.keys(b.devStats||{}));
const a=new S.Agent(D,7,b,E); const n=a.net; console.log('rcv',!!n.rcv,'mixPre',!!n.mixPre,'mlS',!!n.mlS,'mixInhD',n.mixInhD,'mixList',n.mixList&&n.mixList.length,'teach',!!n.teachTr,'uni',n.uni,'p.lr',n.p.lr, 'thr', !!n.thr, 'nPl', n.plastic&&n.plastic.length, 'ws', n.ws.length, 'hh',!!n.hhList, 'dc',!!n.dc, 'gd',!!n.gd,'gu',!!n.gu, 'pkeys', Object.keys(n.p).length);
