import json,os,statistics as st
def h(t,k):
  f=f'sw/out/bd_{t}_{k}.json'
  return json.load(open(f))['heldAcc'] if os.path.exists(f) else None
b1={2951:.4765,2952:.4735,2953:.475}; b4={2951:.478,2952:.526,2953:.4765}
for k in range(2954,2958): b1[k]=h('b30v_1x',k); b4[k]=h('b30v_4x',k)
rows=[]
for k in range(2951,2958):
  if k==2952: continue
  r=dict(k=k,b1=b1[k],t1=h('b30fast_1x',k),b4=b4[k],t4=h('b30fast_4x',k),t8=h('b30fast_8x',k)); rows.append(r); print(r)
def pd(a,b):
  d=[r[a]-r[b] for r in rows if r[a] is not None and r[b] is not None]
  print(f"{a}-{b}: n={len(d)} mean {st.mean(d):+.4f} se {st.stdev(d)/len(d)**.5:.4f} {sum(x>0 for x in d)}+/{sum(x<0 for x in d)}-")
for a,b in [('t4','b4'),('t1','b1'),('t4','t1'),('b4','b1'),('t8','t4'),('t4','b1')]: pd(a,b)
