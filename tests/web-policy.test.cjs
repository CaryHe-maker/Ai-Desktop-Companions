const test=require('node:test'),assert=require('node:assert/strict');
const {classify,canStyle}=require('../src/web-policy.cjs');
test('web chat allows official chat and known authentication, rejects privileged URLs',()=>{
 for(const url of ['file:///C:/secrets','javascript:alert(1)','http://chatgpt.com','https://a:b@chatgpt.com/','https://chatgpt.com:444/'])assert.equal(classify(url),'blocked');
 assert.equal(classify('https://chatgpt.com/c/123'),'chat');
 assert.equal(classify('https://accounts.google.com/signin'),'auth');
 assert.equal(classify('https://chatgpt.com.evil.example/'),'external');
});
test('DeepSeek uses only the official chat origin and leaves login/verification untouched',()=>{
 assert.equal(classify('https://chat.deepseek.com/','deepseek'),'chat');
 assert.equal(canStyle('https://chat.deepseek.com/','deepseek'),true);
 for(const url of ['https://chat.deepseek.com/sign_in','https://chat.deepseek.com/sign_up','https://chat.deepseek.com/cdn-cgi/challenge'])assert.equal(canStyle(url,'deepseek'),false);
 assert.equal(classify('https://chat.deepseek.com.evil.example/','deepseek'),'external');
 assert.equal(classify('file:///chat.deepseek.com/','deepseek'),'blocked');
});
test('sign-in and verification pages are excluded from cosmetic CSS',()=>{
 assert.equal(canStyle('https://chatgpt.com/c/123'),true);
 for(const url of ['https://auth.openai.com/','https://chatgpt.com/auth/login','https://chatgpt.com/cdn-cgi/challenge-platform','https://accounts.google.com/'])assert.equal(canStyle(url),false);
});
