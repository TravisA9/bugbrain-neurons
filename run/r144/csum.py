import json,glob,os
D={}
for f in glob.glob('sw/out/bd_g144b_*_4x_*.json'):
    d=json.load(open(f)); arm='S2' if '_S2_4x_' in f else 'cand'; D.setdefault(d['k'],{})[arm]=d.get('heldAcc')
pairs=sorted((k,v['S2']-v['cand']) for k,v in D.items() if 'S2' in v and 'cand' in v and v['S2'] is not None and v['cand'] is not None)
if pairs:
    m=sum(x for _,x in pairs)/len(pairs)
    print('book100k pairs %d: '%len(pairs)+' '.join(f'{k}:{x:+.4f}' for k,x in pairs)+f'  mean {m:+.4f} worst {min(x for _,x in pairs):+.4f} below -.003: {sum(x<-.003 for _,x in pairs)} (+{sum(x>0 for _,x in pairs)}/-{sum(x<0 for _,x in pairs)})')
else: print('book100k: no pairs yet; files', len(glob.glob('sw/out/bd_g144b_*.json')))
