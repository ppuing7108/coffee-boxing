#!/usr/bin/env node
// Usage: node scripts/check-assets.js [asset-directory]
// No npm install required. Semantic pose checks are documented separately.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {createHash}from'node:crypto';
import { decodePNG } from './lib/png.mjs';
import {inspectPixelArt} from './lib/pixel-integrity.mjs';
import { measureFrame, measureHead, compareFrame } from './lib/asset-metrics.mjs';

const args=process.argv.slice(2);
const root = resolve(args.find(arg=>!arg.startsWith('--')) || join(dirname(fileURLToPath(import.meta.url)), '../public/assets'));
const failures = [], checked = new Map();
let manifest;
const assert = (ok, message) => { if (!ok) failures.push(message); };
const actions = {
  idle:{frames:6,loop:true}, jab:{frames:4,loop:false,impactFrame:2},
  hook:{frames:6,loop:false,impactFrame:3}, uppercut:{frames:7,loop:false,impactFrame:4},
  block:{frames:4,loop:false,hold:true}, dodge:{frames:5,loop:false},
  hit:{frames:3,loop:false}, hit_heavy:{frames:5,loop:false},
  ko:{frames:10,loop:false,hold:true}, victory:{frames:6,loop:true}
};
const effects={hit_spark:{frames:5,size:128},crit_spark:{frames:6,size:192},block_spark:{frames:4,size:128},whoosh:{frames:4,size:128}};
const skins=['fighter-a','fighter-b','fighter-c','fighter-d'];
let headRegions;
try{headRegions=JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)),'../docs/assets/head-regions.json'),'utf8'));}
catch(error){failures.push(`head-regions.json: ${error.message}`);}
function inspect(path,width,height,frameWidth=width,transparent=true) {
  try {
    const image=decodePNG(join(root,path)); checked.set(path,image);
    assert(image.width===width && image.height===height,`${path}: expected ${width}×${height}, got ${image.width}×${image.height}`);
    assert(image.colorType===6,`${path}: PNG must be RGBA`);
    assert(image.data.some((v,i)=>i%4===3 && v>0),`${path}: empty image`);
    if(transparent) assert(image.data.some((v,i)=>i%4===3 && v===0),`${path}: no transparent pixels`);
    if(image.width!==width || image.height!==height) return;
    if(manifest?.artStyle==='pixel-art'&&path.startsWith('fighters/')&&!path.endsWith('/portrait.png')){
      const pixel=inspectPixelArt(image,4,26);
      assert(pixel.softAlpha===0,`${path}: pixel art contains ${pixel.softAlpha} antialiased alpha pixels`);
      assert(pixel.brokenBlocks===0,`${path}: pixel art breaks the 4px grid in ${pixel.brokenBlocks} blocks`);
      assert(pixel.colors<=26,`${path}: pixel art exceeds the 26-color palette (${pixel.colors})`);
    }
    for(let f=0;f<width/frameWidth;f++) {
      let visible=0, touchesEdge=false, bottom=-1;
      for(let y=0;y<height;y++)for(let x=0;x<frameWidth;x++) {
        const alpha=image.data[(y*width+f*frameWidth+x)*4+3];
        if(alpha>16) {visible++; if(x===0||x===frameWidth-1||y===0||y===height-1)touchesEdge=true;}
        if(alpha>128)bottom=Math.max(bottom,y);
      }
      assert(visible>0,`${path}: frame ${f} is empty`);
      if(path.startsWith('fighters/')) assert(!touchesEdge,`${path}: frame ${f} touches frame edge (possible clipping)`);
      if(path.startsWith('fighters/')&&!path.endsWith('/portrait.png'))assert(bottom>=476&&bottom<=480,`${path}: frame ${f} is off the y=480 ground anchor`);
    }
  } catch(e) { failures.push(`${path}: ${e.message}`); }
}
try {
  manifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
  assert(manifest.frameSize===512,'manifest: frameSize must be 512');
  assert(manifest.displayFrameSize===256,'manifest: displayFrameSize must be 256');
  assert(manifest.anchor?.x===256&&manifest.anchor?.y===480,'manifest: source anchor must be (256,480)');
  assert(manifest.fps===12,'manifest: fps must be 12');
  assert(JSON.stringify(manifest.skins)===JSON.stringify(skins),'manifest: incorrect skins');
  assert(JSON.stringify(manifest.corners)===JSON.stringify(['red','blue']),'manifest: incorrect corners');
  for(const [key,spec] of Object.entries(actions))for(const [field,value]of Object.entries(spec))assert(manifest.actions?.[key]?.[field]===value,`manifest: actions.${key}.${field}`);
  for(const [key,spec] of Object.entries(effects))for(const [field,value]of Object.entries(spec))assert(manifest.effects?.[key]?.[field]===value,`manifest: effects.${key}.${field}`);
  assert(Object.keys(manifest.actions||{}).length===10,'manifest: expected 10 actions');
  assert(Object.keys(manifest.effects||{}).length===4,'manifest: expected 4 effects');
} catch(e) { failures.push(`manifest.json: ${e.message}`); }
for(const skin of skins)for(const corner of ['red','blue']) {
  for(const [action,{frames}] of Object.entries(actions))inspect(`fighters/${skin}/${corner}/${action}.png`,frames*512,512,512);
  inspect(`fighters/${skin}/${corner}/portrait.png`,256,256);
}
for(const [name,{frames,size}]of Object.entries(effects))inspect(`effects/${name}.png`,frames*size,size,size);
for(const skin of skins)for(const corner of ['red','blue'])for(const action of ['jab','hook','uppercut','dodge']){
  const prefix=`fighters/${skin}/${corner}`,idle=checked.get(`${prefix}/idle.png`),motion=checked.get(`${prefix}/${action}.png`);
  if(!idle||!motion)continue;
  let same=true;
  for(let y=0;y<512;y++)if(!idle.data.subarray(y*idle.width*4,y*idle.width*4+2048).equals(motion.data.subarray((y*motion.width+motion.width-512)*4,(y*motion.width+motion.width)*4)))same=false;
  assert(same,`${prefix}/${action}: final frame must return to idle guard`);
}
for(const [name,w,h]of [['ring',1280,720],['ko',768,256],['fight',768,256],['coffee',512,512],['corner_red',256,96],['corner_blue',256,96]])inspect(`ui/${name}.png`,w,h,w,name!=='ring');
const consistency=[];
for(const skin of skins)for(const corner of ['red','blue']){
  const prefix=`fighters/${skin}/${corner}`,idle=checked.get(`${prefix}/idle.png`);
  if(!idle||idle.width!==3072||idle.height!==512)continue;
  const reference=measureFrame(idle,0,512);
  const annotations=headRegions?.skins?.[skin];
  assert(Boolean(annotations),`${skin}: missing actual head regions`);
  if(annotations)Object.assign(reference,measureHead(idle,0,annotations.reference,512));
  for(const [action,{frames}]of Object.entries(actions)){
    const image=checked.get(`${prefix}/${action}.png`);
    if(!image||image.width!==frames*512||image.height!==512)continue;
    const annotation=annotations?.actions?.[action];
    assert(annotation?.regions?.length===frames,`${prefix}/${action}.png: missing head annotations`);
    if(corner==='red'&&annotation)assert(createHash('sha256').update(readFileSync(join(root,`${prefix}/${action}.png`))).digest('hex')===annotation.imageSha256,`${prefix}/${action}.png: image changed; head annotations require review`);
    for(let frame=0;frame<frames;frame++){
      const measured=measureFrame(image,frame,512);
      if(annotation?.regions?.[frame])Object.assign(measured,measureHead(image,frame,annotation.regions[frame],512));
      const comparison=compareFrame(measured,reference,action);
      consistency.push({skin,corner,action,frame,...measured,reference,...comparison});
      assert(comparison.bodyPass,`${prefix}/${action}.png: frame ${frame} body area ratio ${comparison.bodyRatio.toFixed(3)} outside ${comparison.bodyRange.join('–')} of idle0`);
      assert(comparison.headPass,`${prefix}/${action}.png: frame ${frame} actual head-width ratio ${comparison.headWidthRatio.toFixed(3)} outside 0.92–1.08 of idle0 (reviewed skull region, gloves and neck excluded)`);
    }
  }
}
const reportArg=args.find(arg=>arg.startsWith('--report='));
if(reportArg)writeFileSync(resolve(reportArg.slice('--report='.length)),JSON.stringify({
  alphaThreshold:128,headMeasurement:'Opaque cranial breadth in an annotated oriented head region; gloves, neck and trailing hair excluded. Width is measured along the local head axis. Occluded legacy A/B heads can fail and require manual review.',
  frames:consistency,
  summary:skins.map(skin=>{const frames=consistency.filter(f=>f.skin===skin&&f.corner==='red');return {skin,frames:frames.length,bodyFailures:frames.filter(f=>!f.bodyPass).length,headFailures:frames.filter(f=>!f.headPass).length};})
},null,2)+'\n');
// Every non-clothing pixel, including alpha, must be identical across corners.
for(const skin of skins)for(const name of [...Object.keys(actions),'portrait']) {
  const prefix=`fighters/${skin}`,red=checked.get(`${prefix}/red/${name}.png`),blue=checked.get(`${prefix}/blue/${name}.png`);
  if(!red||!blue||red.data.length!==blue.data.length)continue;
  let differences=0,wrong=0;
  for(let p=0;p<red.data.length;p+=4) {
    const r=red.data[p],g=red.data[p+1],b=red.data[p+2];
    const mapped=r===211&&g===47&&b===47?[25,118,210]:r===183&&g===28&&b===28?[13,71,161]:null;
    const changed=r!==blue.data[p]||g!==blue.data[p+1]||b!==blue.data[p+2];
    if(red.data[p+3]!==blue.data[p+3])wrong++;
    if(changed){differences++;if(!mapped||mapped.some((value,c)=>blue.data[p+c]!==value))wrong++;}
    else if(mapped&&red.data[p+3]>0)wrong++;
  }
  assert(differences>0,`${prefix}/${name}: corner palette never changes`);
  assert(wrong===0,`${prefix}/${name}: ${wrong} unexpected corner pixel differences`);
}
function list(dir) {return readdirSync(dir).flatMap(name=>statSync(join(dir,name)).isDirectory()?list(join(dir,name)):[join(dir,name)]);}
try { const pngs=list(root).filter(p=>p.endsWith('.png'));assert(pngs.length===98,`expected 98 PNG files, found ${pngs.length}`); } catch(e) {failures.push(e.message);}
if(failures.length) {console.error(failures.map(x=>`FAIL ${x}`).join('\n'));process.exitCode=1;}
else console.log(`PASS: 98 RGBA PNGs; dimensions, nonempty frames, frame margins, ground baseline, return to guard, body area, actual head width, exact corner palette and manifest verified.\nManual review required: horizontal foot anchor, facing direction, impact poses, loop continuity, visual quality.\nRing is an opaque RGBA scene; all other images contain transparency.`);
