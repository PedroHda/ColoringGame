import { decodeRegions } from './state.js';
import { pigments } from './scenes.js';

const resources=new Map();
const hexRgb=hex=>[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16));

async function resource(scene) {
  if(resources.has(scene.id)) return resources.get(scene.id);
  const request=(async()=>{
    const image=new Image(); image.decoding='async';
    const [data]=await Promise.all([
      fetch(scene.regions).then(response=>{if(!response.ok)throw new Error('O mapa de pintura não carregou.');return response.json();}),
      new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('A cena não carregou.'));image.src=scene.image;}),
    ]);
    return {image,data};
  })();
  resources.set(scene.id,request);
  try{return await request;}catch(error){resources.delete(scene.id);throw error;}
}

export class ScenePainter {
  constructor(canvas,labels,onPaint) {
    this.canvas=canvas;this.labels=labels;this.onPaint=onPaint;this.ready=false;this.loadToken=0;
    this.context=canvas.getContext('2d',{willReadFrequently:true});
    let start=null;
    canvas.addEventListener('pointerdown',event=>{start={x:event.clientX,y:event.clientY};});
    canvas.addEventListener('pointerup',event=>{
      if(!this.ready||!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)>10)return;
      const r=canvas.getBoundingClientRect(),x=Math.floor((event.clientX-r.left)/r.width*this.map.width),y=Math.floor((event.clientY-r.top)/r.height*this.map.height);
      if(x>=0&&y>=0&&x<this.map.width&&y<this.map.height)this.onPaint(this.map.mask[y*this.map.width+x],false);
      start=null;
    });
    canvas.addEventListener('pointercancel',()=>{start=null;});
    labels.addEventListener('click',event=>{const button=event.target.closest('[data-area]');if(button)this.onPaint(Number(button.dataset.area),event.detail===0);});
    labels.addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key))return;const button=event.target.closest('[data-area]');if(button){event.preventDefault();this.onPaint(Number(button.dataset.area),true);}});
  }

  async load(scene,level) {
    const token=++this.loadToken;this.ready=false;
    const {image,data}=await resource(scene);
    if(token!==this.loadToken)return false;
    this.map=decodeRegions(data,level);this.scene=scene;
    const w=Math.min(image.naturalWidth,1400),h=Math.round(w*image.naturalHeight/image.naturalWidth);
    this.canvas.width=w;this.canvas.height=h;this.labels.setAttribute('viewBox',`0 0 ${w} ${h}`);
    this.context.drawImage(image,0,0,w,h);
    const original=this.context.getImageData(0,0,w,h);
    this.target=new Uint8ClampedArray(original.data);
    this.gray=new Uint8ClampedArray(this.target.length);
    this.pixelRegions=new Uint8Array(w*h);
    this.luminance=new Float32Array(w*h);
    const palette=pigments.map(([,hex])=>hexRgb(hex));
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const p=y*w+x,i=p*4,id=this.map.mask[Math.min(this.map.height-1,Math.floor(y/h*this.map.height))*this.map.width+Math.min(this.map.width-1,Math.floor(x/w*this.map.width))];
      this.pixelRegions[p]=id;
      const r=this.target[i],g=this.target[i+1],b=this.target[i+2],l=(r*.299+g*.587+b*.114)/255;
      this.luminance[p]=l;
      // Restore neutral concept-art areas to warm pigments while retaining ink and modeled light.
      const chroma=Math.max(r,g,b)-Math.min(r,g,b);
      if(chroma<17&&l>.19) {
        const base=palette[this.map.regions[id].color-1],strength=.72*(1-chroma/40);
        for(let c=0;c<3;c++){const shaded=base[c]*(.3+.7*l)+255*Math.pow(l,3)*.23;this.target[i+c]=this.target[i+c]*(1-strength)+Math.min(255,shaded)*strength;}
      }
      const gray=l*213+26;
      this.gray[i]=gray+5;this.gray[i+1]=gray+3;this.gray[i+2]=gray-2;this.gray[i+3]=255;
    }
    this.target32=new Uint32Array(this.target.buffer);this.gray32=new Uint32Array(this.gray.buffer);
    this.frame=this.context.createImageData(w,h);this.frame32=new Uint32Array(this.frame.data.buffer);
    this.ready=true;return true;
  }

  draw({painted=[],custom=null,selected=1,hideNumbers=false,focusId=null}={}) {
    if(!this.ready)return;
    this.last={painted,custom,selected,hideNumbers};
    const filled=new Set(custom?Object.keys(custom).map(Number):painted),styles=new Map();
    if(custom)for(const [id,paint]of Object.entries(custom))styles.set(Number(id),{...paint,rgb:hexRgb(paint.color)});
    const width=this.canvas.width,height=this.canvas.height;
    for(let p=0;p<this.pixelRegions.length;p++) {
      const id=this.pixelRegions[p];
      if(!filled.has(id)){this.frame32[p]=this.gray32[p];continue;}
      if(!custom){this.frame32[p]=this.target32[p];continue;}
      const paint=styles.get(id),i=p*4,l=this.luminance[p],x=p%width,y=Math.floor(p/width);
      if(l<.16){this.frame32[p]=this.target32[p];continue;}
      let light=0;
      const noise=((Math.imul(x,374761393)^Math.imul(y,668265263))>>>0)%101/100;
      if(paint.texture==='paper')light+=(noise-.5)*26;
      if(paint.texture==='watercolor')light+=Math.sin(x/29+Math.sin(y/37))*8+Math.cos(y/21)*5;
      if(paint.texture==='linen')light+=(x%5===0||y%5===0)?10:-2;
      if(paint.finish==='satin')light+=Math.max(0,1-Math.abs((x/width+y/height)*.5-.45)*4)*25;
      if(paint.finish==='metallic')light+=Math.cos((x/width+y/height)*17)*25;
      if(paint.finish==='glitter'&&((x%23===5&&y%23<4)||(noise>.98&&x%3===0)))light+=95;
      for(let c=0;c<3;c++)this.frame.data[i+c]=Math.min(255,Math.max(0,paint.rgb[c]*(.25+.85*l)+(255-paint.rgb[c])*Math.pow(l,4)*.16+light));
      this.frame.data[i+3]=255;
    }
    this.context.putImageData(this.frame,0,0);
    const displayWidth=this.canvas.getBoundingClientRect().width||width;
    const radius=Math.max(width*.0125,width/Math.max(320,displayWidth)*11);
    this.labels.innerHTML=this.map.regions.filter(region=>custom||!filled.has(region.id)).map(region=>{
      const x=region.x*width,y=region.y*height,active=region.color===selected;
      if(custom)return `<g data-area="${region.id}" role="button" tabindex="0" aria-label="Área ${region.id+1}, ${filled.has(region.id)?'toque para recolorir':'pintura livre'}"><circle cx="${x}" cy="${y}" r="${width*.014}" fill="transparent" stroke="none"/></g>`;
      return `<g data-area="${region.id}" class="area-number ${active?'matching':''} ${hideNumbers?'numbers-hidden':''}" role="button" tabindex="0" aria-label="Área ${region.id+1}, pigmento ${region.color}"><circle cx="${x}" cy="${y}" r="${radius}"/><text x="${x}" y="${y}" font-size="${radius*1.03}">${region.color}</text></g>`;
    }).join('');
    if(focusId!==null)this.labels.querySelector(`[data-area="${focusId}"]`)?.focus({preventScroll:true});
  }

  hint(id){const target=this.labels.querySelector(`[data-area="${id}"]`);target?.classList.add('hint-area');target?.scrollIntoView({block:'center',inline:'center',behavior:'smooth'});target?.focus({preventScroll:true});}
  async export(title) {
    if(!this.ready)throw new Error('Aguarde a cena carregar.');
    const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1000;
    const context=canvas.getContext('2d');context.fillStyle='#F5EBD5';context.fillRect(0,0,1600,1000);
    context.drawImage(this.canvas,0,0,1600,900);
    context.textAlign='center';context.fillStyle='#4E5D40';context.font='30px Georgia';context.fillText(title,800,947);
    context.font='16px Arial';context.fillStyle='#9C896C';context.fillText('colorê. · o caminho das cores',800,978);
    return canvas.toDataURL('image/png');
  }
}
