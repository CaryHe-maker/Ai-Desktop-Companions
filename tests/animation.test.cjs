const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {sample,geometry,duration,resolve,frames,Controller,TRACKS}=require('../src/pet-motion.js');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/v5/manifest.json'),'utf8')),pets=Object.entries(manifest.characters);
const names=['entrance','walk','wave','wake','signature','happy','think','sleep','idle','drag','land','goodbye','look','bow','greet','stretch'];
test('every pose stays inside the window and resolves to cels that exist on disk',()=>{
 for(const [id,{pairs}] of pets){
  const files=new Set(['v3','v4','v5'].flatMap(v=>fs.readdirSync(path.join(__dirname,'../assets',v,id))).map(f=>f.replace('.webp','')));
  for(const name of [...frames(pairs,false),...frames(pairs,true)])assert.ok(files.has(name),`${id}/${name}`);
  for(const name of names)for(let t=0;t<14000;t+=17){
   const p=sample(name,t,{direction:1});
   assert.ok(p.opacity>=0&&p.opacity<=1&&p.t>=0&&p.t<=1);assert.ok(p.sy>.85&&p.sy<1.1&&p.y<=0&&p.y>-14);
   for(const cel of [p,p.stage].filter(Boolean)){const r=resolve(pairs,cel.a,cel.b,cel.t);assert.ok(files.has(r.lo)&&(!r.hi||files.has(r.hi)),`${id} ${name}@${t}`);assert.ok(r.f>=0&&r.f<=1);}
  }
 }
});
test('each pet has 64 distinct new cels and all four gestures visit their 16 cels then return home',()=>{
 const crypto=require('node:crypto');
 for(const [id] of pets){
  const hashes=new Set();
  for(let i=0;i<64;i++)hashes.add(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,`../assets/v4/${id}/n${i}.webp`))).digest('hex'));
  assert.equal(hashes.size,64);
 }
 for(const [j,name] of ['look','bow','greet','stretch'].entries()){
  const seen=new Set();for(let t=0;t<=duration[name];t+=10){const p=sample(name,t);seen.add(p.a);seen.add(p.b);}
  for(let i=0;i<16;i++)assert.ok(seen.has('n'+(j*16+i)),`${name} frame ${i}`);
  assert.equal(sample(name,duration[name]).a,'b0');assert.ok(sample(name,duration[name]).done);
 }
});
test('scripted tracks only travel between pose pairs that were prepared (morph or dissolve)',()=>{
 for(const [id,{pairs}] of pets)for(const [name,steps] of Object.entries(TRACKS)){
  let prev=name==='entrance'?null:name==='wake'?'b6':name==='land'?'b7':'b0';
  for(const [key] of steps){if(prev&&prev!==key)assert.ok(pairs[prev+'-'+key]!==undefined||pairs[key+'-'+prev]!==undefined,`${id} ${name}: ${prev}→${key}`);prev=key;}
 }
});
test('a pair with no in-betweens dissolves; a morphed pair steps through its cels in order',()=>{
 assert.deepEqual(resolve({'a-b':0},'a','b',.4),{lo:'a',hi:'b',f:.4,cross:true});
 assert.deepEqual(resolve({},'a','b',.4),{lo:'a',hi:'b',f:.4,cross:true});
 const seen=[];for(let t=0;t<=1.0001;t+=.05)seen.push(resolve({'a-b':3},'a','b',Math.min(1,t)).lo);
 assert.deepEqual([...new Set(seen)],['a','a-b_1','a-b_2','a-b_3','b']);
 assert.equal(resolve({'a-b':3},'b','a',.1).lo,'a-b_3','reverse travel reuses the same cels');
});
test('paced for the eye: nothing is rushed',()=>{
 assert.ok(duration.entrance>=6000&&duration.entrance<=7500,'the entrance keeps its brisker pace');assert.ok(duration.wave>=2500);assert.ok(duration.signature>=6000);
 for(const [name,steps] of Object.entries(TRACKS))if(name!=='entrance')for(const [key,move] of steps)assert.ok(move===0||move>=(key.startsWith('n')?90:180),`${key} moves in ${move} ms`);
});
test('entrance completes at one fixed house size, walking retains the original eight cels, actions start from the current pose',()=>{
 assert.ok(sample('entrance',duration.entrance).done);assert.ok(!sample('entrance',duration.entrance-20).done);
 for(let t=0;t<duration.entrance;t+=50)assert.equal(sample('entrance',t).stageScale,1);
 const seen=new Set();for(let t=0;t<duration.walk;t+=10)seen.add(sample('walk',t).a);
 for(let i=0;i<8;i++)assert.ok(seen.has('m'+i));
 const c=new Controller(0);c.play('think',0);c.play('idle',5000);assert.equal(c.options.from,'b3');
 assert.deepEqual([sample('idle',0,{from:'b3'}).a,sample('idle',0,{from:'b3'}).b],['b3','b0']);
});
test('entrance retains every old cel and adds exactly ten reachable inserts per pet',()=>{
 const old=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/v4/manifest.json'),'utf8'));
 for(const [id,{pairs,files}] of pets){
  const before=new Set(frames(old.characters[id].pairs,true)),after=new Set(frames(pairs,true));
  for(const key of before)assert.ok(after.has(key),`${id} retained ${key}`);
  assert.equal(after.size-before.size,10);
  const reached=new Set();for(let t=0;t<duration.entrance;t+=5){const p=sample('entrance',t).stage;if(p){const r=resolve(pairs,p.a,p.b,p.t);reached.add(r.lo);reached.add(r.hi);}}
  for(let i=0;i<10;i++){assert.ok(reached.has('eadd'+i));assert.ok(fs.existsSync(path.resolve(__dirname,'../src',files['eadd'+i])));}
 }
});
test('explicit insert lists resolve in both directions without discarding original intermediate cels',()=>{
 const pairs={'e0-e1':['old1','new','old2']};
 assert.deepEqual(frames(pairs,true),['e0','e1','old1','new','old2']);
 assert.equal(resolve(pairs,'e0','e1',.5).lo,'new');assert.equal(resolve(pairs,'e1','e0',.5).lo,'new');
});
test('walk retains the original whole-character poses and in-betweens',()=>{
 const old=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/v4/manifest.json'),'utf8'));
 for(const [id,{pairs,files}] of pets){
  for(const name of ['b0-m0',...Array.from({length:8},(_,i)=>'m'+i+'-m'+((i+1)%8))])assert.deepEqual(pairs[name],old.characters[id].pairs[name]);
  assert.ok(Object.keys(files).every(k=>!/^w\d+$/.test(k)));
 }
 for(let t=0;t<duration.walk;t+=19){const a=sample('walk',t,{direction:-1}),b=sample('walk',t,{direction:1});assert.equal(a.a,b.a);assert.equal(a.b,b.b);assert.equal(a.t,b.t);assert.equal(a.facing,-b.facing);}
});
test('full body and the whole house fit the window at every supported size',()=>{
 for(let s=.3;s<=.85;s+=.01){const g=geometry(s),size=g.actorHeight*512/448;
  assert.ok(g.anchorY-size*488/512-14*g.factor>=0);assert.ok(g.anchorY+size*24/512<=g.height);
  for(const [id,{entranceAnchor:a}] of pets){const stage=g.actorHeight/a.height*512,x=g.anchorX-a.x/512*stage,y=g.anchorY-a.y/512*stage;
   assert.ok(x>=-1&&y>=-1&&x+stage<=g.width+1&&y+stage<=g.height+1,`${id} house at ${s.toFixed(2)}`);}
 }
});
