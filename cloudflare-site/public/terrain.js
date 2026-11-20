export function terrainAt(grid,lon,lat){
 const [west,south,east,north]=grid.bounds;
 if(lon<west||lon>=east||lat<=south||lat>north)return null;
 const x=Math.min(grid.width-1,Math.floor((lon-west)/(east-west)*grid.width));
 const y=Math.min(grid.height-1,Math.floor((north-lat)/(north-south)*grid.height));
 return terrainCell(grid,x,y);
}
export function terrainCell(grid,x,y){
 const {width:w,height:h,values:v,bounds:b}=grid;
 const elevation=v[y*w+x];if(!Number.isFinite(elevation))return null;
 const dx=(b[2]-b[0])*111320*Math.cos((b[1]+b[3])/2*Math.PI/180)/w;
 const dy=(b[3]-b[1])*111320/h;
 const left=Math.max(0,x-1),right=Math.min(w-1,x+1),up=Math.max(0,y-1),down=Math.min(h-1,y+1);
 const gx=(v[y*w+right]-v[y*w+left])/((right-left)*dx||dx);
 const gy=(v[down*w+x]-v[up*w+x])/((down-up)*dy||dy);
 const slope=Math.atan(Math.hypot(gx,gy))*180/Math.PI;
 let total=0,count=0;
 for(let yy=Math.max(0,y-4);yy<=Math.min(h-1,y+4);yy++)for(let xx=Math.max(0,x-4);xx<=Math.min(w-1,x+4);xx++){if(Number.isFinite(v[yy*w+xx])){total+=v[yy*w+xx];count++}}
 const depression=total/count-elevation;
 // Screening only. No drainage capacity, river levels, flow routing or calibrated probability.
 const candidate=depression>=2&&slope<5;
 return{elevation,slope,depression,candidate,x,y};
}
export function screenLevel(cell,rain){
 if(!cell||!cell.candidate||rain<20)return 0;
 if(rain>=100)return 3;
 if(rain>=50)return 2;
 return 1;
}
export function elevationColor(value,min,max){
 const t=Math.max(0,Math.min(1,(value-min)/Math.max(1,max-min)));
 return[Math.round(45+190*t),Math.round(152-85*t),Math.round(207-170*t),180];
}
