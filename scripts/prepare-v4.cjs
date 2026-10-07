// Extract generated atlases; retain genuine alpha and use one scale per gesture.
const fs = require('node:fs');
const sharp = require('sharp');
async function main() {
  const manifest = JSON.parse(fs.readFileSync('assets/v3/manifest.json', 'utf8'));
  const report = {};
  for (const id of ['gpt', 'claude', 'deepseek']) {
    const cells = [];
    for(const action of ['look','bow','greet','stretch']) {
    const source = `assets/source/v4/${id}-${action}.png`;
    const {data, info} = await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    // Generated gutters can drift. Find the emptiest nearby row/column before slicing.
    const divide = axis => {
      const size=axis==='x'?info.width:info.height, other=axis==='x'?info.height:info.width;
      const ink=Array.from({length:size},(_,p)=>{let count=0;for(let q=0;q<other;q++){const x=axis==='x'?p:q,y=axis==='x'?q:p;if(data[(y*info.width+x)*4+3]>80)count++;}return count;});
      return [0,...[1,2,3].map(i=>{const at=Math.round(i*size/4),margin=Math.floor(size/4*.18);let best=at;for(let p=at-margin;p<=at+margin;p++)if(ink[p]<ink[best]||(ink[p]===ink[best]&&Math.abs(p-at)<Math.abs(best-at)))best=p;return best;}),size];
    };
    const xs=divide('x'),ys=divide('y');
    for (let i=0;i<16;i++) {
      const x0=xs[i%4], x1=xs[i%4+1];
      const y0=ys[Math.floor(i/4)], y1=ys[Math.floor(i/4)+1];
      let left=x1, top=y1, right=-1, bottom=-1,occupied=0;
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(data[(y*info.width+x)*4+3]>35){occupied++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      if(right<left)throw Error(`${id}: empty cell ${i}`);
      if(occupied/(x1-x0)/(y1-y0)>.92)throw Error(`${id}/${action}: cell ${i} has an opaque background or invalid grid`);
      cells.push({source,box:{left,top,width:right-left+1,height:bottom-top+1}});
    }
    }
    const scales=Array.from({length:4},(_,j)=>Math.min(448/Math.max(...cells.slice(j*16,j*16+16).map(c=>c.box.height)),460/Math.max(...cells.slice(j*16,j*16+16).map(c=>c.box.width))));
    fs.mkdirSync(`assets/v4/${id}`,{recursive:true});
    const hashes=new Set();
    for(let i=0;i<64;i++){
      const {source,box}=cells[i], scale=scales[Math.floor(i/16)],width=Math.round(box.width*scale),height=Math.round(box.height*scale);
      const sprite=await sharp(source).extract(box).resize(width,height).png().toBuffer();
      const output=await sharp({create:{width:512,height:512,channels:4,background:'#00000000'}})
        .composite([{input:sprite,left:Math.round((512-width)/2),top:488-height}]).webp({lossless:true}).toBuffer();
      hashes.add(require('node:crypto').createHash('sha256').update(output).digest('hex'));
      fs.writeFileSync(`assets/v4/${id}/n${i}.webp`,output);
    }
    if(hashes.size<60)throw Error(`${id}: only ${hashes.size} unique frames`);
    const pairs=manifest.characters[id].pairs;
    for(let start=0;start<64;start+=16){pairs[`b0-n${start}`]=0;for(let i=start;i<start+15;i++)pairs[`n${i}-n${i+1}`]=0;pairs[`n${start+15}-b0`]=0;}
    report[id]={newFrames:64,uniqueFrames:hashes.size,actions:['look','bow','greet','stretch']};
    console.log(id,report[id]);
  }
  manifest.version=4;
  fs.writeFileSync('assets/v4/manifest.json',JSON.stringify(manifest,null,2));
  fs.writeFileSync('assets/v4/report.json',JSON.stringify(report,null,2));
  fs.writeFileSync('src/animation-assets.js','window.ANIMATION_ASSETS = '+JSON.stringify(manifest)+';\n');
}
main().catch(e=>{console.error(e);process.exit(1);});
