"""Register the 16 entrance cels of each pet to their doorway.

The painted sheet draws the door at a slightly different size and place in every
cel (and noticeably larger from the 11th on), and the old extraction stretched
each cell to a square.  Here every cel gets one uniform scale + shift that pins
the door frame to where it is in the first cel, so only the character moves.
Output: assets/v2/<pet>/registered/entrance-NN.png and assets/v2/registered.json
"""
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.cache', 'pydeps'))
import numpy as np, cv2
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OLD = {'gpt': (125, 505, 370), 'claude': (148, 395, 310), 'deepseek': (175, 480, 400)}   # feet x, y, height in the old stretched 512 cels
SIZE, MARGIN = 512, 10

def divisions(ink):
    n = len(ink); out = [0]
    for i in (1, 2, 3):
        e = round(i * n / 4); span = range(e - 65, e + 66)
        out.append(min(span, key=lambda p: (ink[p], abs(p - e))))
    return out + [n]

def cells(path):
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED); im[im[..., 3] <= 16] = 0
    solid = im[..., 3] > 80
    xs, ys = divisions(solid.sum(axis=0)), divisions(solid.sum(axis=1))
    return [im[ys[i // 4]:ys[i // 4 + 1], xs[i % 4]:xs[i % 4 + 1]] for i in range(16)]

def features(cell, sift):
    a = cell[..., 3:4].astype(np.float32) / 255
    gray = cv2.cvtColor((cell[..., :3] * a + 128 * (1 - a)).astype(np.uint8), cv2.COLOR_BGR2GRAY)
    return sift.detectAndCompute(gray, (cell[..., 3] > 80).astype(np.uint8) * 255)

def similarity(src, dst):
    """Least-squares uniform scale + translation (no rotation) taking src to dst."""
    cs, cd = src.mean(0), dst.mean(0); a, b = src - cs, dst - cd
    s = float((a * b).sum() / (a * a).sum())
    return s, cd - s * cs

def match(fa, fb, matcher):
    (ka, da), (kb, db) = fa, fb
    good = [m for m, n in matcher.knnMatch(da, db, k=2) if m.distance < .72 * n.distance]
    if len(good) < 8: return None
    src = np.float32([ka[m.queryIdx].pt for m in good]); dst = np.float32([kb[m.trainIdx].pt for m in good])
    _, inliers = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=2.5)
    if inliers is None or inliers.sum() < 8: return None
    keep = inliers.ravel() > 0; s, t = similarity(src[keep], dst[keep])
    return int(keep.sum()), s, t

def register(pet):
    sift, matcher = cv2.SIFT_create(nfeatures=4000, contrastThreshold=.02), cv2.BFMatcher()
    cel = cells(os.path.join(ROOT, 'assets', 'source', 'v2', pet + '-entrance.png'))
    feats = [features(c, sift) for c in cel]
    T = {0: (1.0, np.zeros(2))}
    for i in range(1, 16):
        # Prefer the bare door of cel 0; when the open door hides too much of it, go through
        # the registered cel that shares the most door detail.
        best = None
        for j in sorted(T):
            m = match(feats[i], feats[j], matcher)
            if not m: continue
            n, s, t = m; sj, tj = T[j]
            # Agreement with a neighbour is mostly the character, so only cel 0 and far cels count fully.
            weight = n * (1.0 if j == 0 else .25 if i - j <= 2 else .6)
            if best is None or weight > best[0]: best = (weight, n, j, s * sj, sj * t + tj)
        if best is None: raise SystemExit('%s cel %d: door not found' % (pet, i))
        T[i] = (best[3], best[4]); print(pet, i, 'via', best[2], 'inliers', best[1], 'scale %.3f' % best[3], 'shift', np.round(best[4], 1), flush=True)
    # Common canvas: everything any cel shows, uniformly scaled into a square.
    lo, hi = np.full(2, 1e9), np.full(2, -1e9)
    for i, c in enumerate(cel):
        ys, xs = np.nonzero(c[..., 3] > 35); s, t = T[i]
        lo = np.minimum(lo, s * np.array([xs.min(), ys.min()]) + t); hi = np.maximum(hi, s * np.array([xs.max() + 1, ys.max() + 1]) + t)
    k = (SIZE - 2 * MARGIN) / max(hi - lo); origin = (SIZE - (hi - lo) * k) / 2 - lo * k
    out = os.path.join(ROOT, 'assets', 'v2', pet, 'registered'); os.makedirs(out, exist_ok=True)
    for i, c in enumerate(cel):
        s, t = T[i]; M = np.float32([[s * k, 0, t[0] * k + origin[0]], [0, s * k, t[1] * k + origin[1]]])
        pre = c.astype(np.float32); pre[..., :3] *= pre[..., 3:4] / 255
        w = cv2.warpAffine(pre, M, (SIZE, SIZE), flags=cv2.INTER_AREA if s * k < 1 else cv2.INTER_CUBIC, borderValue=0)
        a = np.clip(w[..., 3:4], 0, 255); w[..., :3] = np.where(a > .5, w[..., :3] * 255 / np.maximum(a, .5), 0)
        cv2.imwrite(os.path.join(out, 'entrance-%02d.png' % i), np.clip(w + .5, 0, 255).astype(np.uint8))
    # Carry the hand-tuned feet anchor of the last cel into the new canvas.
    x, y, h = OLD[pet]; ch, cw = cel[15].shape[:2]; s, t = T[15]
    return {'x': round(float((x * cw / 512 * s + t[0]) * k + origin[0]), 1), 'y': round(float((y * ch / 512 * s + t[1]) * k + origin[1]), 1), 'height': round(float(h * ch / 512 * s * k), 1)}

if __name__ == '__main__':
    path = os.path.join(ROOT, 'assets', 'v2', 'registered.json')
    anchors = json.load(open(path)) if os.path.exists(path) else {}
    for pet in sys.argv[1:] or list(OLD): anchors[pet] = register(pet)
    json.dump(anchors, open(path, 'w'), indent=1); print(anchors)
