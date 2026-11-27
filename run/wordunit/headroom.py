# Exploratory headroom on never-seen-4-letter contexts: backoff counter (as xray) vs interpolated blends (Witten-Bell / PPM-like), online, same stream.
import sys,json,collections,math
txt,meta=open(sys.argv[1]).read().split('\n')[:2]; meta=json.loads(meta); h0=meta['heldFrom']; n=meta['nSyms']
MAXO=10; tab=[collections.defaultdict(collections.Counter) for _ in range(MAXO+1)]
A=sorted(set(txt))
res=collections.defaultdict(lambda:[0,0]); 
def wb(i,maxo):
  # Witten-Bell interpolation from order 0 up to maxo
  p={a:1/len(A) for a in A}
  for o in range(0,min(maxo,i+1)+1):
    c=tab[o].get(txt[i-o+1:i+1] if o else '')
    if not c: break
    tot=sum(c.values()); u=len(c); lam=tot/(tot+u)
    p={a:lam*c.get(a,0)/tot+(1-lam)*p[a] for a in A}
  return max(p,key=p.get)
def backoff(i):
  for o in range(min(MAXO,i+1),0,-1):
    c=tab[o].get(txt[i-o+1:i+1])
    if c: return c.most_common(1)[0][0]
  return None
for i in range(n):
  tgt=txt[i+1]
  if i>=h0:
    c4=tab[4].get(txt[i-3:i+1]) if i>=3 else None
    nb='new' if not c4 else 'seen'
    preds={'backoff10':backoff(i),'wb10':wb(i,10),'wb5':wb(i,5),'wb3':wb(i,3)}
    for kk,v in preds.items():
      for b in (nb,'all'):
        r=res[(kk,b)]; r[0]+=v==tgt; r[1]+=1
  for o in range(0,min(MAXO,i+1)+1):
    tab[o][txt[i-o+1:i+1] if o else ''][tgt]+=1
out={f'{a}|{b}':(round(v[0]/v[1],4),v[1]) for (a,b),v in sorted(res.items())}
print(json.dumps(out))
