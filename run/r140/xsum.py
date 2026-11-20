import json,collections
r=collections.defaultdict(dict)
for l in open('run/r140/out/xr140.jsonl'):
    j=json.loads(l); r[j['task']].setdefault(j['arm'],{})[j['k']]=j['stats'].get('accuracy',j.get('mean'))
for t,a in r.items():
    c=a.get('cand_4x',{}); s=a.get('S2_4x',{}); ks=sorted(set(c)&set(s))
    if not ks: print(t,'incomplete',len(c),len(s)); continue
    mc=sum(c[k] for k in ks)/len(ks); ms=sum(s[k] for k in ks)/len(ks)
    print(f"{t:12s} n={len(ks)} cand {mc:.4f} S2 {ms:.4f} d {ms-mc:+.4f} | "+' '.join(f"{k}:{c[k]:.3f}/{s[k]:.3f}" for k in ks))
