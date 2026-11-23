import json,collections
r=collections.defaultdict(dict)
for l in open('run/r143/out/xf16.jsonl'):
  j=json.loads(l); r[j['arm']][j['k']]=j
c,s=r['cand_4x'],r['S2_4x']; ks=sorted(set(c)&set(s))
for k in ks: print(k,'fit %+.3f acc %+.4f last %+.4f bits %+.4f'%(s[k]['mean']-c[k]['mean'],s[k]['stats']['accuracy']-c[k]['stats']['accuracy'],s[k]['stats']['lastQuarter']-c[k]['stats']['lastQuarter'],s[k]['stats']['bits']-c[k]['stats']['bits']), c[k]['stats']['accuracy'])
n=len(ks)
if n: print('mean fit %+.4f acc %+.4f last %+.4f'%(sum(s[k]['mean']-c[k]['mean'] for k in ks)/n,sum(s[k]['stats']['accuracy']-c[k]['stats']['accuracy'] for k in ks)/n,sum(s[k]['stats']['lastQuarter']-c[k]['stats']['lastQuarter'] for k in ks)/n))
