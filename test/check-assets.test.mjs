import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { decodePNG, encodePNG } from '../scripts/lib/png.mjs';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const original=join(project,'public/assets');
function run(path=original){return spawnSync(process.execPath,[join(project,'scripts/check-assets.js'),path],{encoding:'utf8'});}
function fixture(fn){const temp=mkdtempSync(join(tmpdir(),'boxing-assets-'));try{cpSync(original,temp,{recursive:true});fn(temp);}finally{rmSync(temp,{recursive:true,force:true});}}
test('reports remaining consistency violations without structural or palette errors',()=>{
 const r=run();assert.equal(r.status,1);const failures=r.stderr.trim().split('\n');
 assert.ok(failures.length>0);for(const failure of failures)assert.match(failure,/^FAIL fighters\/fighter-[abd]\/(red|blue)\/[a-z_]+\.png: frame \d+ (actual head-width|body area) ratio /);
 assert.ok(failures.some(line=>line.includes('actual head-width ratio')));
});
test('rejects a manifest with the wrong fps',()=>fixture(root=>{const path=join(root,'manifest.json'),m=JSON.parse(readFileSync(path));m.fps=24;writeFileSync(path,JSON.stringify(m));const r=run(root);assert.equal(r.status,1);assert.match(r.stderr,/fps must be 12/);}));
test('rejects PNG corruption instead of trusting the header',()=>fixture(root=>{const path=join(root,'effects/whoosh.png'),png=readFileSync(path);png[Math.floor(png.length/2)]^=1;writeFileSync(path,png);const r=run(root);assert.equal(r.status,1);assert.match(r.stderr,/PNG CRC/);}));
test('rejects unrelated corner pixel changes',()=>fixture(root=>{const path=join(root,'fighters/fighter-a/blue/idle.png'),image=decodePNG(path);let p=0;while(image.data[p+3]<200)p+=4;image.data[p]=0;image.data[p+1]=255;image.data[p+2]=0;encodePNG(path,image);const r=run(root);assert.equal(r.status,1);assert.match(r.stderr,/unexpected corner pixel differences/);}));
test('rejects a missing required asset',()=>fixture(root=>{rmSync(join(root,'ui/coffee.png'));const r=run(root);assert.equal(r.status,1);assert.match(r.stderr,/ui\/coffee.png/);assert.match(r.stderr,/expected 98 PNG files/);}));
