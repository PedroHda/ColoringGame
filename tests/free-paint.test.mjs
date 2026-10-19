import test from 'node:test';
import assert from 'node:assert/strict';
import { createArt, renderArt } from '../dist/art.js';
import { textures, finishes, normalizePaint, sanitizePaintings, paintFill, hsvToHex, hexToHsv } from '../dist/paint-effects.js';
import { getProgress } from '../dist/progression.js';

test('the wheel covers primary colors, white, black and round-trips RGB values', () => {
  assert.deepEqual([0,60,120,180,240,300,360].map(h => hsvToHex(h,1,1)), ['#FF0000','#FFFF00','#00FF00','#00FFFF','#0000FF','#FF00FF','#FF0000']);
  assert.equal(hsvToHex(120,0,1),'#FFFFFF');
  assert.equal(hsvToHex(120,1,0),'#000000');
  for (const hex of ['#719460','#B568CF','#000000','#FFFFFF','#010102','#FE0077']) {
    const {h,s,v} = hexToHsv(hex);
    assert.equal(hsvToHex(h,s,v),hex);
  }
});

test('untrusted persisted paints cannot inject SVG and invalid regions are discarded', () => {
  const art = createArt(0);
  const saved = { [art.id]: { r0: {color:'#b568cf',texture:'paper',finish:'glitter'}, r1: {color:'red" onload="bad'}, missing:{color:'#123456'} }, unknown: { r0: {color:'#123456'} } };
  assert.deepEqual(sanitizePaintings(saved,[art]), { [art.id]: {r0:{color:'#B568CF',texture:'paper',finish:'glitter'}} });
  assert.equal(normalizePaint({color:'url(https://example.com)'}),null);
  assert.deepEqual(normalizePaint({color:'#ABCDEF',texture:'invalid',finish:'invalid'}),{color:'#ABCDEF',texture:'none',finish:'matte'});
});

test('all texture and finish combinations export with defined, unique local SVG references', () => {
  const art = createArt(0,1,'hard');
  for (const texture of textures) for (const finish of finishes) {
    const paint = {color:'#B568CF',texture:texture.id,finish:finish.id};
    const paintings = Object.fromEntries(art.regions.map(region => [region.id,paint]));
    const svg = renderArt(art,{preview:true,customPaint:paintings});
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map(m=>m[1]);
    const refs = [...svg.matchAll(/url\(#([^)]+)\)/g)].map(m=>m[1]);
    assert.equal(ids.length,new Set(ids).size);
    assert(refs.every(ref=>ids.includes(ref)));
    assert(!svg.includes('region-number'));
    assert(!svg.includes('data-region='));
    assert(svg.includes('#B568CF'));
    assert(!ids.some(id=>renderArt(art,{preview:true,customPaint:paintings}).includes(`id="${id}"`)));
  }
});

test('free painting remains recolorable, blank previews remain blank, and campaign progress is independent', () => {
  const art = createArt(0);
  const paint = {color:'#123456',texture:'linen',finish:'metallic'};
  const svg = renderArt(art,{customPaint:{r0:paint}});
  assert.match(svg,/toque para recolorir/);
  assert(!svg.includes('aria-disabled="true"'));
  assert(!svg.includes('region-number'));
  const blank = renderArt(art,{preview:true,customPaint:{}});
  assert(!blank.includes(art.palette[0][1]));
  assert.equal(paintFill({color:'#123456',texture:'none',finish:'matte'},'sample').fill,'#123456');
  const journeyPainted = {};
  const free = sanitizePaintings({[art.id]:Object.fromEntries(art.regions.map(r=>[r.id,paint]))},[art]);
  assert.equal(Object.keys(free[art.id]).length,art.regions.length);
  assert.equal(getProgress([art],journeyPainted).stars,0);
});
