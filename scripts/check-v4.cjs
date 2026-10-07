const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),sharp=require('sharp');
const {duration}=require('../src/pet-motion.js');
(async()=>{
 const env={...process.env,DESKBOT_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[path.resolve('.')],env});
 const errors=[];app.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));
 fs.mkdirSync('artifacts/animation-v4',{recursive:true});
 try{
  await app.firstWindow();await new Promise(r=>setTimeout(r,1500));
  assert.equal(app.windows().length,3);
  for(const p of app.windows()){
   await p.waitForFunction(()=>!!window.petDiagnostics);await p.evaluate(()=>petDiagnostics.ready());
   await p.evaluate(()=>petDiagnostics.resume());
   const id=new URL(p.url()).searchParams.get('pet');
   const gallery=[];
   for(const name of ['look','bow','greet','stretch']){
    const frames=[];
    for(let time=0;time<duration[name];time+=100){
     const encoded=await p.evaluate(async({name,time})=>{await petDiagnostics.seek(name,time);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return document.querySelector('canvas').toDataURL().split(',')[1];},{name,time});
     frames.push(await sharp(Buffer.from(encoded,'base64')).resize(320,260).flatten({background:'#eeeaf2'}).ensureAlpha().raw().toBuffer());
    }
    gallery.push(frames[Math.floor(frames.length/2)]);
    await sharp(Buffer.concat(frames),{raw:{width:320,height:260*frames.length,channels:4,pageHeight:260}}).webp({loop:0,delay:100,quality:85}).toFile(`artifacts/animation-v4/${id}-${name}.webp`);
    await p.evaluate(name=>petDiagnostics.play(name),name);await p.waitForTimeout(50);
    assert.equal((await p.evaluate(()=>petDiagnostics.snapshot())).name,name);
   }
   await sharp({create:{width:1280,height:260,channels:4,background:'#eeeaf2'}}).composite(gallery.map((input,i)=>({input,raw:{width:320,height:260,channels:4},left:i*320,top:0}))).png().toFile(`artifacts/animation-v4/${id}-overview.png`);
   console.log(id,'PASS: four gestures loaded, triggered and rendered; previews saved');
  }
  assert.deepEqual(errors,[]);
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exit(1);});
