// Crop and align whole painted characters; no limb rigs or generated leg transforms.
const fs = require('node:fs');
const sharp = require('sharp');
async function cells(file) {
  const {data, info} = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const split = axis => {
    const size = axis ? info.height : info.width, other = axis ? info.width : info.height;
    let best = Math.round(size/2), score = Infinity;
    for (let p=Math.round(size*.43); p<size*.57; p++) {
      let count=0;
      for (let q=0; q<other; q++) if (data[((axis?p:q)*info.width+(axis?q:p))*4+3]>80) count++;
      if(count<score) {best=p; score=count;}
    }
    return [0,best,size];
  };
  const xs=split(0), ys=split(1), result=[];
  for(let i=0; i<4; i++) {
    const x0=xs[i%2], x1=xs[i%2+1], y0=ys[Math.floor(i/2)], y1=ys[Math.floor(i/2)+1];
    // Extract the connected whole-character silhouette, excluding stray atlas islands.
    // Original RGB and alpha inside that silhouette are kept exactly.
    const width=x1-x0,height=y1-y0,labels=new Uint32Array(width*height),queue=new Int32Array(width*height);
    const alpha=p=>data[((y0+Math.floor(p/width))*info.width+x0+p%width)*4+3];
    let component=0,largest=0,largestSize=0;
    for(let p=0;p<labels.length;p++) {
      if(labels[p]||!alpha(p))continue;
      labels[p]=++component;queue[0]=p;let count=1;
      for(let q=0;q<count;q++) {
        const at=queue[q],x=at%width,y=Math.floor(at/width);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
          const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;
          const next=ny*width+nx;
          if(!labels[next]&&alpha(next)){labels[next]=component;queue[count++]=next;}
        }
      }
      if(count>largestSize){largest=component;largestSize=count;}
    }
    let l=width,r=-1,t=height,b=-1;const pixels=Buffer.alloc(width*height*4);
    for(let p=0;p<labels.length;p++)if(labels[p]===largest) {
      const x=p%width,y=Math.floor(p/width),offset=((y0+y)*info.width+x0+x)*4;
      data.copy(pixels,p*4,offset,offset+4);l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
    }
    if(r<l) throw Error('Empty painted cell');
    const box={left:l,top:t,width:r-l+1,height:b-t+1};
    const image=await sharp(pixels,{raw:{width,height,channels:4}}).extract(box).png().toBuffer();
    result.push({image,box});
  }
  return result;
}
async function main() {
  const all=[...await cells('assets/source/v7/gpt-left-phases.png'),...await cells('assets/source/v7/gpt-right-phases.png')];
  const scale=Math.min(448/Math.max(...all.map(c=>c.box.height)),460/Math.max(...all.map(c=>c.box.width)));
  const manifest=JSON.parse(fs.readFileSync('assets/v6/manifest.json','utf8'));
  const character=manifest.characters.gpt, previews=[];
  fs.mkdirSync('assets/v7/gpt',{recursive:true});
  for(const [i,{image:painted,box}] of all.entries()) {
    const width=Math.round(box.width*scale), height=Math.round(box.height*scale);
    const input=await sharp(painted).resize(width,height).png().toBuffer();
    const image=await sharp({create:{width:512,height:512,channels:4,background:'#00000000'}})
      .composite([{input,left:Math.round((512-width)/2),top:488-height}]).png().toBuffer();
    await sharp(image).webp({lossless:true}).toFile(`assets/v7/gpt/m${i}.webp`);
    character.files[`m${i}`]=`../assets/v7/gpt/m${i}.webp`;
    character.pairs[`m${i}-m${(i+1)%8}`]=0;
    previews.push({input:image,left:i%4*512,top:Math.floor(i/4)*512});
  }
  character.pairs['b0-m0']=0;
  manifest.version=7;
  fs.writeFileSync('assets/v7/manifest.json',JSON.stringify(manifest,null,2)+'\n');
  fs.writeFileSync('src/animation-assets.js','window.ANIMATION_ASSETS = '+JSON.stringify(manifest)+';\n');
  fs.mkdirSync('artifacts/animation-v7',{recursive:true});
  await sharp({create:{width:2048,height:1024,channels:4,background:'#00000000'}}).composite(previews)
    .png().toFile('artifacts/animation-v7/gpt-cycle.png');
  console.log('Prepared GPT side walk: left-leading m0..m3, right-leading m4..m7; other sprites preserved.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
