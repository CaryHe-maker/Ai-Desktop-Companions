const test=require('node:test'),assert=require('node:assert/strict');
const {PETS,validPet,safeURL}=require('../src/core.cjs');
test('only the three supported companions can open local windows',()=>{
 for(const id of PETS)assert.equal(validPet(id),id);
 for(const id of ['other','../data',null])assert.throws(()=>validPet(id),/未知角色/);
});
test('untrusted links cannot launch local files or scripts',()=>{
 for(const url of ['javascript:alert(1)','file:///C:/Windows','https://u:p@example.com'])assert.equal(safeURL(url),null);
 assert.equal(safeURL('https://example.com'),'https://example.com/');
});
