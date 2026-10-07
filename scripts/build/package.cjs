const path=require('node:path');
(async()=>{
 const {packager}=await import('@electron/packager');
 const fn=packager||(await import('@electron/packager')).default;
 const out=await fn({dir:path.resolve('.'),name:'Deskbot',platform:'win32',arch:'x64',out:'.cache/staged',overwrite:true,icon:path.resolve('assets/gpt.ico'),
  download:{cacheRoot:path.resolve('.cache/electron')},
  ignore:require('./release-policy.cjs').ignorePackagePath,
  appCopyright:'Deskbot personal desktop companions',win32metadata:{CompanyName:'Deskbot',FileDescription:'Deskbot desktop companions',ProductName:'Deskbot'},
  prune:true
 });console.log(out);
})().catch(e=>{console.error(e);process.exit(1)});
