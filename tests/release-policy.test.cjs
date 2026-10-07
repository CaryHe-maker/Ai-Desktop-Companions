const test=require('node:test'),assert=require('node:assert/strict');
const {ignorePackagePath:ignore}=require('../scripts/release-policy.cjs');
test('package admits runtime roots and excludes personal profiles and configuration',()=>{
 for(const p of ['/src/main.cjs','/assets/v5/gpt/w0.webp','/node_modules/jose/package.json','/package.json','/LICENSE'])assert.equal(ignore(p),false,p);
 for(const p of ['/.env','/.env.production','/.git/config','/.npmrc','/data/credentials.json','/dist/app/data/Partitions/Cookies','/assets/source/prompts.json','/assets/v2/gpt/base-00.png','/artifacts/test-data/settings.json','/src/.env','/src/secrets.json'])assert.equal(ignore(p),true,p);
 assert.equal(ignore(''),false);
});
