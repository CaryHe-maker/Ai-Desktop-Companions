const fs=require('node:fs'),sharp=require('sharp');
const IDS=['gpt','claude','deepseek'], INSERTS=[0,1,2,3,5,6,8,10,12,14];
async function atlas(source){
 const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const cuts=axis=>{const size=axis?info.height:info.width,other=axis?info.width:info.height;
  const ink=Array.from({length:size},(_,p)=>{let n=0;for(let q=0;q<other;q++)if(data[((axis?p:q)*info.width+(axis?q:p))*4+3]>80)n++;return n;});
  return [0,...[1,2,3].map(i=>{const at=Math.round(i*size/4),r=Math.round(size*.04);let best=at;for(let p=at-r;p<=at+r;p++)if(ink[p]<ink[best]||(ink[p]===ink[best]&&Math.abs(p-at)<Math.abs(best-at)))best=p;return best;}),size];};
 const xs=cuts(0),ys=cuts(1),out=[];
 for(let i=0;i<16;i++){
  const left=xs[i%4],top=ys[Math.floor(i/4)],width=xs[i%4+1]-left,height=ys[Math.floor(i/4)+1]-top;
  out.push(await sharp(source).extract({left,top,width,height}).png().toBuffer());
 }
 return out;
}
async function bounds(input){
 const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});let left=info.width,top=info.height,right=-1,bottom=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>50){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<left)throw Error('Empty atlas cell');return {left,top,width:right-left+1,height:bottom-top+1};
}
async function stageSources(){
 for(const id of IDS){
  fs.mkdirSync(`assets/source/v5/${id}`,{recursive:true});
  const cells=await atlas(`assets/source/v5/${id}-entrance.png`);
  for(const i of INSERTS)await sharp(cells[i]).resize(512,512,{fit:'contain',background:'#00000000'}).png().toFile(`assets/source/v5/${id}/insert-${i}.png`);
 }
}
async function build(){
 const manifest=JSON.parse(fs.readFileSync('assets/v4/manifest.json','utf8'));
 const alignment=JSON.parse(fs.readFileSync('assets/source/v5/alignment.json','utf8')),report={};
 for(const id of IDS){
  const character=manifest.characters[id],pairs=character.pairs;character.files={};
  fs.mkdirSync(`assets/v5/${id}`,{recursive:true});
  for(const [j,i] of INSERTS.entries()){
   const {scale:s,x,y}=alignment[id][i],size=Math.round(512*s),left=Math.round(x),top=Math.round(y);
   const raw=await sharp(`assets/source/v5/${id}/insert-${i}.png`).resize(size,size).png().toBuffer();
   const crop={left:Math.max(0,-left),top:Math.max(0,-top),width:Math.min(size,512-left)-Math.max(0,-left),height:Math.min(size,512-top)-Math.max(0,-top)};
   const img=await sharp(raw).extract(crop).png().toBuffer(),key=`eadd${j}`;
   await sharp({create:{width:512,height:512,channels:4,background:'#00000000'}}).composite([{input:img,left:Math.max(0,left),top:Math.max(0,top)}]).webp({lossless:true}).toFile(`assets/v5/${id}/${key}.webp`);
   character.files[key]=`../assets/v5/${id}/${key}.webp`;
   const pair=`e${i}-e${i+1}`,old=Array.from({length:pairs[pair]},(_,k)=>`${pair}_${k+1}`);
   old.splice(Math.floor(old.length/2),0,key);pairs[pair]=old;
  }
  report[id]={entranceAdded:10,walk:"original v3 whole-character cels",entrancePairs:INSERTS,alignment:alignment[id]};
 }
 manifest.version=5;fs.writeFileSync('assets/v5/manifest.json',JSON.stringify(manifest,null,2));
 fs.writeFileSync('assets/v5/report.json',JSON.stringify(report,null,2));
 fs.writeFileSync('src/animation-assets.js','window.ANIMATION_ASSETS = '+JSON.stringify(manifest)+';\n');
 console.log('Prepared 10 entrance inserts per pet; original walking retained.');
}
(process.argv.includes('--stage-sources')?stageSources():build()).catch(e=>{console.error(e);process.exit(1);});
