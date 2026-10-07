'use strict';
const id = new URLSearchParams(location.search).get('pet') || 'gpt';
const char = CHARACTERS[id], api = window.deskbot;
const scene = document.querySelector('#scene'), canvas = document.querySelector('#animation');
const ctx = canvas.getContext('2d'), pet = document.querySelector('#pet');
const bubble = document.querySelector('#bubble'), toolbar = document.querySelector('#toolbar');
const manifest = ANIMATION_ASSETS.characters[id], pairs = manifest.pairs;
const engine = new PetMotion.Controller(performance.now());
const signatureNames = { gpt: '理理头发，轻轻行礼', claude: '翻开书，读一小会儿', deepseek: '抱抱小鲸鱼' };
document.body.dataset.pet = id;
document.querySelector('#nameplate').textContent = char.name;
document.querySelector('#signature-button').title = signatureNames[id];
scene.style.setProperty('--accent', char.accent);
let prefs = { scale: .5, wander: true, reducedMotion: false };
let geo = PetMotion.geometry(.5), loaded = false, thinking = false, sleeping = false;
let hover = false, dragging = false, pressed = null, lastHit = false;
const AMBIENT_INTERVAL = 12000;
const ambientDelay = () => AMBIENT_INTERVAL * (1 + Math.random() * 2);
let lastInteraction = performance.now(), nextAmbient = lastInteraction + ambientDelay(), lastAmbientAction = null;
function scheduleAmbient(now = performance.now()) { nextAmbient = now + ambientDelay(); }
let lastTick = performance.now(), moveRemainder = 0, bubbleDeadline = 0, hoverDeadline = 0;
let walkingDirection = -1, queuedHappy = false, currentPose = null, currentCel = 'b0';
let particles = [], modelBounds = null, stageBounds = null, debugSeek = null;
let cels = {}, stage = {}, alpha = {}, celPixels = 0, stageLoading = null, stageToken = 0, outroSparkled = false, arrived = false;
let markReady; const firstCels = new Promise(resolve => { markReady = resolve; });
const ratio = () => Math.max(1, Math.min(3, devicePixelRatio || 1));
function layout() {
  // Stable DIP coordinates: no scaling from live window metrics, even on mixed-DPI monitors.
  geo = PetMotion.geometry(prefs.scale);
  scene.style.width = geo.width + 'px'; scene.style.height = geo.height + 'px';
  canvas.style.width = geo.width + 'px'; canvas.style.height = geo.height + 'px';
  const dpr = ratio();
  canvas.width = Math.round(geo.width * dpr); canvas.height = Math.round(geo.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingQuality = 'high';
  const size = geo.actorHeight * 512 / ANIMATION_ASSETS.visibleHeight;
  const top = geo.anchorY - size * ANIMATION_ASSETS.baseline / 512;
  modelBounds = { x: geo.anchorX - size / 2, y: top, width: size, height: size };
  const anchor = manifest.entranceAnchor, stageSize = geo.actorHeight / anchor.height * 512;
  stageBounds = { x: geo.anchorX - anchor.x / 512 * stageSize, y: geo.anchorY - anchor.y / 512 * stageSize, size: stageSize };
  Object.assign(pet.style, { left: modelBounds.x + 'px', top: top + 'px', width: size + 'px', height: size + 'px' });
  Object.assign(toolbar.style, { left: (geo.anchorX - 66) + 'px', top: Math.max(5, top - 28) + 'px' });
  Object.assign(bubble.style, { left: Math.max(8, geo.anchorX - 110) + 'px', top: Math.max(5, top - 70) + 'px' });
  Object.assign(document.querySelector('#nameplate').style, { left: (geo.anchorX - 55) + 'px', top: (geo.anchorY + 8) + 'px' });
  scene.classList.toggle('reduced', !!prefs.reducedMotion);
  if (loaded && Math.min(512, Math.ceil(size * dpr)) !== celPixels) loadCels().catch(console.error);
}
addEventListener('resize', layout);
layout();
async function loadCel(name, pixels) {
  const image = new Image(); image.src = manifest.files?.[name] || `../assets/${name.startsWith('n') ? 'v4' : 'v3'}/${id}/${name}.webp`; await image.decode();
  return pixels >= 512 ? createImageBitmap(image) : createImageBitmap(image, { resizeWidth: pixels, resizeHeight: pixels, resizeQuality: 'high' });
}
async function loadAll(names, pixels, each) {
  const queue = [...names];
  await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) { const name = queue.shift(); each(name, await loadCel(name, pixels)); } }));
}
function mask(name, bitmap) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bitmap, 0, 0, 64, 64);
  const data = g.getImageData(0, 0, 64, 64).data, out = new Uint8Array(4096);
  for (let i = 0; i < 4096; i++) out[i] = data[i * 4 + 3];
  alpha[name] = out;
}
// Cels are decoded at the size they are shown, so hundreds of in-betweens stay light.
async function loadCels() {
  const pixels = Math.min(512, Math.ceil(modelBounds.width * ratio())); celPixels = pixels;
  const next = loaded ? {} : cels, names = PetMotion.frames(pairs, false), first = ['b0', 'b1'];
  const add = (name, bitmap) => { if (pixels !== celPixels) { bitmap.close(); return; } next[name] = bitmap; mask(name, bitmap); };
  await loadAll(first, pixels, add); loaded = true; markReady();
  // The rest streams in behind the entrance; an unloaded in-between falls back to its key.
  await loadAll(names.filter(n => !first.includes(n)), pixels, add);
  if (next !== cels && pixels === celPixels) { const old = cels; cels = next; Object.values(old).forEach(b => b.close()); }
}
function loadStage() {
  if (stageLoading) return stageLoading;
  const pixels = Math.min(512, Math.ceil(stageBounds.size * ratio())), next = {};
  return stageLoading = loadAll(PetMotion.frames(pairs, true), pixels, (name, bitmap) => { next[name] = bitmap; }).then(() => { stage = next; });
}
function freeStage() {
  if (engine.name === 'entrance' || debugSeek) return;
  Object.values(stage).forEach(b => b.close()); stage = {}; stageLoading = null;
}
function say(text, ms = 3600) {
  bubble.textContent = text; bubble.classList.add('show'); bubbleDeadline = performance.now() + ms;
}
function play(name, options = {}) {
  if (!loaded) return;
  engine.play(name, performance.now(), options); debugSeek = null;
  scene.classList.toggle('entering', name === 'entrance'); scene.classList.toggle('dragging', name === 'drag');
  moveRemainder = 0;
}
function rest() {
  if (queuedHappy && !thinking) { queuedHappy = false; play('happy'); return; }
  play(thinking ? 'think' : sleeping ? 'sleep' : 'idle');
  // Leave a full quiet interval after an action, rather than counting its playback as rest.
  if (engine.name === 'idle') scheduleAmbient();
}
async function entrance() {
  sleeping = false; hover = false; scene.classList.remove('hover');
  if (dragging) stopDrag();
  await firstCels;
  if (prefs.reducedMotion) { arrived = true; play('wave'); return; }
  const token = ++stageToken;
  try { await loadStage(); } catch (error) { console.error(error); stageLoading = null; arrived = true; play('wave'); return; }
  if (token !== stageToken) return;
  outroSparkled = false; arrived = true; play('entrance');
  burst(stageBounds.x + stageBounds.size * .55, stageBounds.y + stageBounds.size * .45, 12, stageBounds.size * .3);
}
function act(name) {
  lastInteraction = performance.now(); scheduleAmbient(lastInteraction);
  if (name === 'entrance') { entrance(); return; }
  if (name === 'goodbye') { thinking = false; sleeping = false; play('goodbye'); burst(geo.anchorX, geo.anchorY - geo.actorHeight * .5, 10, geo.actorHeight * .4); return; }
  if (engine.name === 'entrance' || dragging) return;
  if (name === 'sleep') { sleeping = !sleeping; play(sleeping ? 'sleep' : 'wake'); return; }
  if (name === 'walk') {
    if (!prefs.wander || thinking || sleeping || prefs.reducedMotion) return;
    walkingDirection = Math.random() < .5 ? -1 : 1; play('walk', { direction: walkingDirection }); return;
  }
  if (['wave', 'happy', 'signature', 'wake', 'look', 'bow', 'greet', 'stretch'].includes(name)) { sleeping = false; play(name); }
}
const keyOf = name => name.includes('_') ? name.split('-')[0] : name;
function sprite(pose, now) {
  if (pose.opacity <= 0) return;
  const cel = PetMotion.resolve(pairs, pose.a, pose.b, pose.t);
  const lo = cels[cel.lo] || cels[keyOf(cel.lo)] || cels.b0, hi = cel.hi && (cels[cel.hi] || cels[keyOf(cel.hi)]);
  currentCel = cels[cel.lo] ? cel.lo : cels[keyOf(cel.lo)] ? keyOf(cel.lo) : 'b0';
  const size = modelBounds.width, baseline = size * ANIMATION_ASSETS.baseline / 512, f = geo.factor;
  // Breathing and a faint lean run on wall-clock time so they never restart between actions.
  const still = prefs.reducedMotion ? 0 : pose.breathe, breath = Math.sin(now / 1650) * .011 * still;
  ctx.save(); ctx.translate(geo.anchorX + pose.x * f, geo.anchorY + pose.y * f);
  const pivot = pose.pivot * geo.actorHeight;
  ctx.translate(0, -pivot); ctx.rotate(pose.rotation + Math.sin(now / 2900) * .004 * still); ctx.translate(0, pivot);
  ctx.scale(pose.facing * pose.sx * (1 - breath * .5), pose.sy * (1 + breath));
  const paint = (image, opacity) => { if (image && opacity > 0) { ctx.globalAlpha = pose.opacity * opacity; ctx.drawImage(image, -size / 2, -baseline, size, size); } };
  if (!hi || hi === lo) paint(lo, 1);
  else if (cel.cross) { paint(lo, Math.min(1, 2 - 2 * cel.f)); paint(hi, Math.min(1, 2 * cel.f)); }
  else { paint(lo, 1); paint(hi, cel.f); }
  ctx.restore();
}
function scenery(pose) {
  if (!pose.stage || pose.stageOpacity <= 0) return;
  const cel = PetMotion.resolve(pairs, pose.stage.a, pose.stage.b, pose.stage.t);
  const lo = stage[cel.lo], hi = cel.hi && stage[cel.hi]; if (!lo) return;
  const { x, y, size } = stageBounds;
  ctx.save();
  // In a dissolve the old cel stays solid until the new one covers it, so the doorway never thins out.
  const under = cel.cross ? Math.min(1, 2 - 2 * cel.f) : 1, over = cel.cross ? Math.min(1, 2 * cel.f) : cel.f;
  ctx.globalAlpha = pose.stageOpacity * under; ctx.drawImage(lo, x, y, size, size);
  if (hi && over > 0) { ctx.globalAlpha = pose.stageOpacity * over; ctx.drawImage(hi, x, y, size, size); }
  ctx.restore();
}
function drawShadow(pose) {
  if (pose.opacity < .01) return;
  const lift = Math.max(.55, 1 + pose.y / 30), radius = 20 * geo.factor * lift;
  ctx.save(); ctx.translate(geo.anchorX, geo.anchorY + 1); ctx.scale(1, .17);
  const gradient = ctx.createRadialGradient(0, 0, 1, 0, 0, radius);
  gradient.addColorStop(0, '#45334e24'); gradient.addColorStop(1, '#45334e00');
  ctx.globalAlpha = pose.opacity * lift; ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function burst(x, y, count, spread) {
  if (prefs.reducedMotion) return;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2, r = Math.random() * spread;
    particles.push({ x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r * .8, vx: Math.cos(angle) * .012, vy: -.012 - Math.random() * .02, life: .6 + Math.random() * .4, size: 1.4 + Math.random() * 1.6 });
  }
}
function drawParticles(now, delta) {
  if (prefs.reducedMotion) return;
  if (engine.name === 'sleep') {
    ctx.save(); ctx.font = '10px Georgia'; ctx.fillStyle = char.accent;
    for (let i = 0; i < 2; i++) { const p = ((now / 2600 + i / 2) % 1); ctx.globalAlpha = Math.sin(p * Math.PI) * .6; ctx.fillText('z', geo.anchorX + 28 + p * 12, modelBounds.y + 25 - p * 18); }
    ctx.restore();
  }
  if (engine.name === 'think') {
    ctx.save(); ctx.fillStyle = char.accent;
    for (let i = 0; i < 3; i++) { ctx.globalAlpha = .25 + (.5 + .5 * Math.sin(now / 250 - i)) * .5; ctx.beginPath(); ctx.arc(geo.anchorX - 7 + i * 7, modelBounds.y - 4, 1.3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  particles = particles.filter(p => p.life > 0);
  if (particles.length < 3 && Math.random() < delta / 4000 && !['entrance', 'sleep'].includes(engine.name)) particles.push({ x: geo.anchorX + (Math.random() - .5) * 100 * geo.factor, y: geo.anchorY - 20, vx: 0, vy: -.006, life: 1, size: 1.6 });
  ctx.save(); ctx.strokeStyle = char.color; ctx.fillStyle = char.color;
  for (const p of particles) {
    p.life -= delta / 2200; p.x += p.vx * delta; p.y += p.vy * delta;
    const s = p.size * geo.factor; ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6) * .7); ctx.beginPath();
    if (id === 'deepseek') { ctx.arc(p.x, p.y, s, 0, Math.PI * 2); ctx.lineWidth = .7; ctx.stroke(); }
    else { ctx.moveTo(p.x, p.y - s * 1.5); ctx.quadraticCurveTo(p.x, p.y, p.x + s, p.y); ctx.quadraticCurveTo(p.x, p.y, p.x, p.y + s * 1.5); ctx.quadraticCurveTo(p.x, p.y, p.x - s, p.y); ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - s * 1.5); ctx.fill(); }
  }
  ctx.restore();
}
function updateAmbient(now) {
  if (now < nextAmbient || engine.name !== 'idle' || hover || dragging || thinking || sleeping) return;
  if (now - lastInteraction > 150000) { sleeping = true; play('sleep'); return; }
  const interaction = lastInteraction;
  const choices = prefs.reducedMotion ? ['signature', 'wave'] : ['signature', 'walk', 'look', 'bow', 'greet', 'stretch'];
  const available = choices.filter(name => name !== lastAmbientAction && (name !== 'walk' || prefs.wander));
  lastAmbientAction = available[Math.floor(Math.random() * available.length)];
  act(lastAmbientAction);
  lastInteraction = interaction;
}
function draw(now) {
  const delta = Math.min(60, now - lastTick); lastTick = now; ctx.clearRect(0, 0, geo.width, geo.height);
  // Nothing is drawn until the house is ready, so the pet never appears before her own entrance.
  if (loaded && (arrived || debugSeek)) {
    let pose = debugSeek ? PetMotion.sample(debugSeek.name, debugSeek.time, debugSeek.options) : engine.current(now, { reduced: prefs.reducedMotion });
    if (pose.done && !debugSeek && engine.name !== 'goodbye') {
      const old = engine.name; rest(); pose = engine.current(now, { reduced: prefs.reducedMotion });
      if (old === 'entrance') { scene.classList.remove('entering'); freeStage(); say(char.hello); }
    }
    if (engine.name === 'entrance' && !debugSeek && !outroSparkled && pose.opacity > 0) {
      outroSparkled = true; burst(stageBounds.x + stageBounds.size * .6, stageBounds.y + stageBounds.size * .5, 14, stageBounds.size * .32);
    }
    currentPose = pose; scenery(pose); drawShadow(pose); sprite(pose, now); drawParticles(now, delta);
    if (engine.name === 'walk' && !debugSeek) {
      if (hover || dragging || thinking) rest();
      else {
        moveRemainder += delta / 1000 * (id === 'deepseek' ? 15 : id === 'claude' ? 12.5 : 13.5) * PetMotion.WALK_SPEED * geo.factor * walkingDirection * pose.speed;
        const dx = Math.trunc(moveRemainder); if (dx) { api.signal('wander', dx); moveRemainder -= dx; }
      }
    }
    if (bubbleDeadline && now > bubbleDeadline) { bubble.classList.remove('show'); bubbleDeadline = 0; }
    if (!hover && now > hoverDeadline) scene.classList.remove('hover');
    if (!debugSeek) updateAmbient(now);
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
function isActorPixel(event) {
  if (!loaded || !arrived || !currentPose || engine.name === 'entrance') return false;
  const x = (event.clientX - modelBounds.x) / modelBounds.width, y = (event.clientY - modelBounds.y) / modelBounds.height;
  if(x<0||x>=1||y<0||y>=1)return false;
  const mask=alpha[currentCel];
  const column=Math.min(63,Math.floor((currentPose.facing<0?1-x:x)*64));
  return !!mask && mask[Math.floor(y*64)*64+column]>40;
}
document.addEventListener('pointermove', e => {
  const hit=!!e.target.closest('#toolbar')||isActorPixel(e);
  if(hit!==lastHit&&!dragging){api.signal('hit-test',hit);lastHit=hit;}
  hover=hit;if(hit){scene.classList.add('hover');hoverDeadline=performance.now()+250;}
});
document.addEventListener('mouseleave',()=>{if(!dragging){hover=false;lastHit=false;hoverDeadline=performance.now()+220;api.signal('hit-test',false);}});
pet.addEventListener('pointerdown',e=>{
  if(e.button!==0||engine.name==='entrance'||!isActorPixel(e))return;
  lastInteraction=performance.now();pressed={x:e.screenX,y:e.screenY};pet.setPointerCapture(e.pointerId);
});
pet.addEventListener('pointermove',e=>{
  if(pressed&&!dragging&&Math.hypot(e.screenX-pressed.x,e.screenY-pressed.y)>4){dragging=true;play('drag');api.signal('drag-start');}
});
function stopDrag(){pressed=null;dragging=false;api.signal('drag-end');play('land');}
function release(e){if(!pressed)return;const wasDrag=dragging;stopDrag();if(!wasDrag&&e.type==='pointerup'){if(sleeping){sleeping=false;play('wake');}api.signal('chat-open');}}
pet.addEventListener('pointerup',release);pet.addEventListener('pointercancel',release);pet.addEventListener('lostpointercapture',release);
pet.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')api.signal('chat-open');});
document.addEventListener('contextmenu',e=>{e.preventDefault();api.signal('pet-menu');});
toolbar.addEventListener('click',e=>{const a=e.target.closest('button')?.dataset.action;if(a==='chat')api.signal('chat-open');else if(a==='menu')api.signal('pet-menu');else if(a)act(a);});
api.on('pet-state',v=>{
  if(v.settings){prefs=v.settings;layout();}
  if(v.edge&&engine.name==='walk'){walkingDirection*=-1;engine.options.direction=walkingDirection;}
  if(typeof v.thinking==='boolean'){
    thinking=v.thinking;if(thinking)sleeping=false;
    if(!['entrance','drag','happy'].includes(engine.name))rest();
  }
});
api.on('pet-action',a=>{if(a==='answered'){queuedHappy=true;if(!thinking)rest();}else if(a!=='settings')act(a);});
api.invoke('init').then(async data=>{
  prefs=data.settings;layout();const house=prefs.reducedMotion?null:loadStage().catch(()=>{});await house;const all=loadCels();await entrance();
  if(data.debug)window.petDiagnostics={
    snapshot:()=>({name:engine.name,geometry:{...geo},bounds:{...modelBounds},pose:currentPose,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}}),
    play:name=>act(name),ready:()=>all,seek:async(name,time,options={})=>{if(name==='entrance')await loadStage();debugSeek={name,time,options};},resume:()=>{debugSeek=null;rest();freeStage();}
  };
}).catch(error=>{say('动画素材加载失败，请重新启动。',30000);console.error(error);});
