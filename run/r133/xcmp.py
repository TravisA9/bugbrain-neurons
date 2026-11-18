import json,collections,statistics as st
B=collections.defaultdict(dict)
for f,arm_map in [('xself',{'self_4x':'b4','self_1x':'b1'}),('xcy8',{'self_4x':'b4','self_1x':'b1'}),('xcand',{'cand_4x':'b4t'}),('reg1x',{'os':'b1t'}),('xfast',{'fast_4x':'f4','fast_1x':'f1'})]:
  for l in open(f'sw/out/{f}.jsonl'):
    r=json.loads(l)
    if r['arm'] in arm_map: B[(arm_map[r['arm']],r['task'])][r['k']]=r['mean']
def cmp(fa,ba,task):
  f=B[(fa,task)]; b=B[(ba,task)]; ks=sorted(set(f)&set(b))
  if not ks: return
  d=[f[k]-b[k] for k in ks]
  print(f"{task:11s} {fa} vs {ba}: n={len(ks)} mean d {st.mean(d):+.3f}" + (f" se {st.stdev(d)/len(d)**.5:.3f}" if len(d)>1 else "") + f" {sum(x>0 for x in d)}+/{sum(x<0 for x in d)}-  " + " ".join(f"{k}:{b[k]}->{f[k]}" for k in ks))
for t in ['sc_order2','sc_cycle']: cmp('f4','b4',t); cmp('f1','b1',t)
for t in ['order3','K4','text1000','fables4000']: cmp('f4','b4t',t); cmp('f1','b1t',t)
