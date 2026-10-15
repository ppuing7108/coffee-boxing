// Small dependency-free PNG codec for the project's 8-bit RGB/RGBA assets.
import { inflateSync, deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

const signature = Buffer.from([137,80,78,71,13,10,26,10]);
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const tag = Buffer.from(type), out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length); tag.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([tag, data])), data.length + 8);
  return out;
}
export function decodePNG(path) {
  const bytes = readFileSync(path);
  if (!bytes.subarray(0,8).equals(signature)) throw new Error(`Not PNG: ${path}`);
  let width, height, channels, colorType, end = false;
  const blocks = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), tag = bytes.toString('ascii', offset+4, offset+8);
    const data = bytes.subarray(offset+8, offset+8+length);
    if (data.length !== length || offset+length+12 > bytes.length) throw new Error('Truncated PNG');
    if (crc32(bytes.subarray(offset+4, offset+8+length)) !== bytes.readUInt32BE(offset+8+length)) throw new Error(`PNG CRC: ${tag}`);
    if (tag === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9];
      if (data[8] !== 8 || ![2,6].includes(colorType) || data[12] !== 0) throw new Error('Expected non-interlaced 8-bit RGB/RGBA PNG');
      channels = colorType === 6 ? 4 : 3;
    }
    if (tag === 'IDAT') blocks.push(data);
    if (tag === 'IEND') { end = true; break; }
    offset += length + 12;
  }
  if (!end || !width || !height) throw new Error('Incomplete PNG');
  const raw = inflateSync(Buffer.concat(blocks)), stride = width * channels;
  if (raw.length !== (stride+1)*height) throw new Error('Invalid PNG data length');
  const pixels = Buffer.alloc(width*height*channels);
  const paeth = (a,b,c) => { const p=a+b-c, x=Math.abs(p-a), y=Math.abs(p-b), z=Math.abs(p-c); return x<=y && x<=z ? a : y<=z ? b : c; };
  for (let y=0;y<height;y++) {
    const filter = raw[y*(stride+1)];
    if (filter>4) throw new Error('Invalid PNG filter');
    for (let x=0;x<stride;x++) {
      const at=y*stride+x, a=x>=channels ? pixels[at-channels] : 0, b=y ? pixels[at-stride] : 0, c=y && x>=channels ? pixels[at-stride-channels] : 0;
      const predictor=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];
      pixels[at]=(raw[y*(stride+1)+1+x]+predictor)&255;
    }
  }
  const rgba=Buffer.alloc(width*height*4);
  for(let p=0;p<width*height;p++) { for(let c=0;c<3;c++) rgba[p*4+c]=pixels[p*channels+c]; rgba[p*4+3]=channels===4 ? pixels[p*4+3] : 255; }
  return {width,height,data:rgba,colorType};
}
export function encodePNG(path, {width,height,data}) {
  const header=Buffer.alloc(13); header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const raw=Buffer.alloc((width*4+1)*height);
  for(let y=0;y<height;y++) data.copy(raw,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
  writeFileSync(path,Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]));
}
export function crop(image,x,y,width,height) {
  const data=Buffer.alloc(width*height*4);
  for(let row=0;row<height;row++) image.data.copy(data,row*width*4,((y+row)*image.width+x)*4,((y+row)*image.width+x+width)*4);
  return {width,height,data};
}
