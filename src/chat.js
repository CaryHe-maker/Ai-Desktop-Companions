const id=new URLSearchParams(location.search).get('pet')||'gpt',char=CHARACTERS[id],api=window.deskbot;
const $=s=>document.querySelector(s);document.body.dataset.pet=id;
$('#avatar').src=`../assets/${id}-icon.png`;$('#avatar').alt=char.name;$('#eyebrow').textContent=`${char.name.toUpperCase()} / COMPANION`;
$('#title').textContent=char.title;$('#welcome-pet').src=`../assets/${id}/pose-2.png`;$('#welcome-pet').alt=char.name;
$('#welcome-title').textContent=id==='claude'?'翻开今天的这一页':id==='gpt'?'有一束月光，正在等你':'海风捎来一声，你好';$('#welcome-subtitle').textContent=char.subtitle;
let images=[],busy=false,web=false,settings={},pending=null,toastTimer,dragDepth=0,streamText='',sessions={current:null,list:[]};
const welcome=$('#welcome').cloneNode(true);
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),5500);}
function scroll(){const el=$('#messages');el.scrollTop=el.scrollHeight;}
function renderText(el,text){
 el.replaceChildren();
 // Render code fences and links without allowing any model-supplied HTML.
 const chunks=text.split(/(```[\s\S]*?```)/g);
 for(const chunk of chunks){if(chunk.startsWith('```')){const pre=document.createElement('pre'),code=document.createElement('code');code.textContent=chunk.slice(3,-3).replace(/^\w*\n/,'');pre.append(code);el.append(pre);continue;}
   const tokens=chunk.split(/(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g);
   for(const token of tokens){const m=token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);if(m){const a=document.createElement('a');a.textContent=m[1];a.href=m[2];a.addEventListener('click',e=>{e.preventDefault();api.invoke('open-link',m[2]).catch(e=>toast(e.message));});el.append(a);}else el.append(document.createTextNode(token));}
 }
}
function addSources(node,sources){node.querySelector('.sources')?.remove();if(!sources?.length)return;const box=document.createElement('div');box.className='sources';sources.forEach((source,index)=>{const b=document.createElement('button');b.textContent=`${index+1} · ${source.title||new URL(source.url).hostname}`;b.title=source.url;b.onclick=()=>api.invoke('open-link',source.url).catch(e=>toast(e.message));box.append(b);});node.append(box);}
function message(data){
 $('#welcome')?.remove();const node=document.createElement('article');node.className='message '+data.role;
 const label=document.createElement('div');label.className='message-label';
 if(data.role==='assistant'){const avatar=document.createElement('img');avatar.src=`../assets/${id}-icon.png`;avatar.alt='';label.append(avatar);}label.append(document.createTextNode(data.role==='user'?'YOU':char.name));node.append(label);
 const body=document.createElement('div');body.className='message-body';
 if(data.images?.length){const row=document.createElement('div');row.className='message-images';for(const url of data.images){const img=document.createElement('img');img.src=url;img.alt='已发送的图片';row.append(img);}body.append(row);}
 const content=document.createElement('div');content.className='message-text';renderText(content,data.text||'');body.append(content);node.append(body);addSources(node,data.sources);
 if(data.role==='assistant'&&data.text)addCopy(node,data.text);
 $('#messages').append(node);scroll();return node;
}
function addCopy(node,text){if(node.querySelector('.copy-button'))return;const b=document.createElement('button');b.className='copy-button';b.textContent='复制回复';b.onclick=()=>navigator.clipboard.writeText(text).then(()=>toast('已复制')).catch(()=>toast('复制失败，请选中文字复制'));node.append(b);}
function renderAttachments(){$('#attachments').replaceChildren();images.forEach((url,i)=>{const d=document.createElement('div');d.className='attachment';const img=document.createElement('img');img.src=url;img.alt=`待发送图片 ${i+1}`;const b=document.createElement('button');b.type='button';b.textContent='×';b.title='移除图片';b.onclick=()=>{images.splice(i,1);renderAttachments();};d.append(img,b);$('#attachments').append(d);});}
function addImages(items){if(images.length+items.length>4){toast('每次最多发送 4 张图片');return;}images.push(...items);renderAttachments();}
async function fileToImage(file){if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('支持 PNG、JPG、WebP 图片');if(file.size>12*1024*1024)throw new Error('单张图片不能超过 12MB');const bitmap=await createImageBitmap(file);const c=document.createElement('canvas'),scale=Math.min(1,2048/Math.max(bitmap.width,bitmap.height));c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);bitmap.close();return c.toDataURL('image/png');}
async function addFiles(files){try{if(files.length+images.length>4)throw new Error('每次最多发送 4 张图片');const result=await Promise.all([...files].map(fileToImage));addImages(result);}catch(e){toast(e.message);}}
function setBusy(value){busy=value;$('#send').hidden=value;$('#stop').hidden=!value;$('#new-chat').disabled=value;$('#session-new').disabled=value;$('#status').textContent=value?'正在把问题交给 '+char.name+'…':'';}
$('#composer').addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;const text=$('#prompt').value.trim();if(!text&&!images.length)return;
 const request={text,images:[...images],web};setBusy(true);message({role:'user',...request});pending=message({role:'assistant',text:''});pending.requestData=request;streamText='';
 const typing=document.createElement('div');typing.className='typing';typing.innerHTML='<i></i><i></i><i></i>';pending.querySelector('.message-text').append(typing);
 try{await api.invoke('send',request);$('#prompt').value='';images=[];renderAttachments();}catch(error){fail(error.message);}
});
function fail(text){if(pending){pending.classList.add('error');const body=pending.querySelector('.message-text');renderText(body,(streamText?streamText+'\n\n':'')+'未完成：'+text);const request=pending.requestData;const retry=document.createElement('button');retry.className='copy-button';retry.textContent='重新填入问题与图片';retry.onclick=()=>{if(request){$('#prompt').value=request.text;images=[...request.images];renderAttachments();$('#prompt').focus();}};pending.append(retry);}setBusy(false);$('#status').textContent=text;pending=null;}
api.on('chat-event',event=>{
 if(event.type==='status')$('#status').textContent=event.text;
 if(event.type==='delta'&&pending){streamText+=event.text;renderText(pending.querySelector('.message-text'),streamText);$('#status').textContent='正在回复…';scroll();}
 if(event.type==='sources'&&pending)addSources(pending,event.sources);
 if(event.type==='done'){if(event.sessions)setSessions(event.sessions);if(pending){renderText(pending.querySelector('.message-text'),event.text);addSources(pending,event.sources);addCopy(pending,event.text);}pending=null;setBusy(false);scroll();}
 if(event.type==='error')fail(event.message);
});
$('#stop').onclick=()=>api.invoke('stop');
$('#prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#composer').requestSubmit();}});
$('#attach').onclick=()=>api.invoke('choose-images').then(addImages).catch(e=>toast(e.message));
document.addEventListener('paste',e=>{if(e.target.closest('#settings-panel'))return;const files=[...e.clipboardData.items].filter(x=>x.kind==='file'&&x.type.startsWith('image/')).map(x=>x.getAsFile());if(files.length){e.preventDefault();addFiles(files);}});
document.addEventListener('dragenter',e=>{if(![...e.dataTransfer.types].includes('Files'))return;e.preventDefault();dragDepth++;$('#drop-overlay').hidden=false;});
document.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});
document.addEventListener('dragleave',e=>{e.preventDefault();if(--dragDepth<=0){dragDepth=0;$('#drop-overlay').hidden=true;}});
document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('#drop-overlay').hidden=true;addFiles(e.dataTransfer.files);});
$('#web').onclick=()=>{if(id==='claude'){toast('Claude 暂不连接模型，也不会联网，仍然回复固定内容');return;}web=!web;$('#web').setAttribute('aria-pressed',String(web));if(web&&id==='deepseek')toast('将搜索 Bing 网页摘要并附上来源，再交给 DeepSeek 回答');};
$('#close').onclick=()=>api.invoke('action','close-chat');$('#minimize').onclick=()=>api.invoke('action','minimize');
// Conversations: every one is kept; the picker switches between them or starts a blank page.
function when(time){const d=new Date(time),now=new Date(),minutes=Math.floor((now-d)/60000),pad=n=>String(n).padStart(2,'0'),clock=`${pad(d.getHours())}:${pad(d.getMinutes())}`;
 if(minutes<1)return '刚刚';if(minutes<60)return `${minutes} 分钟前`;
 const days=Math.round((new Date(now.getFullYear(),now.getMonth(),now.getDate())-new Date(d.getFullYear(),d.getMonth(),d.getDate()))/86400000);
 return days===0?`今天 ${clock}`:days===1?`昨天 ${clock}`:d.getFullYear()===now.getFullYear()?`${d.getMonth()+1}月${d.getDate()}日`:`${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;}
function showHistory(history){$('#messages').replaceChildren();if(history.length)for(const m of history)message(m);else $('#messages').append(welcome.cloneNode(true));$('#status').textContent='';}
function setSessions(value){sessions=value;const current=value.list.find(s=>s.id===value.current);$('#session-title').textContent=current?.count?current.title:'新的对话';renderSessions();}
function renderSessions(){
 const query=$('#session-filter').value.trim().toLowerCase(),saved=sessions.list.filter(s=>s.count),shown=saved.filter(s=>!query||(s.title+' '+s.preview).toLowerCase().includes(query));
 $('#session-list').replaceChildren(...shown.map(s=>{
  const row=document.createElement('div');row.className='session-row'+(s.id===sessions.current?' current':'');row.setAttribute('role','listitem');
  const open=document.createElement('button');open.className='session-open';open.title='继续这段对话';
  const title=document.createElement('strong');title.textContent=s.title;
  const preview=document.createElement('span');preview.className='session-preview';preview.textContent=s.preview||'（图片）';
  const meta=document.createElement('small');meta.textContent=`${when(s.updated)} · ${Math.ceil(s.count/2)} 轮`+(s.id===sessions.current?' · 当前':'');
  open.append(title,preview,meta);open.onclick=()=>openSession(s.id);
  const rename=document.createElement('button');rename.className='session-tool';rename.title='重命名';rename.textContent='✎';
  rename.onclick=()=>{const input=document.createElement('input');input.className='session-rename';input.maxLength=60;input.value=s.title;title.replaceWith(input);input.focus();input.select();
   let finished=false;const finish=async save=>{if(finished)return;finished=true;const value=input.value.trim();if(save&&value&&value!==s.title){try{setSessions(await api.invoke('session-rename',{id:s.id,title:value}));return;}catch(e){toast(e.message);}}renderSessions();};
   input.onclick=e=>e.stopPropagation();input.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();finish(true);}if(e.key==='Escape')finish(false);};input.onblur=()=>finish(true);};
  const remove=document.createElement('button');remove.className='session-tool danger';remove.title='删除这段对话';remove.textContent='×';
  remove.onclick=async()=>{if(!confirm(`删除“${s.title}”？删除后无法恢复。`))return;try{const r=await api.invoke('session-delete',s.id);if(s.id===sessions.current)showHistory(r.history);setSessions(r.sessions);toast('已删除这段对话');}catch(e){toast(e.message);}};
  row.append(open,rename,remove);return row;}));
 $('#session-empty').hidden=shown.length>0;$('#session-empty').textContent=saved.length?'没有找到匹配的对话。':'还没有保存的对话。发出第一条消息后，它会出现在这里。';
}
function sessionPanel(open){$('#session-panel').hidden=!open;if(open){$('#session-filter').value='';renderSessions();}}
async function openSession(key){try{if(key!==sessions.current){const r=await api.invoke('session-open',key);showHistory(r.history);setSessions(r.sessions);}sessionPanel(false);$('#prompt').focus();}catch(e){toast(e.message);}}
async function newSession(){try{const r=await api.invoke('session-new');showHistory(r.history);setSessions(r.sessions);sessionPanel(false);$('#prompt').focus();}catch(e){toast(e.message);}}
$('#new-chat').onclick=newSession;$('#session-new').onclick=newSession;
$('#session-toggle').onclick=()=>sessionPanel($('#session-panel').hidden);$('#session-close').onclick=()=>sessionPanel(false);
$('#session-filter').oninput=renderSessions;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#session-panel').hidden)sessionPanel(false);});
$('#messages').addEventListener('click',e=>{const b=e.target.closest('.suggestions button');if(!b)return;if(b===b.parentElement.lastElementChild)$('#attach').click();else{$('#prompt').value=b.textContent;$('#prompt').focus();}});
function populateSettings(s){settings=s;$('#connection').textContent=id==='gpt'?(s.chatgptEmail?'ChatGPT 会员已连接':'等待连接你的 ChatGPT 账号'):id==='deepseek'?(s.hasDeepseekKey?'V4.1 Flash · 已配置 API':'V4.1 Flash · 等待配置 API'):'本地陪伴 · 不连接模型';$('#mode-label').textContent=id==='claude'?'暖书陪伴模式':id==='deepseek'?'V4.1 FLASH':'CHATGPT PLAN';$('#account-label').textContent=s.chatgptEmail||'尚未连接账号';$('#key-status').textContent=s.hasDeepseekKey?'已安全保存密钥。留空即可继续使用。':'尚未配置密钥。';$('#pet-size').value=Math.round(s.scale*100);$('#size-value').textContent=Math.round(s.scale*100)+'%';$('#wander').checked=s.wander;$('#reduce-motion').checked=s.reducedMotion;if(s.gptModel&&!Array.from($('#gpt-model').options).some(o=>o.value===s.gptModel))$('#gpt-model').add(new Option(s.gptModel,s.gptModel));$('#gpt-model').value=s.gptModel||'';}
async function openSettings(){try{populateSettings(await api.invoke('settings'));$('#settings-panel').hidden=false;}catch(e){toast(e.message);}}
$('#settings-toggle').onclick=openSettings;$('#settings-close').onclick=()=>$('#settings-panel').hidden=true;
$('#gpt-settings').hidden=id!=='gpt';$('#deepseek-settings').hidden=id!=='deepseek';$('#claude-settings').hidden=id!=='claude';
$('#pet-size').oninput=()=>$('#size-value').textContent=$('#pet-size').value+'%';
$('#save-settings').onclick=async()=>{try{populateSettings(await api.invoke('save-settings',{gptModel:$('#gpt-model').value,deepseekKey:$('#api-key').value,scale:Number($('#pet-size').value)/100,wander:$('#wander').checked,reducedMotion:$('#reduce-motion').checked}));$('#api-key').value='';$('#settings-status').textContent='设置已保存。';toast('小屋设置已保存');}catch(e){$('#settings-status').textContent=e.message;}};
async function refreshModels(){const models=await api.invoke('models');if(!models.length)throw new Error('这个账号暂未返回可用模型');$('#gpt-model').replaceChildren(...models.map(m=>new Option(m.name,m.id)));if(models.some(m=>m.id===settings.gptModel))$('#gpt-model').value=settings.gptModel;await api.invoke('save-settings',{gptModel:$('#gpt-model').value});$('#settings-status').textContent='模型列表已更新。';}
$('#login').onclick=async()=>{$('#login').disabled=true;$('#settings-status').textContent='已打开官方登录页，请在浏览器里完成授权…';try{await api.invoke('login');populateSettings(await api.invoke('settings'));await refreshModels();$('#settings-status').textContent='账号已连接，可以开始聊天。';}catch(e){$('#settings-status').textContent=e.message;}finally{$('#login').disabled=false;}};
$('#models-refresh').onclick=async()=>{try{await refreshModels();}catch(e){$('#settings-status').textContent=e.message;}};
$('#logout').onclick=async()=>{try{const r=await api.invoke('logout');populateSettings(await api.invoke('settings'));$('#settings-status').textContent=r.revoked?'已退出连接。':'本地凭据已清除，远端撤销尚未确认。可在 ChatGPT 设置中断开应用。';}catch(e){$('#settings-status').textContent=e.message;}};
$('#remove-key').onclick=async()=>{try{populateSettings(await api.invoke('save-settings',{clearDeepseekKey:true}));$('#api-key').value='';toast('已删除密钥');}catch(e){toast(e.message);}};
$('#usage-link').onclick=()=>api.invoke('open-link','https://chatgpt.com/#settings');
api.on('pet-action',action=>{if(action==='settings')openSettings();});
api.invoke('init').then(data=>{populateSettings(data.settings);for(const m of data.history)message(m);setSessions(data.sessions);
 // With earlier conversations on file, start by asking which one to continue.
 if(data.sessions.list.some(s=>s.count))sessionPanel(true);}).catch(e=>toast(e.message));
