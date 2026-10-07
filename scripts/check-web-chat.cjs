// Exercises the GPT and Claude official-web windows against local fixture pages served in the
// throw-away test session. For a look at the real sites use scripts/probe-web.cjs.
const {_electron:electron}=require('playwright');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {PROVIDERS}=require('../src/web-policy.cjs');
const FIXTURE={
 gpt:`<!doctype html><meta charset="utf-8"><style>body{margin:0;display:flex;font:14px sans-serif}#stage-slideover-sidebar{width:160px;background:#ddd;height:100vh}main{flex:1;padding:18px}textarea{width:100%}</style><aside id="stage-slideover-sidebar">历史记录（测试页面）</aside><main><header>ChatGPT · Chat</header><h2>界面测试示例</h2><p>此页是本地测试素材，不是真实模型回复。</p><div data-message-author-role="assistant">欢迎来到月光小屋。</div><form><textarea id="prompt-textarea" placeholder="输入消息"></textarea><button type="button" aria-label="Send message">↑</button></form></main>`,
 claude:`<!doctype html><meta charset="utf-8"><style>:root{--bg-100:48 33.3% 97.1%}body{margin:0;padding:18px;font:14px sans-serif;background:hsl(var(--bg-100))}</style><h2>界面测试示例</h2><p>此页是本地测试素材，不是真实模型回复。</p><fieldset><div data-testid="chat-input" contenteditable="true">输入消息</div></fieldset>`
};
const env={...process.env,DESKBOT_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE;
const executablePath=process.env.DESKBOT_PACKAGED,launch=id=>electron.launch({executablePath,args:executablePath?['--pet='+id]:[path.resolve('.'),'--pet='+id],env});
async function check(id){
 const provider=PROVIDERS[id],partition='persist:'+provider.partition+'-test',login=id==='gpt'?'https://auth.openai.com/':'https://claude.ai/login';
 const app=await launch(id);
 try{
  const pet=await app.firstWindow();await pet.waitForFunction(()=>!!window.petDiagnostics);
  await pet.evaluate(()=>deskbot.signal('chat-open'));
  let shell;for(let i=0;i<40;i++){shell=app.windows().find(p=>p.url().includes('web-chat.html'));if(shell)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(shell,id+' uses the official web shell');await shell.waitForSelector('#veil');
  const remote=(fn,arg)=>app.evaluate(async({webContents,session},{partition,fn,arg})=>{const wc=webContents.getAllWebContents().find(w=>w.session===session.fromPartition(partition));return new Function('wc','arg','return ('+fn+')(wc,arg)')(wc,arg);},{partition,fn:fn.toString(),arg});
  const page=code=>remote((wc,code)=>wc.executeJavaScript(code),code);
  const prefs=await remote(wc=>{const p=wc.getLastWebPreferences();return {sandbox:p.sandbox,node:p.nodeIntegration,isolation:p.contextIsolation,preload:p.preload,ua:wc.getUserAgent()};});
  assert.equal(prefs.sandbox,true);assert.equal(prefs.node,false);assert.equal(prefs.isolation,true);assert.ok(!prefs.preload);assert.doesNotMatch(prefs.ua,/Electron|deskbot/i);
  await app.evaluate(async({session},{partition,hosts,html})=>{
   await session.fromPartition(partition).protocol.handle('https',request=>{const u=new URL(request.url);return new Response(hosts.includes(u.hostname)&&!u.pathname.startsWith('/login')?html:'<!doctype html><h1>Authentication fixture</h1><input type="password">',{headers:{'Content-Type':'text/html;charset=utf-8'}});});
  },{partition,hosts:provider.hosts,html:FIXTURE[id]});
  const visible=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('web-chat.html')).contentView.children[0].getVisible());
  assert.equal(await visible(),false,'the page stays behind the welcome veil until it has loaded');
  await remote(async(wc,home)=>{await wc.loadURL(home).catch(()=>{});},provider.home);await shell.waitForTimeout(1800);
  assert.equal(await visible(),true,'the page is revealed once ready');
  const skinned=()=>page(id==='gpt'?'getComputedStyle(document.querySelector("#stage-slideover-sidebar")).display==="none"':'getComputedStyle(document.documentElement).getPropertyValue("--bg-100").trim()==="36 52% 97.4%"');
  assert.equal(await skinned(),true,'cosmetic skin applied on the chat surface');
  assert.equal(await page('typeof window.deskbot+typeof require'),'undefinedundefined','no bridge inside the official page');
  const bounds=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('web-chat.html'));return {view:w.contentView.children[0].getBounds(),size:w.getContentSize()};});
  const card=await shell.locator('#card').boundingBox();
  assert.ok(bounds.view.x>=card.x&&bounds.view.y>=card.y&&bounds.view.x+bounds.view.width<=card.x+card.width+.5&&bounds.view.y+bounds.view.height<=card.y+card.height+.5,'official page sits inside the card frame');
  fs.writeFileSync(`artifacts/web-chat/${id}-fixture-page.png`,Buffer.from(await remote(async wc=>(await wc.capturePage()).toPNG().toString('base64')),'base64'));
  await shell.evaluate(()=>deskbot.invoke('web-action','compact'));await shell.waitForTimeout(200);assert.equal(await skinned(),false,'skin can be switched off');
  await shell.evaluate(()=>deskbot.invoke('web-action','compact'));await shell.waitForTimeout(200);assert.equal(await skinned(),true);
  await shell.evaluate(()=>deskbot.invoke('web-action','settings-open'));assert.equal(await visible(),false);await shell.evaluate(()=>deskbot.invoke('web-action','settings-close'));assert.equal(await visible(),true);
  await assert.rejects(()=>shell.evaluate(()=>deskbot.invoke('send',{text:'must not use a local route'})),/官方网页/);
  await remote(async(wc,url)=>{await wc.loadURL(url).catch(()=>{});},login);await shell.waitForTimeout(600);
  assert.match(await shell.locator('#web-message').textContent(),/登录/);
  if(id==='claude')assert.equal(await skinned(),false,'sign-in pages are never restyled');
  await shell.locator('#close').click();await pet.evaluate(()=>deskbot.signal('chat-open'));await shell.waitForTimeout(200);
  assert.equal(await remote(wc=>wc.getURL()),login,'closing only hides the window; the page is kept');
  await app.evaluate(async({session},{partition,url})=>{const ses=session.fromPartition(partition);await ses.cookies.set({url,name:'deskbot-persistence-test',value:'ok',secure:true,expirationDate:Date.now()/1000+3600});await ses.cookies.flushStore();},{partition,url:new URL(provider.home).origin});
 }finally{await app.close();}
 const again=await launch(id);
 try{await again.firstWindow();const cookies=await again.evaluate(async({session},partition)=>session.fromPartition(partition).cookies.get({name:'deskbot-persistence-test'}),partition);assert.equal(cookies[0]?.value,'ok','sign-in cookies survive a full restart');await again.evaluate(async({session},{partition,url})=>session.fromPartition(partition).cookies.remove(url,'deskbot-persistence-test'),{partition,url:new URL(provider.home).origin});}finally{await again.close();}
 console.log(`PASS ${id}: isolated official view, reveal after load, skin on/off, framed layout, auth pages untouched, hide/reopen, cookies persist.`);
}
(async()=>{fs.mkdirSync('artifacts/web-chat',{recursive:true});for(const id of ['gpt','claude'])await check(id);})().catch(e=>{console.error(e);process.exit(1)});
