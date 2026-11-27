import json,sys,glob,os,re
# summ.py [glob] -> one row per xray output: held acc, counter, new/1-2 bins (held), reuse by type, long whole-word sharing, recruit stats
rows=[]
FS=sys.argv[1:] or glob.glob('/workspace/wordunit-wt/sw/out/xray_*.json')
for f in sorted(FS):
  if f.endswith('_summary.json'): continue
  try: x=json.load(open(f))
  except Exception as e: print("skip",f,e,file=sys.stderr); continue
  L=x['learningToLearn']; g=lambda b,key: (L.get('H:'+b) or {}).get(key)
  r=x['reuse']; bt=r['byType']; gs=x.get('guStats',{})
  rows.append(dict(file=os.path.basename(f),k=x['k'],tag=x['tag'],held=x['heldAcc'],cnt=x['countModel']['heldAcc'],
    new_b=g('new','brain'),new_c=g('new','count'),new_n=g('new','n'),r12_b=g('1-2','brain'),r12_c=g('1-2','count'),
    word_share=bt['word']['shareAny'],word_pairs=bt['word']['pairs'],chunk_share=bt['chunk']['shareAny'],tuple_share=bt['tuple']['shareAny'],
    long_pairs=r['long']['pairs'],long_shared=r['long']['sharedWholeWord'],jacc=r['jacc'],diffJ=r['diffWordJacc'],
    wordRec=gs.get('wordRec'),chunkRec=gs.get('chunkRec'),wordFired=gs.get('wordFired'),chunkFired=gs.get('chunkFired'),sec=round(x['sec'])))
json.dump(rows,open('/workspace/wordunit/rows.json','w'),indent=0)
H=['tag','k','held','cnt','new_b','new_c','new_n','r12_b','r12_c','word_share','word_pairs','chunk_share','long_shared','long_pairs','jacc','wordRec','chunkRec','sec']
print('\t'.join(H))
for R in rows: print('\t'.join(str(R[h]) for h in H))
