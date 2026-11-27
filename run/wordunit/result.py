import json,glob,os,statistics as S,sys
O='/workspace/wordunit-wt/sw/out/'
def load(tag,arm,k):
  f=f'{O}xray_{tag}_{arm}_{k}.json'
  if not os.path.exists(f): return None
  x=json.load(open(f)); L=x['learningToLearn']; r=x['reuse']
  return dict(k=k,held=x['heldAcc'],cnt=x['countModel']['heldAcc'],newb=L['H:new']['brain'],newc=L['H:new']['count'],newn=L['H:new']['n'],
    r12=L.get('H:1-2',{}).get('brain'),ws=r['byType']['word']['shareAny'],wp=r['byType']['word']['pairs'],lw=r['long']['sharedWholeWord']/max(1,r['long']['pairs']),hits=x['hits'])
def m(v): v=[a for a in v if a is not None]; return round(S.mean(v),4) if v else None
out=[]; P=out.append
P('# Word-unit diagnostic RESULT (auto-written %s)\n'%os.popen("date '+%a %b %d %H:%M CT'").read().strip())
arms=['base','w1','w2']; T={a:[load('t30',a,k) for k in (2977,2978)] for a in arms}
P('## Tune (30k, k2977/k2978)\n\n| arm | k | held | counter | new brain | new counter | 1-2 bin | word reuse | whole-word share |\n|---|---|---|---|---|---|---|---|---|')
for a in arms:
  for d in T[a]:
    if d: P(f"| {a} | {d['k']} | {d['held']} | {d['cnt']} | {d['newb']} | {d['newc']} | {d['r12']} | {d['ws']} | {d['lw']:.3f} |")
ok=lambda a: all(T[a]) and m([d['ws'] for d in T[a]]) is not None and m([d['ws'] for d in T[a]])>=0.5
mh={a:m([d['held'] for d in T[a] if d]) for a in arms}
P(f"\nMean held: {mh}")
best=None
if all(all(T[a]) for a in arms):
  c=[a for a in ('w1','w2') if ok(a)]
  if c:
    best=max(c,key=lambda a:mh[a]); 
    if len(c)==2 and abs(mh['w1']-mh['w2'])<0.003: best='w1'
P(f"Chosen arm (PREREG rule): {best}\n")
if len(sys.argv)>1 and sys.argv[1]=='pick': print(best or ''); sys.exit()
arm=open('/workspace/wordunit/chosen.txt').read().strip() if os.path.exists('/workspace/wordunit/chosen.txt') else best
ks=range(3001,3017); B=[load('c30','base',k) for k in ks]; A=[load('c30',arm,k) for k in ks] if arm else []
pr=[(b,a) for b,a in zip(B,A) if a and b]
P(f'## Confirm (30k, 16 fresh seeds k3001-k3016): base vs {arm}; paired seeds done: {len(pr)}\n')
if pr:
  dh=[a['held']-b['held'] for b,a in pr]; dn=[a['newb']-b['newb'] for b,a in pr]
  P('| k | base held | arm held | base new | arm new | counter new | arm word reuse |\n|---|---|---|---|---|---|---|')
  for b,a in pr: P(f"| {b['k']} | {b['held']} | {a['held']} | {b['newb']} | {a['newb']} | {a['newc']} | {a['ws']} |")
  mw=m([a['ws'] for b,a in pr]); dlw=m([a['lw']-b['lw'] for b,a in pr])
  nb_c=m([a['newb']-a['newc'] for b,a in pr])
  P(f"\nMean held base {m([b['held'] for b,a in pr])} arm {m([a['held'] for b,a in pr])} counter {m([b['cnt'] for b,a in pr])}; paired diff {m(dh)} (arm better on {sum(x>0 for x in dh)}/{len(dh)}, worse {sum(x<0 for x in dh)}), sd {round(S.pstdev(dh),4)}")
  P(f"New-context acc: base {m([b['newb'] for b,a in pr])} arm {m([a['newb'] for b,a in pr])} counter {m([a['newc'] for b,a in pr])}; arm-base {m(dn)} (up on {sum(x>0 for x in dn)}/{len(dn)}); arm-counter {nb_c}")
  P(f"Mechanism: word reuse (shareAny) mean {mw}; whole-word sharing change {dlw}")
  Mp=mw is not None and mw>=0.5 and dlw>=0.10; Mf=mw is None or mw<0.2
  Op=m(dn)>=0.02 and nb_c>=0.01; flat=abs(m(dn))<0.01
  P(f"\nPREREG verdict: M {'PASS' if Mp else ('FAIL' if Mf else 'partial')}; O {'PASS' if Op else ('FLAT' if flat else 'in between (+.01..+.02 or below counter)')}")
  if len(pr)<16: P('(INTERIM: not all 16 seeds finished)')
open('/workspace/wordunit/RESULT.md','w').write('\n'.join(out)+'\n'); print('\n'.join(out))
