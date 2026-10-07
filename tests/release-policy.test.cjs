const test=require('node:test'),assert=require('node:assert/strict');
const {ignorePackagePath:ignore}=require('../scripts/build/release-policy.cjs');
test('package admits runtime roots and excludes personal profiles and configuration',()=>{
 for(const p of ['/src/main.cjs','/assets/v6/gpt/m0.webp','/node_modules/example/package.json','/package.json','/LICENSE'])assert.equal(ignore(p),false,p);
 for(const p of ['/.env','/.env.production','/.git/config','/.npmrc','/data/credentials.json','/dist/app/data/Partitions/Cookies','/assets/source/prompts.json','/assets/v2/gpt/base-00.png','/artifacts/test-data/settings.json','/src/.env','/src/secrets.json','/install.exe','/installer/Installer.cs','/scripts/windows/install.ps1'])assert.equal(ignore(p),true,p);
 assert.equal(ignore(''),false);
});
