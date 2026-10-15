// Propose head regions by reference-template matching, then render contact sheets
// for visual review. This never modifies sprite pixels or scales a fighter.
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';
import{createHash}from'node:crypto';
import{decodePNG,crop,encodePNG}from'./lib/png.mjs';
import{measureHead}from'./lib/asset-metrics.mjs';
const manifest=JSON.parse(readFileSync('public/assets/manifest.json'));
// Analyze in logical coordinates, preserving the original high-resolution file hash.
function logicalSheet(path){
 const source=decodePNG(path),res=source.height/256,width=source.width/res,out={width,height:256,data:Buffer.alloc(width*256*4)};
 for(let y=0;y<256;y++)for(let x=0;x<width;x++)for(let c=0;c<4;c++){
 let total=0;for(let dy=0;dy<res;dy++)for(let dx=0;dx<res;dx++)total+=source.data[((y*res+dy)*source.width+x*res+dx)*4+c];
 out.data[(y*width+x)*4+c]=Math.round(total/(res*res));
 }return out;
}
const overrides=JSON.parse(readFileSync('docs/assets/head-overrides.json'));
// Skull and face bounds, with neck/ponytail excluded. x,y,width,height.
const references={a:[125,40,52,58],b:[145,42,49,62],c:[110,50,79,77],d:[106,55,58,65]};
const output={version:1,description:'Reviewed oriented head regions [centerX,centerY,width,height,clockwiseDegrees]; skull and face, excluding neck, gloves and loose ponytail. Pixels are alpha>128; clothing is excluded; width is measured along the local head axis.',skins:{}};
function match(image,ref,box,action){
  const [x0,y0,w,h]=box,cx=x0+w/2,cy=y0+h/2,points=[];
  for(let y=1;y<h*.7;y+=2)for(let x=1;x<w-2;x+=2){const p=((y0+y)*ref.width+x0+x)*4;const[r,g,b,a]=ref.data.subarray(p,p+4);if(a>200&&!(r>g*1.8&&r>b*1.8&&g-b<25))points.push([x-w/2,y-h/2,r,g,b]);}
  const angles=action==='ko'?[-100,-90,-75,-60,-45,-30,-15,0,15,30]:['hit','hit_heavy','dodge'].includes(action)?[-45,-30,-15,0,15]:[-15,0,15];
  let best={score:Infinity};
  function score(x,y,angle){const theta=angle*Math.PI/180,cos=Math.cos(theta),sin=Math.sin(theta);let error=0;for(const[dx,dy,r,g,b]of points){const xx=Math.round(x+cos*dx-sin*dy),yy=Math.round(y+sin*dx+cos*dy);if(xx<0||yy<0||xx>=256||yy>=256){error+=150000;continue;}const p=(yy*256+xx)*4,alpha=image.data[p+3];error+=(r-image.data[p])**2+(g-image.data[p+1])**2+(b-image.data[p+2])**2+(255-alpha)**2;}return error/points.length;}
  let top=256,left=256,bottom=-1,right=-1;for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(image.data[(y*256+x)*4+3]>128){top=Math.min(top,y);bottom=Math.max(bottom,y);left=Math.min(left,x);right=Math.max(right,x);}
  const horizontal=action==='ko'&&(right-left)>(bottom-top)*1.05;
  const minY=action==='victory'?74:horizontal?top+10:top+25,maxY=action==='victory'?110:horizontal?bottom:top+39;
  const minX=horizontal?left+12:24,maxX=horizontal?Math.min(left+65,220):230;
  for(const angle of angles)for(let y=minY;y<maxY;y+=4)for(let x=minX;x<maxX;x+=4){const value=score(x,y,angle);if(value<best.score)best={score:value,x,y,angle};}
  const coarse={...best};for(let angle=coarse.angle-8;angle<=coarse.angle+8;angle+=4)for(let y=coarse.y-5;y<=coarse.y+5;y+=2)for(let x=coarse.x-5;x<=coarse.x+5;x+=2){const value=score(x,y,angle);if(value<best.score)best={score:value,x,y,angle};}
  // Search is only an annotation aid; the stored region remains inspectable.
  const theta=best.angle*Math.PI/180,shift=-h*.15;
  return [best.x-Math.sin(theta)*shift,best.y+Math.cos(theta)*shift,w,h*.7,best.angle];
}
for(const skin of manifest.skins){
  const letter=skin.at(-1),reference=crop(logicalSheet(`public/assets/fighters/${skin}/red/idle.png`),0,0,256,256),box=references[letter],refRegion=[box[0]+box[2]/2,box[1]+box[3]/2,box[2],box[3],0],cache=new Map();
  const capRegion=[refRegion[0],refRegion[1]-box[3]*.15,box[2],box[3]*.7,0];
  const data={reference:capRegion,actions:{}},review={width:2560,height:2560,data:Buffer.alloc(2560*2560*4)};
  for(const[row,[action,spec]]of Object.entries(Object.entries(manifest.actions))){
    const path=`public/assets/fighters/${skin}/red/${action}.png`,image=logicalSheet(path),regions=[];
    for(let f=0;f<spec.frames;f++){
      const frame=crop(image,f*256,0,256,256),key=createHash('sha256').update(frame.data).digest('hex');
      let region=cache.get(key);
      if(!region){region=key===createHash('sha256').update(reference.data).digest('hex')?capRegion:match(frame,reference,box,action);cache.set(key,region);}
      if(overrides[skin]?.[action]?.[f]){region=overrides[skin][action][f];cache.set(key,region);}
      regions.push(region);
      for(let y=0;y<256;y++)frame.data.copy(review.data,((Number(row)*256+y)*review.width+f*256)*4,y*1024,(y+1)*1024);
      const[cx,cy,w,h,angle]=region,theta=angle*Math.PI/180,cos=Math.cos(theta),sin=Math.sin(theta);
      for(let t=0;t<=360;t++)for(const edge of [0,1,2,3]){const u=t/360,dx=edge===0?-w/2:edge===1?w/2:-w/2+u*w,dy=edge===2?-h/2:edge===3?h/2:-h/2+u*h,x=Math.round(cx+cos*dx-sin*dy),y=Math.round(cy+sin*dx+cos*dy);if(x>=0&&x<256&&y>=0&&y<256){const p=((Number(row)*256+y)*review.width+f*256+x)*4;review.data[p]=40;review.data[p+1]=255;review.data[p+2]=180;review.data[p+3]=255;}}
    }
    data.actions[action]={imageSha256:createHash('sha256').update(readFileSync(path)).digest('hex'),regions};
  }
  output.skins[skin]=data;
  mkdirSync('docs/assets/review',{recursive:true});encodePNG(`docs/assets/review/${skin}-heads.png`,review);
  const baseline=measureHead(reference,0,capRegion).headWidth,bad=[];
  for(const[action,{regions}]of Object.entries(data.actions)){const image=logicalSheet(`public/assets/fighters/${skin}/red/${action}.png`);regions.forEach((region,f)=>{const width=measureHead(image,f,region).headWidth,ratio=width/baseline;if(ratio<.92||ratio>1.08)bad.push(`${action}${f}:${width.toFixed(1)}(${ratio.toFixed(2)})`);});}
  console.log(skin,'reference',baseline.toFixed(2),'failures',bad.length,bad.join(' '));
}
writeFileSync('docs/assets/head-regions.json',JSON.stringify(output,null,2)+'\n');
