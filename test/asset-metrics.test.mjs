import test from 'node:test';
import assert from 'node:assert/strict';
import {measureFrame,measureHead,compareFrame} from '../scripts/lib/asset-metrics.mjs';
test('counts alpha >128 and uses bounds-relative top quarter in the selected frame',()=>{
  const image={width:16,height:8,data:Buffer.alloc(16*8*4)};
  const set=(x,y,a=255)=>{image.data[(y*16+x)*4+3]=a;};
  set(0,0); // A pixel in the other frame must not enter the measurement.
  set(10,4);set(12,4);set(11,5);set(11,6);set(11,7);set(15,4,128);
  assert.deepEqual(measureFrame(image,1,8),{area:5,headWidth:3,top:4,bottom:7});
});
test('normal motion area uses inclusive 0.88–1.15, recoil/KO 0.80–1.25',()=>{
  const ref={area:10000,headWidth:100};
  for(const action of ['idle','jab','hook','uppercut','block','dodge','hit','victory']){
    assert.equal(compareFrame({area:8800,headWidth:100},ref,action).bodyPass,true);
    assert.equal(compareFrame({area:11500,headWidth:100},ref,action).bodyPass,true);
    assert.equal(compareFrame({area:8799,headWidth:100},ref,action).bodyPass,false);
    assert.equal(compareFrame({area:11501,headWidth:100},ref,action).bodyPass,false);
  }
  for(const action of ['hit_heavy','ko']){
    assert.equal(compareFrame({area:8000,headWidth:100},ref,action).bodyPass,true);
    assert.equal(compareFrame({area:12500,headWidth:100},ref,action).bodyPass,true);
    assert.equal(compareFrame({area:7999,headWidth:100},ref,action).bodyPass,false);
    assert.equal(compareFrame({area:12501,headWidth:100},ref,action).bodyPass,false);
  }
});
test('head-width tolerance is ±8% and does not silently exempt KO or victory',()=>{
  const ref={area:10000,headWidth:100};
  for(const action of ['jab','ko','victory'])for(const [width,passes]of [[91,false],[92,true],[108,true],[109,false]])assert.equal(compareFrame({area:10000,headWidth:width},ref,action).headPass,passes);
});

test('actual head ROI excludes a wide arm and corner-colored gloves at both resolutions',()=>{
 for(const size of [256,512]){
 const res=size/256,image={width:size,height:size,data:Buffer.alloc(size*size*4)};
 const fill=(x0,y0,w,h,color)=>{for(let y=y0*res;y<(y0+h)*res;y++)for(let x=x0*res;x<(x0+w)*res;x++)image.data.set(color,(y*size+x)*4);};
 fill(20,110,210,25,[120,80,50,255]); // Arm outside head ROI.
 fill(95,50,20,20,[150,100,60,255]); // Actual skull.
 fill(115,50,8,20,[211,47,47,255]); // Glove overlaps ROI but is not head.
 assert.equal(measureHead(image,0,[108,60,32,20,0],size).headWidth,20*res);
 }
});
