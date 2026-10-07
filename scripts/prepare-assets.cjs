const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');
const palettes = {gpt:['#413959','#c9b4ed'],claude:['#603824','#e7ad6c'],deepseek:['#1b3b68','#80bfeb']};
async function ico(png, file) {
  const sizes=[16,24,32,48,64,128,256], buffers=[];
  for(const size of sizes) buffers.push(await sharp(png).resize(size,size).png().toBuffer());
  const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
  sizes.forEach((size,i)=>{const p=6+i*16;header[p]=size===256?0:size;header[p+1]=header[p];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(buffers[i].length,p+8);header.writeUInt32LE(offset,p+12);offset+=buffers[i].length;});
  fs.writeFileSync(file,Buffer.concat([header,...buffers]));
}
(async()=>{
  for(const id of Object.keys(palettes)){
    const source=path.join('assets','source',id+'.png'),meta=await sharp(source).metadata();
    const width=meta.width/4,height=meta.height/2;
    fs.mkdirSync(path.join('assets',id),{recursive:true});
    for(let i=0;i<8;i++)await sharp(source).extract({left:(i%4)*width,top:Math.floor(i/4)*height,width,height}).png().toFile(path.join('assets',id,`pose-${i}.png`));
    const [dark,light]=palettes[id];
    const bg=Buffer.from(`<svg width="256" height="256"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><rect width="256" height="256" rx="46" fill="url(#g)"/><path d="M14 183Q128 100 243 170" stroke="#fff" stroke-opacity=".22" fill="none"/><circle cx="198" cy="35" r="60" fill="white" opacity=".12"/></svg>`);
    const face=await sharp(source).extract({left:2*width+22,top:12,width:width-44,height:310}).resize(256,256,{fit:'cover'}).toBuffer();
    const mask=Buffer.from('<svg width="256" height="256"><rect width="256" height="256" rx="46" fill="white"/></svg>');
    const composed=await sharp(bg).composite([{input:face}]).png().toBuffer();
    const out=await sharp(composed).composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
    fs.writeFileSync(`assets/${id}-icon.png`,out);await ico(out,`assets/${id}.ico`);
  }
  console.log('Prepared 24 transparent animation poses and 3 multi-resolution face icons.');
})().catch(e=>{console.error(e);process.exit(1)});
