const runtimeRoots=new Set(['src','assets','node_modules','package.json','LICENSE','ASSET_NOTICE.md']);
function ignorePackagePath(entry){
 const name=entry.replaceAll('\\','/').replace(/^\/+/,''),root=name.split('/')[0];
 if(!name)return false;
 if(!runtimeRoots.has(root))return true;
 if(/^assets\/(source|v2)(\/|$)/.test(name)||/^assets\/prompts[^/]*\.json$/.test(name))return true;
 return /(^|\/)(\.env(?:\.[^/]*)?|\.npmrc|credentials[^/]*\.json|secrets[^/]*\.json)$/.test(name);
}
module.exports={ignorePackagePath};
