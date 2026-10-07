const {_electron:electron}=require('playwright');
const sharp=require('sharp'),path=require('node:path'),fs=require('node:fs');
const {duration}=require('../../src/pet-motion.js');
// Seeks the real renderer at 30 fps and writes an animated preview plus a contact sheet per pet.
(async()=>{
 const env={...process.env,DESKBOT_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[path.resolve('.')],env});
 const clips=['entrance','wave','walk','signature','happy'],step=1000/30,out='artifacts/animation-v3';
 fs.mkdirSync(out,{recursive:true});
 try{
  await app.firstWindow();await new Promise(r=>setTimeout(r,1400));
  for(const page of app.windows()){
   await page.waitForFunction(()=>window.petDiagnostics);await page.evaluate(()=>petDiagnostics.ready());
   const id=new URL(page.url()).searchParams.get('pet'),frames=[];
   for(const name of clips)for(let time=0;time<duration[name];time+=step){
    const encoded=await page.evaluate(async({name,time})=>{
     await petDiagnostics.seek(name,time,{direction:-1});
     await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
     return document.querySelector('canvas').toDataURL().split(',')[1];
    },{name,time});
    frames.push(await sharp(Buffer.from(encoded,'base64')).resize(320,260).flatten({background:'#f4f0f6'}).ensureAlpha().raw().toBuffer());
   }
   await page.evaluate(()=>petDiagnostics.resume());
   await sharp(Buffer.concat(frames),{raw:{width:320,height:260*frames.length,channels:4,pageHeight:260}}).webp({loop:0,delay:Math.round(step),quality:82}).toFile(`${out}/${id}-preview.webp`);
   const cols=12,pick=frames.filter((_,i)=>i%3===0),rows=Math.ceil(pick.length/cols);
   await sharp({create:{width:cols*320,height:rows*260,channels:4,background:'#f4f0f6'}}).composite(pick.map((input,i)=>({input,raw:{width:320,height:260,channels:4},left:i%cols*320,top:Math.floor(i/cols)*260}))).png().toFile(`${out}/${id}-sheet.png`);
   console.log(id,frames.length,'frames');
  }
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exit(1)});
