const {test}=require('node:test');const assert=require('node:assert/strict');
const {ChatGPTAuth}=require('../src/auth.cjs');
function storeStub(){let secrets={},records={};return {secrets:()=>structuredClone(secrets),saveSecrets:s=>{secrets=structuredClone(s)},read:n=>records[n]||{},write:(n,v)=>{records[n]=v},host:()=>'urn:uuid:test-host'};}
test('official OAuth verifies nonce/signature and retains the issued client, never the bootstrap ID',async()=>{
 const jose=await import('jose'),{publicKey,privateKey}=await jose.generateKeyPair('RS256'),jwk=await jose.exportJWK(publicKey);jwk.kid='test-key';
 const realFetch=global.fetch;let authURL,exchanged;
 global.fetch=async(url,options)=>{
  if(String(url).startsWith('http://127.0.0.1:'))return realFetch(url,options);
  if(String(url).endsWith('/.well-known/openid-configuration'))return Response.json({issuer:'https://auth.openai.com',jwks_uri:'https://auth.openai.com/jwks'});
  if(String(url).endsWith('/jwks'))return Response.json({keys:[jwk]});
  if(String(url).endsWith('/oauth/token')){exchanged=new URLSearchParams(options.body);const token=await new jose.SignJWT({nonce:authURL.searchParams.get('nonce'),email:'test@example.com'}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer('https://auth.openai.com').setAudience('oaiapp_test').setSubject('subject-test').setExpirationTime('5m').sign(privateKey);return Response.json({id_token:token,access_token:'access-test',refresh_token:'refresh-test',scope:'openid chatgpt.tokens.use.direct',expires_in:3600});}
  throw new Error('Unexpected URL '+url);
 };
 const store=storeStub();let callbackResult;
 const auth=new ChatGPTAuth(store,async url=>{
  authURL=new URL(url);const callback=new URL(authURL.searchParams.get('redirect_uri'));callback.searchParams.set('state','wrong');let response=await realFetch(callback);assert.equal(response.status,400);
  callback.searchParams.set('state',authURL.searchParams.get('state'));callback.searchParams.set('code','test-code');callback.searchParams.set('client_id','oaiapp_test');callbackResult=realFetch(callback);
 });
 try{const result=await auth.signIn();assert.equal(result.email,'test@example.com');assert.equal((await callbackResult).status,200);assert.equal(exchanged.get('client_id'),'oaiapp_test');assert.equal(store.secrets().chatgpt.client_id,'oaiapp_test');assert.equal(authURL.searchParams.get('client_id'),'dynamic_agent_client');assert.equal(await auth.accessToken(),'access-test');}finally{global.fetch=realFetch;}
});
test('refresh is serialized and rotated refresh tokens saved atomically',async()=>{
 const original=global.fetch;const store=storeStub();store.saveSecrets({chatgpt:{access_token:'old',refresh_token:'refresh-old',client_id:'oaiapp_test',expires_at:0}});let calls=0;
 global.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,10));return Response.json({access_token:'new',refresh_token:'refresh-new',expires_in:3600});};
 try{const auth=new ChatGPTAuth(store,()=>{});assert.deepEqual(await Promise.all([auth.accessToken(),auth.accessToken()]),['new','new']);assert.equal(calls,1);assert.equal(store.secrets().chatgpt.refresh_token,'refresh-new');}finally{global.fetch=original;}
});
