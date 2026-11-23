# Renders the 2000 held-out letters with which ones the SNN (R140 winner, book100k 4x, from sw/out/bd_b100r140S2_4x_<k>.json hits)
# and the KN 5-gram (same 98k training letters) guessed right, plus word-level statistics. -> standing/render_k<k>.json / .txt
import json, sys
sys.path.insert(0, 'standing'); from ngram import KN, A, K
def words_stats(text, hits):
    # word = maximal run of non-space letters; count letters 2..end plus the space after it (the parts predictable from earlier letters)
    res = {'words': 0, 'all_right': 0, 'first_letter_right': 0, 'rest_right_frac': 0.0, 'space_after_right': 0}; i = 0; fr = []
    while i < len(text):
        if text[i] == ' ': i += 1; continue
        j = i
        while j < len(text) and text[j] != ' ': j += 1
        if j >= len(text): break
        seg = list(range(i, j + 1)); res['words'] += 1
        res['first_letter_right'] += hits[i]; rest = seg[1:]
        res['all_right'] += int(all(hits[q] for q in rest)); fr.append(sum(hits[q] for q in rest) / len(rest)); res['space_after_right'] += hits[j]
        i = j + 1
    res['rest_right_frac'] = round(sum(fr) / len(fr), 4)
    for q in ['all_right', 'first_letter_right', 'space_after_right']: res[q + '_frac'] = round(res[q] / res['words'], 4)
    return res
def marks(text, hits, guesses=None):
    return ''.join((c.upper() if c != ' ' else '·') if h else '_' for c, h in zip(text, hits))
out = {}
for k in [2951, 2953, 2954]:
    d = json.load(open(f'standing/data_k{k}.json')); held = d['held']
    snn = [int(c) for c in json.load(open(f'sw/out/bd_b100r140S2_4x_{k}.json'))['hits']]
    m = KN(d['train'], 5); ctx = d['train'] + held; kn = []
    for i in range(len(held)):
        p = m.dist(ctx[len(d['train']) + i - 10:len(d['train']) + i]); kn.append(int(A[max(range(K), key=lambda j: p[j])] == held[i]))
    both = sum(a and b for a, b in zip(snn, kn)); only_snn = sum(a and not b for a, b in zip(snn, kn)); only_kn = sum(b and not a for a, b in zip(snn, kn))
    out[k] = {'snn_acc': sum(snn) / 2000, 'kn5_acc': sum(kn) / 2000, 'both_right': both, 'only_snn': only_snn, 'only_kn5': only_kn,
              'snn_words': words_stats(held, snn), 'kn5_words': words_stats(held, kn),
              'excerpt_text': held[:400], 'excerpt_snn': marks(held[:400], snn), 'excerpt_kn5': marks(held[:400], kn)}
    print(k, json.dumps({q: out[k][q] for q in ['snn_acc', 'kn5_acc', 'both_right', 'only_snn', 'only_kn5']}), out[k]['snn_words'])
json.dump(out, open('standing/render.json', 'w'), indent=1)
