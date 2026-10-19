import test from 'node:test';
import assert from 'node:assert/strict';
import { createArt, renderArt, templates } from '../dist/art.js';
import { getProgress } from '../dist/progression.js';

test('all drawings have increasingly detailed levels with four, six and eight colors', () => {
  for (let index = 0; index < templates.length; index++) for (const seed of [0, 1, 2, 19]) {
    const easy = createArt(index, seed, 'easy');
    const medium = createArt(index, seed, 'medium');
    const hard = createArt(index, seed, 'hard');
    assert(easy.regions.length < medium.regions.length);
    assert(medium.regions.length < hard.regions.length);
    assert.deepEqual([easy.palette.length, medium.palette.length, hard.palette.length], [4, 6, 8]);
    for (const art of [easy, medium, hard]) {
      assert.equal(new Set(art.regions.map(region => region.id)).size, art.regions.length);
      assert(art.regions.every(region => region.color >= 1 && region.color <= art.palette.length));
      assert(art.regions.every(region => Number.isFinite(region.x) && Number.isFinite(region.y)));
    }
  }
});

test('original medium drawing IDs and region counts stay compatible with saved progress', () => {
  const counts = [27, 21, 25, 23, 17, 25, 22, 19, 22];
  templates.forEach((template, index) => {
    const original = createArt(index);
    assert.equal(original.id, `${template.id}-0`);
    assert.equal(original.regions.length, counts[index]);
    assert.notEqual(createArt(index, 0, 'easy').id, original.id);
    assert.notEqual(createArt(index, 0, 'hard').id, original.id);
  });
});

test('difficulty versions cannot share or overwrite each other’s saved progress', () => {
  const easy = createArt(0, 0, 'easy');
  const medium = createArt(0);
  const painted = { [medium.id]: medium.regions.map(region => region.id) };
  assert.equal(painted[easy.id], undefined);
  const before = JSON.stringify(medium);
  createArt(0, 0, 'hard');
  assert.equal(JSON.stringify(medium), before);
});

test('any difficulty completes a phase, while three completed difficulties still award only three stars', () => {
  const originals = templates.map((_, index) => createArt(index));
  const easy = createArt(0, 0, 'easy');
  const hard = createArt(0, 0, 'hard');
  const artworks = [...originals, easy, hard];
  const painted = { [easy.id]: easy.regions.map(region => region.id) };
  assert.equal(getProgress(artworks, painted).unlocked[1], true);
  assert.equal(getProgress(artworks, painted).stars, 3);
  painted[hard.id] = hard.regions.map(region => region.id);
  painted[originals[0].id] = originals[0].regions.map(region => region.id);
  assert.equal(getProgress(artworks, painted).stars, 3);
});

test('detailed SVG partitions define every clip reference and avoid duplicate IDs across thumbnails', () => {
  const art = createArt(5, 3, 'hard');
  const svg = renderArt(art, { preview: true });
  const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);
  const refs = [...svg.matchAll(/url\(#([^)]+)\)/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert(refs.length > 0);
  assert(refs.every(ref => ids.includes(ref)));
  assert(!/<[^>]*\btransform="[^"]*"[^>]*\btransform=/.test(svg));
  const second = renderArt(art, { preview: true });
  assert(!ids.some(id => second.includes(`id="${id}"`)));
});
