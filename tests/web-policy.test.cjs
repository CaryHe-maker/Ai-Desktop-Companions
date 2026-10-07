const test=require('node:test'),assert=require('node:assert/strict');
const {classify,canStyle}=require('../src/web-policy.cjs');
test('web chat allows official chat and known authentication, rejects privileged URLs',()=>{
 for(const url of ['file:///C:/secrets','javascript:alert(1)','http://chatgpt.com','https://a:b@chatgpt.com/','https://chatgpt.com:444/'])assert.equal(classify(url),'blocked');
 assert.equal(classify('https://chatgpt.com/c/123'),'chat');
 assert.equal(classify('https://accounts.google.com/signin'),'auth');
 assert.equal(classify('https://chatgpt.com.evil.example/'),'external');
});
test('sign-in and verification pages are excluded from cosmetic CSS',()=>{
 assert.equal(canStyle('https://chatgpt.com/c/123'),true);
 for(const url of ['https://auth.openai.com/','https://chatgpt.com/auth/login','https://chatgpt.com/cdn-cgi/challenge-platform','https://accounts.google.com/'])assert.equal(canStyle(url),false);
});
