const {WebContentsView,Menu,shell,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {PROVIDERS,classify,canStyle}=require('./web-policy.cjs');
// The official page is shown inside the card drawn by web-chat.html; keep these in step with web-chat.css.
const FRAME={left:9,top:59,right:9,bottom:9,radius:13};
const PAPER={gpt:'#fbf9fd',claude:'#fdfaf5'};
function attachOfficialChat(win,{id='gpt',test=false,zoom=1,logFile=null,previousAgent=null,onAgent=()=>{},onState=()=>{},onZoom=()=>{},onSettings=()=>{}}={}){
 // Navigation diary for troubleshooting: where the page went and how the server answered. Paths only, never queries, cookies or content.
 const note=(...parts)=>{if(!logFile)return;try{if(fs.existsSync(logFile)&&fs.statSync(logFile).size>400000)fs.renameSync(logFile,logFile+'.old');fs.appendFileSync(logFile,new Date().toISOString()+' '+id+' '+parts.join(' ')+'\n');}catch{}};
 const brief=url=>{try{const u=new URL(url);return u.origin+u.pathname;}catch{return String(url).slice(0,80);}};
 const provider=PROVIDERS[id],partition='persist:'+provider.partition+(test?'-test':'');
 const view=new WebContentsView({webPreferences:{partition,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,spellcheck:true}});
 const wc=view.webContents,popups=new Set();let compact=true,settings=false,cssKey=null,revision=0,closed=false,painted=false,failed=false;
 let status={loading:true,ready:false,busy:false,compact:true,error:false,canGoBack:false,origin:new URL(provider.home).origin,message:`正在打开官方 ${provider.name}…`};
 const css=fs.readFileSync(path.join(__dirname,`official-${id}.css`),'utf8');
 // Present as the Chromium browser this is; the default token advertises the app name instead.
 // Set on the session too, so sign-in pop-ups and workers report the same browser as the page.
 const agent=wc.getUserAgent().replace(/\s(Electron|deskbot-companions)\/\S+/g,'');wc.session.setUserAgent(agent);wc.setUserAgent(agent);
 win.contentView.addChildView(view);view.setBackgroundColor(PAPER[id]);view.setBorderRadius?.(FRAME.radius);
 const layout=()=>{if(closed)return;const [width,height]=win.getContentSize();view.setBounds({x:FRAME.left,y:FRAME.top,width:Math.max(1,width-FRAME.left-FRAME.right),height:Math.max(1,height-FRAME.top-FRAME.bottom)});view.setVisible(painted&&!failed&&!settings);};
 const report=patch=>{status={...status,...patch,canGoBack:!wc.isDestroyed()&&wc.navigationHistory.canGoBack()};if(!win.isDestroyed())win.webContents.send('web-status',status);};
 async function style(){
  const current=++revision;
  if(closed)return;
  // A visible composer proves this is a chat surface rather than authentication.
  const chatSurface=compact&&canStyle(wc.getURL(),id)&&await wc.executeJavaScript(`!!document.querySelector(${JSON.stringify(provider.composer)}) && ![...document.querySelectorAll("input[type=password],input[type=email],input[autocomplete=username]")].some(e=>e.getClientRects().length && getComputedStyle(e).visibility!=="hidden" && !e.closest("[inert],[aria-hidden=true]"))`).catch(()=>false);
  if(current!==revision||closed)return;
  if(!chatSurface){if(cssKey){const key=cssKey;cssKey=null;await wc.removeInsertedCSS(key).catch(()=>{});}return;}
  if(cssKey)return;
  // Close the official sidebar via its own control, so its backdrop is also dismissed.
  if(provider.sidebar)await wc.executeJavaScript(`[...document.querySelectorAll(${JSON.stringify(provider.sidebar)})].find(e=>e.getClientRects().length && !e.closest("[inert],[aria-hidden=true]"))?.click()`).catch(()=>{});
  if(current!==revision||closed)return;
  const key=await wc.insertCSS(css).catch(()=>null);if(current===revision)cssKey=key;else if(key)wc.removeInsertedCSS(key).catch(()=>{});
 }
 async function external(url){if(classify(url,id)==='blocked')return;const r=await dialog.showMessageBox(win,{type:'question',message:'在默认浏览器打开此链接？',detail:new URL(url).origin,buttons:['打开','取消'],defaultId:0,cancelId:1});if(r.response===0)await shell.openExternal(url);}
 const safePrefs={sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,partition};
 function secureRemote(contents){
  const navigate=(event,url)=>{const kind=classify(url,id);if(kind==='blocked'||kind==='external'){event.preventDefault();if(kind==='external')external(url).catch(()=>{});}};
  contents.on('will-navigate',navigate);contents.on('will-redirect',navigate);
  contents.setWindowOpenHandler(({url})=>{
   const kind=classify(url,id);
   if(kind==='chat'||kind==='auth')return {action:'allow',overrideBrowserWindowOptions:{width:560,height:740,parent:win,autoHideMenuBar:true,webPreferences:safePrefs}};
   if(kind==='external')external(url).catch(()=>{});return {action:'deny'};
  });
  contents.on('did-create-window',popup=>{popups.add(popup);popup.on('closed',()=>popups.delete(popup));secureRemote(popup.webContents);});
 }
 secureRemote(wc);
 note('open','agent',JSON.stringify(wc.getUserAgent()));
 wc.on('did-navigate',(_e,url,code)=>note('navigate',code,brief(url)));
 wc.on('did-redirect-navigation',details=>{if(details.isMainFrame)note('redirect',brief(details.url));});
 wc.on('did-fail-load',(_e,code,description,url,isMain)=>note('fail',isMain?'main':'sub',code,description,brief(url)));
 wc.on('page-title-updated',(_e,title)=>note('title',JSON.stringify(title.slice(0,60))));
 wc.on('did-stop-loading',()=>note('loaded',brief(wc.getURL())));
 wc.on('render-process-gone',(_e,details)=>note('gone',details.reason));
 wc.on('console-message',details=>{if(details.level==='error'&&/challenge|turnstile|cf-|403|blocked|CSP|sentinel/i.test(details.message))note('console',JSON.stringify(details.message.slice(0,220)));});
 wc.session.webRequest.onCompleted({urls:['https://*/*']},details=>{if(details.statusCode>=400&&(details.resourceType==='mainFrame'||details.resourceType==='subFrame'||details.resourceType==='xhr'))note('http',details.statusCode,details.resourceType,details.method,brief(details.url));});
 wc.session.webRequest.onErrorOccurred({urls:['https://*/*']},details=>{if(details.error!=='net::ERR_ABORTED')note('neterror',details.error,details.resourceType,brief(details.url));});
 wc.session.setPermissionRequestHandler((_contents,permission,callback)=>callback(permission==='clipboard-sanitized-write'));
 wc.session.setPermissionCheckHandler((_contents,permission)=>permission==='clipboard-sanitized-write');
 wc.on('did-start-loading',()=>report({loading:true,error:false,message:'正在加载官方页面…'}));
 wc.on('did-start-navigation',details=>{if(details.isMainFrame&&!details.isSameDocument&&failed){failed=false;layout();}});
 wc.on('did-navigate',(_e,url)=>{
  cssKey=null;revision++;
  report({origin:new URL(url).origin,message:canStyle(url,id)?provider.hint:'请在官方页面完成登录；登录状态将保存在本机。'});
 });
 wc.on('did-navigate-in-page',(_e,url)=>{if(canStyle(url,id))report({message:provider.hint});style();});
 // Reveal the page only once it has something to show, already restyled, so the card never flashes white.
 wc.on('dom-ready',async()=>{wc.setZoomFactor(zoom);await style();if(closed)return;painted=true;layout();report({ready:true});});
 wc.on('did-stop-loading',()=>{report({loading:false});style();});
 wc.on('did-fail-load',(_e,code,_description,_url,isMain)=>{if(isMain&&code!==-3){failed=true;layout();report({loading:false,error:true,message:'官方页面未能加载。'});}});
 wc.on('render-process-gone',()=>{failed=true;layout();report({loading:false,error:true,message:'网页进程已退出。'});});
 // Only observe whether the official stop-generation button exists; no message extraction.
 const tick=setInterval(async()=>{
  if(closed||wc.isLoading()||!canStyle(wc.getURL(),id))return;
  await style();
  const value=await wc.executeJavaScript(`!!document.querySelector(${JSON.stringify(provider.busy)})`).catch(()=>false);
  if(value!==status.busy){report({busy:value});onState(value);}
 },1200);
 win.on('resize',layout);layout();
 win.on('closed',()=>{closed=true;revision++;clearInterval(tick);for(const p of popups)if(!p.isDestroyed())p.destroy();if(!wc.isDestroyed())wc.close();});
 function menu(){
  Menu.buildFromTemplate([
   {label:'精简外观（收起侧栏，换上小屋配色）',type:'checkbox',checked:compact,click:()=>action('compact')},
   {label:'文字大小',submenu:[.8,.9,1,1.1,1.25].map(z=>({label:Math.round(z*100)+'%',type:'radio',checked:Math.abs(z-zoom)<.01,click:()=>{zoom=z;wc.setZoomFactor(z);onZoom(z);}}))},
   {type:'separator'},
   {label:'返回上一页',enabled:wc.navigationHistory.canGoBack(),click:()=>action('back')},
   {label:'在浏览器中打开当前页面 ↗',click:()=>action('browser')},
   {label:'修复连接（清除验证缓存，保留登录）',click:()=>action('repair')},
   {type:'separator'},
   {label:'小屋设置',click:()=>onSettings()}
  ]).popup({window:win});
 }
 async function action(name){
  if(name==='status')return status;
  if(name==='reload'){if(failed)await wc.loadURL(classify(wc.getURL(),id)==='chat'?wc.getURL():provider.home).catch(()=>{});else wc.reload();return status;}
  if(name==='new'){await wc.loadURL(provider.home).catch(()=>{});return status;}
  if(name==='back'){if(wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();return status;}
  if(name==='compact'){compact=!compact;await style();report({compact});return status;}
  if(name==='menu'){menu();return status;}
  if(name==='repair'){await forgetVerification();await wc.session.clearCache().catch(()=>{});await wc.loadURL(provider.home).catch(()=>{});return status;}
  if(name==='settings-open'||name==='settings-close'){settings=name==='settings-open';layout();return status;}
  if(name==='browser'){const url=classify(wc.getURL(),id)==='chat'?wc.getURL():provider.home;await shell.openExternal(url);return status;}
  throw new Error('未知网页操作');
 }
 // Cloudflare ties its "already verified" cookies to the exact browser signature. Ones saved under a
 // different signature are refused and re-challenged forever, so drop those (and only those: the
 // sign-in cookies stay) whenever the signature has changed, or when the user asks for a repair.
 async function forgetVerification(){
  const all=await wc.session.cookies.get({});let removed=0;
  for(const c of all)if(/^(cf_clearance|__cf_bm|_cfuvid|__cflb|cf_chl_.*|__cfwaitingroom|__cfruid)$/.test(c.name)){await wc.session.cookies.remove(`https://${c.domain.replace(/^\./,'')}${c.path}`,c.name).catch(()=>{});removed++;}
  await wc.session.cookies.flushStore().catch(()=>{});note('forgot',removed,'verification cookies');return removed;
 }
 const ready=(async()=>{if(agent!==previousAgent){await forgetVerification().catch(()=>{});onAgent(agent);}})();
 if(!test)ready.then(()=>wc.loadURL(provider.home).catch(()=>{}));
 return {action,view};
}
module.exports={attachOfficialChat,FRAME};
