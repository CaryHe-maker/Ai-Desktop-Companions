// Whole-character drawings only: crop/align generated sheets, never split limbs.
const fs=require('node:fs'),sharp=require('sharp');
async function cells(file){
 const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const cut=axis=>{const size=axis?info.height:info.width,other=axis?info.width:info.height;let best=Math.round(size/2),score=Infinity;
  for(let p=Math.round(size*.43);p<size*.57;p++){let n=0;for(let q=0;q<other;q++)if(data[((axis?p:q)*info.width+(axis?q:p))*4+3]>80)n++;if(n<score){best=p;score=n;}}return [0,best,size];};
 const xs=cut(0),ys=cut(1),out=[];
 for(let i=0;i<4;i++){const x0=xs[i%2],x1=xs[i%2+1],y0=ys[Math.floor(i/2)],y1=ys[Math.floor(i/2)+1];let l=x1,r=-1,t=y1,b=-1;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(data[(y*info.width+x)*4+3]>60){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
  if(r<l)throw Error('Empty generated cell');out.push({file,box:{left:l,top:t,width:r-l+1,height:b-t+1}});
 }return out;
}
async function render(cell,scale){const {file,box}=cell,width=Math.round(box.width*scale),height=Math.round(box.height*scale);
 const sprite=await sharp(file).extract(box).resize(width,height).png().toBuffer();
 return sharp({create:{width:512,height:512,channels:4,background:'#00000000'}}).composite([{input:sprite,left:Math.round((512-width)/2),top:488-height}]).png().toBuffer();
}
async function main(){
 const manifest=JSON.parse(fs.readFileSync('assets/v5/manifest.json','utf8'));
 for(const id of ['gpt','deepseek']){
  const raw=await cells(`assets/source/v6/${id}-keys.png`),keys=[raw[0],raw[3],raw[2],raw[1]];
  if(process.argv.includes('--references')){
   const scale=Math.min(448/Math.max(...keys.map(c=>c.box.height)),460/Math.max(...keys.map(c=>c.box.width)));
   const c=await Promise.all(keys.map(async(k,i)=>({input:await render(k,scale),left:i%2*512,top:Math.floor(i/2)*512})));
   await sharp({create:{width:1024,height:1024,channels:4,background:'#00000000'}}).composite(c).png().toFile(`assets/source/v6/${id}-ordered.png`);continue;
  }
  const inserts=await cells(`assets/source/v6/${id}-between.png`),all=keys.flatMap((k,i)=>[k,inserts[i]]);
  fs.mkdirSync(`assets/v6/${id}`,{recursive:true});const c=manifest.characters[id];
  for(let i=0;i<8;i++){
   const celScale=Math.min(448/all[i].box.height,460/all[i].box.width);
   await sharp(await render(all[i],celScale)).webp({lossless:true}).toFile(`assets/v6/${id}/m${i}.webp`);
   c.files[`m${i}`]=`../assets/v6/${id}/m${i}.webp`;
   // Old optical-flow frames contain the old one-leg pose; do not mix them in.
   c.pairs[`m${i}-m${(i+1)%8}`]=0;
  }
  c.pairs['b0-m0']=0;
 }
 if(process.argv.includes('--references'))return;
 manifest.version=6;fs.writeFileSync('assets/v6/manifest.json',JSON.stringify(manifest,null,2));
 fs.writeFileSync('src/animation-assets.js','window.ANIMATION_ASSETS = '+JSON.stringify(manifest)+';\n');
 console.log('Prepared 8 whole-character walking frames each for GPT and DeepSeek; Claude and entrances preserved.');
}
main().catch(e=>{console.error(e);process.exit(1);});
