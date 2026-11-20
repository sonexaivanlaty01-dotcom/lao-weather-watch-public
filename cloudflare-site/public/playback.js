// Serial ready frames, explicit bounded replay, and a cancellable dwell.
export function cursorAtTime(slots,time,fallback=0){if(!slots.length)return 0;if(time===null)return fallback;const i=slots.findIndex(s=>s.time>=time);return i<0?slots.length-1:i}
export function playbackIndices(slots,start){return slots.map((s,i)=>s.frame>=0&&i>=start?i:-1).filter(i=>i>=0)}
export class Playback {
 constructor({render,onState=()=>{},holdMs=1200,speed=1}){this.render=render;this.onState=onState;this.holdMs=holdMs;this.speed=[1,2,3].includes(speed)?speed:1;this.generation=0;this.wake=null}
 setSpeed(speed){this.speed=[1,2,3].includes(speed)?speed:1;this.wake?.()}
 cancel(){this.generation++;this.wake?.();this.wake=null}
 async run(indices,context,{rounds=1,skipUnavailable=false}={}){
  this.cancel();const generation=this.generation;
  rounds=Math.max(1,Math.min(3,Math.floor(rounds)||1));let skipped=0;
  try{
   for(let round=1;round<=rounds;round++){
    let shownCount=0;
    for(let position=0;position<indices.length;position++){
     if(generation!==this.generation)return 'cancelled';const index=indices[position],details={position,total:indices.length,index,round,rounds,speed:this.speed};this.onState('loading',details);
     const shown=await this.render(index,context);if(generation!==this.generation)return 'cancelled';
     if(shown===false){if(!skipUnavailable)throw new Error('frame_unavailable');skipped++;this.onState('skipped',{...details,skipped});continue}
     shownCount++;this.onState('playing',{...details,speed:this.speed,skipped});
     if(position<indices.length-1||round<rounds)await new Promise(resolve=>{const timer=setTimeout(()=>{this.wake=null;resolve()},this.holdMs/this.speed);this.wake=()=>{clearTimeout(timer);this.wake=null;resolve()}});
    }
    if(!shownCount)throw new Error('frame_unavailable');
   }
   if(generation===this.generation)this.onState('ended',{rounds,skipped});return 'ended';
  }catch(error){if(generation!==this.generation)return 'cancelled';this.onState('error',{error});return 'error'}
 }
}
export class RenderGate {
 constructor(){this.revision=0}
 cancel(){this.revision++}
 async prepare(load,commit){const revision=++this.revision,value=await load();if(revision!==this.revision)return false;await commit(value,()=>revision===this.revision);return revision===this.revision}
}
