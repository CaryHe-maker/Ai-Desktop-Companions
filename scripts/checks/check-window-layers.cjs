const {_electron:electron}=require('playwright'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
async function handles(app){return app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({id:w.id,pet:w.webContents.getURL().includes('/pet.html'),handle:String(w.getNativeWindowHandle().readBigUInt64LE()),top:w.isAlwaysOnTop()})));}
function order(list){return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('scripts/checks/read-window-order.ps1'),'-Handles',list.map(w=>w.handle).join(',')],{encoding:'utf8',windowsHide:true}));}
(async()=>{
 const env={...process.env,DESKBOT_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const executablePath=process.env.DESKBOT_PACKAGED;
 const app=await electron.launch({executablePath,args:executablePath?[]:[path.resolve('.')],env});let probe;
 try{
  await app.firstWindow();await new Promise(r=>setTimeout(r,1600));
  const pets=app.windows();assert.equal(pets.length,3);
  for(const p of pets){await p.waitForFunction(()=>!!window.petDiagnostics);await p.evaluate(()=>deskbot.signal('chat-open'));}
  await new Promise(r=>setTimeout(r,1400));
  const own=await handles(app);assert.equal(own.length,6);
  assert.ok(own.every(w=>w.top===w.pet));
  probe=await electron.launch({args:[path.resolve('scripts/checks/layer-probe.cjs')],env});await probe.firstWindow();
  const external=(await handles(probe))[0],all=[...own,external];
  async function check(){
   await probe.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();w.moveTop();});
   await new Promise(r=>setTimeout(r,400));
   const native=order(all),by=new Map(native.windows.map(w=>[w.handle,w])),other=by.get(external.handle);
   for(const w of own){const n=by.get(w.handle);assert.ok(n,'native window exists');assert.equal(n.top,w.pet);assert.ok(w.pet?n.z<other.z:n.z>other.z,w.pet?'pet remains above external window':'external window covers chat');}
   // Windows may refuse a background test process's foreground request while
   // the user types elsewhere. Regardless, raising pets must never focus them.
   assert.ok(!own.filter(w=>w.pet).some(w=>w.handle===native.foreground),'pet stacking must not take keyboard focus');
  }
  await check();
  for(const chat of own.filter(w=>!w.pet)){
   await app.evaluate(({BrowserWindow},id)=>{const w=BrowserWindow.fromId(id);w.minimize();w.restore();w.show();w.focus();},chat.id);
   await new Promise(r=>setTimeout(r,300));
   const native=order(own),by=new Map(native.windows.map(w=>[w.handle,w]));
   for(const pet of own.filter(w=>w.pet))assert.ok(by.get(pet.handle).z<by.get(chat.handle).z,'all pets remain above focused chat');
   await check();
  }
  console.log('PASS: native Windows Z-order: all pets above chats and external application; every chat coverable after open/restore; pets do not take keyboard focus.');
 }finally{if(probe)await probe.close();await app.close();}
})().catch(e=>{console.error(e);process.exit(1);});
