// Display-only, premultiplied-alpha filtering. Numerical weather data is untouched.
// Monotone cubic interpolation: continuous edges without sharpening halos or
// new colour/opacity extrema. Work on neighbouring source pixels before zooming.
function cubic(a,b,c,d,t){
 const delta=c-b,limit=3*Math.abs(delta);
 const slope=(u,v)=>u*v<=0?0:Math.sign(delta)*Math.min(Math.abs((u+v)/2),limit);
 const m0=slope(b-a,delta),m1=slope(delta,d-c),t2=t*t,t3=t2*t;
 return Math.max(Math.min(b,c),Math.min(Math.max(b,c),(2*t3-3*t2+1)*b+(t3-2*t2+t)*m0+(-2*t3+3*t2)*c+(t3-t2)*m1));
}
export function resampleRGBA(pixels,width,height,outWidth,outHeight,{crop=[0,0,width,height],preserveGaps=false}={}){
 if(pixels.length!==width*height*4||![width,height,outWidth,outHeight].every(v=>Number.isInteger(v)&&v>0))throw new Error('invalid_image');
 const [left,top,cropWidth,cropHeight]=crop;
 if(!crop.every(Number.isFinite)||cropWidth<=0||cropHeight<=0)throw new Error('invalid_crop');
 const rows=new Float32Array(height*outWidth*4),result=new Uint8ClampedArray(outWidth*outHeight*4);
 const sample=(x,y,k)=>{const i=(y*width+Math.max(0,Math.min(width-1,x)))*4;return k===3?pixels[i+3]:pixels[i+k]*pixels[i+3]/255};
 for(let x=0;x<outWidth;x++){
  const sx=left+(x+.5)*cropWidth/outWidth-.5,ix=Math.floor(sx),t=sx-ix;
  for(let y=0;y<height;y++)for(let k=0;k<4;k++)rows[(y*outWidth+x)*4+k]=cubic(sample(ix-1,y,k),sample(ix,y,k),sample(ix+1,y,k),sample(ix+2,y,k),t);
 }
 for(let y=0;y<outHeight;y++){
  const sy=top+(y+.5)*cropHeight/outHeight-.5,iy=Math.floor(sy),t=sy-iy;
  const row=[iy-1,iy,iy+1,iy+2].map(v=>Math.max(0,Math.min(height-1,v))*outWidth*4);
  for(let x=0;x<outWidth;x++){
   const i=(y*outWidth+x)*4,q=x*4;
   if(preserveGaps){const sx=Math.max(0,Math.min(width-1,Math.round(left+(x+.5)*cropWidth/outWidth-.5))),yy=Math.max(0,Math.min(height-1,Math.round(sy)));if(!pixels[(yy*width+sx)*4+3])continue}
   const a=cubic(rows[row[0]+q+3],rows[row[1]+q+3],rows[row[2]+q+3],rows[row[3]+q+3],t);if(a<.5)continue;
   for(let k=0;k<3;k++)result[i+k]=cubic(rows[row[0]+q+k],rows[row[1]+q+k],rows[row[2]+q+k],rows[row[3]+q+k],t)*255/a;
   result[i+3]=a;
  }
 }
 return result;
}
export function smoothingSize(width,height,radius){
 const scale=Math.min(1,3/Math.max(1,radius));
 return {width:Math.max(8,Math.round(width*scale)),height:Math.max(8,Math.round(height*scale)),radius:Math.max(1,Math.min(3,Math.round(radius*scale)))};
}
export function softenRGBA(pixels,width,height,radius=1,{preserveGaps=false}={}){
 if(pixels.length!==width*height*4)throw new Error('invalid_image');
 const r=Math.max(1,Math.min(3,Math.round(radius))),span=2*r+1;
 let source=new Float32Array(pixels.length),target=new Float32Array(pixels.length);
 for(let i=0;i<pixels.length;i+=4){const a=pixels[i+3]/255;source[i]=pixels[i]*a;source[i+1]=pixels[i+1]*a;source[i+2]=pixels[i+2]*a;source[i+3]=pixels[i+3]}
 const pass=horizontal=>{
  const lines=horizontal?height:width,length=horizontal?width:height,step=horizontal?4:width*4;
  for(let line=0;line<lines;line++){
   const origin=horizontal?line*width*4:line*4;
   for(let channel=0;channel<4;channel++){
    let sum=0;for(let k=-r;k<=r;k++)sum+=source[origin+Math.max(0,Math.min(length-1,k))*step+channel];
    for(let p=0;p<length;p++){target[origin+p*step+channel]=sum/span;sum-=source[origin+Math.max(0,p-r)*step+channel];sum+=source[origin+Math.min(length-1,p+r+1)*step+channel]}
   }
  }
  [source,target]=[target,source];
 };
 for(let p=0;p<3;p++){pass(true);pass(false)}
 const result=new Uint8ClampedArray(pixels.length);
 for(let i=0;i<result.length;i+=4){const a=source[i+3];if(a<.5||(preserveGaps&&!pixels[i+3]))continue;result[i]=source[i]*255/a;result[i+1]=source[i+1]*255/a;result[i+2]=source[i+2]*255/a;result[i+3]=a}
 return result;
}
