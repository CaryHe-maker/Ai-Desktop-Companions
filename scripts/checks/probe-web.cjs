// Developer aid: opens the real official page in the throw-away test session (never the
// user's signed-in one), applies the cosmetic CSS and prints what that CSS can rely on.
// Usage: node scripts/checks/probe-web.cjs gpt|claude|deepseek [waitMs]
const {_electron:electron}=require('playwright');
const path=require('node:path'),fs=require('node:fs');
const id=process.argv[2]||'gpt',{PROVIDERS}=require('../../src/web-policy.cjs');
function inspect(composer){
 const rules=[...document.styleSheets].flatMap(s=>{try{return [...s.cssRules];}catch{return [];}});
 const vars={};
 for(const r of rules)if(r.selectorText&&/^(:root|html|body|\.light|\[data-theme)/.test(r.selectorText))for(const n of r.style)if(n.startsWith('--')&&Object.keys(vars).length<500)vars[n]=r.style.getPropertyValue(n).trim().slice(0,40);
 const box=e=>{const r=e.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];};
 return JSON.stringify({title:document.title,text:document.body.innerText.slice(0,500),composer:!!document.querySelector(composer),
  root:document.documentElement.className+' | '+[...document.documentElement.attributes].map(a=>a.name+'='+a.value).join(' '),
  body:getComputedStyle(document.body).backgroundColor,vars,
  landmarks:[...document.querySelectorAll('header,nav,aside,main,form,footer,textarea,[contenteditable],[data-testid],button[aria-label]')].slice(0,160).map(e=>({tag:e.tagName,id:e.id,testid:e.getAttribute('data-testid'),label:e.getAttribute('aria-label'),cls:String(e.className).slice(0,110),box:box(e)}))},null,1);
}
(async()=>{
 fs.mkdirSync('artifacts/web-chat',{recursive:true});
 const env={...process.env,DESKBOT_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[path.resolve('.'),'--pet='+id],env});
 try{
  const pet=await app.firstWindow();await pet.waitForFunction(()=>!!window.petDiagnostics);
  await pet.evaluate(()=>deskbot.signal('chat-open'));
  let shell;for(let i=0;i<40;i++){shell=app.windows().find(p=>p.url().includes('web-chat.html'));if(shell)break;await new Promise(r=>setTimeout(r,100));}
  const partition='persist:'+PROVIDERS[id].partition+'-test';
  const remote=(fn,arg)=>app.evaluate(async({webContents,session},{partition,fn,arg})=>{const wc=webContents.getAllWebContents().find(w=>w.session===session.fromPartition(partition));return new Function('wc','arg','return ('+fn+')(wc,arg)')(wc,arg);},{partition,fn:fn.toString(),arg});
  await remote(async(wc,home)=>{await wc.loadURL(home).catch(()=>{});},PROVIDERS[id].home);
  await shell.waitForTimeout(Number(process.argv[3]||9000));
  const say=process.argv.find(a=>a.startsWith('--say='))?.slice(6);
  if(say){
   // Types one message like a person would (focus, text, Enter) and reports what the page shows afterwards.
   await remote(async(wc,{composer,say})=>{await wc.executeJavaScript(`document.querySelector(${JSON.stringify(composer)}).focus()`);await wc.insertText(say);await new Promise(r=>setTimeout(r,600));for(const type of ['keyDown','char','keyUp'])wc.sendInputEvent({type,keyCode:'Return'});},{composer:PROVIDERS[id].composer,say});
   for(let i=0;i<12;i++){await shell.waitForTimeout(2500);console.log(i,JSON.stringify(await shell.evaluate(()=>deskbot.invoke('web-action','status'))));}
   console.log(await remote(wc=>wc.executeJavaScript('document.body.innerText.slice(0,1500)')));
  }
  console.log(await remote(wc=>wc.getURL()));
  console.log(await remote((wc,code)=>wc.executeJavaScript(code),`(${inspect.toString()})(${JSON.stringify(PROVIDERS[id].composer)})`));
  const shot=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('web-chat.html'));return (await w.capturePage()).toPNG().toString('base64');});
  fs.writeFileSync(`artifacts/web-chat/${id}-shell.png`,Buffer.from(shot,'base64'));
  const page=await remote(async wc=>(await wc.capturePage()).toPNG().toString('base64'));
  fs.writeFileSync(`artifacts/web-chat/${id}-page.png`,Buffer.from(page,'base64'));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exit(1)});
