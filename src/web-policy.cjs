// One entry per companion that talks through its vendor's own website.
const SIGN_IN=['accounts.google.com','login.microsoftonline.com','login.live.com','appleid.apple.com'];
const PROVIDERS={
 gpt:{name:'ChatGPT',home:'https://chatgpt.com/',hosts:['chatgpt.com','chat.openai.com'],auth:['auth.openai.com','auth0.openai.com',...SIGN_IN],partition:'chatgpt-web',
  unstyled:/^\/(auth|api|cdn-cgi)(\/|$)/,composer:'#prompt-textarea,#mobile-composer-prompt,#desktop-composer-prompt',
  busy:'[data-testid=stop-button],[aria-label="停止生成"],[aria-label="Stop generating"],[aria-label="停止流式传输"],[aria-label="Stop streaming"]',
  sidebar:'button[aria-label="关闭边栏"],button[aria-label="Close sidebar"]',hint:'使用普通 Chat；Work 的用量规则不同。'},
 claude:{name:'Claude',home:'https://claude.ai/new',hosts:['claude.ai'],auth:SIGN_IN,partition:'claude-web',
  unstyled:/^\/(login|logout|oauth|magic-link|sso|api|cdn-cgi|onboarding|verify|signup)(\/|$)/,composer:'[data-testid="chat-input"],div.ProseMirror[contenteditable="true"],fieldset [contenteditable="true"]',
  busy:'button[aria-label="Stop response"],button[aria-label="停止回复"],button[aria-label="停止响应"],[data-testid="stop-button"]',
  sidebar:null,hint:'对话与用量都记在你的 Claude 账号下。'},
 deepseek:{name:'DeepSeek',home:'https://chat.deepseek.com/',hosts:['chat.deepseek.com'],auth:SIGN_IN,partition:'deepseek-web',
  unstyled:/^\/(sign_in|sign_up|signin|signup|login|logout|auth|oauth|api|cdn-cgi|verify)(\/|$)/,composer:'textarea,[contenteditable="true"][role="textbox"]',
  busy:'button[aria-label="Stop generating"],button[aria-label="停止生成"],button[aria-label="Stop response"],button[aria-label="停止回复"],[data-testid="stop-button"]',
  sidebar:null,hint:'使用 DeepSeek 官网账号聊天，历史与模型由官网管理。'}
};
const HOME=PROVIDERS.gpt.home;
function classify(raw,id='gpt'){
 const provider=PROVIDERS[id];
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port)return 'blocked';
  if(provider.hosts.includes(u.hostname))return 'chat';
  if(provider.auth.includes(u.hostname))return 'auth';
  return 'external';
 }catch{return 'blocked';}
}
function canStyle(raw,id='gpt'){try{const u=new URL(raw);return u.hostname===PROVIDERS[id].hosts[0]&&classify(raw,id)==='chat'&&!PROVIDERS[id].unstyled.test(u.pathname);}catch{return false;}}
module.exports={HOME,PROVIDERS,classify,canStyle};
