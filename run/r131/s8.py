import json,sys,numpy as np,collections
d=collections.defaultdict(dict)
for f in sys.argv[1:]:
  for l in open(f):
    r=json.loads(l)
    if r['task']=='sc_order2': d[r['arm']][r['k']]=r['mean']
b=d['os']
for a in sorted(d):
  ks=[k for k in sorted(d[a]) if k in b]
  if a=='os': print('os', ' '.join(f"{b[k]:.2f}" for k in ks), 'mean %.3f'%np.mean([b[k] for k in ks])); continue
  dl=np.array([d[a][k]-b[k] for k in ks])
  if len(dl)<2: continue
  print(f"{a:12s} n={len(dl)} d={dl.mean():+.3f} se={dl.std(ddof=1)/np.sqrt(len(dl)):.3f} {sum(dl>0)}+/{sum(dl<0)}-  ", ' '.join(f"{d[a][k]:.2f}" for k in ks))
