# KN 5-gram (standing/ngram.py, trained on the same 98k letters) per-letter hits on the 2000 held letters -> JSON
import json, sys
sys.path.insert(0, 'standing'); from ngram import KN, A, K
k = int(sys.argv[1]); d = json.load(open(f'standing/data_k{k}.json')); held = d['held']
m = KN(d['train'], 5); ctx = d['train'] + held; hits = []
for i in range(len(held)):
    p = m.dist(ctx[len(d['train']) + i - 10:len(d['train']) + i]); hits.append(int(A[max(range(K), key=lambda j: p[j])] == held[i]))
json.dump({'k': k, 'model': 'KN 5-gram, same 98k training letters', 'hits': ''.join(map(str, hits)), 'acc': sum(hits) / len(hits)}, open(sys.argv[2], 'w'))
print(k, sum(hits) / len(hits))
