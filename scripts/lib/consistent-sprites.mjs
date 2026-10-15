import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {decodePNG,encodePNG,crop} from './png.mjs';
import {measureFrame} from './asset-metrics.mjs';
const blank=(width,height)=>({width,height,data:Buffer.alloc(width*height*4)});
function bounds(image){let x0=image.width,y0=image.height,x1=-1,y1=-1;for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(image.data[(y*image.width+x)*4+3]>128){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return {x0,y0,x1,y1};}
function area(image){let n=0;for(let p=3;p<image.data.length;p+=4)if(image.data[p]>128)n++;return n;}
function clean(image){
  const n=image.width*image.height,seen=new Uint8Array(n);let largest=[];
  for(let i=0;i<n;i++)if(!seen[i]&&image.data[i*4+3]>96){
    const queue=[i];seen[i]=1;for(let q=0;q<queue.length;q++){const p=queue[q],x=p%image.width,y=Math.floor(p/image.width);for(const k of [x?p-1:-1,x+1<image.width?p+1:-1,y?p-image.width:-1,y+1<image.height?p+image.width:-1])if(k>=0&&!seen[k]&&image.data[k*4+3]>96){seen[k]=1;queue.push(k);}}
    if(queue.length>largest.length)largest=queue;
  }
  const keep=new Uint8Array(n);for(const p of largest)keep[p]=1;
  for(let i=0;i<n;i++)if(!keep[i])image.data.fill(0,i*4,i*4+4);
  return image;
}
function recolor(image){for(let p=0;p<image.data.length;p+=4){const [r,g,b,a]=image.data.subarray(p,p+4);if(!a){image.data.fill(0,p,p+4);continue;}if(r>65&&r>g*2.5&&r>b*2.5&&g-b<20&&b-g<30){const color=r>170?[211,47,47]:[183,28,28];for(let c=0;c<3;c++)image.data[p+c]=color[c];}}return image;}
function blueFromRed(image){const out={...image,data:Buffer.from(image.data)};for(let p=0;p<out.data.length;p+=4){const[r,g,b]=out.data.subarray(p,p+3),c=r===211&&g===47&&b===47?[25,118,210]:r===183&&g===28&&b===28?[13,71,161]:null;if(c)for(let i=0;i<3;i++)out.data[p+i]=c[i];}return out;}
function translate(image,dx,dy){const size=image.height,res=size/256,out=blank(size,size);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const tx=x+dx*res,ty=y+dy*res;if(tx>=0&&tx<size&&ty>=0&&ty<size)image.data.copy(out.data,(ty*size+tx)*4,(y*size+x)*4,(y*size+x)*4+4);}return out;}
// Rasterization uses ONE uniform scale per reference atlas, established by its
// guard pose. Every pose shares that scale. No fit-to-cell or per-pose resizing.
export function renderPose(source,scale,lying=false){
  const b=bounds(source);let minX=source.width,maxX=0;
  for(let y=b.y1-Math.ceil((b.y1-b.y0+1)*.18);y<=b.y1;y++)for(let x=b.x0;x<=b.x1;x++)if(source.data[(y*source.width+x)*4+3]>128){minX=Math.min(minX,x);maxX=Math.max(maxX,x);}
  const pivot=lying?(b.x0+b.x1)/2:(minX+maxX)/2;
  const tx=128-pivot*scale,ty=240-(b.y1+1)*scale;
  if(tx+b.x0*scale<2||tx+(b.x1+1)*scale>254||ty+b.y0*scale<2)throw new Error(`Pose does not fit at shared scale ${scale}; regenerate the pose, do not shrink it.`);
  const size=512,res=2,out=blank(size,size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const sx=(x+.5-tx*res)/(scale*res)-.5,sy=(y+.5-ty*res)/(scale*res)-.5;
    if(sx<0||sy<0||sx>source.width-1||sy>source.height-1)continue;
    const x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;
    let a=0,colors=[0,0,0];
    for(const[xx,yy,w]of [[x0,y0,(1-fx)*(1-fy)],[Math.min(x0+1,source.width-1),y0,fx*(1-fy)],[x0,Math.min(y0+1,source.height-1),(1-fx)*fy],[Math.min(x0+1,source.width-1),Math.min(y0+1,source.height-1),fx*fy]]){const p=(yy*source.width+xx)*4,alpha=source.data[p+3]*w;a+=alpha;for(let c=0;c<3;c++)colors[c]+=source.data[p+c]*alpha;}
    const p=(y*size+x)*4;if(a>0){for(let c=0;c<3;c++)out.data[p+c]=Math.round(colors[c]/a);out.data[p+3]=Math.round(a);}
  }
  return {image:recolor(out),transform:{scale,tx,ty}};
}
export function writeMotion(root,skin,action,frames){const size=frames[0].height,image=blank(frames.length*size,size);for(let f=0;f<frames.length;f++)for(let y=0;y<size;y++)frames[f].data.copy(image.data,(y*image.width+f*size)*4,y*size*4,(y+1)*size*4);for(const corner of ['red','blue']){const dir=join(root,'fighters',skin,corner);mkdirSync(dir,{recursive:true});encodePNG(join(dir,`${action}.png`),corner==='red'?image:blueFromRed(image));}}
export function buildConsistentFighters(project){
  const sourceDir=join(project,'docs/assets/sources'),root=join(project,'public/assets');
  const layouts=JSON.parse(readFileSync(join(sourceDir,'consistent-layouts.json'),'utf8'));
  const rendered={};
  for(const skin of ['fighter-c','fighter-d']){
    const config=layouts[skin],atlas=decodePNG(join(sourceDir,config.file)),reference=decodePNG(join(sourceDir,`${skin}-idle-reference.png`));
    const poses=config.rects.map(([x,y,w,h])=>clean(crop(atlas,x,y,w,h)));
    const scale=Math.sqrt(area(reference)/area(poses[0]));
    const koAtlas=decodePNG(join(sourceDir,config.ko.file));
    const koPoses=config.ko.rects.map(rect=>clean(crop(koAtlas,...rect)));
    const koScale=Math.sqrt(area(reference)/area(koPoses[0]));
    const drawings=poses.map((pose,i)=>{
      if(i===12||i===13)return renderPose(koPoses[i===12?2:3],koScale,true);
      // The longer C jab exceeds the frame at the shared scale. Use the
      // shorter, fully drawn jab from the same reference atlas instead.
      if(skin==='fighter-c'&&i===2)pose=poses[1];
      // Reject the D head variant that drifted from its model sheet. The
      // adjacent restrained recoil preserves the character's proportions.
      if(skin==='fighter-d'&&i===9)pose=poses[8];
      if(skin==='fighter-d'&&i===15)pose=poses[14];
      try{return renderPose(pose,scale,i===11||i===12||i===13);}
      catch(error){throw new Error(`${skin} pose ${i}: ${error.message}`);}
    });
    // All ten rebuilt motions use the same generated model sheet, including
    // its guard. The original idle remains the immutable imagegen input.
    const canonical=drawings[0].image;
    const sequences={idle:[0,0,0,0,0,0],jab:[0,1,2,0],hook:[0,3,3,4,3,0],uppercut:[0,5,5,6,6,5,0],block:[0,7,7,7],dodge:[0,8,8,8,0],hit:[0,9,0],hit_heavy:[0,9,10,9,0],ko:[0,9,10,11,11,12,12,13,13,13],victory:[14,15,14,15,14,15]};
    const meta={scale,koScale,drawings:drawings.map(d=>({transform:d.transform,metrics:measureFrame(d.image,0,512)})),sequences};
    for(const[action,indices]of Object.entries(sequences))writeMotion(root,skin,action,indices.map((index,f)=>action==='idle'&&[1,2,4].includes(f)?translate(canonical,0,-1):skin==='fighter-d'&&action==='victory'&&f%2?translate(drawings[index].image,0,-1):drawings[index].image));
    rendered[skin]=meta;
    console.log(`${skin}: shared scale ${scale.toFixed(6)} at 2× export; pose area ratios ${meta.drawings.map(d=>(d.metrics.area/(area(reference)*4)).toFixed(3)).join(', ')}`);
  }
  return rendered;
}
export function repairExistingFighters(project){
  const source=join(project,'docs/assets/sources'),root=join(project,'public/assets');
  const frames=(file)=>{const image=decodePNG(file),size=image.height;return Array.from({length:image.width/size},(_,i)=>crop(image,i*size,0,size,size));};
  const a=frames(join(root,'fighters/fighter-a/red/idle.png'))[0];
  const hitA=frames(join(root,'fighters/fighter-a/red/hit.png'));
  writeMotion(root,'fighter-a','hit',[a,hitA[1],hitA[2]]);
  writeMotion(root,'fighter-a','hit_heavy',[a,hitA[1],translate(hitA[1],-3,0),hitA[1],a]);
  const koA=frames(join(root,'fighters/fighter-a/red/ko.png'));koA[0]=a;writeMotion(root,'fighter-a','ko',koA);
  const b=frames(join(root,'fighters/fighter-b/red/idle.png'))[0];
  const hitB=frames(join(root,'fighters/fighter-b/red/hit.png'));
  const heavyB=frames(join(root,'fighters/fighter-b/red/hit_heavy.png'));
  writeMotion(root,'fighter-b','hit',[hitB[0],heavyB[1],hitB[2]]);
  const dodge=frames(join(root,'fighters/fighter-b/red/dodge.png'));dodge[2]=dodge[1];writeMotion(root,'fighter-b','dodge',dodge);
  const atlas=decodePNG(join(source,'fighter-b-ko-v2.png'));
  const rects=[[0,0,620,700],[620,0,634,700],[0,700,625,554],[625,700,629,554]];
  const poses=rects.map(rect=>clean(crop(atlas,...rect))),scale=Math.sqrt(area(b)/4/area(poses[0]));
  const ko=frames(join(root,'fighters/fighter-b/red/ko.png'));
  const finals=[renderPose(poses[1],scale,true),renderPose(poses[2],scale,true),renderPose(poses[3],scale,true)];
  ko[7]=finals[0].image;ko[8]=finals[1].image;ko[9]=finals[2].image;
  writeMotion(root,'fighter-b','ko',ko);
  return {scale,finals:finals.map(d=>({transform:d.transform,metrics:measureFrame(d.image,0)}))};
}
