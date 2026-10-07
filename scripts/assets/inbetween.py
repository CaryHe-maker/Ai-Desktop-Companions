"""Offline in-betweening for the hand-painted cels.

Dense optical flow (DIS) is estimated in both directions between two key cels,
both are warped toward the intermediate time and blended.  Where the two warps
disagree (occlusion, a limb that has no counterpart) the blend sharpens into a
quick local switch rather than a double-exposed ghost.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '.cache', 'pydeps'))
import numpy as np, cv2

def load(path):
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if im is None: raise SystemExit('missing ' + path)
    if im.shape[2] == 3: im = cv2.cvtColor(im, cv2.COLOR_BGR2BGRA)
    im = im.astype(np.float32) / 255
    im[..., :3] *= im[..., 3:4]            # premultiplied
    return im

def save(path, im):
    out = im.copy(); a = np.clip(out[..., 3:4], 0, 1)
    out[..., :3] = np.where(a > 1e-4, out[..., :3] / np.maximum(a, 1e-4), 0)
    out[..., 3:4] = np.where(a < 6 / 255, 0, a)
    out = (np.clip(out, 0, 1) * 255 + .5).astype(np.uint8)
    if path.endswith('.webp'): cv2.imwrite(path, out, [cv2.IMWRITE_WEBP_QUALITY, 92])
    else: cv2.imwrite(path, out, [cv2.IMWRITE_PNG_COMPRESSION, 9])

def guide(im):
    lum = im[..., :3] @ np.array([.114, .587, .299], np.float32)
    g = im[..., 3] * .38 + lum * .62      # silhouette stays visible for white hair
    return (np.clip(g, 0, 1) * 255).astype(np.uint8)

_dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
_dis.setFinestScale(1); _dis.setPatchSize(12); _dis.setPatchStride(3)
_dis.setGradientDescentIterations(25); _dis.setVariationalRefinementIterations(8)
_dis.setVariationalRefinementAlpha(40); _dis.setUseSpatialPropagation(True)

def flow(a, b):
    ga, gb = guide(a), guide(b)
    # A quarter-size pass with a wide window finds strides DIS alone would miss.
    sa, sb = (cv2.resize(g, None, fx=.25, fy=.25, interpolation=cv2.INTER_AREA) for g in (ga, gb))
    coarse = cv2.calcOpticalFlowFarneback(sa, sb, None, .5, 4, 31, 8, 7, 1.5, 0)
    init = cv2.resize(cv2.GaussianBlur(coarse, (0, 0), 3), (ga.shape[1], ga.shape[0]), interpolation=cv2.INTER_LINEAR) * 4
    best, score = None, None
    for start in (None, init):
        f = cv2.GaussianBlur(_dis.calc(ga, gb, None if start is None else start.copy()), (0, 0), 2.2)
        xs, ys = grid(*ga.shape)
        back = cv2.remap(gb, xs + f[..., 0], ys + f[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        e = float(np.abs(back.astype(np.float32) - ga).mean())
        if score is None or e < score: best, score = f, e
    return best

def grid(h, w):
    xs, ys = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    return xs, ys

def warp(src, f, t, xs, ys):
    # Backward-project the forward flow to time t with a short fixed-point solve.
    g = f.copy()
    for _ in range(3):
        g = cv2.remap(f, xs - t * g[..., 0], ys - t * g[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return cv2.remap(src, xs - t * g[..., 0], ys - t * g[..., 1], cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)

class Pair:
    def __init__(self, a, b):
        self.a, self.b = a, b
        self.fab, self.fba = flow(a, b), flow(b, a)
        self.xs, self.ys = grid(*a.shape[:2])
    def trouble(self):
        """Share of the changed area where the two half-way warps disagree: high means the
        poses are too different to morph cleanly and a plain dissolve will look better."""
        wa = warp(self.a, self.fab, .5, self.xs, self.ys); wb = warp(self.b, self.fba, .5, self.xs, self.ys)
        changed = np.abs(self.a - self.b).max(axis=2) > .12
        return float((np.abs(wa - wb).max(axis=2) > .25).sum()) / max(1, int(changed.sum()))
    def at(self, t):
        if t <= 0: return self.a
        if t >= 1: return self.b
        wa = warp(self.a, self.fab, t, self.xs, self.ys)
        wb = warp(self.b, self.fba, 1 - t, self.xs, self.ys)
        err = np.abs(wa - wb).max(axis=2)
        bad = np.clip(cv2.GaussianBlur(err, (0, 0), 5) * 4.5 - .12, 0, 1)
        s = np.clip((t - .52) / .08, 0, 1)   # never an even double exposure on a sampled cel; s = s * s * (3 - 2 * s)
        w = (t * (1 - bad) + s * bad)[..., None]
        return np.clip(wa * (1 - w) + wb * w, 0, 1)

if __name__ == '__main__':
    a, b, out, n = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
    p = Pair(load(a), load(b))
    strip = np.concatenate([p.at(i / (n + 1)) for i in range(n + 2)], axis=1)
    bg = np.full_like(strip, .52); bg[..., 3] = 1
    save(out, cv2.resize(strip + bg * (1 - strip[..., 3:4]), None, fx=.6, fy=.6, interpolation=cv2.INTER_AREA))
