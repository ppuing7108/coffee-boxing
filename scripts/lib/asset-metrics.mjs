// Asset spec §8.2. Alpha threshold is strictly greater than 128.
// measureFrame also returns the legacy top-quarter proxy for diagnostics.
// The checker replaces it with measureHead from the annotated actual head ROI.
export function measureFrame(image, index, size=256) {
  let area=0, top=size, bottom=-1;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    if(image.data[(y*image.width+index*size+x)*4+3]>128) {
      area++; top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
  }
  if(!area)return {area:0,headWidth:0,top:null,bottom:null};
  const end=top+Math.ceil((bottom-top+1)/4);
  let left=size,right=-1;
  for(let y=top;y<end;y++)for(let x=0;x<size;x++) {
    if(image.data[(y*image.width+index*size+x)*4+3]>128) {
      left=Math.min(left,x);right=Math.max(right,x);
    }
  }
  return {area,headWidth:right-left+1,top,bottom};
}
export function measureHead(image,index,region,size=256){
  const resolution=size/256;
  const [cx,cy,width,height]=region.slice(0,4).map(value=>value*resolution),angle=region[4]||0,theta=angle*Math.PI/180,cos=Math.cos(theta),sin=Math.sin(theta);
  let left=Infinity,right=-Infinity,count=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const dx=x-cx,dy=y-cy,lx=cos*dx+sin*dy,ly=-sin*dx+cos*dy;
    if(Math.abs(lx)>width/2||Math.abs(ly)>height/2)continue;
    // The lower rear corner is hair trailing onto the neck/shoulder, and the
    // lower front corner is jaw/neck rather than cranial breadth.
    if(ly>0&&(lx < -width/2+(ly/(height/2))*width*.22 || lx > width/2-(ly/(height/2))*width*.10))continue;
    const p=(y*image.width+index*size+x)*4,[r,g,b,a]=image.data.subarray(p,p+4);
    // Exclude gloves crossing the annotated skull/face region in either corner.
    const red=r>65&&r>g*1.25&&r>b*1.25&&(g-b)/(r-b)<.14;
    const blue=b>65&&b>r*1.25&&b>g*1.1;
    if(a<=128||red||blue)continue;
    left=Math.min(left,lx);right=Math.max(right,lx);count++;
  }
  return {headWidth:count?right-left+1:0,headPixels:count};
}
export function compareFrame(measurement,reference,action) {
  const bodyRange=['hit_heavy','ko'].includes(action)?[.80,1.25]:[.88,1.15];
  const bodyRatio=measurement.area/reference.area;
  const headWidthRatio=measurement.headWidth/reference.headWidth;
  return {bodyRatio,headWidthRatio,bodyRange,headRange:[.92,1.08],
    bodyPass:Number.isFinite(bodyRatio)&&bodyRatio>=bodyRange[0]&&bodyRatio<=bodyRange[1],
    headPass:Number.isFinite(headWidthRatio)&&headWidthRatio>=.92&&headWidthRatio<=1.08};
}
