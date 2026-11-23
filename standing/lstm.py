# Small character LSTM in plain numpy (no torch on the box). Trained on the SAME letters as an SNN life (98k), early-stopped on the last 5k
# of them, scored on the SAME 2000 held letters (stateful, warmed up on the preceding text). usage: python3 standing/lstm.py <k> <minutes> [full]
import json, math, sys, time, numpy as np
A = ' .abcdefghiklmnoprstuvwy'; K = len(A); IX = {c: i for i, c in enumerate(A)}
k = int(sys.argv[1]); MIN = float(sys.argv[2]); FULL = len(sys.argv) > 3
d = json.load(open(f'standing/data_k{k}.json'))
tr = json.load(open('/tmp/book_full.json'))['train'] if FULL else d['train']
x_all = np.array([IX[c] for c in tr], dtype=np.int64); val = x_all[-5000:]; x = x_all[:-5000]
H = int(__import__("os").environ.get("LSTM_H", "256")); S = 64; Bt = 32; rng = np.random.default_rng(k)
def init(n, m): return (rng.standard_normal((n, m)) / math.sqrt(n)).astype(np.float32)
P = {'Wx': init(K, 4 * H), 'Wh': init(H, 4 * H), 'b': np.zeros(4 * H, np.float32), 'Wy': init(H, K), 'by': np.zeros(K, np.float32)}
P['b'][H:2 * H] = 1.0
M = {n: np.zeros_like(v) for n, v in P.items()}; V = {n: np.zeros_like(v) for n, v in P.items()}; t_adam = 0
sig = lambda z: 1 / (1 + np.exp(-z))
def forward(xs, h, c, P, keep=True):
    T = xs.shape[1]; cache = []; logits = []
    for t in range(T):
        z = P['Wx'][xs[:, t]] + h @ P['Wh'] + P['b']
        i, f, o, g = sig(z[:, :H]), sig(z[:, H:2*H]), sig(z[:, 2*H:3*H]), np.tanh(z[:, 3*H:])
        c2 = f * c + i * g; tc = np.tanh(c2); h2 = o * tc
        if keep: cache.append((xs[:, t], h, c, i, f, o, g, tc))
        h, c = h2, c2; logits.append(h @ P['Wy'] + P['by'])
    return np.stack(logits, 1), h, c, cache
def lossgrad(xs, ys, h0, c0):
    lg, h, c, cache = forward(xs, h0, c0, P)
    m = lg.max(-1, keepdims=True); e = np.exp(lg - m); p = e / e.sum(-1, keepdims=True)
    B, T = ys.shape; loss = -np.log(p[np.arange(B)[:, None], np.arange(T)[None], ys] + 1e-12).mean()
    dl = p; dl[np.arange(B)[:, None], np.arange(T)[None], ys] -= 1; dl /= (B * T)
    G = {n: np.zeros_like(v) for n, v in P.items()}; dh = np.zeros((B, H), np.float32); dc = np.zeros((B, H), np.float32)
    for t in reversed(range(T)):
        xt, hp, cp, i, f, o, g, tc = cache[t]
        hcur = o * tc; G['Wy'] += hcur.T @ dl[:, t]; G['by'] += dl[:, t].sum(0)
        dh = dh + dl[:, t] @ P['Wy'].T
        do = dh * tc; dc = dc + dh * o * (1 - tc ** 2)
        di = dc * g; dg = dc * i; df = dc * cp
        dz = np.concatenate([di * i * (1 - i), df * f * (1 - f), do * o * (1 - o), dg * (1 - g ** 2)], 1)
        np.add.at(G['Wx'], xt, dz); G['Wh'] += hp.T @ dz; G['b'] += dz.sum(0)
        dh = dz @ P['Wh'].T; dc = dc * f
    return loss, G, h, c
def evaluate(seq, warm):
    h = np.zeros((1, H), np.float32); c = np.zeros((1, H), np.float32); hit = 0; bits = 0.0; n = 0
    for t in range(len(seq) - 1):
        z = P['Wx'][seq[t]][None] + h @ P['Wh'] + P['b']
        i, f, o, g = sig(z[:, :H]), sig(z[:, H:2*H]), sig(z[:, 2*H:3*H]), np.tanh(z[:, 3*H:])
        c = f * c + i * g; h = o * np.tanh(c)
        if t + 1 >= warm:
            lg = (h @ P['Wy'] + P['by'])[0]; p = np.exp(lg - lg.max()); p /= p.sum(); y = seq[t + 1]
            hit += int(p.argmax() == y); bits -= math.log2(p[y]); n += 1
    return hit / n, bits / n, n
def sample(prompt, n, T, seed):
    r = np.random.default_rng(seed); h = np.zeros((1, H), np.float32); c = np.zeros((1, H), np.float32); s = prompt
    seq = [IX[ch] for ch in prompt]; out = ''
    for t in range(len(seq) + n - 1):
        cur = seq[t] if t < len(seq) else IX[out[-1]]
        z = P['Wx'][cur][None] + h @ P['Wh'] + P['b']
        i, f, o, g = sig(z[:, :H]), sig(z[:, H:2*H]), sig(z[:, 2*H:3*H]), np.tanh(z[:, 3*H:])
        c = f * c + i * g; h = o * np.tanh(c)
        if t >= len(seq) - 1:
            lg = (h @ P['Wy'] + P['by'])[0] / T; p = np.exp(lg - lg.max()); p /= p.sum(); out += A[r.choice(K, p=p)]
    return out
t0 = time.time(); best = (9e9, None); step = 0; lr = 2e-3; log = []
nb = (len(x) - 1) // S
while time.time() - t0 < MIN * 60:
    starts = rng.integers(0, len(x) - S - 1, Bt)
    xs = np.stack([x[s:s + S] for s in starts]); ys = np.stack([x[s + 1:s + S + 1] for s in starts])
    loss, G, _, _ = lossgrad(xs, ys, np.zeros((Bt, H), np.float32), np.zeros((Bt, H), np.float32))
    gn = math.sqrt(sum((g ** 2).sum() for g in G.values()))
    if gn > 5: G = {n: g * 5 / gn for n, g in G.items()}
    t_adam += 1
    for n in P:
        M[n] = 0.9 * M[n] + 0.1 * G[n]; V[n] = 0.999 * V[n] + 0.001 * G[n] ** 2
        P[n] -= lr * (M[n] / (1 - 0.9 ** t_adam)) / (np.sqrt(V[n] / (1 - 0.999 ** t_adam)) + 1e-8)
    step += 1
    if step % 300 == 0:
        va, vb, _ = evaluate(np.concatenate([x[-200:], val[:3000]]), 200)
        log.append((step, round(time.time() - t0), round(float(loss) / math.log(2), 3), round(vb, 3), round(va, 3))); print(log[-1], flush=True)
        if vb < best[0]: best = (vb, {n: v.copy() for n, v in P.items()})
if best[1]: P = best[1]
ctx = np.array([IX[c] for c in d['train'][-2000:] + d['held']]); acc, bits, n = evaluate(ctx, 2000)
nparam = sum(v.size for v in P.values())
res = {'k': k, 'model': f'LSTM H{H} numpy', 'train': 'full3.29M' if FULL else 'life98k', 'params': int(nparam), 'minutes': MIN, 'steps': step, 'acc': round(acc, 4), 'bits': round(bits, 4), 'n': n, 'bestValBits': round(best[0], 4), 'log': log,
       'samples': {'story_open': {'T0.5': sample('once upon a time there was a ', 300, 0.5, 1), 'T1': sample('once upon a time there was a ', 300, 1.0, 2)},
                   'qa_oz': {'T0.5': sample('kwestion. who went to the land of os. answer. ', 300, 0.5, 3)}}}
json.dump(res, open(f"standing/lstm_{'full' if FULL else 'life'}_H{H}_k{k}.json", 'w'), indent=1); print(json.dumps({q: res[q] for q in ['acc', 'bits', 'params', 'steps']}))
