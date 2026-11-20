import assert from 'node:assert/strict';
import fs from 'node:fs';
import {terrainAt,terrainCell,screenLevel} from './dist/terrain.js';
const flat={width:9,height:9,bounds:[102,17,102.009,17.009],values:Array(81).fill(100)};
assert.equal(terrainAt(flat,102.0045,17.0045).slope,0);
assert.equal(terrainCell(flat,4,4).candidate,false);
assert.equal(terrainAt(flat,101,17.005),null);
const basin={...flat,values:[...flat.values]};basin.values[40]=95;
const low=terrainCell(basin,4,4);assert.equal(low.candidate,true);
assert.equal(screenLevel(low,0),0);assert.equal(screenLevel(low,30),1);assert.equal(screenLevel(low,75),2);assert.equal(screenLevel(low,150),3);
assert.equal(screenLevel(terrainCell(flat,4,4),150),0);
for(const id of ['vientiane','pakse','luangprabang','savannakhet']){
 const grid=JSON.parse(fs.readFileSync(new URL('./dist/data/'+id+'.json',import.meta.url)));
 assert.equal(grid.values.length,grid.width*grid.height);assert(grid.values.every(Number.isFinite));
 let candidates=0;for(let y=0;y<grid.height;y++)for(let x=0;x<grid.width;x++){const cell=terrainCell(grid,x,y);assert(Number.isFinite(cell.slope));if(cell.candidate)candidates++}
 assert(candidates>0&&candidates<grid.values.length);console.log(JSON.stringify({id,gridCells:grid.values.length,candidates,heightRange:[Math.min(...grid.values),Math.max(...grid.values)]}));
}
console.log('Terrain math and pilot grid checks passed; this is not scientific flood-model validation.');
