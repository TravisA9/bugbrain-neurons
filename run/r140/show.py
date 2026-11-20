import json,glob,sys
for f in sorted(glob.glob('sw/out/lp_p_*_4x_*.json')):
    d=json.load(open(f)); b=d['bins']; print(d['tag'],d['k'],'acc',d['acc'],'probe',d['probeAcc'],'n',d['probeN'],' '.join(f"{k}:{b[k]['acc']}/{b[k]['n']}" for k in ['5-8','9-16','17-31'] if k in b),'rec',d['lagRec'],'fired',d['lagFired'],'sec',int(d['sec']))
for f in sorted(glob.glob('sw/out/bd_b30[xb]*_4x_*.json'))+sorted(glob.glob('sw/out/bd_b30cand_4x_*.json')):
    d=json.load(open(f)); g=d.get('gu') or {}; print(d['tag'],d['k'],'held',d['heldAcc'],'exact',g.get('exact'),'lagRec',g.get('lagRec'),'chunkRec',g.get('chunkRec'),'sec',int(d['sec']))
