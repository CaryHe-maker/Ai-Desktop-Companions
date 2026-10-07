const {test}=require('node:test');const assert=require('node:assert/strict');
const {validateMessage,responseInput,deepseekInput,sse,safeURL,trimHistory}=require('../src/core.cjs');
const {chat,webSearch}=require('../src/providers.cjs');
const image='data:image/png;base64,iVBORw0KGgo=';
test('validates message and attachment bounds before network access',()=>{
 assert.throws(()=>validateMessage({text:'',images:[]}));assert.throws(()=>validateMessage({text:'x',images:['file:///secret']}));assert.throws(()=>validateMessage({text:'x',images:Array(5).fill(image)}));
 assert.equal(validateMessage({text:' hi ',images:[image]}).text,'hi');assert.throws(()=>validateMessage({text:'x'.repeat(16001)}));
});
test('provider adapters retain image and conversation roles',()=>{
 const messages=[{role:'user',text:'describe',images:[image]},{role:'assistant',text:'a picture'},{role:'user',text:'more'}];
 assert.equal(responseInput(messages)[0].content[1].image_url,image);assert.equal(deepseekInput(messages)[0].content[1].image_url.url,image);assert.equal(responseInput(messages)[1].role,'assistant');
});
test('SSE decoder handles split UTF-8, CRLF and a trailing event',async()=>{
 const bytes=new TextEncoder().encode('data: {"text":"你好"}\r\n\r\ndata: {"done":true}');let i=0;
 const body=new ReadableStream({pull(c){if(i>=bytes.length)c.close();else c.enqueue(bytes.slice(i,i+=3));}});
 const events=[];for await(const e of sse({body}))events.push(e);assert.deepEqual(events,[{text:'你好'},{done:true}]);
});
test('Claude always returns exact local response, including image and web flags',async()=>{
 const original=global.fetch;global.fetch=()=>{throw new Error('No network allowed')};
 try{const events=[];const r=await chat({id:'claude',messages:[{role:'user',text:'分析图片',images:[image],web:true}],emit:e=>events.push(e)});assert.equal(r.text,'emmm你是不是在东八区');assert.equal(events[0].text,r.text);}finally{global.fetch=original;}
});
test('untrusted links cannot launch local files or scripts',()=>{assert.equal(safeURL('javascript:alert(1)'),null);assert.equal(safeURL('file:///C:/Windows'),null);assert.equal(safeURL('https://u:p@example.com'),null);assert.equal(safeURL('https://example.com'),'https://example.com/');});
test('history trim keeps complete recent exchanges',()=>{const h=Array.from({length:80},(_,i)=>({role:i%2?'assistant':'user',text:String(i)}));const out=trimHistory(h);assert.equal(out.length,40);assert.equal(out[0].role,'user');});
test('DeepSeek sends requested model and validates stream completion',async()=>{
 const original=global.fetch;let body;
 global.fetch=async(_url,o)=>{body=JSON.parse(o.body);return new Response('data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n');};
 try{const r=await chat({id:'deepseek',key:'test-only',messages:[{role:'user',text:'hi',images:[image]}],signal:new AbortController().signal,emit:()=>{}});assert.equal(r.text,'你好');assert.equal(body.model,'deepseek-flash');assert.equal(body.messages[1].content[1].image_url.url,image);
 global.fetch=async()=>new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n');await assert.rejects(chat({id:'deepseek',key:'test-only',messages:[{role:'user',text:'x'}],signal:new AbortController().signal,emit:()=>{}}),/中断/);
 }finally{global.fetch=original;}
});
test('ChatGPT uses plan OAuth, image inputs and explicit search only when enabled',async()=>{
 const original=global.fetch;let body,headers;
 global.fetch=async(_url,o)=>{body=JSON.parse(o.body);headers=o.headers;return new Response('data: {"type":"response.output_text.delta","delta":"answer"}\n\ndata: {"type":"response.completed","response":{"status":"completed"}}\n');};
 try{const r=await chat({id:'gpt',auth:{accessToken:async()=>'test-oauth'},settings:{gptModel:'account-model'},messages:[{role:'user',text:'hi',images:[image],web:true}],signal:new AbortController().signal,emit:()=>{}});assert.equal(r.text,'answer');assert.equal(headers.Authorization,'Bearer test-oauth');assert.equal(body.store,false);assert.equal(body.stream,true);assert.equal(body.tools[0].type,'web_search');assert.equal(body.input[0].content[1].type,'input_image');}finally{global.fetch=original;}
});
