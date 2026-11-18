import json,sys,numpy as np,collections
def feats(tr,key,n):
    X=np.zeros((len(tr),n))
    for i,t in enumerate(tr):
        v=t[key]; 
        for j in range(0,len(v),2): X[i,v[j]]=v[j+1]
    return X
def ridge_cv(X,y,K,lam=1.0,folds=5):
    X=np.log1p(X); X=np.hstack([X,np.ones((len(X),1))]); Y=np.eye(K)[y]; idx=np.arange(len(y)); acc=0
    for f in range(folds):
        te=idx%folds==f; tr=~te
        A=X[tr]; W=np.linalg.solve(A.T@A+lam*np.eye(A.shape[1]),A.T@Y[tr]); acc+=(np.argmax(X[te]@W,1)==y[te]).sum()
    return acc/len(y)
def fo_base(tr):  # best first-order (cur symbol -> target) and order-2 table accuracy (oracle, in-sample)
    c1=collections.defaultdict(collections.Counter); c2=collections.defaultdict(collections.Counter)
    for t in tr: c1[t['c']][t['t']]+=1; c2[(t['p'],t['c'])][t['t']]+=1
    return sum(max(v.values()) for v in c1.values())/len(tr), sum(max(v.values()) for v in c2.values())/len(tr)
for f in sys.argv[1:]:
    d=json.load(open(f)); tr=d['trials'][2:]; n=len(tr); K=6
    q=lambda key,fn=np.mean: [round(float(fn([key(t) for t in tr[i*n//4:(i+1)*n//4]])),3) for i in range(4)]
    y=np.array([t['t'] for t in tr]); Xs=feats(tr,'sv',d['nStr']); Xc=feats(tr,'cv',d['nCx'])
    h=n//2
    print(f"{d['tag']:11s} {d['k']} fit {d['fitness']:.2f} nStr {d['nStr']}")
    print('   acc/q', q(lambda t:t['ok']), ' margin', q(lambda t:t['m']), ' top2', q(lambda t:t['top2']), ' outSpk', q(lambda t:t['tot']))
    print('   strSpk/cell', q(lambda t:t['g'].get('striatum',0)/d['nStr']), ' silentStr', q(lambda t: (len(t['sv'])//2)/d['nStr']), ' DA', q(lambda t:t['da']), ' V', q(lambda t:t['v']))
    print('   |dw| OUT<-str per syn', q(lambda t:t['dOs']/max(1,d['nSyn']['os'])), ' str<-cx per syn', q(lambda t:t['dSc']/max(1,d['nSyn']['sc'])), ' tot0frac', q(lambda t: t['tot']==0))
    fo,o2=fo_base(tr)
    print('   decode target: striatum %.3f  cortex+context %.3f | 1st-order oracle %.3f  2nd-order oracle %.3f' % (ridge_cv(Xs,y,K), ridge_cv(Xc,y,K), fo, o2), ' 2nd half str %.3f' % ridge_cv(Xs[h:],y[h:],K))
