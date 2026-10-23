import { scenes, levels } from './scenes.js';
import { normalizePaint } from '../paint-effects.js';

export const STORAGE_KEY = 'colore-history-v1';
export const keyFor = (scene,level) => `${scene.id}:${level}`;
export const initialState = () => ({version:1,current:0,level:'easy',view:'journey',chapter:0,mode:'journey',selected:1,numbered:{},free:{},custom:{color:'#D4A34E',texture:'none',finish:'matte'},recent:[]});

export function readState(raw) {
  const clean=initialState();
  if(!raw || raw.version!==1) return clean;
  if(Number.isInteger(raw.current) && raw.current>=0 && raw.current<scenes.length) clean.current=raw.current;
  if(levels.some(level=>level.id===raw.level)) clean.level=raw.level;
  if(['journey','atelier','collection','play'].includes(raw.view)) clean.view=raw.view;
  if(Number.isInteger(raw.chapter) && raw.chapter>=0 && raw.chapter<3) clean.chapter=raw.chapter;
  if(['journey','free'].includes(raw.mode)) clean.mode=raw.mode;
  if(Number.isInteger(raw.selected) && raw.selected>=1 && raw.selected<=6) clean.selected=raw.selected;
  clean.custom=normalizePaint(raw.custom)||clean.custom;
  clean.recent=Array.isArray(raw.recent)?raw.recent.filter(color=>/^#[\da-f]{6}$/i.test(color)).slice(0,8):[];
  for(const scene of scenes) for(const level of levels) {
    const key=keyFor(scene,level.id), saved=raw.numbered?.[key];
    if(Array.isArray(saved)) clean.numbered[key]=[...new Set(saved.filter(id=>Number.isInteger(id)&&id>=0&&id<level.count))];
    const free=raw.free?.[key];
    if(free && typeof free==='object'&&!Array.isArray(free)) {
      const paints={};
      for(let id=0;id<level.count;id++) {const paint=normalizePaint(free[id]);if(paint) paints[id]=paint;}
      if(Object.keys(paints).length) clean.free[key]=paints;
    }
  }
  return clean;
}

export function progress(state) {
  const complete=scenes.map(scene=>levels.some(level=>{
    const saved=new Set(state.numbered[keyFor(scene,level.id)]||[]);
    return Array.from({length:level.count},(_,id)=>id).every(id=>saved.has(id));
  }));
  const unlocked=complete.map((_,index)=>complete.slice(0,index).every(Boolean));
  const next=complete.findIndex(value=>!value);
  return {complete,unlocked,next:next<0?8:next,finished:next<0,stars:complete.filter(Boolean).length*3};
}

export function decodeRegions(data,level) {
  const definition=data?.levels?.[level],expected=levels.find(item=>item.id===level)?.count;
  if(!definition || definition.width!==336 || definition.height!==189 || definition.regions.length!==expected) throw new Error('Mapa de pintura incompatível.');
  const mask=new Uint8Array(definition.width*definition.height);
  let offset=0;
  if(!Array.isArray(definition.runs)||definition.runs.length%2) throw new Error('Mapa de pintura inválido.');
  for(let i=0;i<definition.runs.length;i+=2) {
    const id=definition.runs[i],count=definition.runs[i+1];
    if(!Number.isInteger(id)||id<0||id>=expected||!Number.isInteger(count)||count<1||offset+count>mask.length) throw new Error('Região inválida.');
    mask.fill(id,offset,offset+count);offset+=count;
  }
  if(offset!==mask.length) throw new Error('Mapa incompleto.');
  return {...definition,mask};
}
