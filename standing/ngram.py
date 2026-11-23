# Character n-gram baselines (interpolated Kneser-Ney, 24-letter book alphabet) trained on the SAME letters as an SNN life
# and scored on the SAME 2000 held-out letters. usage: python3 standing/ngram.py  -> standing/ngram_results.json (incl. samples)
import json, math, random, collections
A = ' .abcdefghiklmnoprstuvwy'; K = len(A)
class KN:
    def __init__(self, text, order, D=0.75):
        self.n = order; self.D = D
        self.c = [collections.defaultdict(collections.Counter) for _ in range(order)]   # c[m][context of length m][next char]
        for m in range(order):
            cm = self.c[m]
            for i in range(m, len(text)): cm[text[i-m:i]][text[i]] += 1
        self.cc = [collections.defaultdict(collections.Counter) for _ in range(order)]  # KN continuation counts for lower orders
        for m in range(order - 1):
            for ctx, ctr in self.c[m + 1].items():
                for ch in ctr: self.cc[m][ctx[1:]][ch] += 1
        self.cache = {}
    def dist(self, ctx):
        ctx = ctx[len(ctx) - (self.n - 1):] if self.n > 1 else ''
        if ctx in self.cache: return self.cache[ctx]
        p = [1.0 / K] * K
        for m in range(0, len(ctx) + 1):
            h = ctx[len(ctx) - m:] if m else ''
            tab = (self.c[m] if m == len(ctx) else self.cc[m]).get(h)
            if not tab: continue
            tot = sum(tab.values()); d = self.D if m > 0 else 0.0; lam = d * len(tab) / tot
            p = [max(tab.get(A[j], 0) - d, 0) / tot + lam * p[j] for j in range(K)]
        s = sum(p); p = [x / s for x in p]; self.cache[ctx] = p; return p
def score(model, text, start):
    hit = 0; bits = 0.0; n = 0
    for i in range(start, len(text)):
        p = model.dist(text[max(0, i - 10):i]); y = A.index(text[i])
        hit += int(max(range(K), key=lambda j: p[j]) == y); bits -= math.log2(p[y]); n += 1
    return hit / n, bits / n, n
def sample(model, prompt, n, T, seed):
    r = random.Random(seed); s = prompt
    for _ in range(n):
        w = [x ** (1 / T) for x in model.dist(s[-10:])]; u = r.random() * sum(w)
        for j in range(K):
            u -= w[j]
            if u <= 0: break
        s += A[j]
    return s[len(prompt):]
if __name__ == '__main__':
    full = json.load(open('/tmp/book_full.json'))
    out = {'note': 'interpolated Kneser-Ney (D=0.75); order n uses n-1 letters of context; acc = argmax next-letter accuracy; bits = log-loss bits/char', 'runs': []}
    seeds = [2951, 2953, 2954]; D = {k: json.load(open(f'standing/data_k{k}.json')) for k in seeds}
    for order in range(1, 8):
        for k in seeds:
            d = D[k]; m = KN(d['train'], order); acc, bits, n = score(m, d['train'] + d['held'], len(d['train']))
            out['runs'].append({'train': 'life98k', 'k': k, 'order': order, 'acc': round(acc, 4), 'bits': round(bits, 4), 'n': n}); print(order, k, 'life98k', round(acc, 4), round(bits, 4), flush=True)
    for order in range(1, 8):
        m = KN(full['train'], order)
        for k in seeds:
            d = D[k]; acc, bits, n = score(m, d['train'] + d['held'], len(d['train']))
            out['runs'].append({'train': 'full3.29M', 'k': k, 'order': order, 'acc': round(acc, 4), 'bits': round(bits, 4), 'n': n})
        acc, bits, n = score(m, full['held'][:50000], 10)
        out['runs'].append({'train': 'full3.29M', 'k': 'HELD50k', 'order': order, 'acc': round(acc, 4), 'bits': round(bits, 4), 'n': n}); print(order, 'full HELD50k', round(acc, 4), round(bits, 4), flush=True)
        del m
    d = D[2951]; S = {}
    prompts = {'story_open': 'once upon a time there was a ', 'qa_oz': 'kwestion. who went to the land of os. answer. '}
    for name, (tr, order) in {'2gram_life98k': (d['train'], 2), '3gram_life98k': (d['train'], 3), '5gram_life98k': (d['train'], 5), '7gram_full3.29M': (full['train'], 7)}.items():
        m = KN(tr, order); S[name] = {pn: {'T0.5': sample(m, pr, 300, 0.5, 1), 'T1': sample(m, pr, 300, 1.0, 2)} for pn, pr in prompts.items()}
    out['samples'] = S; json.dump(out, open('standing/ngram_results.json', 'w'), indent=1)
