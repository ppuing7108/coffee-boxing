// Pixel-art finishing: a shared pose scale, bounded palette, binary alpha and
// integer nearest-neighbor export. Never resize individual poses to pass metrics.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {decodePNG,crop,encodePNG} from './png.mjs';
import {writeMotion} from './consistent-sprites.mjs';
export const PIXEL_PALETTE=[
 [25,20,30],[47,36,43],[76,48,45],[106,59,43],[140,76,44],[174,98,53],
 [205,129,72],[232,163,99],[248,192,128],[255,218,165],
 [71,43,34],[100,55,35],[130,72,41],[163,91,47],[191,118,65],
 [48,48,61],[74,76,89],[106,111,123],[145,154,163],[191,199,196],
 [228,214,178],[255,241,207],[255,253,236],[130,101,73],
 [211,47,47],[183,28,28]
];
export const PIXEL_SEQUENCES={idle:[0,0,0,0,0,0],jab:[0,1,2,0],hook:[0,3,3,4,3,0],uppercut:[0,5,5,6,6,5,0],block:[0,7,7,7],dodge:[0,8,8,8,0],hit:[0,9,0],hit_heavy:[0,9,10,9,0],ko:[0,9,10,11,11,12,12,13,13,13],victory:[14,15,14,15,14,15]};
const blank=(width,height)=>({width,height,data:Buffer.alloc(width*height*4)});
function bounds(image){let x0=image.width,y0=image.height,x1=-1,y1=-1;for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(image.data[(y*image.width+x)*4+3]>128){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}if(x1<0)throw Error('Empty pixel pose');return{x0,y0,x1,y1};}
function largestComponent(image){const seen=new Uint8Array(image.width*image.height);let largest=[];for(let start=0;start<seen.length;start++){if(seen[start]||image.data[start*4+3]<=128)continue;const queue=[start];seen[start]=1;for(let i=0;i<queue.length;i++){const p=queue[i],x=p%image.width,y=Math.floor(p/image.width);for(const q of [x?p-1:-1,x+1<image.width?p+1:-1,y?p-image.width:-1,y+1<image.height?p+image.width:-1])if(q>=0&&!seen[q]&&image.data[q*4+3]>128){seen[q]=1;queue.push(q);}}if(queue.length>largest.length)largest=queue;}const keep=new Uint8Array(seen.length);for(const p of largest)keep[p]=1;for(let p=0;p<seen.length;p++)if(!keep[p])image.data.fill(0,p*4,p*4+4);return image;}
function extractPoses(atlas){
 const seen=new Uint8Array(atlas.width*atlas.height),groups=[];
 for(let start=0;start<seen.length;start++){
 if(seen[start]||atlas.data[start*4+3]<=128)continue;
 const queue=[start];seen[start]=1;let x0=atlas.width,y0=atlas.height,x1=0,y1=0;
 for(let i=0;i<queue.length;i++){const p=queue[i],x=p%atlas.width,y=Math.floor(p/atlas.width);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);for(const q of [x?p-1:-1,x+1<atlas.width?p+1:-1,y?p-atlas.width:-1,y+1<atlas.height?p+atlas.width:-1])if(q>=0&&!seen[q]&&atlas.data[q*4+3]>128){seen[q]=1;queue.push(q);}}
 if(queue.length>500)groups.push({queue,x0,y0,x1,y1});
 }
 const selected=groups.sort((a,b)=>b.queue.length-a.queue.length).slice(0,16),slots=[];
 if(selected.length!==16)throw Error(`Expected 16 connected drawings, got ${selected.length}`);
 for(const g of selected){const col=Math.min(3,Math.floor((g.x0+g.x1+1)/2/atlas.width*4)),row=Math.min(3,Math.floor((g.y0+g.y1+1)/2/atlas.height*4)),index=row*4+col;
 if(slots[index])throw Error(`Two drawings occupy pixel atlas cell ${index}; supply explicit rects.`);
 const image=blank(g.x1-g.x0+1,g.y1-g.y0+1);for(const p of g.queue){const x=p%atlas.width-g.x0,y=Math.floor(p/atlas.width)-g.y0;atlas.data.copy(image.data,(y*image.width+x)*4,p*4,p*4+4);}slots[index]={image,rect:[g.x0,g.y0,image.width,image.height]};
 }return slots;
}
function nearestColor(r,g,b){
 // Isolate clothing before color quantization so both corners stay exact.
 if(r>70&&r>g*1.65&&r>b*1.65&&g-b<28)return r>180?[211,47,47]:[183,28,28];
 let best=Infinity,result;for(const c of PIXEL_PALETTE.slice(0,-2)){const d=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2;if(d<best){best=d;result=c;}}return result;
}
export function expandPixels(image,factor=4){const out=blank(image.width*factor,image.height*factor);for(let y=0;y<out.height;y++)for(let x=0;x<out.width;x++){const p=(Math.floor(y/factor)*image.width+Math.floor(x/factor))*4;image.data.copy(out.data,(y*out.width+x)*4,p,p+4);}return out;}
function render(source,scale,lying=false){const b=bounds(source);let foot0=source.width,foot1=-1;for(let y=b.y1-Math.ceil((b.y1-b.y0)*.15);y<=b.y1;y++)for(let x=b.x0;x<=b.x1;x++)if(source.data[(y*source.width+x)*4+3]>128){foot0=Math.min(foot0,x);foot1=Math.max(foot1,x);}const pivot=lying?(b.x0+b.x1)/2:(foot0+foot1)/2,tx=64-pivot*scale,ty=120-(b.y1+1)*scale;
 if(tx+b.x0*scale<1||tx+(b.x1+1)*scale>127||ty+b.y0*scale<1)throw Error('Pose overflows at shared pixel scale; adjust drawing or common scale, never fit each pose.');
 const out=blank(128,128);for(let y=0;y<128;y++)for(let x=0;x<128;x++){const sx=Math.floor((x+.5-tx)/scale),sy=Math.floor((y+.5-ty)/scale);if(sx<0||sy<0||sx>=source.width||sy>=source.height)continue;const p=(sy*source.width+sx)*4;if(source.data[p+3]<=128)continue;const color=nearestColor(...source.data.subarray(p,p+3)),q=(y*128+x)*4;out.data.set([...color,255],q);}return{image:out,transform:{scale,tx,ty}};
}
function bounce(image,dy){const out=blank(128,128);for(let y=0;y<128;y++){if(y+dy<0||y+dy>=128)continue;image.data.copy(out.data,(y+dy)*128*4,y*128*4,(y+1)*128*4);}return out;}
export function buildPixelFighters(project){const source=join(project,'docs/assets/sources'),root=join(project,'public/assets'),layouts=JSON.parse(readFileSync(join(source,'pixel-layouts.json'))),report={};
 for(const letter of ['a','b','c','d'].filter(letter=>layouts[`fighter-${letter}`])){const skin=`fighter-${letter}`,config=layouts[skin],atlas=decodePNG(join(source,config.file));
 const extracted=config.rects?config.rects.map(rect=>({rect,image:largestComponent(crop(atlas,...rect))})):extractPoses(atlas),rects=extracted.map(p=>p.rect),poses=extracted.map(p=>p.image),b=bounds(poses[0]),scale=(config.guardHeight||100)/(b.y1-b.y0+1);
 const rendered=poses.map((pose,i)=>{try{return render(poses[config.poseMap?.[i]??i],scale,i>=11&&i<=13);}catch(e){throw Error(`${skin} pose ${i}: ${e.message}`);}});
 mkdirSync(join(project,'docs/assets/review'),{recursive:true});const contact=blank(512,512);for(let i=0;i<16;i++)for(let y=0;y<128;y++)rendered[i].image.data.copy(contact.data,((Math.floor(i/4)*128+y)*512+(i%4)*128)*4,y*128*4,(y+1)*128*4);encodePNG(join(project,`docs/assets/review/${skin}-pixel-poses.png`),expandPixels(contact,2));
 for(const[action,indices]of Object.entries(PIXEL_SEQUENCES)){const frames=indices.map((id,f)=>expandPixels(action==='idle'&&[1,2,4].includes(f)?bounce(rendered[id].image,-1):rendered[id].image));writeMotion(root,skin,action,frames);}
 report[skin]={scale,rects,transforms:rendered.map(r=>r.transform)};console.log(`${skin}: 16 pixel poses, one scale ${scale.toFixed(6)}, 4× nearest-neighbor export`);
 }
 writeFileSync(join(project,'docs/assets/pixel-build.json'),JSON.stringify(report,null,2)+'\n');return report;
}
