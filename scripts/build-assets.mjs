#!/usr/bin/env node
// Deterministic finishing of the imagegen originals retained in docs/assets/sources.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, crop } from './lib/png.mjs';
import {buildPixelFighters} from './lib/pixel-sprites.mjs';
import {buildConsistentFighters,repairExistingFighters} from './lib/consistent-sprites.mjs';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sources=join(project,'docs/assets/sources'), destination=join(project,'public/assets');
const actions={idle:{frames:6,loop:true},jab:{frames:4,loop:false,impactFrame:2},hook:{frames:6,loop:false,impactFrame:3},uppercut:{frames:7,loop:false,impactFrame:4},block:{frames:4,loop:false,hold:true},dodge:{frames:5,loop:false},hit:{frames:3,loop:false},hit_heavy:{frames:5,loop:false},ko:{frames:10,loop:false,hold:true},victory:{frames:6,loop:true}};
const effects={hit_spark:{frames:5,size:128},crit_spark:{frames:6,size:192},block_spark:{frames:4,size:128},whoosh:{frames:4,size:128}};
const blank=(width,height)=>({width,height,data:Buffer.alloc(width*height*4)});
function save(path,image){const full=join(destination,path);mkdirSync(dirname(full),{recursive:true});encodePNG(full,image);}
function bounds(image,threshold=32){let x0=image.width,y0=image.height,x1=-1,y1=-1;for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(image.data[(y*image.width+x)*4+3]>threshold){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}if(x1<0)throw new Error('Empty source region');return {x0,y0,x1,y1,width:x1-x0+1,height:y1-y0+1};}
function trim(image){const b=bounds(image);return crop(image,b.x0,b.y0,b.width,b.height);}
// Discard small detached generation noise while keeping silhouette and antialiasing.
function clean(image){
  const n=image.width*image.height, seen=new Uint8Array(n), groups=[];
  for(let i=0;i<n;i++)if(!seen[i] && image.data[i*4+3]>96){
    const group=[],queue=[i];seen[i]=1;
    for(let q=0;q<queue.length;q++){
      const p=queue[q];group.push(p);const x=p%image.width,y=Math.floor(p/image.width);
      for(const k of [x? p-1:-1,x+1<image.width?p+1:-1,y?p-image.width:-1,y+1<image.height?p+image.width:-1])if(k>=0&&!seen[k]&&image.data[k*4+3]>96){seen[k]=1;queue.push(k);}
    }
    groups.push(group);
  }
  const largest=Math.max(0,...groups.map(g=>g.length));
  const keep=new Uint8Array(n);for(const group of groups)if(group.length===largest)for(const p of group)keep[p]=1;
  for(let i=0;i<n;i++)if(!keep[i])image.data.fill(0,i*4,i*4+4);
  return image;
}
// Premultiplied-alpha bilinear scaling prevents dark fringes on transparent sprites.
function blitScaled(target,source,dx,dy,width,height){
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const tx=dx+x,ty=dy+y;if(tx<0||ty<0||tx>=target.width||ty>=target.height)continue;
    const sx=Math.max(0,Math.min(source.width-1,(x+.5)*source.width/width-.5)),sy=Math.max(0,Math.min(source.height-1,(y+.5)*source.height/height-.5));
    const x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;
    let alpha=0,colors=[0,0,0];
    for(const [xx,yy,w]of [[x0,y0,(1-fx)*(1-fy)],[Math.min(x0+1,source.width-1),y0,fx*(1-fy)],[x0,Math.min(y0+1,source.height-1),(1-fx)*fy],[Math.min(x0+1,source.width-1),Math.min(y0+1,source.height-1),fx*fy]]){
      const p=(yy*source.width+xx)*4,a=source.data[p+3]*w;alpha+=a;for(let c=0;c<3;c++)colors[c]+=source.data[p+c]*a;
    }
    const p=(ty*target.width+tx)*4;
    if(alpha>0){for(let c=0;c<3;c++)target.data[p+c]=Math.round(colors[c]/alpha);target.data[p+3]=Math.round(alpha);}
  }
}
function center(source,width,height,padding=8){source=trim(source);const target=blank(width,height),scale=Math.min((width-padding*2)/source.width,(height-padding*2)/source.height),w=Math.round(source.width*scale),h=Math.round(source.height*scale);blitScaled(target,source,Math.floor((width-w)/2),Math.floor((height-h)/2),w,h);return target;}
function palette(image,blue=false){
  const out={...image,data:Buffer.from(image.data)};
  for(let p=0;p<out.data.length;p+=4){let [r,g,b,a]=out.data.subarray(p,p+4);if(!a){out.data.fill(0,p,p+4);continue;}
    if(r>65&&r>g*2.5&&r>b*2.5&&g-b<20&&b-g<30){
      const color=r>170?(blue?[25,118,210]:[211,47,47]):(blue?[13,71,161]:[183,28,28]);for(let c=0;c<3;c++)out.data[p+c]=color[c];
    }
  }return out;
}
function blueFromRed(image){const out={...image,data:Buffer.from(image.data)};for(let p=0;p<out.data.length;p+=4){let [r,g,b]=out.data.subarray(p,p+3);const color=r===211&&g===47&&b===47?[25,118,210]:r===183&&g===28&&b===28?[13,71,161]:null;if(color)for(let c=0;c<3;c++)out.data[p+c]=color[c];}return out;}
function strip(frames,size){const out=blank(frames.length*size,size);frames.forEach((frame,i)=>{for(let y=0;y<size;y++)frame.data.copy(out.data,(y*out.width+i*size)*4,y*size*4,(y+1)*size*4);});return out;}
function writeFighterBPortrait(){
  const original=decodePNG(join(sources,'portrait-b-female.png'));
  const red=palette(center(original,256,256,8));
  save('fighters/fighter-b/red/portrait.png',red);
  save('fighters/fighter-b/blue/portrait.png',blueFromRed(red));
}
if(process.argv.includes('--portrait-b-only')){
  writeFighterBPortrait();
  console.log('Built fighter-b female portraits for red and blue corners.');
  process.exit(0);
}
const row=(y0,y1,xs)=>({y0,y1,xs});
// Source sheets are hand inspected: these rectangles describe actual artwork,
// rather than assuming the image model obeyed the requested grid.
const layouts={
  A:[row(5,125,[[18,112],[124,219],[231,326],[340,434],[449,545],[557,650]]),row(130,255,[[12,112],[114,217],[218,320],[320,447],[448,540]]),row(260,390,[[12,118],[123,233],[233,370],[371,475],[476,559],[559,664],[664,764]]),row(390,520,[[12,121],[122,229],[230,346],[347,449],[450,566],[567,674]]),row(523,647,[[12,115],[116,219],[220,322],[327,427]]),row(650,778,[[12,115],[126,239],[240,350],[351,450],[451,552]]),row(784,910,[[20,134],[135,237],[238,332]]),null,row(913,1053,[[12,118],[125,234],[230,355],[631,790],[791,921],[922,1084],[1085,1245]]),row(1058,1242,[[12,119],[126,234],[235,351],[352,468],[469,588],[589,702]])],
  B:[row(4,126,[[24,121],[143,237],[251,350],[368,462],[476,575],[587,689]]),row(128,243,[[18,120],[127,251],[252,364],[363,463]]),row(243,368,[[24,123],[136,237],[247,365],[366,490],[495,604],[605,702]]),row(369,495,[[20,124],[134,238],[244,347],[347,455],[454,561],[568,673],[675,780]]),row(495,615,[[19,123],[130,231],[239,347],[360,461]]),row(616,737,[[23,121],[141,247],[264,378],[389,494],[495,594]]),row(737,861,[[17,128],[133,260],[262,353]]),row(865,985,[[19,118],[119,248],[249,360],[361,488],[491,597]]),row(986,1098,[[22,121],[133,242],[239,345],[358,456],[469,575],[588,718],[719,862],[863,1060],[1061,1235]]),row(1099,1245,[[23,120],[141,245],[269,372],[387,503],[521,635]])],
};
const sourceCounts={};
function sourceFrames(image,layout){return layout.xs.map(([x0,x1])=>clean(crop(image,x0,layout.y0,x1-x0,layout.y1-layout.y0)));}
function frameSprite(source,scale){
  const b=bounds(source),maxW=236,maxH=230;
  // Keep a common scale within the motion, with enough room for raised hands.
  scale=Math.min(scale,maxH/b.height);
  let minX=source.width,maxX=0;
  for(let y=Math.max(b.y0,b.y1-Math.ceil(b.height*.18));y<=b.y1;y++)for(let x=b.x0;x<=b.x1;x++)if(source.data[(y*source.width+x)*4+3]>96){minX=Math.min(minX,x);maxX=Math.max(maxX,x);}
  const footX=(minX+maxX)/2;
  // If a horizontal KO pose is too wide about the feet, center its footprint.
  const pivot=b.width>b.height*1.5?(b.x0+b.x1)/2:footX;
  const available=Math.max(pivot-b.x0,b.x1-pivot);
  // Fit extended arms horizontally without making the fighter shorter at contact.
  const scaleX=Math.min(scale,maxW/b.width,119/Math.max(available,1));
  const out=blank(512,512),sprite=crop(source,b.x0,b.y0,b.width,b.height);
  const w=Math.max(1,Math.round(b.width*scaleX)),h=Math.max(1,Math.round(b.height*scale));
  const dx=Math.round(128+(b.x0-pivot)*scaleX),dy=240-h;
  blitScaled(out,sprite,dx*2,dy*2,w*2,h*2);return palette(out);
}
const pixelMode=existsSync(join(sources,'pixel-layouts.json'));
if(!pixelMode){
const heavySource=decodePNG(join(sources,'heavyA.png'));
for(const [letter,layout]of Object.entries(layouts)){
  const skin=`fighter-${letter.toLowerCase()}`,atlas=decodePNG(join(sources,`atlas${letter}.png`));
  const motion=layout.map(l=>l?sourceFrames(atlas,l):null);
  if(letter==='A'){
    const regions=[[0,405],[405,785],[780,1275],[1275,1650],[1650,1978]];
    motion[7]=regions.map(([x0,x1])=>clean(crop(heavySource,Math.round(x0*heavySource.width/1978),0,Math.round((x1-x0)*heavySource.width/1978),heavySource.height)));
  }
  const standingHeight=bounds(motion[0][1]).height,baseScale=200/standingHeight;
  let idleFrame;
  for(const [index,[action,spec]]of Object.entries(Object.entries(actions))){
    let poses=motion[Number(index)];sourceCounts[`${skin}/${action}`]=poses.length;
    // Select contact frames explicitly after inspecting each source sheet.
    const contact={A:{jab:3,hook:2,uppercut:3},B:{jab:1,hook:3,uppercut:3},C:{jab:2,hook:2,uppercut:2},D:{jab:2,hook:3,uppercut:3}}[letter][action];
    let order=Array.from({length:spec.frames},(_,i)=>Math.round(i*(poses.length-1)/(spec.frames-1)));
    if(action==='idle'&&letter==='D')order=[1,2,3,4,5,2];
    if(contact!==undefined)order[spec.impactFrame]=contact;
    if(action==='block')order[spec.frames-1]=poses.length-1;
    // Victory holds an arms-up bounce throughout, including its loop seam.
    if(action==='victory')order=letter==='A'?[1,2,3,4,3,2]:letter==='B'?[2,3,4,3,2,3]:letter==='C'?[0,1,2,1,0,1]:[1,2,3,4,3,2];
    let scale=(action==='hit_heavy'&&letter==='A')||(action==='jab'&&letter==='C')?200/bounds(poses[0]).height:baseScale;
    if(action==='victory')scale=Math.min(scale,...poses.map(p=>230/bounds(p).height));
    const frames=order.map(i=>frameSprite(poses[i],scale));
    if(action==='idle')idleFrame=frames[0];
    if(['jab','hook','uppercut','dodge'].includes(action)){frames[0]=idleFrame;frames[frames.length-1]=idleFrame;}
    const red=strip(frames,512);save(`fighters/${skin}/red/${action}.png`,red);save(`fighters/${skin}/blue/${action}.png`,blueFromRed(red));
  }
}
buildConsistentFighters(project);
repairExistingFighters(project);
}else{buildPixelFighters(project);}
// Legacy atlas supplies A/C/D only. Its old B portrait is intentionally skipped.
const portraitAtlas=decodePNG(join(sources,'portraits-legacy.png'));
for(let i=0;i<4;i++){
  if(i===1){writeFighterBPortrait();continue;}
  const x=(i%2)*627,y=Math.floor(i/2)*627;
  const portrait=palette(center(clean(crop(portraitAtlas,x,y,627,627)),256,256,8));
  save(`fighters/fighter-${'abcd'[i]}/red/portrait.png`,portrait);save(`fighters/fighter-${'abcd'[i]}/blue/portrait.png`,blueFromRed(portrait));
}
const fx=decodePNG(join(sources,'effects.png'));
const fxLayouts={hit_spark:row(45,358,[[22,196],[196,414],[414,658],[658,872],[872,1056]]),crit_spark:row(360,696,[[6,197],[197,419],[419,703],[703,907],[907,1070],[1070,1250]]),block_spark:row(704,962,[[3,234],[234,471],[471,698],[698,872]]),whoosh:row(968,1254,[[0,232],[232,489],[489,702],[702,890]])};
for(const [name,spec]of Object.entries(effects)){
  const layout=fxLayouts[name],poses=layout.xs.map(([x0,x1])=>crop(fx,x0,layout.y0,x1-x0,layout.y1-layout.y0));
  const maxW=Math.max(...poses.map(p=>bounds(p).width)),maxH=Math.max(...poses.map(p=>bounds(p).height));
  const scale=(spec.size-12)/Math.max(maxW,maxH);
  const frames=poses.map((p,i)=>{p=trim(p);const target=blank(spec.size,spec.size),w=Math.max(1,Math.round(p.width*scale)),h=Math.max(1,Math.round(p.height*scale));blitScaled(target,p,Math.round((spec.size-w)/2),Math.round((spec.size-h)/2),w,h);if(i===poses.length-1)for(let q=3;q<target.data.length;q+=4)target.data[q]=Math.round(target.data[q]*.4);return target;});
  save(`effects/${name}.png`,strip(frames,spec.size));
}
const ui=decodePNG(join(sources,'ui.png'));
for(const [name,x,y,w,h,ow,oh]of [['ko',0,0,663,435,768,256],['fight',655,0,599,520,768,256],['coffee',0,437,633,540,512,512],['corner_red',0,975,637,260,256,96],['corner_blue',638,975,616,260,256,96]])save(`ui/${name}.png`,center(crop(ui,x,y,w,h),ow,oh,6));
save('ui/coffee.png',center(decodePNG(join(sources,'coffeeClean.png')),512,512,16));
save('ui/ko.png',center(decodePNG(join(sources,'koClean.png')),768,256,12));
const ring=decodePNG(join(sources,'ring.png')),background=blank(1280,720);blitScaled(background,ring,0,0,1280,720);save('ui/ring.png',background);
const manifest={...(pixelMode?{artStyle:"pixel-art",pixelSize:4,maxColors:26}:{}),frameSize:512,displayFrameSize:256,anchor:{x:256,y:480},fps:12,skins:['fighter-a','fighter-b','fighter-c','fighter-d'],corners:['red','blue'],actions,effects};
writeFileSync(join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Built 98 PNG assets and manifest.json.');
