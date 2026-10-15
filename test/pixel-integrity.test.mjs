import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPixelArt} from '../scripts/lib/pixel-integrity.mjs';
test('accepts aligned opaque pixel clusters and rejects blur or a broken pixel grid',()=>{
 const image={width:8,height:8,data:Buffer.alloc(8*8*4)};
 for(let y=0;y<4;y++)for(let x=4;x<8;x++)image.data.set([211,47,47,255],(y*8+x)*4);
 assert.deepEqual(inspectPixelArt(image),{softAlpha:0,brokenBlocks:0,colors:1,pass:true});
 image.data[(1*8+5)*4+3]=180;let r=inspectPixelArt(image);assert.equal(r.pass,false);assert.equal(r.softAlpha,1);assert.equal(r.brokenBlocks,1);
 image.data[(1*8+5)*4+3]=255;image.data[(1*8+5)*4]=210;r=inspectPixelArt(image);assert.equal(r.softAlpha,0);assert.equal(r.brokenBlocks,1);assert.equal(r.pass,false);
});
