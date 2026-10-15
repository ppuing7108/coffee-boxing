// Checks actual pixels, rather than trusting the manifest's style label.
export function inspectPixelArt(image,pixelSize=4,maxColors=26){
 let softAlpha=0,brokenBlocks=0;const colors=new Set();
 for(let p=0;p<image.data.length;p+=4){const a=image.data[p+3];if(a!==0&&a!==255)softAlpha++;if(a)colors.add((image.data[p]<<16)|(image.data[p+1]<<8)|image.data[p+2]);}
 for(let y=0;y<image.height;y+=pixelSize)for(let x=0;x<image.width;x+=pixelSize){const base=(y*image.width+x)*4;let broken=false;for(let yy=y;yy<Math.min(y+pixelSize,image.height);yy++)for(let xx=x;xx<Math.min(x+pixelSize,image.width);xx++){const p=(yy*image.width+xx)*4;for(let c=0;c<4;c++)if(image.data[p+c]!==image.data[base+c])broken=true;}if(broken)brokenBlocks++;}
 return{softAlpha,brokenBlocks,colors:colors.size,pass:softAlpha===0&&brokenBlocks===0&&colors.size<=maxColors};
}
