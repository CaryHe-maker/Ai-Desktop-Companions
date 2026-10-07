const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('node:path');
const { Storage } = require('./storage.cjs');
const { PETS, validPet, safeURL } = require('./core.cjs');
const { geometry } = require('./pet-motion.js');
const { attachOfficialChat } = require('./web-chat.cjs');
const { raisePets, normalChat } = require('./window-layers.cjs');
const ROOT = path.join(__dirname, '..');
const TEST = process.env.DESKBOT_TEST === '1';
app.setPath('userData', path.join(app.isPackaged ? path.dirname(process.execPath) : ROOT, TEST ? 'artifacts/test-data' : 'data'));
app.setAppUserModelId('Deskbot.Companions');
const windows = new Map(), owners = new Map(), drags = new Map();
let store, tray;
const labels = { gpt: 'GPT · 月光', claude: 'Claude · 暖书', deepseek: 'DeepSeek · 海汐' };
const defaults = { scale: .5, wander: true, reducedMotion: false, animationVersion: 2, webZoom: {} };
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
  w.setAlwaysOnTop(true,'screen-saver'); w.setIgnoreMouseEvents(true,{forward:true});
  w.on('show',()=>raisePets(windows));
  w.loadFile(path.join(__dirname,'pet.html'),{query:{pet:id}});
  w.once('ready-to-show',()=>{w.showInactive();movePet(w,b.x,b.y);});
  w.on('closed',()=>{ clearInterval(drags.get(id)?.timer); drags.delete(id); const c=windows.get(id)?.chat; if(c&&!c.isDestroyed())c.destroy(); windows.delete(id); });
}
function openChat(id) {
  const pair = windows.get(id); if (!pair) return;
  if (pair.chat && !pair.chat.isDestroyed()) { pair.chat.show(); pair.chat.focus(); return; }
  const p=pair.pet.getBounds(), a=screen.getDisplayMatching(p).workArea;
  const width=Math.min(488,a.width),height=Math.min(748,a.height-24);
  // Chat is a normal independent window; only the desktop pet stays on top.
  const w=new BrowserWindow({ width,height,x:Math.round(Math.max(a.x,Math.min(p.x-width+95,a.x+a.width-width))),y:Math.round(Math.max(a.y+8,Math.min(p.y+80,a.y+a.height-height-8))),title:labels[id]+' · 聊天',frame:false,resizable:true,minWidth:360,minHeight:480,backgroundColor:({gpt:'#f4eefa',claude:'#f9f1e6'})[id]||'#f6fafc',show:false,alwaysOnTop:false,icon:path.join(ROOT,'assets',id+'.ico'),webPreferences:options() });
  pair.chat=w;configure(w,id,'webchat');
  normalChat(w,windows);
  // A native child view can defer ready-to-show; the trusted shell is ready independently.
  let shown=false;
  const showOnce=()=>{if(!shown&&!w.isDestroyed()){shown=true;w.show();}};
  w.webContents.once('did-finish-load',showOnce);
  pair.official=attachOfficialChat(w,{id,test:TEST,logFile:path.join(app.getPath('userData'),'web-chat.log'),previousAgent:store.read('web-agents')[id]||null,onAgent:agent=>store.write('web-agents',{...store.read('web-agents'),[id]:agent}),zoom:settings().webZoom?.[id]||1,
      onState:thinking=>{notify(id,'pet-state',{thinking});if(!thinking)notify(id,'pet-action','answered');},
      onZoom:zoom=>{const s=settings();s.webZoom={...s.webZoom,[id]:zoom};store.write('settings',s);},
      onSettings:()=>notify(id,'pet-action','settings')});
  w.loadFile(path.join(__dirname,'web-chat.html'),{query:{pet:id}});
  w.once('ready-to-show',showOnce);w.on('close',e=>{if(!app.quitting){e.preventDefault();w.hide();}});
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
function publicSettings() { const s=settings();return {scale:s.scale,wander:s.wander,reducedMotion:s.reducedMotion,webZoom:s.webZoom,animationVersion:s.animationVersion}; }
function installIPC() {
  const handle=(name,fn)=>ipcMain.handle(name,async(e,value)=>{const o=owner(e);return fn(o,value,e);});
  handle('init',o=>({id:o.id,settings:publicSettings(),debug:TEST}));
  handle('web-action',(o,name)=>{if(o.type!=='webchat')throw new Error('仅官方聊天窗口可执行此操作');return windows.get(o.id).official.action(name);});
  handle('settings',()=>publicSettings());
  handle('save-settings',(_o,v)=>{
    if(!v||typeof v!=='object')throw new Error('设置格式错误');
    const s=settings();
    if(typeof v.scale==='number'&&Number.isFinite(v.scale))s.scale=Math.max(.3,Math.min(.85,v.scale));
    if(typeof v.wander==='boolean')s.wander=v.wander;
    if(typeof v.reducedMotion==='boolean')s.reducedMotion=v.reducedMotion;
    store.write('settings',s);
    for(const [id,p]of windows){movePet(p.pet,...p.pet.getPosition());notify(id,'pet-state',{settings:publicSettings()});}
    return publicSettings();
  });
  handle('open-link',(_o,url)=>{const safe=safeURL(url);if(!safe)throw new Error('链接不安全');return shell.openExternal(safe);});
  handle('action',(o,a)=>{if(a==='close-chat')windows.get(o.id)?.chat?.hide();if(a==='minimize')windows.get(o.id)?.chat?.minimize();if(a==='menu')petMenu(o.id);});
  ipcMain.on('hit-test',(e,hit)=>{const o=owner(e);if(o.type==='pet'&&!drags.has(o.id))windows.get(o.id)?.pet.setIgnoreMouseEvents(!hit,{forward:true});});
  ipcMain.on('chat-open',e=>openChat(owner(e).id));ipcMain.on('pet-menu',e=>petMenu(owner(e).id));
  ipcMain.on('drag-start',e=>{const o=owner(e);if(o.type!=='pet'||drags.has(o.id))return;const w=windows.get(o.id).pet,point=screen.getCursorScreenPoint(),[x,y]=w.getPosition();const timer=setInterval(()=>{if(w.isDestroyed())return;const p=screen.getCursorScreenPoint();movePet(w,x+p.x-point.x,y+p.y-point.y);},16);drags.set(o.id,{timer});w.setIgnoreMouseEvents(false);});
  ipcMain.on('drag-end',e=>{const o=owner(e);clearInterval(drags.get(o.id)?.timer);drags.delete(o.id);});
  ipcMain.on('wander',(e,dx)=>{const o=owner(e);if(o.type!=='pet'||!settings().wander||drags.has(o.id)||!Number.isFinite(dx))return;const w=windows.get(o.id)?.pet;if(w){const [x,y]=w.getPosition();const result=movePet(w,x+Math.max(-3,Math.min(3,dx)),y);if(result.edge)notify(o.id,'pet-state',{edge:true});}});
}
if(!app.requestSingleInstanceLock()&&!TEST){app.quit();}else{
  app.on('second-instance',(_e,args)=>{if(args.includes('--quit-for-update')){app.quit();return;}const id=args.find(a=>a.startsWith('--pet='))?.slice(6);if(PETS.includes(id))spawn(id);else PETS.forEach(spawn);const chatId=args.find(a=>a.startsWith('--open-chat='))?.slice(12);if(PETS.includes(chatId))openChat(chatId);});
  app.whenReady().then(()=>{
    store=new Storage(app.getPath('userData'));
    const previous=store.read('settings');
    if(previous.animationVersion!==2)store.write('settings',{...previous,scale:.5,animationVersion:2});
    installIPC();
    tray=new Tray(nativeImage.createFromPath(path.join(ROOT,'assets','gpt.ico')));tray.setToolTip('Deskbot '+app.getVersion()+' · 三位桌面小伙伴');
    tray.setContextMenu(Menu.buildFromTemplate([...PETS.map(id=>({label:'召唤 '+labels[id],click:()=>spawn(id)})),{label:'召唤全部',click:()=>PETS.forEach(spawn)},{label:'全部归位',click:()=>{for(const[id,p]of windows)p.pet.setBounds(homeBounds(id));}},{type:'separator'},{label:'退出 Deskbot',click:()=>app.quit()}]));
    tray.on('double-click',()=>PETS.forEach(spawn));
    const id=process.argv.find(a=>a.startsWith('--pet='))?.slice(6);if(PETS.includes(id))spawn(id);else PETS.forEach(spawn);
    const chatId=process.argv.find(a=>a.startsWith('--open-chat='))?.slice(12);if(PETS.includes(chatId))openChat(chatId);
    screen.on('display-removed',()=>{for(const[id,p]of windows)p.pet.setBounds(homeBounds(id));});
  });
  app.on('before-quit',()=>{app.quitting=true;for(const d of drags.values())clearInterval(d.timer);});
  app.on('window-all-closed',()=>{});
}
