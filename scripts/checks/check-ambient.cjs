const {_electron:electron}=require('playwright');
const path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const env={...process.env,DESKBOT_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const executablePath=process.env.DESKBOT_PACKAGED;
 const app=await electron.launch({executablePath,args:executablePath?[]:[path.resolve('.')],env});
 try{
  await app.firstWindow();await new Promise(r=>setTimeout(r,1500));assert.equal(app.windows().length,3);
  const results=[];
  for(const page of app.windows()){
   await page.waitForFunction(()=>!!window.petDiagnostics);await page.evaluate(()=>petDiagnostics.ready());
   const result=await page.evaluate(()=>{
    thinking=false;sleeping=false;hover=false;dragging=false;queuedHappy=false;prefs.reducedMotion=false;prefs.wander=true;
    const delays=[],actions=[];lastAmbientAction=null;
    for(let i=0;i<100;i++){
     rest();const now=performance.now();lastInteraction=now;nextAmbient=now-1;updateAmbient(now);
     actions.push(engine.name);delays.push(nextAmbient-performance.now());
    }
    rest();const idleDeadline=nextAmbient;updateAmbient(idleDeadline-1);const beforeDeadline=engine.name;
    const guardNames=['hover','dragging','thinking','sleeping'],guards=[];
    for(const guard of guardNames){
     thinking=false;sleeping=false;hover=false;dragging=false;engine.play('idle',performance.now());nextAmbient=0;
     if(guard==='hover')hover=true;if(guard==='dragging')dragging=true;if(guard==='thinking')thinking=true;if(guard==='sleeping')sleeping=true;
     updateAmbient(performance.now());guards.push(engine.name);
    }
    thinking=false;sleeping=false;hover=false;dragging=false;prefs.wander=false;
    const stationary=[];
    for(let i=0;i<30;i++){rest();lastInteraction=performance.now();nextAmbient=0;updateAmbient(performance.now());stationary.push(engine.name);}
    prefs.wander=true;rest();const resumeAt=performance.now(),quiet=nextAmbient-resumeAt;
    act('bow');const manual=engine.name;rest();
    return {id,delays,actions,beforeDeadline,guards,stationary,quiet,manual};
   });
   assert.ok(result.delays.every(d=>d>=11990&&d<=36000),'random interval survives action dispatch');
   assert.ok(Math.max(...result.delays)-Math.min(...result.delays)>15000,'delays vary across the full range');
   assert.ok(result.actions.every((a,i)=>!i||a!==result.actions[i-1]),'no consecutive repeats');
   assert.ok(new Set(result.actions).size>=5,'varied action selection');
   assert.equal(result.beforeDeadline,'idle');assert.deepEqual(result.guards,['idle','idle','idle','idle']);
   assert.ok(!result.stationary.includes('walk'));assert.ok(result.quiet>=11990&&result.quiet<=36000);
   assert.equal(result.manual,'bow');results.push(Math.round(result.delays[0]));
   console.log('PASS '+result.id+': 100 independently randomized actions, 12–36 s intervals, full rest after completion, hover/drag/thinking/sleep guards, wandering off, immediate manual action.');
  }
  assert.ok(new Set(results).size>1,'companions do not share one synchronized delay');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
