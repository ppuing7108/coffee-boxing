import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadManifest,Sprite} from '../public/sprites.js';

test('512px source frames retain the 256px display size and crop each frame correctly',async()=>{
 const old={fetch:globalThis.fetch,document:globalThis.document,Image:globalThis.Image,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};
 const calls=[],ticks=[];
 const context={scale:(...args)=>calls.push(['scale',...args]),clearRect(){},drawImage:(...args)=>calls.push(['draw',...args])};
 const canvas={style:{},getContext:()=>context};
 try{
 globalThis.fetch=async()=>({ok:true,json:async()=>JSON.parse(readFileSync(new URL('../public/assets/manifest.json',import.meta.url)))});
 globalThis.document={createElement:()=>canvas};
 globalThis.Image=class{decode(){return Promise.resolve();}};
 globalThis.setInterval=fn=>{ticks.push(fn);return 1;};globalThis.clearInterval=()=>{};
 const manifest=await loadManifest();assert.equal(manifest.frameSize,512);assert.equal(manifest.displayFrameSize,256);
 const el={style:{setProperty(){}},classList:{add(){},toggle(){}},dataset:{},replaceChildren(){}};
 const sprite=new Sprite(el,{skin:'fighter-c',corner:'red'});await sprite.play('jab');
 assert.equal(el.style.width,'256px');assert.equal(canvas.width,512);assert.equal(context.imageSmoothingEnabled,false);assert.equal(canvas.style.width,'256px');
 assert.deepEqual(calls[0],['scale',2,2]);
 assert.deepEqual(calls.at(-1).slice(2),[0,0,512,512,0,0,256,256]);
 ticks[0]();assert.deepEqual(calls.at(-1).slice(2),[512,0,512,512,0,0,256,256]);sprite.stop();
 }finally{Object.assign(globalThis,old);}
});
