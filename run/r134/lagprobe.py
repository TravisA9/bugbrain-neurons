# python3 sw/lagprobe.py <tag> <k>: ridge one-hot probes of the letter at lag L (0..8) from each region's per-slot spike counts; train first 70%, test rest
import json,sys,numpy as np
tag,k=sys.argv[1],sys.argv[2]
M=json.load(open(f'sw/out/lp_{tag}_{k}.json')); X=np.fromfile(f'sw/out/lp_{tag}_{k}.bin',dtype=np.float32).reshape(M['nRows'],M['nCells'])
s=np.array(M['syms']); reg=np.array(M['region']); K=int(s.max())+1; T=len(s); tr=int(T*0.7)
out={}
groups=sorted(set(reg))+['ALL']
for gname in groups:
  cols=np.where(reg==gname)[0] if gname!='ALL' else np.arange(X.shape[1])
  Z=np.log1p(X[:,cols]); Z=(Z-Z[:tr].mean(0))/(Z[:tr].std(0)+1e-3); Z=np.hstack([Z,np.ones((T,1))])
  res=[]
  for L in range(0,9):
    idx=np.arange(L,T); y=s[idx-L]; Zi=Z[idx]; trm=idx<tr; tem=idx>=tr
    Y=np.eye(K)[y[trm]]; A=Zi[trm]; lam=10.0*A.shape[1]
    W=np.linalg.solve(A.T@A+lam*np.eye(A.shape[1]),A.T@Y)
    acc=float((np.argmax(Zi[tem]@W,1)==y[tem]).mean()); res.append(round(acc,3))
  out[gname]={'n':int(len(cols)),'acc':res}
chance=float(np.bincount(s[tr:]).max()/len(s[tr:]))
print(json.dumps({'tag':tag,'k':k,'chance':round(chance,3),'probe':out}))
