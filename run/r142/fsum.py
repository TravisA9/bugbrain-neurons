import json,collections,sys
r=collections.defaultdict(dict)
for f in ['run/r140/out/xr140.jsonl','run/r141/out/xf141.jsonl','run/r141/out/xf141b.jsonl']+sys.argv[1:]:
  for l in open(f):
    j=json.loads(l)
    if j['task']=='fables4000': r[j['arm']][j['k']]=(j['mean'],j['stats']['accuracy'],j['stats']['bits'])
c=r['cand_4x']
for a,d in sorted(r.items()):
  ks=sorted(set(d)&set(c))
  if a=='cand_4x' or not ks: continue
  print(f"{a:8s}", ' '.join(f"{k}:{d[k][0]-c[k][0]:+.3f}/{d[k][1]-c[k][1]:+.4f}" for k in ks), '| mean fit %+.4f acc %+.4f bits %+.4f'%tuple(sum(d[k][i]-c[k][i] for k in ks)/len(ks) for i in range(3)))
