# python3 run/r140/mkreg.py <arm> <extra variant> > jobs.json : the R135 cross-task suite at 4x (sc_order2/sc_cycle 8 seeds, others 3)
import json,sys
arm,extra=sys.argv[1],sys.argv[2] if len(sys.argv)>2 else ''
C=open('run/r140/cand_base.txt').read().strip()+',sc.sizeF=4'+(','+extra if extra else '')
T={'sc_order2':('{"env":"seqchoice","params":{"source":"order2","nSyms":1000}}',range(2951,2959)),'sc_cycle':('{"env":"seqchoice","params":{"source":"cycle","nSyms":1000}}',range(2951,2959)),
 'order3':('{"env":"seq","params":{"source":"order3","K":8,"readIn":0.01}}',range(2951,2954)),'K4':('{"env":"seq","params":{"source":"order3","K":4,"readIn":0.01}}',range(2951,2954)),
 'text1000':('{"env":"seq","params":{"source":"text","nSyms":1000,"readIn":0.01}}',range(2951,2954)),'fables4000':('{"env":"seq","params":{"source":"fables","nSyms":4000,"readIn":0.01}}',range(2951,2954))}
print(json.dumps([{'arm':arm,'task':t,'tj':tj,'variant':C,'k':k} for t,(tj,ks) in T.items() for k in ks]))
