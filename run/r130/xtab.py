import json,collections,sys
d=collections.defaultdict(dict)
for f in ('sw/out/xt.jsonl','sw/out/xsc.jsonl')+tuple(sys.argv[1:]):
  try:
    for l in open(f):
      r=json.loads(l); d[r['task']][r['arm']]=d[r['task']].get(r['arm'],{}); d[r['task']][r['arm']][r['k']]=r.get('mean')
  except FileNotFoundError: pass
for t in sorted(d):
  b=d[t].get('os',{})
  for a in sorted(d[t]):
    v=d[t][a]; ks=[k for k in (2951,2952,2953) if k in v and k in b]
    dl=[v[k]-b[k] for k in ks]
    print(f"{t:11s} {a:10s}", ' '.join(f"{v.get(k,float('nan')):6.3f}" for k in (2951,2952,2953)), f" d={sum(dl)/max(1,len(dl)):+.3f} {sum(x>0.001 for x in dl)}+/{sum(x<-0.001 for x in dl)}-" if a!='os' else '')
