import json
from collections import defaultdict
R=defaultdict(dict)
for f in ['sw/out/xfast.jsonl','sw/out/xchunk.jsonl']:
  for l in open(f):
    if not l.startswith('{'): continue
    d=json.loads(l);R[(d['arm'],d['task'])][d['k']]=d['mean']
for arm in ['4x','1x']:
  for t in ['order3','sc_order2','sc_cycle','K4','text1000','fables4000']:
    a=R[('fast_'+arm,t)];b=R[('chunk_'+arm,t)];ks=sorted(set(a)&set(b))
    if not ks: continue
    dd=[b[k]-a[k] for k in ks]
    print(arm,t,'n',len(ks),'base',[a[k] for k in ks],'chunk',[b[k] for k in ks],'mean d %+.3f'%(sum(dd)/len(dd)))
