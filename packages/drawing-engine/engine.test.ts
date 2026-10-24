import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';
import {
  CanvasBrushEngine, createDocument, DEFAULT_BRUSH_SETTINGS, deserializeDocument,
  getDefaultBrushSettings, interpolatePoints, interpolateSmoothPoints, materials,
  mixPigments, normalizeBrushSettings, seededRandom, serializeDocument, tools,
  validateDocument, type BrushSettings, type DrawingDocument, type ToolId,
} from './index';

function setup(width = 240, height = 160) {
  const canvas = createCanvas(width, height);
  const engine = new CanvasBrushEngine(canvas as unknown as HTMLCanvasElement, width, height);
  return { canvas, engine };
}
const pixels = (canvas: Canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
const digest = (canvas: Canvas) => createHash('sha256').update(pixels(canvas)).digest('hex');
const mass = (canvas: Canvas) => pixels(canvas).reduce((sum, value, i) => sum + (i % 4 === 3 ? value : 0), 0);
const brush = (tool: ToolId = 'round', extra: Partial<BrushSettings> = {}) => ({ ...getDefaultBrushSettings(tool), ...extra });
function draw(engine: CanvasBrushEngine, settings = brush(), y = 80) {
  engine.begin({ x: 25, y, pressure: 0.4 }, settings);
  for (let x = 35; x < 210; x += 10) engine.move({ x, y: y + Math.sin(x / 28) * 16, pressure: 0.45 + x / 500 });
  return engine.end()!;
}

test('changing a touch into navigation cancels only active ink and preserves undo/redo', () => {
  const {canvas,engine}=setup();
  draw(engine,brush('crayon')); const painted=digest(canvas);
  draw(engine,brush('marker'),50); engine.undo();
  const before=engine.getDocument();
  engine.begin({x:110,y:30},brush('round',{size:100,color:'#E23745'}));
  engine.move({x:140,y:80}); assert.notEqual(digest(canvas),painted);
  engine.cancelActive();
  assert.equal(digest(canvas),painted); assert.deepEqual(engine.getDocument(),before);
  assert.equal(engine.end(),null); assert.equal(engine.redo(),true);
});

test('controls normalise unsafe input while saved documents reject corrupt settings', () => {
  const settings = normalizeBrushSettings({ color: '#f0c', size: Infinity, opacity: -2, texture: 9, softness: NaN });
  assert.equal(settings.color, '#FF00CC');
  assert.equal(settings.size, DEFAULT_BRUSH_SETTINGS.size);
  assert.equal(settings.opacity, 0);
  assert.equal(settings.texture, 1);
  const { engine } = setup();
  draw(engine);
  const doc = engine.getDocument();
  const broken = structuredClone(doc);
  broken.strokes[0].points[0].x = NaN;
  assert.throws(() => validateDocument(broken), /Ponto inválido/);
  broken.strokes[0].points[0].x = 10;
  broken.strokes[0].settings.opacity = 2;
  assert.throws(() => validateDocument(broken), /Configuração inválida/);
  assert.throws(() => createDocument(10000, 100), /Dimensões/);
  assert.throws(() => deserializeDocument('{"version":2}'), /incompatível/);
  assert.deepEqual(deserializeDocument(serializeDocument(doc)), doc);
  const duplicate = structuredClone(doc);
  duplicate.redo.push(structuredClone(duplicate.strokes[0]));
  assert.throws(() => validateDocument(duplicate), /duplicados/);
});

test('interpolation closes gaps, reaches the destination and carries pressure and time', () => {
  const from = { x: 0, y: 0, pressure: 0.2, time: 10 }, to = { x: 30, y: 40, pressure: 0.8, time: 60 };
  const points = interpolatePoints(from, to, 2);
  assert.equal(points.length, 25);
  assert.deepEqual(points.at(-1), to);
  let previous = from;
  for (const point of points) {
    assert.ok(Math.hypot(point.x - previous.x, point.y - previous.y) <= 2.00001);
    assert.ok(point.pressure! >= previous.pressure!);
    previous = point as typeof from;
  }
  const smoothed = interpolateSmoothPoints({ x: -20, y: 30 }, from, to, 2);
  assert.deepEqual(smoothed.at(-1), to);
  assert.notEqual(smoothed[3].y, points[3].y);
  assert.deepEqual(interpolatePoints({ x: NaN, y: 0 }, to), []);
});

test('seeds repeat exactly and do not turn imported strokes into a different texture', () => {
  const a = seededRandom(182), b = seededRandom(182), c = seededRandom(183);
  const first = Array.from({ length: 100 }, a);
  assert.deepEqual(Array.from({ length: 100 }, b), first);
  assert.notDeepEqual(Array.from({ length: 100 }, c), first);
});

test('the engine paints a continuous transparent layer and increments without full-canvas replay', () => {
  const { canvas, engine } = setup();
  assert.equal(mass(canvas), 0);
  const ctx = canvas.getContext('2d');
  const original = ctx.clearRect.bind(ctx);
  let clears = 0;
  ctx.clearRect = (...args) => { clears++; original(...args); };
  engine.begin({ x: 20, y: 80 }, brush('pen', { size: 20, opacity: 1, alpha: 1, intensity: 1 }));
  engine.move({ x: 215, y: 80 });
  assert.equal(clears, 0, 'pointer movement must not clear or replay the frame');
  engine.end();
  for (let x = 20; x < 215; x++) assert.ok(ctx.getImageData(x, 80, 1, 1).data[3] > 0, `gap at ${x}`);
  assert.equal(ctx.getImageData(10, 10, 1, 1).data[3], 0, 'paper and contours are not flattened into the paint layer');
  assert.ok(engine.undo()); assert.equal(clears, 1); assert.equal(mass(canvas), 0);
});

test('undo, redo, autosave and reopening reproduce the exact pigment including mixing and erasing', () => {
  const { canvas, engine } = setup();
  draw(engine, brush('crayon', { material: 'glitter', color: '#DD5522' }));
  draw(engine, brush('round', { material: 'oil', color: '#3388DD', mix: 0.8 }), 84);
  draw(engine, brush('eraser', { size: 16 }), 78);
  const final = digest(canvas);
  const doc = engine.getDocument();
  assert.equal(doc.strokes.length, 3);
  assert.ok(engine.undo()); assert.notEqual(digest(canvas), final);
  assert.ok(engine.redo()); assert.equal(digest(canvas), final);
  const second = setup();
  second.engine.setDocument(deserializeDocument(serializeDocument(doc)));
  assert.equal(digest(second.canvas), final);
  doc.strokes[0].points[0].x = 999;
  assert.notEqual(engine.getDocument().strokes[0].points[0].x, 999, 'getDocument must return a copy');
  engine.begin({ x: 25, y: 25 }, brush('charcoal'));
  engine.move({ x: 100, y: 30 });
  const inProgress = engine.getDocument();
  second.engine.setDocument(inProgress);
  assert.equal(digest(second.canvas), digest(canvas), 'autosave includes the active gesture');
  engine.end();
  assert.equal(digest(canvas), digest(second.canvas));
  assert.equal(engine.redo(), false, 'new art invalidates the future history');
});

test('erasing removes selected ink and can itself be undone', () => {
  const { canvas, engine } = setup();
  engine.begin({ x: 120, y: 80 }, brush('round', { size: 100, opacity: 1, intensity: 1, softness: 0 }));
  engine.end();
  const before = digest(canvas), originalMass = mass(canvas);
  engine.begin({ x: 120, y: 80 }, brush('eraser', { size: 40, opacity: 1, intensity: 1, softness: 0 }));
  engine.end();
  assert.equal(canvas.getContext('2d').getImageData(120, 80, 1, 1).data[3], 0);
  assert.ok(mass(canvas) < originalMass);
  assert.ok(canvas.getContext('2d').getImageData(150, 80, 1, 1).data[3] > 0, 'neighbouring paint survives');
  engine.undo(); assert.equal(digest(canvas), before);
});

test('all twelve tools and all ten materials produce different real raster marks', () => {
  const toolPrints = new Set<string>();
  for (const tool of tools) {
    const { engine, canvas } = setup();
    const fixed: DrawingDocument = {
      ...createDocument(240, 160), strokes: [{
        id: 'test', seed: 12345, settings: brush(tool.id, { size: 40 }),
        points: [{ x: 25, y: 80 }, { x: 90, y: 60 }, { x: 210, y: 90 }],
      }],
    };
    engine.setDocument(fixed);
    toolPrints.add(digest(canvas));
    if (tool.id !== 'eraser') assert.ok(mass(canvas) > 0, tool.name);
  }
  assert.equal(toolPrints.size, 12);
  const materialPrints = new Set<string>();
  for (const material of materials) {
    const { engine, canvas } = setup();
    engine.setDocument({ ...createDocument(240, 160), strokes: [{ id: 'material', seed: 12345, settings: brush('round', { size: 40, material: material.id }), points: [{ x: 25, y: 80 }, { x: 210, y: 80 }] }] });
    materialPrints.add(digest(canvas));
  }
  assert.equal(materialPrints.size, 10);
});

test('size, opacity, alpha and pen pressure change actual coverage', () => {
  const coverage = (settings: Partial<BrushSettings>, pressure = 0.7) => {
    const { canvas, engine } = setup();
    engine.begin({ x: 120, y: 80, pressure }, brush('round', settings)); engine.end();
    return mass(canvas);
  };
  assert.ok(coverage({ size: 60 }) > coverage({ size: 15 }) * 8);
  assert.ok(coverage({ opacity: 1 }) > coverage({ opacity: 0.2 }) * 3);
  assert.ok(coverage({ size: 50 }, 1) > coverage({ size: 50 }, 0.1) * 4);
  assert.equal(coverage({ alpha: 0 }), 0);
});

test('pigment blending responds to underlying paint and eyedropper samples the visible result', () => {
  assert.equal(mixPigments('#FF0000', '#0000FF', 0), '#FF0000');
  assert.notEqual(mixPigments('#FFAA00', '#3366FF', 0.8), '#FFAA00');
  const first = setup(), second = setup();
  const base = brush('round', { color: '#2255DD', size: 70, opacity: 1, intensity: 1, softness: 0 });
  for (const target of [first, second]) {
    target.engine.begin({ x: 120, y: 80 }, base); target.engine.end();
    target.engine.begin({ x: 90, y: 80 }, brush('round', { color: '#F4CA55', size: 20, mix: target === first ? 1 : 0 }));
    target.engine.move({ x: 150, y: 80 }); target.engine.end();
  }
  assert.notEqual(first.engine.sample(120, 80), second.engine.sample(120, 80));
  assert.equal(first.engine.sample(-10, 0), '#FFFFFF');
  assert.match(first.engine.sample(120, 80), /^#[\dA-F]{6}$/);
});

test('PNG export keeps the original black ink above paint and emits a real image', async () => {
  const { canvas, engine } = setup();
  engine.begin({ x: 120, y: 80 }, brush('round', { color: '#FF0000', size: 120, opacity: 1, softness: 0, intensity: 1 })); engine.end();
  const lineArt = createCanvas(240, 160), ink = lineArt.getContext('2d');
  ink.fillStyle = '#FFFFFF'; ink.fillRect(0, 0, 240, 160);
  ink.fillStyle = '#000000'; ink.fillRect(119, 0, 3, 160);
  const exported = await engine.exportComposite(lineArt as unknown as CanvasImageSource);
  assert.equal(exported.type, 'image/png');
  const bytes = new Uint8Array(await exported.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const image = await loadImage(bytes);
  assert.equal(image.width, 240); assert.equal(image.height, 160);
  const composited = createCanvas(240, 160); composited.getContext('2d').drawImage(image, 0, 0);
  assert.deepEqual([...composited.getContext('2d').getImageData(120, 80, 1, 1).data], [0, 0, 0, 255]);
  assert.deepEqual([...composited.getContext('2d').getImageData(100, 80, 1, 1).data], [255, 0, 0, 255]);
  assert.equal(canvas.getContext('2d').getImageData(10, 10, 1, 1).data[3], 0, 'export must not flatten the working layer');
});

test('a corrupt restore leaves current art intact; clear and disposal release the drawing session', () => {
  const { canvas, engine } = setup(); draw(engine);
  const before = digest(canvas);
  assert.throws(() => engine.setDocument({ version: 9 } as unknown as DrawingDocument));
  assert.equal(digest(canvas), before);
  engine.clear(); assert.equal(mass(canvas), 0); assert.equal(engine.getDocument().strokes.length, 0);
  engine.dispose(); engine.dispose();
  assert.throws(() => engine.begin({ x: 5, y: 5 }, brush()), /encerrado/);
});

test('a long editable painting stores operations rather than per-gesture image snapshots', context => {
  const { engine } = setup(600, 400);
  const start = performance.now();
  for (let stroke = 0; stroke < 10; stroke++) {
    engine.begin({ x: 20, y: 20 + stroke * 30 }, brush('pencil', { size: 18 }));
    for (let i = 1; i <= 150; i++) engine.move({ x: 20 + i * 3.5, y: 20 + stroke * 30 + Math.sin(i / 8) * 5, pressure: 0.65 });
    engine.end();
  }
  const elapsed = performance.now() - start;
  const serialized = serializeDocument(engine.getDocument());
  assert.equal(engine.getDocument().strokes.reduce((sum, stroke) => sum + stroke.points.length, 0), 1510);
  assert.ok(serialized.length < 180000);
  assert.ok(!serialized.includes('base64'));
  assert.ok(elapsed < 15000, `1500 pointer moves took ${elapsed.toFixed(0)}ms`);
  context.diagnostic(`1500 pointer moves; ${elapsed.toFixed(0)}ms; editable JSON ${(serialized.length / 1024).toFixed(1)}KiB (desktop CPU; not an Android benchmark).`);
});
