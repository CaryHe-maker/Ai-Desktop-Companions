(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PetMotion = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const backOut = t => { t = clamp(t, 0, 1) - 1; return 1 + t * t * (2.7 * t + 1.7); };
  // Keys: bN base pose, mN motion cel, eN entrance cel. A step is
  // [key, moveMs, holdMs, linear]: travel from the previous key through the
  // painted in-betweens, then rest on the key.
  const WAVE = [['m12', 240, 0], ['m13', 280, 70], ['m14', 260, 130], ['m13', 260, 50], ['m14', 260, 130], ['m13', 260, 70], ['m15', 300, 150], ['m12', 300, 0]];
  const HOME = [['b0', 320, 0]];
  // Sixteen newly drawn cels per gesture, with time to ease into and out of it.
  const gesture = start => [...Array.from({length:16}, (_,i) => ['n'+(start+i), i ? 90 : 320, 0, 1]), ...HOME];
  const TRACKS = {
    look: gesture(0), bow: gesture(16), greet: gesture(32), stretch: gesture(48),
    entrance: [['e0', 0, 330], ['e1', 250, 110], ['e2', 270, 240], ['e3', 270, 130], ['e4', 300, 150],
      ['e5', 270, 0, 1], ['e6', 250, 0, 1], ['e7', 250, 0, 1], ['e8', 250, 0, 1], ['e9', 250, 0, 1], ['e10', 250, 0, 1],
      ['e11', 250, 0, 1], ['e12', 260, 50], ['e13', 260, 250], ['e14', 220, 210], ['e15', 240, 260]],
    wave: [...WAVE, ...HOME],
    wake: [['b1', 420, 260], ['b0', 340, 220], ...WAVE, ...HOME],
    signature: [['m8', 340, 320], ['m9', 540, 420], ['m10', 540, 850], ['m9', 480, 320], ['m10', 480, 750], ['m11', 540, 650], ['m8', 480, 260], ...HOME],
    happy: [['b7', 320, 1360], ['b0', 340, 0]],
    goodbye: [...WAVE, ['m13', 260, 700]],
    think: [['b3', 380, 0]], sleep: [['b6', 560, 0]], drag: [['b7', 180, 0]], land: [['b0', 240, 420]], idle: HOME
  };
  const length = steps => steps.reduce((sum, s) => sum + s[1] + s[2], 0);
  const INTRO = 360, OUTRO = 760, STEP = 135, WALK_IN = 280, WALK_OUT = 320, CYCLES = 4;
  const entranceDuration = INTRO + length(TRACKS.entrance);
  const duration = { entrance: entranceDuration + OUTRO, wave: length(TRACKS.wave), wake: length(TRACKS.wake),
    signature: length(TRACKS.signature), happy: length(TRACKS.happy), land: length(TRACKS.land),
    goodbye: length(TRACKS.goodbye), walk: WALK_IN + CYCLES * 8 * STEP + WALK_OUT };
  for (const name of ['look','bow','greet','stretch']) duration[name] = length(TRACKS[name]);
  function follow(steps, from, t) {
    let previous = from;
    for (let i = 0; i < steps.length; i++) {
      const [key, move, hold, linear] = steps[i], travel = previous && previous !== key ? move : 0;
      if (t < travel) return { a: previous, b: key, t: linear ? t / travel : ease(t / travel), step: i, held: -1 };
      t -= travel;
      if (t < hold) return { a: key, b: key, t: 0, step: i, held: t };
      t -= hold; previous = key;
    }
    return { a: previous, b: previous, t: 0, step: steps.length, held: t, done: true };
  }
  // One hop: crouch, stretch on take-off, settle on landing.
  function hop(u, height) {
    if (u < .16) { const k = Math.sin(u / .16 * Math.PI); return { y: 0, sy: 1 - .07 * k }; }
    if (u < .84) { const k = (u - .16) / .68; return { y: -height * 4 * k * (1 - k), sy: 1 + .05 * Math.abs(1 - 2 * k) }; }
    const k = Math.sin((u - .84) / .16 * Math.PI); return { y: 0, sy: 1 - .08 * k };
  }
  function sample(name, elapsed, options = {}) {
    const t = Math.max(0, elapsed), reduced = !!options.reduced, from = options.from || 'b0';
    const p = { a: 'b0', b: 'b0', t: 0, x: 0, y: 0, rotation: 0, pivot: 0, facing: 1, opacity: 1, sx: 1, sy: 1,
      breathe: 1, speed: 0, stage: null, stageOpacity: 0, stageScale: 1, done: false };
    const use = f => { p.a = f.a; p.b = f.b; p.t = f.t; return f; };
    if (name === 'entrance') {
      const f = follow(TRACKS.entrance, null, t - INTRO), out = t - entranceDuration;
      p.stage = t < INTRO ? { a: 'e0', b: 'e0', t: 0 } : { a: f.a, b: f.b, t: f.t };
      // The house fades in and out at one fixed size: the doorway never scales or shifts.
      p.stageOpacity = t < INTRO ? ease(t / INTRO) : 1 - ease((out - 180) / 580);
      p.opacity = ease(out / 230); p.done = t >= duration.entrance;
    } else if (name === 'walk') {
      const loop = CYCLES * 8 * STEP, total = options.walkDuration || duration.walk, end = total - WALK_OUT;
      if (t < WALK_IN) { p.a = from; p.b = 'm0'; p.t = ease(t / WALK_IN); }
      else if (t < end) { const u = ((t - WALK_IN) % loop) / STEP, i = Math.floor(u) % 8; p.a = 'm' + i; p.b = 'm' + (i + 1) % 8; p.t = u - Math.floor(u); }
      else { p.a = 'm0'; p.b = 'b0'; p.t = ease((t - end) / WALK_OUT); }
      p.facing = options.direction > 0 ? -1 : 1;
      p.speed = Math.min(ease((t - WALK_IN * .5) / 360), 1 - ease((t - end) / (WALK_OUT * .6)));
      p.breathe = .3; p.done = t >= total;
    } else if (name === 'happy') {
      const f = use(follow(TRACKS.happy, from, t));
      if (f.step === 0 && f.held >= 0 && !reduced) {
        const h = hop((f.held / 680) % 1, 8); p.y = h.y; p.sy = h.sy; p.sx = 1 + (1 - h.sy) * .7;
      }
      p.breathe = .3; p.done = !!f.done;
    } else if (name === 'land') {
      const f = use(follow(TRACKS.land, from, t)), k = reduced ? 0 : Math.exp(-t / 150) * Math.cos(t / 70);
      p.sy = 1 - .085 * k; p.sx = 1 + .06 * k; p.breathe = .4; p.done = !!f.done;
    } else if (name === 'drag') {
      use(follow(TRACKS.drag, from, t));
      p.rotation = reduced ? 0 : Math.sin(t / 330) * .05; p.pivot = .86; p.breathe = 0;
    } else if (name === 'think') {
      use(follow(TRACKS.think, from, t)); p.rotation = reduced ? 0 : Math.sin(t / 1300) * .012;
    } else if (name === 'sleep') {
      use(follow(TRACKS.sleep, from, t)); p.breathe = 1.7;
    } else if (name === 'goodbye') {
      use(follow(TRACKS.goodbye, from, t));
      const out = ease((t - duration.goodbye + 900) / 900); p.opacity = 1 - out; p.y = reduced ? 0 : -6 * out;
      p.done = t >= duration.goodbye;
    } else if (TRACKS[name] && name !== 'idle') {
      p.done = !!use(follow(TRACKS[name], from, t)).done;
    } else {
      const f = follow(HOME, from, t);
      if (!f.done) use(f);
      else {
        // Blink on a slightly irregular rhythm; every third blink is a double.
        const period = options.blinkPeriod || 4700, cycle = Math.floor(f.held / period), at = f.held - cycle * period;
        const start = period - 800 - (cycle * 37 % 5) * 130, blink = k => { const u = at - start - k * 380;
          return u < 0 || u > 330 ? 0 : u < 110 ? ease(u / 110) : u < 170 ? 1 : 1 - ease((u - 170) / 160); };
        const closed = Math.max(blink(0), cycle % 3 === 2 ? blink(1) : 0);
        p.b = 'b1'; p.t = closed;
      }
    }
    return p;
  }
  const nearest = p => p.t < .5 ? p.a : p.b;
  class Controller {
    constructor(now = 0) { this.name = 'idle'; this.started = now; this.options = {}; }
    play(name, now, options = {}) {
      const from = this.name === 'entrance' ? 'b0' : nearest(this.current(now));
      this.name = name; this.started = now; this.options = { ...options, from };
    }
    current(now, options = {}) { return sample(this.name, now - this.started, { ...this.options, ...options }); }
  }
  // Turns "t of the way from key a to key b" into the two nearest drawn cels.
  // Pairs without painted in-betweens degrade to a staggered cross-dissolve.
  function resolve(pairs, a, b, t) {
    if (a === b || t <= 0) return { lo: a, hi: null, f: 0 };
    if (t >= 1) return { lo: b, hi: null, f: 0 };
    let name = a + '-' + b, u = t, n = pairs[name];
    if (n === undefined) { name = b + '-' + a; u = 1 - t; n = pairs[name]; }
    if (Array.isArray(n)) {
      const keys = [name.split('-')[0], ...n, name.split('-')[1]];
      const pos = u * (keys.length-1), i = Math.min(keys.length-2, Math.floor(pos));
      return {lo:keys[i], hi:keys[i+1], f:pos-i};
    }
    // No in-betweens (never painted, or the two poses are too different to morph): dissolve.
    if (!n) return { lo: a, hi: b, f: t, cross: true };
    const keys = name.split('-'), pos = u * (n + 1), i = Math.min(n, Math.floor(pos));
    const cel = k => k === 0 ? keys[0] : k === n + 1 ? keys[1] : name + '_' + k;
    return { lo: cel(i), hi: cel(i + 1), f: pos - i };
  }
  function frames(pairs, stage) {
    const out = new Set();
    for (const [name, n] of Object.entries(pairs)) {
      if ((name[0] === 'e') !== stage) continue;
      name.split('-').forEach(k => out.add(k));
      if (Array.isArray(n)) { n.forEach(k => out.add(k)); continue; }
      for (let i = 1; i <= n; i++) out.add(name + '_' + i);
    }
    return [...out];
  }
  // Window size never depends on where the window is, its previous pixel size or animation state.
  function geometry(scale = .5) {
    scale = Number.isFinite(scale) ? clamp(scale, .3, .85) : .5;
    const factor = scale / .5;
    const width = Math.max(320, Math.ceil(300 * factor));
    return { width, height: Math.max(260, Math.ceil(260 * factor)),
      factor, actorHeight: 112 * factor, stageSize: 205 * factor,
      anchorX: width * .45, anchorY: 218 * factor, scale };
  }
  return { Controller, sample, resolve, frames, follow, geometry, TRACKS, entranceDuration, duration, ease, clamp };
});
