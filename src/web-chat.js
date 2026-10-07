const id=new URLSearchParams(location.search).get('pet')||'gpt',char=CHARACTERS[id],api=window.deskbot,$=s=>document.querySelector(s);
const site={gpt:'ChatGPT',claude:'Claude',deepseek:'DeepSeek'}[id];
document.body.dataset.pet=id;document.title=`${char.name} · 官方聊天`;
$('#avatar').src=`../assets/${id}-icon.png`;$('#veil-pet').src=`../assets/${id}/pose-2.png`;
$('#title').textContent=`${char.name} · ${char.title}`;$('#settings-title').textContent=char.home+'设置';
$('#about-title').textContent=`官方 ${site} 网页`;
$('#about-1').textContent=id==='gpt'?'直接在官方页面登录、发送文字和图片、使用搜索，消耗的是你 ChatGPT 账号自己的额度。请选择普通 Chat 模式；切换到 Work 会采用不同的用量规则。':`直接在官方 ${id==='deepseek'?'chat.deepseek.com':'claude.ai'} 页面登录并聊天，使用你自己的 ${site} 账号；模型、附件、联网及历史等功能以官方网页为准。`;
let settingsOpen=false;
function status(v){
 const text=v.busy?`${char.name} 正在回复…`:v.loading&&v.ready?'正在加载…':v.message;
 $('#web-message').textContent=text;$('#web-message').title=`${v.origin} · ${v.message}`;
 document.body.classList.toggle('busy',!!v.busy);document.body.classList.toggle('offline',!!v.error);
 $('#progress').classList.toggle('on',!!v.loading&&!v.error);$('#back').disabled=!v.canGoBack;
 // The veil is only visible while the native page is hidden: first load, or a failure.
 $('#veil-title').textContent=v.error?'没能连上官方页面':char.subtitle;
 $('#veil-text').textContent=v.error?`${v.message}请检查网络或系统代理后重试，也可以先在浏览器里打开。`:`正在把 ${site} 请进${char.home}…`;
 $('#skeleton').hidden=!!v.error;$('#veil-actions').hidden=!v.error;
}
async function command(name){try{status(await api.invoke('web-action',name));}catch(e){$('#web-message').textContent=e.message;}}
document.querySelectorAll('[data-web]').forEach(b=>b.onclick=()=>command(b.dataset.web));
$('#close').onclick=()=>api.invoke('action','close-chat');$('#minimize').onclick=()=>api.invoke('action','minimize');
async function settings(open){settingsOpen=open;await command(open?'settings-open':'settings-close');$('#settings-panel').hidden=!open;}
$('#settings-close').onclick=()=>settings(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&settingsOpen)settings(false);});
$('#pet-size').oninput=()=>$('#size-value').textContent=$('#pet-size').value+'%';
$('#save-settings').onclick=async()=>{try{await api.invoke('save-settings',{scale:Number($('#pet-size').value)/100,wander:$('#wander').checked,reducedMotion:$('#reduce-motion').checked});$('#settings-status').textContent='已保存';}catch(e){$('#settings-status').textContent=e.message;}};
api.on('web-status',status);api.on('pet-action',a=>{if(a==='settings')settings(true);});
api.invoke('init').then(v=>{$('#pet-size').value=Math.round(v.settings.scale*100);$('#pet-size').oninput();$('#wander').checked=v.settings.wander;$('#reduce-motion').checked=v.settings.reducedMotion;return command('status');});
