import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scenes,levels } from '../dist/history/scenes.js';
import { initialState,readState,keyFor,progress,decodeRegions } from '../dist/history/state.js';

test('historical journey unlocks the next scene only after completion and awards stars once',()=>{
  const state=initialState();
  assert.deepEqual(progress(state).unlocked,[true,false,false,false,false,false,false,false,false]);
  for(const level of levels)state.numbered[keyFor(scenes[0],level.id)]=Array.from({length:level.count},(_,i)=>i);
  const status=progress(state);assert.equal(status.stars,3);assert.equal(status.unlocked[1],true);assert.equal(status.unlocked[2],false);
  state.free[keyFor(scenes[1],'easy')]=Object.fromEntries(Array.from({length:24},(_,i)=>[i,{color:'#123456',texture:'paper',finish:'glitter'}]));
  assert.equal(progress(state).stars,3);assert.equal(progress(state).unlocked[2],false);
  state.numbered[keyFor(scenes[2],'easy')]=Array.from({length:24},(_,i)=>i);
  assert.equal(progress(state).unlocked[3],false);
});

test('saved historical paints stay independent by scene, mode and difficulty and reject malformed records',()=>{
  const key=keyFor(scenes[0],'easy');
  const result=readState({version:1,numbered:{[key]:[0,0,-1,24,'2',1]},free:{[key]:{0:{color:'#b568cf',texture:'paper',finish:'glitter'},1:{color:'url(evil)'},500:{color:'#123456'}}},custom:{color:'#123456'}});
  assert.deepEqual(result.numbered[key],[0,1]);assert.deepEqual(Object.keys(result.free[key]),['0']);assert.equal(result.free[key][0].color,'#B568CF');
  assert.equal(result.numbered[keyFor(scenes[0],'medium')],undefined);assert.equal(result.numbered[keyFor(scenes[1],'easy')],undefined);
  assert.equal(readState({version:99}).current,0);
});

test('all 27 image-derived maps cover every pixel, have connected touch areas and interior labels',async()=>{
  for(const scene of scenes){
    const data=JSON.parse(await readFile(new URL(`../dist/history/regions/${scene.id}.json`,import.meta.url),'utf8'));
    const png=await readFile(new URL(`../dist/history/images/${scene.id}.png`,import.meta.url));assert.equal(png.subarray(1,4).toString(),'PNG');
    for(const level of levels){
      const map=decodeRegions(data,level.id);assert.equal(map.regions.length,level.count);const counts=new Uint32Array(level.count);
      for(const id of map.mask)counts[id]++;
      for(const region of map.regions){
        assert.equal(counts[region.id],region.pixels);assert(region.color>=1&&region.color<=6);
        const x=Math.round(region.x*map.width),y=Math.round(region.y*map.height);assert.equal(map.mask[y*map.width+x],region.id);
      }
      // A single flood walk per area must reach every pixel belonging to it.
      const seen=new Uint8Array(map.mask.length),queue=new Int32Array(map.mask.length);
      for(let start=0;start<map.mask.length;start++){
        if(seen[start])continue;const id=map.mask[start];let head=0,tail=1;queue[0]=start;seen[start]=1;
        while(head<tail){const p=queue[head++],x=p%map.width;for(const n of [x>0?p-1:-1,x<map.width-1?p+1:-1,p-map.width,p+map.width])if(n>=0&&n<map.mask.length&&!seen[n]&&map.mask[n]===id){seen[n]=1;queue[tail++]=n;}}
        assert.equal(tail,counts[id],`${scene.id}/${level.id}/${id} must be connected`);
      }
    }
  }
});

test('corrupt compressed region data cannot overflow the canvas mask',()=>{
  const regions=Array.from({length:24},(_,id)=>({id}));
  const data={levels:{easy:{width:336,height:189,regions,runs:[0,336*189+1]}}};
  assert.throws(()=>decodeRegions(data,'easy'));data.levels.easy.runs=[0,30];assert.throws(()=>decodeRegions(data,'easy'));
});
