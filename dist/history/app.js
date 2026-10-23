import { scenes,chapters,levels,pigments } from './scenes.js';
import { STORAGE_KEY,initialState,readState,keyFor,progress } from './state.js';
import { ScenePainter } from './painter.js';
import { textures,finishes,hsvToHex,hexToHsv,normalizePaint,paintFill } from '../paint-effects.js';

const $=id=>document.getElementById(id);
let storageAvailable=true,state=initialState();
try{state=readState(JSON.parse(localStorage.getItem(STORAGE_KEY)));}catch{storageAvailable=false;}
let undoHistory=[],hideNumbers=false,zoomed=false,erasing=false,collectionMode='journey',toastTimer,openToken=0;
let hsv=hexToHsv(state.custom.color);
const routes={journey:'#jornada',atelier:'#livre',collection:'#colecao',play:'#colorir'};
const scene=()=>scenes[state.current],key=()=>keyFor(scene(),state.level),freeMode=()=>state.mode==='free';
const painted=()=>state.numbered[key()]||[],custom=()=>state.free[key()]||{};
const painter=new ScenePainter($('painting'),$('area-labels'),paintArea);
const levelName=id=>levels.find(level=>level.id===id).name;
const countFor=(item,level,mode='journey')=>mode==='free'?Object.keys(state.free[keyFor(item,level)]||{}).length:(state.numbered[keyFor(item,level)]||[]).length;

function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));storageAvailable=true;}catch{storageAvailable=false;}$('save-status').textContent=storageAvailable?'● Salvo neste dispositivo':'● Apenas nesta sessão';}
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3400);}
function levelButtons(){return levels.map(level=>`<button data-level="${level.id}" aria-label="Dificuldade ${level.name}" aria-pressed="${state.level===level.id}">${level.name}<small>${level.count} áreas</small></button>`).join('');}
function preferredLevel(item){return levels.find(level=>countFor(item,level.id)===level.count)?.id||levels.find(level=>countFor(item,level.id)>0)?.id||state.level;}

function renderJourney(){
  const status=progress(state),next=scenes[status.next],level=preferredLevel(next),count=countFor(next,level),total=levels.find(item=>item.id===level).count;
  $('header-stars').textContent=status.stars;$('journey-count').textContent=`${status.complete.filter(Boolean).length} de 9 memórias`;
  $('hero').innerHTML=`<article class="hero"><img src="${next.image}" alt="${next.title}, uma paisagem histórica desenhada à mão" fetchpriority="high"><div class="hero-copy"><span class="hero-chip">✧ ${status.finished?'UMA JORNADA FEITA POR VOCÊ':count?'SUA HISTÓRIA CONTINUA':'UMA COR. UM NOVO COMEÇO.'}</span><h1>${status.finished?'Você deu cor<br>a uma <em>história inteira.</em>':count?`Ainda há cores<br>para <em>descobrir.</em>`:'O mundo começa<br>com um <em>toque de cor.</em>'}</h1><p>${status.finished?'Cada lugar guarda um pouquinho de você. Reveja suas memórias ou descubra outras cores no ateliê.':`Das primeiras marcas às cidades que criamos. Viaje pela história e veja cada cenário ganhar vida.`}</p><button class="primary-button" ${status.finished?'data-view="collection"':`data-start="${next.index}"`}>${status.finished?'Ver minha coleção':count?'Continuar minha história':'Começar minha jornada'} <span>→</span></button><div class="hero-details">${status.finished?'9 encontros com a criação humana':`${next.era} · ${next.title}`} <span>·</span> no seu ritmo</div></div><div class="hero-progress"><span>${status.finished?'HISTÓRIAS PARA GUARDAR':'SEU PRÓXIMO CAMINHO'}</span><strong>${status.finished?'9 de 9':`Fase ${next.index+1} de 9`}</strong><small>${status.finished?'27 estrelas':`${count}/${total} áreas`}</small><div class="hero-progress-track"><i style="width:${Math.floor((status.finished?1:count/total)*100)}%"></i></div></div></article>`;
  $('chapter-tabs').innerHTML=chapters.map((chapter,index)=>`<button data-chapter="${index}" aria-pressed="${state.chapter===index}"><span class="chapter-symbol">${chapter.symbol}</span><span><small>CAPÍTULO ${String(index+1).padStart(2,'0')}</small><strong>${chapter.name}</strong></span><span class="chapter-done">${status.complete.slice(index*3,index*3+3).filter(Boolean).length}/3</span></button>`).join('');
  $('chapter-intro').innerHTML=`<span>${chapters[state.chapter].period}</span><span>Uma cena abre o próximo caminho.</span>`;
  $('journey-map').innerHTML=scenes.filter(item=>item.chapter===state.chapter).map(item=>{
    const complete=status.complete[item.index],locked=!status.unlocked[item.index],active=item.index===status.next&&!status.finished,level=preferredLevel(item),count=countFor(item,level),total=levels.find(item=>item.id===level).count;
    return `<button class="journey-card ${locked?'locked':''} ${active?'active-phase':''}" data-start="${item.index}" aria-label="Fase ${item.index+1}: ${item.title}, ${locked?'bloqueada':complete?'concluída':'disponível'}" aria-disabled="${locked}"><span class="card-image"><img src="${item.image}" alt="" loading="lazy"><span class="phase-number ${complete?'done':''}">${complete?'✓':locked?'⌑':item.index+1}</span><span class="phase-status">${locked?`Depois da fase ${item.index}`:complete?'Uma memória sua':active?'Você está aqui':'Pronta para descobrir'}</span></span><span class="card-copy"><span class="eyebrow">${item.era}</span><strong>${item.title}</strong><p>${item.intro.split('. ')[0]}.</p><span class="card-bottom"><span>${locked?'Continue o caminho':complete?'Rever minhas cores':count?`Continuar · ${Math.floor(count/total*100)}%`:'Vamos dar vida a este lugar?'}</span><span class="card-stars ${complete?'earned':''}" aria-hidden="true">✦ ✦ ✦</span></span></span></button>`;
  }).join('');
}

function artCard(item,level,mode){
  const count=countFor(item,level,mode),total=levels.find(option=>option.id===level).count;
  return `<button class="art-card" data-art="${item.index}" data-mode="${mode}" data-art-level="${level}" aria-label="${mode==='free'?'Pintura livre':'Rever fase'}: ${item.title}, ${levelName(level)}"><span class="card-image"><img src="${item.image}" alt="" loading="lazy"><span class="phase-status">${count===total?'✓ Concluída':count?`${Math.floor(count/total*100)}% com suas cores`:'Seu próximo encontro'}</span></span><span class="card-copy"><span class="eyebrow">${item.era}</span><strong>${item.title}</strong><span class="card-bottom"><span>${levelName(level)} · ${count?`${count}/${total} áreas`:`${total} áreas`}</span><span>↗</span></span></span></button>`;
}
function renderAtelier(){$('atelier-levels').innerHTML=levelButtons();$('atelier-gallery').innerHTML=scenes.map(item=>artCard(item,state.level,'free')).join('');}
function renderCollection(){
  document.querySelectorAll('[data-collection]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.collection===collectionMode)));
  const works=scenes.flatMap(item=>levels.filter(level=>countFor(item,level.id,collectionMode)>0).map(level=>artCard(item,level.id,collectionMode)));
  $('collection-gallery').innerHTML=works.length?works.join(''):`<div class="empty-collection"><span aria-hidden="true">✿</span><h2>Sua primeira memória está por vir.</h2><p>Comece uma cena. Suas cores vão encontrar um lugar por aqui.</p><button class="primary-button" data-view="${collectionMode==='free'?'atelier':'journey'}">Encontrar meu caminho →</button></div>`;
}
function renderAll(){renderJourney();renderAtelier();renderCollection();}

function navigate(view,scroll=true){
  if(!routes[view])return;
  state.view=view;document.body.dataset.view=view;
  Object.keys(routes).forEach(name=>$(`${name}-view`).hidden=name!==view);
  document.querySelectorAll('.navigation button').forEach(button=>{const active=button.dataset.view===view||view==='play'&&button.dataset.view===(freeMode()?'atelier':'journey');button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  if(view!=='play')renderAll();
  if(location.hash!==routes[view])history.pushState(null,'',routes[view]);save();
  if(scroll){window.scrollTo({top:0,behavior:'instant'});const heading=$(`${view}-view`).querySelector('h1,h2');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}}
}

function renderGameChrome(){
  $('play-era').textContent=scene().era;$('play-title').textContent=scene().title;
  $('play-kicker').textContent=freeMode()?'ATELIÊ LIVRE · O MUNDO NAS SUAS CORES':`CAPÍTULO ${scene().chapter+1} · CAMINHO ${state.current+1} DE 9`;
  $('play-levels').innerHTML=levelButtons();$('back').innerHTML=`← <span>${freeMode()?'Escolher outra época':'Minha jornada'}</span>`;
  $('scene-story').textContent=freeMode()?'Escolha uma cor e toque em qualquer área. Você pode voltar, recolorir e experimentar quantas vezes quiser.':scene().intro;
  $('stage-caption').textContent=freeMode()?'FEITO DO SEU JEITO':`${scene().era.toUpperCase()} · UMA COR DE CADA VEZ`;
  document.querySelector('.paint-layout').classList.toggle('free-mode',freeMode());$('materials').hidden=!freeMode();$('numbers').hidden=freeMode();
  $('discovery').textContent=`✧ ${scene().discovery}`;$('next-scene').textContent=state.current===8?'Ver minha jornada →':'Próximo caminho →';
}

async function openScene(index,mode='journey',checkLock=true){
  const target=scenes[index];if(!target)return;
  if(mode==='journey'&&checkLock&&!progress(state).unlocked[index]){toast('Conclua o caminho anterior para chegar até aqui. No ateliê, todas as épocas estão abertas.');return;}
  const token=++openToken;state.current=index;state.mode=mode;undoHistory=[];zoomed=false;hideNumbers=false;erasing=false;
  $('scene-container').classList.remove('zoomed','erasing');$('zoom').setAttribute('aria-pressed','false');$('numbers').setAttribute('aria-pressed','false');$('numbers').setAttribute('aria-label','Ocultar números');
  $('viewport').scrollTo(0,0);$('download').disabled=true;
  $('loading').hidden=false;$('loading').innerHTML='<span class="loading-flower">✿</span><strong>Preparando sua próxima pausa…</strong>';
  renderGameChrome();navigate('play');syncMaterials();
  try{
    const ready=await painter.load(target,state.level);
    if(!ready||token!==openToken)return;
    if(!freeMode()){const available=painter.map.regions.find(region=>!painted().includes(region.id));if(available)state.selected=available.color;}
    $('loading').hidden=true;$('download').disabled=false;renderGame();save();
  }catch(error){if(token!==openToken)return;$('loading').innerHTML='<span class="loading-flower">✿</span><strong>Esta cena não carregou agora.</strong><button class="outline-button" data-retry>Tentar novamente</button>';toast('Não foi possível carregar a cena. Tente novamente.');console.error('Carregamento da cena:',error.message);}
}

function renderGame(focusId=null){
  if(!painter.ready)return;
  painter.draw({painted:painted(),custom:freeMode()?custom():null,selected:state.selected,hideNumbers,focusId});
  const count=freeMode()?Object.keys(custom()).length:painted().length,total=painter.map.regions.length,percent=Math.floor(count/total*100);
  $('percent').textContent=`${percent}%`;$('stage-meter').style.setProperty('--progress',`${percent}%`);
  $('paint-count').textContent=`${count} de ${total} áreas com suas cores`;
  $('undo').disabled=$('free-undo').disabled=!undoHistory.length;
  $('hint').disabled=count===total;
  $('header-stars').textContent=progress(state).stars;
  if(!freeMode())$('pigments').innerHTML=pigments.map(([name,color],i)=>{const remaining=painter.map.regions.filter(region=>region.color===i+1&&!painted().includes(region.id)).length;return `<button class="pigment" data-pigment="${i+1}" aria-label="Pigmento ${i+1}: ${name}, ${remaining} áreas restantes" aria-pressed="${state.selected===i+1}"><span class="pigment-swatch" style="background:${color}">${remaining?i+1:'✓'}</span><small>${remaining?`${remaining} áreas`:'completo'}</small></button>`;}).join('');
}

function paintArea(id,keyboard=false){
  if(!painter.ready||state.view!=='play')return;
  const region=painter.map.regions[id];if(!region)return;
  if(freeMode()){
    const previous=custom()[id]||null,next=erasing?null:{...state.custom};
    if(JSON.stringify(previous)===JSON.stringify(next))return;
    undoHistory.push({id,previous});if(!state.free[key()])state.free[key()]={};
    if(next){state.free[key()][id]=next;state.recent=[next.color,...state.recent.filter(color=>color!==next.color)].slice(0,8);}else delete state.free[key()][id];
    syncMaterials();
  }else{
    if(painted().includes(id))return;
    if(region.color!==state.selected){toast(`Essa área pede o pigmento ${region.color}. Escolha ${pigments[region.color-1][0].toLowerCase()}.`);return;}
    if(!state.numbered[key()])state.numbered[key()]=[];
    state.numbered[key()].push(id);undoHistory.push({id});
    if(!painter.map.regions.some(item=>item.color===state.selected&&!painted().includes(item.id)))state.selected=painter.map.regions.find(item=>!painted().includes(item.id))?.color||state.selected;
  }
  renderGame(keyboard&&freeMode()?id:null);save();
  if(!freeMode()&&painted().length===painter.map.regions.length)celebrate();
  else if(keyboard&&!freeMode())$('area-labels').querySelector('.matching')?.focus({preventScroll:true});
}

function undo(){const action=undoHistory.pop();if(!action)return;if(freeMode()){if(action.previous)state.free[key()][action.id]=action.previous;else delete state.free[key()][action.id];}else{state.numbered[key()]=painted().filter(id=>id!==action.id);state.selected=painter.map.regions[action.id].color;}renderGame();save();}
async function celebrate(){
  $('completion-eyebrow').textContent=`CAMINHO ${state.current+1} CONCLUÍDO · ${levelName(state.level).toUpperCase()}`;
  $('completion-title').textContent=progress(state).finished?'Sua história ganhou todas as cores.':'Um novo caminho floresceu.';
  $('completion-story').textContent=scene().outro;$('completion-memory').textContent=`✧ Memória descoberta: ${scene().discovery}`;
  $('continue-story').textContent=state.current<8?`Seguir para ${scenes[state.current+1].title.toLowerCase()} →`:'Guardar minhas memórias →';
  $('completion-image').src=await painter.export(scene().title);
  if(!$('completion').open)$('completion').showModal();
}
function nextScene(){if(state.current===8){state.chapter=2;navigate('journey');return;}openScene(state.current+1,state.mode);}
async function download(){
  if(!painter.ready)return;$('download').disabled=true;
  try{const png=await painter.export(`${scene().title} · ${freeMode()?'pintura livre':levelName(state.level)}`);$('export-image').src=png;$('export-link').href=png;$('export-link').download=`colore-${scene().id}-${freeMode()?'livre-':''}${state.level}.png`;if(!$('export').open)$('export').showModal();}catch{toast('Não consegui preparar a imagem agora. Tente novamente.');}finally{$('download').disabled=false;}
}

function syncMaterials(){
  const color=state.custom.color,radians=hsv.h*Math.PI/180;
  $('wheel-thumb').style.left=`${50+Math.cos(radians)*hsv.s*46}%`;$('wheel-thumb').style.top=`${50+Math.sin(radians)*hsv.s*46}%`;$('wheel-thumb').style.background=color;
  $('color-wheel').setAttribute('aria-valuenow',String(Math.round(hsv.h)%360));$('color-wheel').setAttribute('aria-valuetext',`${color}, saturação ${Math.round(hsv.s*100)}%`);
  $('lightness').value=Math.round(hsv.v*100);$('light-output').textContent=`${Math.round(hsv.v*100)}%`;$('lightness').style.background=`linear-gradient(to right,#000,${hsvToHex(hsv.h,hsv.s,1)})`;
  $('hex').value=color;['red','green','blue'].forEach((name,i)=>$(name).value=parseInt(color.slice(1+i*2,3+i*2),16));
  const sample=paintFill(state.custom,'history-sample');$('paint-sample').innerHTML=`<svg viewBox="0 0 600 600" aria-hidden="true"><defs>${sample.definitions}</defs><rect width="600" height="600" fill="${sample.fill}"/></svg>`;
  for(const [items,target,attribute,selected]of [[textures,'textures','texture',state.custom.texture],[finishes,'finishes','finish',state.custom.finish]])$(target).innerHTML=items.map(item=>`<button data-${attribute}="${item.id}" aria-pressed="${selected===item.id}"><span aria-hidden="true">${item.symbol}</span>${item.name}</button>`).join('');
  const recent=state.recent.length?state.recent:pigments.map(([,hex])=>hex);
  $('recent-colors').innerHTML=`<span>${state.recent.length?'Suas cores':'Um pouco de inspiração'}</span>${recent.map(c=>`<button data-recent="${c}" style="--color:${c}" aria-label="Usar cor ${c}"></button>`).join('')}`;
  $('fill').setAttribute('aria-pressed',String(!erasing));$('erase').setAttribute('aria-pressed',String(erasing));$('scene-container').classList.toggle('erasing',erasing);
  $('material-note').textContent=erasing?'Borracha: toque em uma área para retirar sua pintura.':`${textures.find(item=>item.id===state.custom.texture).name} + ${finishes.find(item=>item.id===state.custom.finish).name}. Toque para aplicar ou recolorir.`;
}
function setColor(color){state.custom.color=color.toUpperCase();hsv=hexToHsv(color);erasing=false;syncMaterials();save();}

document.addEventListener('click',event=>{
  const nav=event.target.closest('button[data-view]');if(nav){navigate(nav.dataset.view);return;}
  const start=event.target.closest('[data-start]');if(start){const index=Number(start.dataset.start);state.level=preferredLevel(scenes[index]);openScene(index);return;}
  const chapter=event.target.closest('[data-chapter]');if(chapter){state.chapter=Number(chapter.dataset.chapter);renderJourney();save();return;}
  const art=event.target.closest('[data-art]');if(art){state.level=art.dataset.artLevel;openScene(Number(art.dataset.art),art.dataset.mode);return;}
  const level=event.target.closest('[data-level]');if(level&&level.dataset.level!==state.level){state.level=level.dataset.level;if(state.view==='play')openScene(state.current,state.mode);else{renderAtelier();save();}return;}
  const pigment=event.target.closest('[data-pigment]');if(pigment){state.selected=Number(pigment.dataset.pigment);renderGame();save();$('pigments').querySelector(`[data-pigment="${state.selected}"]`)?.focus({preventScroll:true});return;}
  const collection=event.target.closest('[data-collection]');if(collection){collectionMode=collection.dataset.collection;renderCollection();return;}
  const texture=event.target.closest('[data-texture]'),finish=event.target.closest('[data-finish]'),recent=event.target.closest('[data-recent]');
  if(texture){state.custom.texture=texture.dataset.texture;erasing=false;syncMaterials();save();}
  if(finish){state.custom.finish=finish.dataset.finish;erasing=false;syncMaterials();save();}
  if(recent)setColor(recent.dataset.recent);
  if(event.target.closest('[data-retry]'))openScene(state.current,state.mode);
  if(event.target.closest('[data-close]'))event.target.closest('dialog').close();
});
$('back').addEventListener('click',()=>navigate(freeMode()?'atelier':'journey'));
$('undo').addEventListener('click',undo);$('free-undo').addEventListener('click',undo);
$('hint').addEventListener('click',()=>{if(!painter.ready||freeMode())return;let region=painter.map.regions.find(item=>item.color===state.selected&&!painted().includes(item.id))||painter.map.regions.find(item=>!painted().includes(item.id));if(!region)return;state.selected=region.color;hideNumbers=false;$('numbers').setAttribute('aria-pressed','false');renderGame();painter.hint(region.id);toast(`Um pontinho de luz: esta área pede o pigmento ${region.color}.`);save();});
$('numbers').addEventListener('click',()=>{hideNumbers=!hideNumbers;$('numbers').setAttribute('aria-pressed',String(hideNumbers));$('numbers').setAttribute('aria-label',hideNumbers?'Mostrar números':'Ocultar números');renderGame();});
$('zoom').addEventListener('click',()=>{zoomed=!zoomed;$('scene-container').classList.toggle('zoomed',zoomed);$('zoom').setAttribute('aria-pressed',String(zoomed));$('zoom').setAttribute('aria-label',zoomed?'Reduzir cena':'Ampliar cena');if(!zoomed)$('viewport').scrollTo(0,0);renderGame();});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('play-view').requestFullscreen();}catch{toast('Neste navegador, gire o celular para ter mais espaço.');}});
$('download').addEventListener('click',download);$('next-scene').addEventListener('click',nextScene);
$('continue-story').addEventListener('click',()=>{$('completion').close();if(state.current===8)navigate('collection');else nextScene();});
$('back-map').addEventListener('click',()=>{$('completion').close();state.chapter=Math.floor(progress(state).next/3);navigate('journey');});
$('help').addEventListener('click',()=>$('help-modal').showModal());
$('fill').addEventListener('click',()=>{erasing=false;syncMaterials();});$('erase').addEventListener('click',()=>{erasing=true;syncMaterials();});
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
document.addEventListener('keydown',event=>{if(state.view!=='play'||freeMode()||!painter.ready||event.ctrlKey||event.metaKey||event.altKey||document.querySelector('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;if(/^[1-6]$/.test(event.key)){event.preventDefault();state.selected=Number(event.key);renderGame();save();}});

const wheel=$('color-wheel');let pointerId=null;
function wheelPointer(event){const r=wheel.getBoundingClientRect(),dx=event.clientX-r.left-r.width/2,dy=event.clientY-r.top-r.height/2;hsv.h=(Math.atan2(dy,dx)*180/Math.PI+360)%360;hsv.s=Math.min(1,Math.hypot(dx,dy)/(r.width*.46));state.custom.color=hsvToHex(hsv.h,hsv.s,hsv.v);erasing=false;syncMaterials();}
wheel.addEventListener('pointerdown',event=>{if(!event.isPrimary||event.button!==0)return;event.preventDefault();pointerId=event.pointerId;wheel.setPointerCapture(pointerId);wheel.focus({preventScroll:true});wheelPointer(event);});
wheel.addEventListener('pointermove',event=>{if(event.pointerId===pointerId)wheelPointer(event);});
function endPointer(event){if(pointerId===event.pointerId){pointerId=null;save();}}
wheel.addEventListener('pointerup',endPointer);wheel.addEventListener('pointercancel',endPointer);wheel.addEventListener('lostpointercapture',endPointer);
wheel.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();if(event.key==='ArrowLeft')hsv.h=(hsv.h+355)%360;if(event.key==='ArrowRight')hsv.h=(hsv.h+5)%360;if(event.key==='ArrowUp')hsv.s=Math.min(1,hsv.s+.05);if(event.key==='ArrowDown')hsv.s=Math.max(0,hsv.s-.05);if(event.key==='Home')hsv.s=0;if(event.key==='End')hsv.s=1;state.custom.color=hsvToHex(hsv.h,hsv.s,hsv.v);erasing=false;syncMaterials();save();});
$('lightness').addEventListener('input',event=>{hsv.v=Number(event.target.value)/100;state.custom.color=hsvToHex(hsv.h,hsv.s,hsv.v);erasing=false;syncMaterials();save();});
$('hex').addEventListener('input',event=>{if(/^#[\da-f]{6}$/i.test(event.target.value))setColor(event.target.value);});
$('hex').addEventListener('change',event=>{if(!/^#[\da-f]{6}$/i.test(event.target.value)){toast('Use o formato #RRGGBB, como #D4A34E.');syncMaterials();}});
for(const name of ['red','green','blue'])$(name).addEventListener('input',()=>{const strings=['red','green','blue'].map(id=>$(id).value),channels=strings.map(Number);if(strings.every(Boolean)&&channels.every(value=>Number.isInteger(value)&&value>=0&&value<=255))setColor('#'+channels.map(value=>value.toString(16).padStart(2,'0')).join(''));});
for(const name of ['red','green','blue'])$(name).addEventListener('change',()=>{const channels=['red','green','blue'].map(id=>Number($(id).value));if(!channels.every(value=>Number.isInteger(value)&&value>=0&&value<=255)){toast('Cada canal RGB vai de 0 a 255.');syncMaterials();}});

function routeView(){return Object.keys(routes).find(view=>routes[view]===location.hash)||(['#desenhos','#atelie'].includes(location.hash)?'atelier':null);}
function handleRoute(){const view=routeView()||'journey';if(view==='play')openScene(state.current,state.mode);else navigate(view);}
renderAll();syncMaterials();
const first=routeView()||'journey';if(first==='play')openScene(state.current,state.mode);else navigate(first,false);
window.addEventListener('popstate',handleRoute);window.addEventListener('hashchange',()=>{const view=routeView();if(view&&view!==state.view)handleRoute();});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(state.view==='play'&&painter.ready)renderGame();},120);});
