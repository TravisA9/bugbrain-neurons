import json,collections
R=collections.defaultdict(dict)
for l in open('run/r144/out/xreg.jsonl'):
    r=json.loads(l); R[(r['task'],r['k'])][r['arm']]=r
T=collections.defaultdict(list)
for (t,k),a in sorted(R.items()):
    if 'cand_4x' in a and 'S2_4x' in a:
        c,s=a['cand_4x'],a['S2_4x']
        T[t].append((k,s['mean']-c['mean'],s['stats'].get('accuracy',0)-c['stats'].get('accuracy',0)))
for t,v in T.items():
    n=len(v); fd=sum(x[1] for x in v)/n; ad=sum(x[2] for x in v)/n
    print(f"{t:11s} n={n:2d} fit d {fd:+.4f} acc d {ad:+.4f} (+{sum(x[1]>0 for x in v)}/-{sum(x[1]<0 for x in v)}) per-seed acc: "+' '.join(f"{x[0]}:{x[2]:+.4f}" for x in v))
print('results',sum(len(a) for a in R.values()),'/ 96')
