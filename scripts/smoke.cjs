const { _electron: electron }=require('playwright');
const path=require('node:path');const fs=require('node:fs');const assert=require('node:assert/strict');
const {duration}=require('../src/pet-motion.js');
(async()=>{
 const executablePath=process.env.DESKBOT_PACKAGED,home=path.join(executablePath?path.dirname(executablePath):'.','artifacts/test-data');
 fs.mkdirSync('artifacts',{recursive:true});fs.mkdirSync(home,{recursive:true});const env={...process.env,DESKBOT_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE;
 // Two saved DeepSeek conversations, so the picker has something to offer.
 const data=f=>path.join(home,f);
 for(const f of fs.readdirSync(home))if(/^(sessions?-|history-)/.test(f))fs.rmSync(data(f));
 const now=Date.now(),talk=(q,a)=>[{role:'user',text:q,images:[],web:false},{role:'assistant',text:a,sources:[]}];
 fs.writeFileSync(data('sessions-deepseek.json'),JSON.stringify({current:'a1',list:[
  {id:'a1',title:'周末去海边带什么',custom:false,created:now-9e6,updated:now-36e5,count:2,preview:'防晒、拖鞋，还有一本书。'},
  {id:'b2',title:'帮我解释一下潮汐',custom:false,created:now-2e8,updated:now-1.8e8,count:4,preview:'所以一天通常有两次涨潮。'}]}));
 fs.writeFileSync(data('session-deepseek-a1.json'),JSON.stringify(talk('周末去海边带什么','防晒、拖鞋，还有一本书。')));
 fs.writeFileSync(data('session-deepseek-b2.json'),JSON.stringify([...talk('帮我解释一下潮汐','月球引力拉起了海水。'),...talk('一天几次？','所以一天通常有两次涨潮。')]));
 const app=await electron.launch({executablePath,args:executablePath?[]:[path.resolve('.')],env});const errors=[];
 app.on('window',page=>{page.on('pageerror',e=>errors.push(e.message));});
 try{
  await app.firstWindow();await new Promise(r=>setTimeout(r,1800));
  const pets=app.windows();assert.equal(pets.length,3,'three pets launch');
  for(const page of pets){const id=new URL(page.url()).searchParams.get('pet');await page.screenshot({path:`artifacts/${id}-entrance.png`,omitBackground:true});}
  for(const page of pets)await page.waitForFunction(()=>{const s=petDiagnostics.snapshot();return s.pose&&s.name!=='entrance'&&s.pose.opacity===1;},null,{timeout:duration.entrance+15000});
  for(const page of pets){const id=new URL(page.url()).searchParams.get('pet');assert.notEqual(await page.evaluate(()=>petDiagnostics.snapshot().name),'entrance',id+' leaves the entrance');await page.screenshot({path:`artifacts/${id}-pet.png`,omitBackground:true});}
  const open=async(id,file)=>{await pets.find(p=>p.url().includes('pet='+id)).evaluate(()=>window.deskbot.signal('chat-open'));for(let i=0;i<40;i++){const w=app.windows().find(p=>p.url().includes(file)&&p.url().includes('pet='+id));if(w)return w;await new Promise(r=>setTimeout(r,100));}throw new Error('no chat window for '+id);};
  // A real pointer click on the body opens the chat; a click on empty space beside her does not count as a hit.
  {const page=pets.find(p=>p.url().includes('pet=deepseek')),box=await page.evaluate(()=>{petDiagnostics.resume();return petDiagnostics.snapshot().bounds;});
   const hit=(x,y)=>page.evaluate(([x,y])=>{const e=new PointerEvent('pointermove',{clientX:x,clientY:y,bubbles:true});document.body.dispatchEvent(e);return new Promise(r=>setTimeout(()=>r(document.querySelector('#scene').classList.contains('hover')),120));},[x,y]);
   await page.waitForTimeout(400);assert.equal(await hit(box.x+box.width/2,box.y+box.height*.55),true,'the body is solid to the pointer');
   await page.mouse.move(box.x+box.width/2,box.y+box.height*.55);await page.mouse.down();await page.mouse.up();
   for(let i=0;i<30&&!app.windows().some(p=>p.url().includes('chat.html'));i++)await new Promise(r=>setTimeout(r,100));
   assert.ok(app.windows().some(p=>p.url().includes('chat.html')&&p.url().includes('deepseek')),'clicking the pet opens her chat');
   await page.waitForTimeout(400);await hit(2,2);await page.waitForTimeout(400);assert.equal(await hit(2,2),false,'empty corners stay click-through');}
  // DeepSeek: conversation picker, switching, new, rename, delete.
  const dc=await open('deepseek','chat.html');
  await dc.waitForSelector('#session-panel:not([hidden]) .session-row');assert.equal(await dc.locator('.session-row').count(),2,'picker lists saved conversations');
  await dc.waitForTimeout(350);await dc.screenshot({path:'artifacts/deepseek-sessions.png'});
  assert.equal(await dc.locator('.message').count(),2,'current conversation is loaded behind the picker');
  await dc.locator('.session-row:nth-child(2) .session-open').click();await dc.waitForSelector('#session-panel',{state:'hidden'});
  assert.equal(await dc.locator('.message').count(),4);assert.equal(await dc.locator('#session-title').textContent(),'帮我解释一下潮汐');
  await dc.locator('#new-chat').click();await dc.waitForSelector('#welcome');assert.equal(await dc.locator('.message').count(),0);
  await dc.locator('#prompt').fill('hello');await dc.locator('#send').click();await dc.waitForSelector('.message.error');assert.match(await dc.locator('.message.error').innerText(),/API Key/);
  await dc.locator('.message.error .copy-button').click();assert.equal(await dc.locator('#prompt').inputValue(),'hello');
  await dc.screenshot({path:'artifacts/deepseek-chat.png'});
  await dc.locator('#session-toggle').click();assert.equal(await dc.locator('.session-row').count(),2,'an unanswered blank page is not saved');
  await dc.locator('.session-row').first().hover();await dc.locator('.session-row').first().locator('.session-tool').first().click();
  await dc.locator('.session-rename').fill('海边清单');await dc.locator('.session-rename').press('Enter');
  await dc.waitForFunction(()=>document.querySelector('.session-row strong')?.textContent==='海边清单');
  dc.once('dialog',d=>d.accept());await dc.locator('.session-row').nth(1).hover();await dc.locator('.session-row').nth(1).locator('.session-tool.danger').click();
  await dc.waitForFunction(()=>document.querySelectorAll('.session-row').length===1);assert.ok(!fs.existsSync(data('session-deepseek-b2.json')),'deleted conversation is removed from disk');
  await dc.locator('#session-filter').fill('不存在');await dc.waitForSelector('#session-empty:not([hidden])');await dc.locator('#session-filter').fill('');
  await dc.locator('.session-open').click();assert.equal(await dc.locator('.message').count(),2);
  await dc.locator('#settings-toggle').click();await dc.waitForTimeout(350);await dc.screenshot({path:'artifacts/deepseek-settings.png'});await dc.locator('#settings-close').click();
  // GPT and Claude both open the official-web shell; neither may use a local send route.
  for(const id of ['gpt','claude']){
   const shell=await open(id,'web-chat.html');await shell.waitForSelector('#veil-title');await shell.waitForTimeout(400);await shell.screenshot({path:`artifacts/${id}-chat.png`});
   await assert.rejects(()=>shell.evaluate(()=>deskbot.invoke('send',{text:'must stay on the official page'})),/官方网页/);
   await assert.rejects(()=>shell.evaluate(()=>deskbot.invoke('session-new')),/官方网页/);
  }
  assert.equal(await app.evaluate(({safeStorage})=>safeStorage.isEncryptionAvailable()&&safeStorage.decryptString(safeStorage.encryptString('test-roundtrip'))==='test-roundtrip'),true,'Windows credential encryption');
  const layers=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({pet:w.webContents.getURL().includes('/pet.html'),top:w.isAlwaysOnTop()})));
  assert.equal(layers.filter(w=>w.pet).length,3);assert.equal(layers.filter(w=>!w.pet).length,3);
  assert.ok(layers.every(w=>w.top===w.pet),'only pets stay above other applications; all three chat windows are ordinary windows');
  const security=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({sandbox:w.webContents.getLastWebPreferences().sandbox,node:w.webContents.getLastWebPreferences().nodeIntegration})));
  assert.ok(security.every(s=>s.sandbox&&!s.node));assert.deepEqual(errors,[]);console.log('PASS: three pets and entrances, DeepSeek conversation picker (switch/new/rename/delete/search), missing-key error and retry, GPT + Claude official-web shells, renderer isolation. Screenshots in artifacts/.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exit(1)});
