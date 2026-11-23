# Long-memory control: what an n-gram (no memory beyond its context) guesses on the invented-name prompts of sw/standing_gen.js,
# first vs second occurrence of the name (letters 2..end). -> standing/ngram_lm.json
import json, re, sys
sys.path.insert(0, 'standing'); from ngram import KN, A, K
TPL = [('d_short', 'the king sent for N and N came at once. '), ('d_30', 'a little girl named N lived in a house by the wood. N had a red cap. '),
       ('d_60', 'once there was a dog called N who lived on a farm with an old man and his wife. every day N ran to the river. '),
       ('d_120', 'in a village by the sea lived a fisherman named N. he had a small boat and a net and each morning he went out on the water to catch fish for his children and his wife. one day N saw a great storm. ')]
names = ['sorinda', 'brumwick', 'pelmatho', 'garvinel', 'tobimar', 'kelvoran']
d = json.load(open('standing/data_k2951.json')); out = {}
for tag, tr, o in [('KN5_life98k', d['train'], 5), ('KN7_full', json.load(open('/tmp/book_full.json'))['train'] if False else None, 7)]:
    if tr is None: continue
    m = KN(tr, o); res = {}
    for tid, t in TPL:
        h1 = n1 = h2 = n2 = 0
        for nm in names:
            s = t.replace('N', nm); i1 = s.index(nm); i2 = s.index(nm, i1 + 1)
            for (st, acc) in [(i1, 1), (i2, 2)]:
                for i in range(st + 1, st + len(nm)):
                    p = m.dist(s[max(0, i - 10):i]); ok = A[max(range(K), key=lambda j: p[j])] == s[i]
                    if acc == 1: h1 += ok; n1 += 1
                    else: h2 += ok; n2 += 1
        res[tid] = {'first': f'{h1}/{n1}', 'second': f'{h2}/{n2}'}
    out[tag] = res; print(tag, res)
json.dump(out, open('standing/ngram_lm.json', 'w'), indent=1)
