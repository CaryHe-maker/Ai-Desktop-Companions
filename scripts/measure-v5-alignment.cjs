// Measure scale/translation against the static doorway; save metadata only.
const fs=require('node:fs'),sharp=require('sharp');
async function pixels(file){const data=await sharp(file).resize(128,128).ensureAlpha().raw().toBuffer();const a=new Float32Array(data.length);for(let i=0;i<data.length;i+=4){const alpha=data[i+3]/255;for(let c=0;c<3;c++)a[i+c]=data[i+c]/255*alpha;a[i+3]=alpha;}return a;}
async function main(){
 const out={};
 for(const id of ['gpt','claude','deepseek']){
  out[id]={};const ref=await pixels(`assets/v3/${id}/e0.webp`),points=[];
  for(let y=0;y<118;y+=3)for(let x=0;x<128;x+=3){if(y>46&&x<102)continue;const k=(y*128+x)*4;if(ref[k+3]>.1)points.push([x,y,k]);}
  if(points.length<30)throw Error('Door template too small');
  for(const i of [0,1,2,3,5,6,8,10,12,14]){
   const src=await pixels(`assets/source/v5/${id}/insert-${i}.png`);
   const score=(s,dx,dy)=>{let e=0;for(const [x,y,k] of points){const xx=Math.round((x-dx)/s),yy=Math.round((y-dy)/s),q=(yy*128+xx)*4,inside=xx>=0&&xx<128&&yy>=0&&yy<128;for(let c=0;c<4;c++)e+=Math.abs(ref[k+c]-(inside?src[q+c]:0))*(c===3?2:1);}return e/points.length;};
   let best={error:Infinity};
   for(let s=.65;s<=1.251;s+=.025)for(let x=-20;x<=20;x+=2)for(let y=-20;y<=20;y+=2){const error=score(s,x,y);if(error<best.error)best={scale:s,x,y,error};}
   const coarse={...best};
   for(let s=coarse.scale-.025;s<=coarse.scale+.025;s+=.005)for(let x=coarse.x-2;x<=coarse.x+2;x+=.5)for(let y=coarse.y-2;y<=coarse.y+2;y+=.5){const error=score(s,x,y);if(error<best.error)best={scale:s,x,y,error};}
   best.x*=4;best.y*=4;out[id][i]=best;console.log(id,i,best);
  }
 }
 fs.writeFileSync('assets/source/v5/alignment.json',JSON.stringify(out,null,2));
}
main().catch(e=>{console.error(e);process.exit(1);});
