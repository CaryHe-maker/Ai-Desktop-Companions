const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const env={...process.env,DESKBOT_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const executablePath=process.env.DESKBOT_PACKAGED;
 const app=await electron.launch({executablePath,args:executablePath?[]:[path.resolve('.')],env});
 const errors=[];app.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));
 try{
  await app.firstWindow();await new Promise(r=>setTimeout(r,1500));
  const pages=app.windows();assert.equal(pages.length,3);
  fs.mkdirSync('artifacts/animation-v3',{recursive:true});
  for(const p of pages){
   await p.waitForFunction(()=>!!window.petDiagnostics);
   const id=new URL(p.url()).searchParams.get('pet');
   for(const [name,time] of [['entrance',1200],['entrance',2600],['entrance',4200],['idle',0],['walk',270],['signature',1600]]){
    await p.evaluate(([n,t])=>petDiagnostics.seek(n,t),[name,time]);await p.waitForTimeout(70);
    await p.screenshot({path:`artifacts/animation-v3/${id}-${name}-${time}.png`,omitBackground:true});
   }
   await p.evaluate(()=>petDiagnostics.ready());await p.evaluate(()=>petDiagnostics.resume());
   // Real-time pacing: play the walk and count distinct painted cels and frames per second.
   const pace=await p.evaluate(()=>new Promise(resolve=>{petDiagnostics.play('walk');const seen=new Set();let frames=0;const start=performance.now();
    const tick=now=>{const pose=petDiagnostics.snapshot().pose;frames++;seen.add(pose.a+pose.b+Math.round(pose.t*8));if(now-start<2000)requestAnimationFrame(tick);else resolve({fps:frames/2,cels:seen.size});};requestAnimationFrame(tick);}));
   console.log(id,'walk',Math.round(pace.fps)+' fps,',pace.cels,'distinct poses in 2 s');
   assert.ok(pace.fps>=45,'renders at display rate');assert.ok(pace.cels>=40,'walk shows in-between cels, not just eight keys');
   await p.evaluate(()=>petDiagnostics.resume());
   const initial=await p.evaluate(()=>petDiagnostics.snapshot());
   assert.equal(initial.geometry.actorHeight,112);
   for(let batch=0;batch<20;batch++){
    await p.evaluate(b=>{for(let i=0;i<50;i++)deskbot.signal('wander',b%2?3:-3);},batch);
    await p.waitForTimeout(35);
   }
   await p.waitForTimeout(100);
   const final=await p.evaluate(()=>petDiagnostics.snapshot());
   assert.deepEqual(final.viewport,initial.viewport,'1000 native moves preserve viewport');
   assert.deepEqual(final.bounds,initial.bounds,'1000 native moves preserve sprite geometry');
   assert.ok(final.bounds.y>=0&&final.bounds.y+final.bounds.height<=final.viewport.height,'full body fits');
  }
  assert.deepEqual(errors,[]);console.log('PASS: 3 pets, 18 visual captures, 3000 native moves, stable viewport and full-body bounds.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exit(1)});
