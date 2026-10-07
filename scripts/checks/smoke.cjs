const {_electron:electron}=require('playwright'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {duration}=require('../../src/pet-motion.js');
(async()=>{
 const env={...process.env,DESKBOT_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const executablePath=process.env.DESKBOT_PACKAGED;
 const app=await electron.launch({executablePath,args:executablePath?[]:[path.resolve('.')],env}),errors=[];
 app.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));fs.mkdirSync('artifacts',{recursive:true});
 try{
  await app.firstWindow();await new Promise(r=>setTimeout(r,1400));const pets=app.windows();assert.equal(pets.length,3);
  for(const pet of pets){
   await pet.waitForFunction(()=>!!window.petDiagnostics);
   await pet.waitForFunction(()=>petDiagnostics.snapshot().name!=='entrance',null,{timeout:duration.entrance+15000});
   await pet.evaluate(()=>deskbot.signal('chat-open'));
  }
  await new Promise(r=>setTimeout(r,1200));
  const shells=app.windows().filter(p=>p.url().includes('/web-chat.html'));assert.equal(shells.length,3);
  for(const shell of shells){
   const id=new URL(shell.url()).searchParams.get('pet');await shell.waitForSelector('#veil-title');
   assert.match(await shell.locator('#about-title').textContent(),new RegExp(id==='gpt'?'ChatGPT':id==='claude'?'Claude':'DeepSeek'));
   assert.equal(await shell.locator('input[type=password],#api-key,#deepseek-key').count(),0,'no API settings in any shell');
   await assert.rejects(()=>shell.evaluate(()=>deskbot.invoke('send',{text:'must not send through local API'})),/Unknown operation/);
   await assert.rejects(()=>shell.evaluate(()=>deskbot.invoke('session-new')),/Unknown operation/);
   const pet=pets.find(p=>p.url().includes('pet='+id));
   await shell.locator('#close').click();await pet.evaluate(()=>deskbot.signal('chat-open'));await shell.waitForTimeout(150);
   await shell.screenshot({path:`artifacts/${id}-chat.png`});
  }
  const prefs=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({pet:w.webContents.getURL().includes('/pet.html'),top:w.isAlwaysOnTop(),sandbox:w.webContents.getLastWebPreferences().sandbox,node:w.webContents.getLastWebPreferences().nodeIntegration})));
  assert.equal(prefs.filter(w=>w.pet).length,3);assert.equal(prefs.filter(w=>!w.pet).length,3);
  assert.ok(prefs.every(w=>w.top===w.pet&&w.sandbox&&!w.node));
  assert.deepEqual(errors,[]);console.log('PASS: three pets; ChatGPT, Claude and DeepSeek official-web shells; no local API bridge or key fields; hide/reopen and renderer isolation.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exit(1);});
