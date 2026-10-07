const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');
const ids = ['gpt', 'claude', 'deepseek'];
async function bounds(input) {
  const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let left=info.width,top=info.height,right=-1,bottom=-1;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>35){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(right<left)throw new Error('Empty animation frame');
  return {left,top,width:right-left+1,height:bottom-top+1};
}
async function normalize(input, dest, targetHeight) {
  const box=await bounds(input);
  // Registration aligns the soles and locks artwork height across the walk cycle.
  // This is offline atlas extraction, never runtime perspective scaling.
  const scale=Math.min(targetHeight/box.height,460/box.width);
  const width=Math.round(box.width*scale),height=Math.round(box.height*scale);
  const sprite=await sharp(input).extract(box).resize(width,height).png().toBuffer();
  await sharp({create:{width:512,height:512,channels:4,background:'#00000000'}})
    .composite([{input:sprite,left:Math.round((512-width)/2),top:488-height}]).png().toFile(dest);
  return {width,height,baseline:488,center:256};
}
(async()=>{
  const manifest={version:2,cellSize:512,baseline:488,visibleHeight:448,characters:{}};
  for(const id of ids){
    const out=path.join('assets','v2',id);fs.mkdirSync(out,{recursive:true});
    const anchors={gpt:{x:125,y:505,height:370},claude:{x:148,y:395,height:310},deepseek:{x:175,y:480,height:400}};
    const item={base:[],motion:[],entrance:[],entranceAnchor:anchors[id],stats:[]};
    for(let i=0;i<8;i++){
      const name=`base-${String(i).padStart(2,'0')}.png`;
      await normalize(`assets/${id}/pose-${i}.png`,path.join(out,name),448);item.base.push(name);
    }
    for(const kind of ['entrance','motion']){
      const source=`assets/source/v2/${id}-${kind}.png`,meta=await sharp(source).metadata();
      const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      // Discard near-transparent export noise before resampling the atlas.
      for(let p=0;p<data.length;p+=4)if(data[p+3]<=16)data.fill(0,p,p+4);
      const clean=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
      function divisions(axis){
        const length=axis==='x'?info.width:info.height,other=axis==='x'?info.height:info.width;
        const ink=Array.from({length},(_,p)=>{let n=0;for(let q=0;q<other;q++){const x=axis==='x'?p:q,y=axis==='x'?q:p;if(data[(y*info.width+x)*4+3]>80)n++;}return n;});
        return [0,...[1,2,3].map(i=>{const expected=Math.round(i*length/4);let best=expected;for(let p=expected-65;p<=expected+65;p++)if(ink[p]<ink[best]||(ink[p]===ink[best]&&Math.abs(p-expected)<Math.abs(best-expected)))best=p;return best;}),length];
      }
      const xs=divisions('x'),ys=divisions('y');
      for(let i=0;i<16;i++){
        const col=i%4,row=Math.floor(i/4);
        const cell=await sharp(clean).extract({left:xs[col],top:ys[row],width:xs[col+1]-xs[col],height:ys[row+1]-ys[row]}).png().toBuffer();
        const name=`${kind}-${String(i).padStart(2,'0')}.png`;
        if(kind==='motion')item.stats.push(await normalize(cell,path.join(out,name),448));
        else await sharp(cell).resize(512,512,{fit:'fill'}).png().toFile(path.join(out,name));
        item[kind].push(name);
      }
    }
    manifest.characters[id]=item;
    console.log(id, '40 registered frames prepared');
  }
  fs.writeFileSync('assets/v2/manifest.json',JSON.stringify(manifest,null,2));
  fs.writeFileSync('src/animation-assets.js','window.ANIMATION_ASSETS = '+JSON.stringify(manifest)+';\n');
})().catch(e=>{console.error(e);process.exit(1);});
