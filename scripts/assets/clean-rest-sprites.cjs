// Repair atlas extraction without redrawing the character: retain original RGBA
// pixels, clear neighboring-cell fragments, and keep the central silhouette.
const fs=require('node:fs'),sharp=require('sharp');
async function cleanRest(id){
 const {data,info}=await sharp(`assets/v3/${id}/b6.webp`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width,height}=info;
 // Claude's neighboring curls touch the character through antialiased pixels.
 // These seams follow the empty gap in the source cell rather than crop the
 // character's own lower hair curls or dress.
 if(id==='claude')for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const left=y<=300?115:y<340?115-(y-300)*.2:0;
  if(x<left||(x>=416&&y<317))data.fill(0,(y*width+x)*4,(y*width+x)*4+4);
 }
 const seen=new Uint8Array(width*height),groups=[];
 for(let k=0;k<seen.length;k++){
  if(seen[k]||!data[k*4+3])continue;
  const queue=[k];seen[k]=1;
  for(let i=0;i<queue.length;i++){
   const p=queue[i],x=p%width,y=Math.floor(p/width);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const nx=x+dx,ny=y+dy,n=ny*width+nx;
    if(nx>=0&&nx<width&&ny>=0&&ny<height&&!seen[n]&&data[n*4+3]){seen[n]=1;queue.push(n);}
   }
  }groups.push(queue);
 }
 groups.sort((a,b)=>b.length-a.length);
 for(const group of groups.slice(1))for(const p of group)data.fill(0,p*4,p*4+4);
 fs.mkdirSync(`assets/v6/${id}`,{recursive:true});
 await sharp(data,{raw:info}).webp({lossless:true}).toFile(`assets/v6/${id}/b6.webp`);
 return {kept:groups[0].length,removed:groups.slice(1).reduce((n,g)=>n+g.length,0)};
}
async function main(){
 const manifest=JSON.parse(fs.readFileSync('assets/v6/manifest.json','utf8'));
 for(const id of ['gpt','claude','deepseek']){
  console.log(id,await cleanRest(id));manifest.characters[id].files.b6=`../assets/v6/${id}/b6.webp`;
 }
 fs.writeFileSync('assets/v6/manifest.json',JSON.stringify(manifest,null,2));
 fs.writeFileSync('src/animation-assets.js','window.ANIMATION_ASSETS = '+JSON.stringify(manifest)+';\n');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exit(1);});
module.exports={cleanRest};
