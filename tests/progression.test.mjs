import test from 'node:test';
import assert from 'node:assert/strict';
import { createArt, templates } from '../dist/art.js';
import { getProgress } from '../dist/progression.js';

const arts = templates.map((_, index) => createArt(index));
const finish = art => art.regions.map(region => region.id);

test('a new journey opens only the first level', () => {
  const status = getProgress(arts, {});
  assert.deepEqual(status.unlocked, [true, false, false, false, false, false, false, false, false]);
  assert.equal(status.stars, 0);
  assert.equal(status.next, 0);
});

test('a completed drawing from the original version unlocks the next level', () => {
  const progress = getProgress(arts, { 'tropical-0': finish(arts[0]) });
  assert.equal(progress.completed[0], true);
  assert.equal(progress.unlocked[1], true);
  assert.equal(progress.unlocked[2], false);
  assert.equal(progress.next, 1);
  assert.equal(progress.stars, 3);
});

test('free mode rewards a future drawing without bypassing earlier campaign prerequisites', () => {
  const painted = { [arts[8].id]: finish(arts[8]) };
  const status = getProgress(arts, painted);
  assert.equal(status.completed[8], true);
  assert.equal(status.unlocked[8], false);
  assert.equal(status.next, 0);
  assert.equal(status.stars, 3);
});

test('duplicate IDs or extra IDs cannot replace a missing painted region', () => {
  const painted = finish(arts[0]).slice(1);
  painted.push(painted[0], 'unknown-region');
  assert.equal(getProgress(arts, { [arts[0].id]: painted }).completed[0], false);
});

test('stars derive from unique completed levels and ignore procedural extras', () => {
  const extra = createArt(0, 1);
  const painted = { [arts[0].id]: finish(arts[0]), [extra.id]: finish(extra) };
  assert.equal(getProgress([...arts, extra], painted).stars, 3);
  assert.equal(getProgress([...arts, extra], painted).stars, 3);
});

test('all nine phases produce the completed journey and 27 stars', () => {
  const status = getProgress(arts, Object.fromEntries(arts.map(art => [art.id, finish(art)])));
  assert.equal(status.finished, true);
  assert.equal(status.count, 9);
  assert.equal(status.stars, 27);
  assert(status.unlocked.every(Boolean));
});
