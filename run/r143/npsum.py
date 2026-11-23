import json,glob,sys
for f in sorted(glob.glob('sw/out/np_np_*.json')):
  j=json.load(open(f)); print(f.split('/')[-1], 'held', j['heldAcc'], 'text acc on/off', j['textAccOn'], j['textAccOff'], 'shift', j['shiftAcc']['used'], 'lagFired', j['lagFired'])
  for s in ('on','off'):
    print('  ',s, ' '.join(f"g{g}: f {b['first1']:.2f}->{b['first2']:.2f} r {b['rest1']:.3f}->{b['rest2']:.3f} x {b['exact1']}->{b['exact2']}" for g,b in sorted(j[s]['byGap'].items(), key=lambda t:int(t[0]))))
