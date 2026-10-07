"""Build assets/v3: every key cel plus flow-morphed in-betweens.

Usage: python scripts/assets/build-inbetweens.py [gpt claude deepseek] [--only=e]   (run register-entrance.py first)
Keys: bN = base pose, mN = motion cel, eN = entrance cel (all from assets/v2).
"""
import sys, os, json, glob
from inbetween import load, save, Pair
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
GESTURE, WALK, ENTRANCE = 7, 5, 7      # in-betweens per pair
CLEAN = .24                            # above this a morph smears; the pair dissolves instead (0 in-betweens)
def chain(*keys, loop=False):
    out = list(zip(keys, keys[1:]))
    return out + [(keys[-1], keys[0])] if loop else out
PAIRS = {}
for a, b in (chain('b0', 'b1') + chain('b0', 'b3') + chain('b0', 'b6') + chain('b6', 'b1') + chain('b0', 'b7')
             + chain('b0', 'm12', 'm13', 'm14') + chain('m13', 'm15', 'm12')
             + chain('b0', 'm8', 'm9', 'm10', 'm11', 'm8') + chain('b0', 'm0')):
    PAIRS[a + '-' + b] = GESTURE
for a, b in chain(*['m%d' % i for i in range(8)], loop=True): PAIRS[a + '-' + b] = WALK
for a, b in chain(*['e%d' % i for i in range(16)]): PAIRS[a + '-' + b] = ENTRANCE
SETS = {'b': 'base', 'm': 'motion', 'e': 'entrance'}
def source(cid, key):
    # Entrance cels come from register-entrance.py, which pins the doorway in place.
    return os.path.join(ROOT, 'assets', 'v2', cid, 'registered' if key[0] == 'e' else '', '%s-%02d.png' % (SETS[key[0]], int(key[1:])))
def build(cid, only=''):
    out = os.path.join(ROOT, 'assets', 'v3', cid); os.makedirs(out, exist_ok=True)
    cache, result = {}, {}
    def key(k):
        if k not in cache:
            cache[k] = load(source(cid, k)); save(os.path.join(out, k + '.webp'), cache[k])
        return cache[k]
    for name, n in PAIRS.items():
        if not name.startswith(only): continue
        a, b = name.split('-'); pair = Pair(key(a), key(b)); trouble = pair.trouble()
        for stale in glob.glob(os.path.join(out, name + '_*.webp')): os.remove(stale)
        if trouble > CLEAN: n = 0
        for i in range(1, n + 1): save(os.path.join(out, '%s_%d.webp' % (name, i)), pair.at(i / (n + 1)))
        result[name] = n; print(cid, name, '%.2f' % trouble, 'morph' if n else 'dissolve', flush=True)
    path = os.path.join(out, 'pairs.json'); known = json.load(open(path)) if os.path.exists(path) else {}
    known.update(result); json.dump(known, open(path, 'w'))
if __name__ == '__main__':
    only = next((a[7:] for a in sys.argv[1:] if a.startswith('--only=')), '')
    ids = [a for a in sys.argv[1:] if not a.startswith('--')] or ['gpt', 'claude', 'deepseek']
    for cid in ids: build(cid, only)
    anchors = json.load(open(os.path.join(ROOT, 'assets', 'v2', 'registered.json'), encoding='utf8'))
    v2 = json.load(open(os.path.join(ROOT, 'assets', 'v2', 'manifest.json'), encoding='utf8'))
    manifest = {'version': 3, 'cellSize': 512, 'baseline': v2['baseline'], 'visibleHeight': v2['visibleHeight'],
                'characters': {c: {'entranceAnchor': anchors[c], 'pairs': json.load(open(os.path.join(ROOT, 'assets', 'v3', c, 'pairs.json')))} for c in ['gpt', 'claude', 'deepseek']}}
    json.dump(manifest, open(os.path.join(ROOT, 'assets', 'v3', 'manifest.json'), 'w', encoding='utf8'), indent=1)
    open(os.path.join(ROOT, 'src', 'animation-assets.js'), 'w', encoding='utf8').write('window.ANIMATION_ASSETS = ' + json.dumps(manifest, separators=(',', ':')) + ';\n')
