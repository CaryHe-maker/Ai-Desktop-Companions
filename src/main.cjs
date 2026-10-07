const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, dialog, clipboard, safeStorage } = require('electron');
const path = require('node:path'), fs = require('node:fs');
const { Storage } = require('./storage.cjs');
const { ChatGPTAuth } = require('./auth.cjs');
const { PETS, validPet, validateMessage, safeURL, trimHistory } = require('./core.cjs');
const { Sessions } = require('./sessions.cjs');
const { chat } = require('./providers.cjs');
const { geometry } = require('./pet-motion.js');
const { attachOfficialChat } = require('./web-chat.cjs');
const ROOT = path.join(__dirname, '..');
const TEST = process.env.DESKBOT_TEST === '1';
app.setPath('userData', path.join(app.isPackaged ? path.dirname(process.execPath) : ROOT, TEST ? 'artifacts/test-data' : 'data'));
app.setAppUserModelId('Deskbot.Companions');
const windows = new Map(), owners = new Map(), active = new Map(), drags = new Map();
let store, auth, tray, sessions;
const WEB = ['gpt', 'claude'];
const labels = { gpt: 'GPT · 月光', claude: 'Claude · 暖书', deepseek: 'DeepSeek · 海汐' };
const defaults = { gptModel: '', scale: .5, wander: true, reducedMotion: false, animationVersion: 2, webZoom: {} };
function settings() { return { ...defaults, ...store.read('settings') }; }
function owner(event) { const entry = owners.get(event.sender.id); if (!entry || event.senderFrame !== event.sender.mainFrame) throw new Error('非法窗口请求'); return entry; }
function notify(id, channel, data) { const pair=windows.get(id);for (const w of [pair?.pet,pair?.chat]) if (w && !w.isDestroyed()) w.webContents.send(channel, data); }
function configure(w, id, type) {
  owners.set(w.webContents.id, { id, type });
  const wcId = w.webContents.id;
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', e => e.preventDefault());
  w.webContents.session.setPermissionRequestHandler((_wc,_p,callback) => callback(false));
  w.on('closed', () => { owners.delete(wcId); });
}
function options() { return { preload: path.join(__dirname,'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }; }
function clamp(w, x, y) {
  const o = owners.get(w.webContents.id);
  const {width,height} = o?.type === 'pet' ? geometry(settings().scale) : w.getBounds();
  const area = screen.getDisplayNearestPoint({ x: Math.round(x+width/2), y: Math.round(y+height/2) }).workArea;
  return [Math.round(Math.max(area.x,Math.min(x,area.x+area.width-width))), Math.round(Math.max(area.y,Math.min(y,area.y+area.height-height)))];
}
function movePet(w, x, y) {
  const {width,height} = geometry(settings().scale), [left,top] = clamp(w,x,y);
  // Do not let successive native Windows moves reuse a DPI-rounded size.
  w.setBounds({x:left,y:top,width,height},false);
  return {edge:Math.abs(left-x)>.5, x:left, y:top};
}
function homeBounds(id) {
  const a = screen.getPrimaryDisplay().workArea; const {width,height} = geometry(settings().scale);
  const i = PETS.indexOf(id); return { width, height, x: Math.max(a.x, a.x+a.width-width-14-i*Math.min(width-10,(a.width-width-28)/2)), y:a.y+12 };
}
function spawn(id) {
  validPet(id);
  if (windows.get(id)?.pet && !windows.get(id).pet.isDestroyed()) { windows.get(id).pet.showInactive(); notify(id,'pet-action','entrance'); return; }
  const b=homeBounds(id);
  const w = new BrowserWindow({ ...b, title: labels[id], frame:false, transparent:true, backgroundColor:'#00000000', resizable:false, hasShadow:false, skipTaskbar:true, alwaysOnTop:true, show:false, icon:path.join(ROOT,'assets',id+'.ico'), webPreferences: options() });
  windows.set(id,{pet:w,chat:null}); configure(w,id,'pet');
  w.setAlwaysOnTop(true,'floating'); w.setIgnoreMouseEvents(true,{forward:true});
  w.loadFile(path.join(__dirname,'pet.html'),{query:{pet:id}});
  w.once('ready-to-show',()=>{w.showInactive();movePet(w,b.x,b.y);});
  w.on('closed',()=>{ clearInterval(drags.get(id)?.timer); drags.delete(id); active.get(id)?.abort(); const c=windows.get(id)?.chat; if(c&&!c.isDestroyed())c.destroy(); windows.delete(id); });
}
function openChat(id) {
  const pair = windows.get(id); if (!pair) return;
  if (pair.chat && !pair.chat.isDestroyed()) { pair.chat.show(); pair.chat.focus(); return; }
  const p=pair.pet.getBounds(), a=screen.getDisplayMatching(p).workArea;
  const width=Math.min(WEB.includes(id)?488:470,a.width),height=Math.min(WEB.includes(id)?748:710,a.height-24);
  // Chat is a normal independent window; only the desktop pet stays on top.
  const w=new BrowserWindow({ width,height,x:Math.round(Math.max(a.x,Math.min(p.x-width+95,a.x+a.width-width))),y:Math.round(Math.max(a.y+8,Math.min(p.y+80,a.y+a.height-height-8))),title:labels[id]+' · 聊天',frame:false,resizable:true,minWidth:360,minHeight:480,backgroundColor:({gpt:'#f4eefa',claude:'#f9f1e6'})[id]||'#f6fafc',show:false,alwaysOnTop:false,icon:path.join(ROOT,'assets',id+'.ico'),webPreferences:options() });
  pair.chat=w;configure(w,id,WEB.includes(id)?'webchat':'chat');
  // A native child view can defer ready-to-show; the trusted shell is ready independently.
  w.webContents.once('did-finish-load',()=>{if(!w.isDestroyed())w.show();});
  if(WEB.includes(id)){
    pair.official=attachOfficialChat(w,{id,test:TEST,logFile:path.join(app.getPath('userData'),'web-chat.log'),previousAgent:store.read('web-agents')[id]||null,onAgent:agent=>store.write('web-agents',{...store.read('web-agents'),[id]:agent}),zoom:settings().webZoom?.[id]||1,
      onState:thinking=>{notify(id,'pet-state',{thinking});if(!thinking)notify(id,'pet-action','answered');},
      onZoom:zoom=>{const s=settings();s.webZoom={...s.webZoom,[id]:zoom};store.write('settings',s);},
      onSettings:()=>notify(id,'pet-action','settings')});
    w.loadFile(path.join(__dirname,'web-chat.html'),{query:{pet:id}});
  }else w.loadFile(path.join(__dirname,'chat.html'),{query:{pet:id}});
  w.once('ready-to-show',()=>w.show());w.on('close',e=>{if(!app.quitting){e.preventDefault();w.hide();}});
}
function petMenu(id) {
  Menu.buildFromTemplate([
    {label:labels[id],enabled:false},{type:'separator'},
    {label:'和她聊聊',click:()=>openChat(id)},
    {label:'打个招呼',click:()=>notify(id,'pet-action','wave')},
    {label:'开心一下',click:()=>notify(id,'pet-action','happy')},
    {label:'左右看看',click:()=>notify(id,'pet-action','look')},
    {label:'轻轻鞠躬',click:()=>notify(id,'pet-action','bow')},
    {label:'摆手问好',click:()=>notify(id,'pet-action','greet')},
    {label:'伸个懒腰',click:()=>notify(id,'pet-action','stretch')},
    {label:({gpt:'理头发 · 轻轻行礼',claude:'翻书 · 读一小会儿',deepseek:'抱抱 · 小鲸鱼'})[id],click:()=>notify(id,'pet-action','signature')},
    {label:'出去散散步',click:()=>notify(id,'pet-action','walk')},
    {label:'休息 / 叫醒',click:()=>notify(id,'pet-action','sleep')},
    {label:'重播小屋出场',click:()=>{windows.get(id).pet.setBounds(homeBounds(id));notify(id,'pet-action','entrance');}},
    {label:'设置',click:()=>{openChat(id);setTimeout(()=>notify(id,'pet-action','settings'),250);}},
    {type:'separator'},{label:'让她回家',click:()=>{notify(id,'pet-action','goodbye');setTimeout(()=>windows.get(id)?.pet.destroy(),4100);}}
  ]).popup({window:windows.get(id)?.pet});
}
function publicSettings() { const s=store.secrets();return {...settings(),hasDeepseekKey:!!s.deepseekKey,chatgptEmail:s.chatgpt?.email||null}; }
function imageData(file) {
  const stat=fs.statSync(file); if(stat.size>12*1024*1024)throw new Error('单张图片不能超过 12MB');
  const img=nativeImage.createFromPath(file); if(img.isEmpty())throw new Error('无法打开图片');
  const size=img.getSize();const factor=Math.min(1,2048/Math.max(size.width,size.height));
  return img.resize({width:Math.round(size.width*factor),height:Math.round(size.height*factor)}).toDataURL();
}
function installIPC() {
  const handle=(name,fn)=>ipcMain.handle(name,async(e,value)=>{const o=owner(e);return fn(o,value,e);});
  handle('init',o=>({id:o.id,settings:publicSettings(),...(WEB.includes(o.id)?{history:[]}:{history:sessions.messages(o.id),sessions:sessions.overview(o.id)}),debug:TEST}));
  handle('web-action',(o,name)=>{if(o.type!=='webchat')throw new Error('仅官方聊天窗口可执行此操作');return windows.get(o.id).official.action(name);});
  handle('settings',()=>publicSettings());
  handle('save-settings',(_o,v)=>{
    if(!v||typeof v!=='object')throw new Error('设置格式错误');
    const s=settings();
    if(typeof v.gptModel==='string'&&v.gptModel.length<150)s.gptModel=v.gptModel;
    if(typeof v.scale==='number'&&Number.isFinite(v.scale))s.scale=Math.max(.3,Math.min(.85,v.scale));
    if(typeof v.wander==='boolean')s.wander=v.wander;
    if(typeof v.reducedMotion==='boolean')s.reducedMotion=v.reducedMotion;
    if(typeof v.deepseekKey==='string'&&v.deepseekKey.trim()){
      if(v.deepseekKey.length>500||/\s/.test(v.deepseekKey.trim()))throw new Error('API Key 格式不正确');
      const secrets=store.secrets();secrets.deepseekKey=v.deepseekKey.trim();store.saveSecrets(secrets);
    }
    if(v.clearDeepseekKey){const secrets=store.secrets();delete secrets.deepseekKey;store.saveSecrets(secrets);}
    store.write('settings',s);
    for(const [id,p]of windows){movePet(p.pet,...p.pet.getPosition());notify(id,'pet-state',{settings:s});}
    return publicSettings();
  });
  handle('login',()=>auth.signIn());
  handle('logout',()=>{for(const [id,c]of active)if(id==='gpt')c.abort();return auth.signOut();});
  handle('models',()=>auth.models());
  const idle=o=>{if(o.type!=='chat')throw new Error('这位小伙伴的对话保存在官方网页中');if(active.has(o.id))throw new Error('请先停止当前回答');};
  handle('history',o=>WEB.includes(o.id)?[]:sessions.messages(o.id));
  handle('sessions',o=>{if(o.type!=='chat')throw new Error('这位小伙伴的对话保存在官方网页中');return sessions.overview(o.id);});
  handle('session-new',o=>{idle(o);sessions.create(o.id);return {sessions:sessions.overview(o.id),history:[]};});
  handle('session-open',(o,key)=>{idle(o);sessions.open(o.id,key);return {sessions:sessions.overview(o.id),history:sessions.messages(o.id)};});
  handle('session-rename',(o,v)=>{if(o.type!=='chat')throw new Error('这位小伙伴的对话保存在官方网页中');sessions.rename(o.id,v?.id,v?.title);return sessions.overview(o.id);});
  handle('session-delete',(o,key)=>{idle(o);sessions.remove(o.id,key);return {sessions:sessions.overview(o.id),history:sessions.messages(o.id)};});
  handle('send',async(o,value)=>{
    if(WEB.includes(o.id))throw new Error('已改用官方网页，请在官方输入框发送消息。');
    if(active.has(o.id))throw new Error('正在回答，请稍等或先停止');
    const message=validateMessage(value),session=sessions.current(o.id),history=sessions.messages(o.id,session); const controller=new AbortController();active.set(o.id,controller);
    notify(o.id,'pet-state',{thinking:true});
    const emit=data=>notify(o.id,'chat-event',data);
    // Do not keep IPC invocation open for the duration of a stream.
    (async()=>{
      try{
        const result=await chat({id:o.id,messages:trimHistory([...history,message]),settings:settings(),key:store.secrets().deepseekKey,auth,signal:controller.signal,emit});
        if(controller.signal.aborted)throw new Error('已停止回答');
        const answer={role:'assistant',text:result.text,sources:result.sources};
        sessions.save(o.id,session,[...history,message,answer]);emit({type:'done',...result,sessions:sessions.overview(o.id)});notify(o.id,'pet-action','answered');
      }catch(error){emit({type:'error',message:controller.signal.aborted?'已停止回答':error.name==='TimeoutError'?'连接超时，请稍后重试':error.message==='fetch failed'?'网络连接失败，请检查网络或系统代理':error.message});}
      finally{active.delete(o.id);notify(o.id,'pet-state',{thinking:false});}
    })(); return {started:true};
  });
  handle('stop',o=>active.get(o.id)?.abort());
  handle('choose-images',async(o)=>{const r=await dialog.showOpenDialog(windows.get(o.id).chat,{properties:['openFile','multiSelections'],filters:[{name:'图片',extensions:['png','jpg','jpeg','webp']}]});if(r.canceled)return [];if(r.filePaths.length>4)throw new Error('最多选择 4 张图片');return r.filePaths.map(imageData);});
  handle('clipboard-image',()=>{let img=clipboard.readImage();if(img.isEmpty())return null;const s=img.getSize(),factor=Math.min(1,2048/Math.max(s.width,s.height));return img.resize({width:Math.round(s.width*factor),height:Math.round(s.height*factor)}).toDataURL();});
  handle('open-link',(_o,url)=>{const safe=safeURL(url);if(!safe)throw new Error('链接不安全');return shell.openExternal(safe);});
  handle('action',(o,a)=>{if(a==='close-chat')windows.get(o.id)?.chat?.hide();if(a==='minimize')windows.get(o.id)?.chat?.minimize();if(a==='menu')petMenu(o.id);});
  ipcMain.on('hit-test',(e,hit)=>{const o=owner(e);if(o.type==='pet'&&!drags.has(o.id))windows.get(o.id)?.pet.setIgnoreMouseEvents(!hit,{forward:true});});
  ipcMain.on('chat-open',e=>openChat(owner(e).id));ipcMain.on('pet-menu',e=>petMenu(owner(e).id));
  ipcMain.on('drag-start',e=>{const o=owner(e);if(o.type!=='pet'||drags.has(o.id))return;const w=windows.get(o.id).pet,point=screen.getCursorScreenPoint(),[x,y]=w.getPosition();const timer=setInterval(()=>{if(w.isDestroyed())return;const p=screen.getCursorScreenPoint();movePet(w,x+p.x-point.x,y+p.y-point.y);},16);drags.set(o.id,{timer});w.setIgnoreMouseEvents(false);});
  ipcMain.on('drag-end',e=>{const o=owner(e);clearInterval(drags.get(o.id)?.timer);drags.delete(o.id);});
  ipcMain.on('wander',(e,dx)=>{const o=owner(e);if(o.type!=='pet'||!settings().wander||drags.has(o.id)||active.has(o.id)||!Number.isFinite(dx))return;const w=windows.get(o.id)?.pet;if(w){const [x,y]=w.getPosition();const result=movePet(w,x+Math.max(-3,Math.min(3,dx)),y);if(result.edge)notify(o.id,'pet-state',{edge:true});}});
}
if(!app.requestSingleInstanceLock()&&!TEST){app.quit();}else{
  app.on('second-instance',(_e,args)=>{if(args.includes('--quit-for-update')){app.quit();return;}const id=args.find(a=>a.startsWith('--pet='))?.slice(6);if(PETS.includes(id))spawn(id);else PETS.forEach(spawn);const chatId=args.find(a=>a.startsWith('--open-chat='))?.slice(12);if(PETS.includes(chatId))openChat(chatId);});
  app.whenReady().then(()=>{
    store=new Storage(app.getPath('userData'),safeStorage);
    const previous=store.read('settings');
    if(previous.animationVersion!==2)store.write('settings',{...previous,scale:.5,animationVersion:2});
    auth=new ChatGPTAuth(store,url=>shell.openExternal(url));sessions=new Sessions(store);installIPC();
    tray=new Tray(nativeImage.createFromPath(path.join(ROOT,'assets','gpt.ico')));tray.setToolTip('Deskbot · 三位桌面小伙伴');
    tray.setContextMenu(Menu.buildFromTemplate([...PETS.map(id=>({label:'召唤 '+labels[id],click:()=>spawn(id)})),{label:'召唤全部',click:()=>PETS.forEach(spawn)},{label:'全部归位',click:()=>{for(const[id,p]of windows)p.pet.setBounds(homeBounds(id));}},{type:'separator'},{label:'退出 Deskbot',click:()=>app.quit()}]));
    tray.on('double-click',()=>PETS.forEach(spawn));
    const id=process.argv.find(a=>a.startsWith('--pet='))?.slice(6);if(PETS.includes(id))spawn(id);else PETS.forEach(spawn);
    const chatId=process.argv.find(a=>a.startsWith('--open-chat='))?.slice(12);if(PETS.includes(chatId))openChat(chatId);
    screen.on('display-removed',()=>{for(const[id,p]of windows)p.pet.setBounds(homeBounds(id));});
  });
  app.on('before-quit',()=>{app.quitting=true;for(const c of active.values())c.abort();for(const d of drags.values())clearInterval(d.timer);});
  app.on('window-all-closed',()=>{});
}
