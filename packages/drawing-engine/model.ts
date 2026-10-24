/** Platform independent stroke data. Import this module from native renderers. */
export interface Point { x: number; y: number; pressure?: number; time?: number }
export type ToolId = 'round' | 'pencil' | 'fine' | 'broad' | 'watercolor' | 'crayon' | 'marker' | 'airbrush' | 'charcoal' | 'pen' | 'texture' | 'eraser';
export type MaterialId = 'paint' | 'watercolor' | 'oil' | 'acrylic' | 'pastel' | 'graphite' | 'metallic' | 'glitter' | 'pearl' | 'natural';
export interface BrushSettings {
  tool: ToolId; material: MaterialId; color: string; size: number; opacity: number;
  intensity: number; softness: number; texture: number; mix: number; alpha: number;
}
export interface Stroke { id: string; points: Point[]; settings: BrushSettings; seed: number; layerId?: string }
export interface DrawingDocument { version: 1; width: number; height: number; strokes: Stroke[]; redo: Stroke[] }

export const tools: ReadonlyArray<{ id: ToolId; name: string; description: string }> = [
  { id: 'round', name: 'Pincel redondo', description: 'Marca circular com pressão e borda ajustável.' },
  { id: 'pencil', name: 'Lápis de cor', description: 'Ponta estreita, grão fino e cobertura gradual.' },
  { id: 'fine', name: 'Pincel fino', description: 'Ponta alongada que acompanha a direção e a pressão.' },
  { id: 'broad', name: 'Pincel grosso', description: 'Pincel chato com cerdas paralelas visíveis.' },
  { id: 'watercolor', name: 'Aquarela', description: 'Lavagens translúcidas e pigmento nas bordas.' },
  { id: 'crayon', name: 'Giz de cera', description: 'Grão largo, irregular e com falhas de papel.' },
  { id: 'marker', name: 'Marcador', description: 'Ponta chanfrada de cobertura densa.' },
  { id: 'airbrush', name: 'Aerógrafo', description: 'Névoa difusa acumulada suavemente.' },
  { id: 'charcoal', name: 'Carvão', description: 'Pó escuro com partículas e bordas esfumadas.' },
  { id: 'pen', name: 'Caneta artística', description: 'Linha precisa de tinta, sem difusão.' },
  { id: 'texture', name: 'Pincel de textura', description: 'Marcas secas, hachuras e cerdas separadas.' },
  { id: 'eraser', name: 'Borracha', description: 'Remove tinta sem modificar os contornos.' },
];
export const materials: ReadonlyArray<{ id: MaterialId; name: string; description: string }> = [
  { id: 'paint', name: 'Tinta comum', description: 'Pigmento equilibrado.' },
  { id: 'watercolor', name: 'Aquarela', description: 'Transparência e borda pigmentada.' },
  { id: 'oil', name: 'Tinta a óleo', description: 'Cobertura densa e relevo de cerdas.' },
  { id: 'acrylic', name: 'Tinta acrílica', description: 'Cobertura firme e reflexo discreto.' },
  { id: 'pastel', name: 'Giz pastel', description: 'Pigmento claro e poeira de papel.' },
  { id: 'graphite', name: 'Grafite', description: 'Pigmento acinzentado e reflexos suaves.' },
  { id: 'metallic', name: 'Pigmento metálico', description: 'Faixas de luz e sombra que simulam metal.' },
  { id: 'glitter', name: 'Glitter', description: 'Partículas brilhantes presas à tinta.' },
  { id: 'pearl', name: 'Tinta perolizada', description: 'Reflexo claro com nuances iridescentes.' },
  { id: 'natural', name: 'Pigmentos naturais', description: 'Tons terrosos e grãos minerais.' },
];
export const TOOLS = tools;
export const MATERIALS = materials;
export const DEFAULT_BRUSH_SETTINGS: Readonly<BrushSettings> = Object.freeze({
  tool: 'round', material: 'paint', color: '#B9684E', size: 28,
  opacity: 0.8, intensity: 0.8, softness: 0.25, texture: 0.35, mix: 0, alpha: 1,
});
export const defaultBrushSettings = DEFAULT_BRUSH_SETTINGS;

const toolIds = new Set(tools.map(({ id }) => id));
const materialIds = new Set(materials.map(({ id }) => id));
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
export const clamp = (n: number, min = 0, max = 1): number => Math.min(max, Math.max(min, n));
const control = (n: unknown, fallback: number, min = 0, max = 1): number => finite(n) ? clamp(n, min, max) : fallback;

export function normalizeColor(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_BRUSH_SETTINGS.color;
  const hex = value.trim();
  if (/^#[\da-f]{6}$/i.test(hex)) return hex.toUpperCase();
  if (/^#[\da-f]{3}$/i.test(hex)) return '#' + [...hex.slice(1)].map(c => c + c).join('').toUpperCase();
  return DEFAULT_BRUSH_SETTINGS.color;
}

export function normalizeBrushSettings(input: Partial<BrushSettings> = {}): BrushSettings {
  const d = DEFAULT_BRUSH_SETTINGS;
  return {
    tool: toolIds.has(input.tool as ToolId) ? input.tool! : d.tool,
    material: materialIds.has(input.material as MaterialId) ? input.material! : d.material,
    color: normalizeColor(input.color), size: control(input.size, d.size, 1, 256),
    opacity: control(input.opacity, d.opacity), intensity: control(input.intensity, d.intensity),
    softness: control(input.softness, d.softness), texture: control(input.texture, d.texture),
    mix: control(input.mix, d.mix), alpha: control(input.alpha, d.alpha),
  };
}

export function getDefaultBrushSettings(tool: ToolId = 'round'): BrushSettings {
  const sizes: Record<ToolId, number> = { round: 28, pencil: 10, fine: 12, broad: 60, watercolor: 56, crayon: 30, marker: 32, airbrush: 76, charcoal: 36, pen: 6, texture: 50, eraser: 44 };
  return normalizeBrushSettings({ ...DEFAULT_BRUSH_SETTINGS, tool, size: sizes[tool], softness: tool === 'airbrush' ? 0.95 : tool === 'pen' ? 0 : 0.25 });
}

export function createDocument(width = 2048, height = 1280): DrawingDocument {
  if (!finite(width) || !finite(height) || width < 1 || height < 1 || width > 8192 || height > 8192) throw new Error('Dimensões da pintura inválidas (1–8192).');
  return { version: 1, width: Math.round(width), height: Math.round(height), strokes: [], redo: [] };
}

/** Includes the destination, excludes the origin; pressure and timestamps travel with the line. */
export function interpolatePoints(from: Point, to: Point, spacing = 1): Point[] {
  if (![from.x, from.y, to.x, to.y].every(finite)) return [];
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.min(65536, Math.ceil(distance / Math.max(0.25, finite(spacing) ? spacing : 1))));
  return Array.from({ length: steps }, (_, index) => {
    const t = (index + 1) / steps;
    const point: Point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    if (from.pressure !== undefined || to.pressure !== undefined) point.pressure = clamp((from.pressure ?? 0.5) + ((to.pressure ?? 0.5) - (from.pressure ?? 0.5)) * t);
    if (from.time !== undefined && to.time !== undefined) point.time = from.time + (to.time - from.time) * t;
    return point;
  });
}

/** Causal Hermite smoothing: the stroke reaches the pointer without waiting for a future event. */
export function interpolateSmoothPoints(before: Point, from: Point, to: Point, spacing = 1): Point[] {
  const samples = interpolatePoints(from, to, spacing);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const tangentX = (to.x - before.x) / 2, tangentY = (to.y - before.y) / 2;
  const magnitude = Math.hypot(tangentX, tangentY);
  const limit = magnitude > distance && magnitude > 0 ? distance / magnitude : 1;
  return samples.map((point, index) => {
    const t = (index + 1) / samples.length, t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    return {
      ...point,
      x: h00 * from.x + h10 * tangentX * limit + h01 * to.x + h11 * (to.x - from.x),
      y: h00 * from.y + h10 * tangentY * limit + h01 * to.y + h11 * (to.y - from.y),
    };
  });
}

export function normalizePoint(point: Point, width: number, height: number): Point {
  if (!point || !finite(point.x) || !finite(point.y)) throw new Error('Ponto inválido.');
  const normalized: Point = { x: clamp(point.x, -256, width + 256), y: clamp(point.y, -256, height + 256) };
  if (finite(point.pressure)) normalized.pressure = clamp(point.pressure);
  if (finite(point.time)) normalized.time = Math.max(0, point.time);
  return normalized;
}

function validateStroke(value: unknown, width: number, height: number): Stroke {
  const s = value as Partial<Stroke> | null;
  if (!s || typeof s.id !== 'string' || !s.id || s.id.length > 160 || !Array.isArray(s.points) || !s.points.length || s.points.length > 100000 || !finite(s.seed) || !s.settings || typeof s.settings !== 'object') throw new Error('Traço inválido ou excede o limite de pontos.');
  if (!toolIds.has(s.settings.tool) || !materialIds.has(s.settings.material)) throw new Error('Ferramenta ou material desconhecido.');
  if (!/^#[\da-f]{6}$/i.test(s.settings.color)) throw new Error('Cor inválida.');
  for (const key of ['size', 'opacity', 'intensity', 'softness', 'texture', 'mix', 'alpha'] as const) {
    const v = s.settings[key];
    if (!finite(v) || v < (key === 'size' ? 1 : 0) || v > (key === 'size' ? 256 : 1)) throw new Error(`Configuração inválida: ${key}.`);
  }
  return {
    id: s.id, seed: s.seed >>> 0, settings: normalizeBrushSettings(s.settings),
    points: s.points.map(p => normalizePoint(p, width, height)),
    ...(typeof s.layerId === 'string' && s.layerId.length <= 160 ? { layerId: s.layerId } : {}),
  };
}

/** Returns a defensive, validated copy; throws rather than silently losing saved art. */
export function validateDocument(value: unknown): DrawingDocument {
  const doc = value as Partial<DrawingDocument> | null;
  if (!doc || doc.version !== 1 || !finite(doc.width) || !finite(doc.height) || !Array.isArray(doc.strokes) || !Array.isArray(doc.redo)) throw new Error('Formato de pintura inválido ou versão incompatível.');
  const result = createDocument(doc.width, doc.height);
  if (doc.strokes.length + doc.redo.length > 20000) throw new Error('A pintura excede o limite de traços.');
  const total = [...doc.strokes, ...doc.redo].reduce((count, stroke) => count + (Array.isArray(stroke?.points) ? stroke.points.length : 0), 0);
  if (total > 2000000) throw new Error('A pintura excede o limite de pontos.');
  result.strokes = doc.strokes.map(s => validateStroke(s, result.width, result.height));
  result.redo = doc.redo.map(s => validateStroke(s, result.width, result.height));
  const ids = [...result.strokes, ...result.redo].map(s => s.id);
  if (new Set(ids).size !== ids.length) throw new Error('Há identificadores de traços duplicados.');
  return result;
}

export function serializeDocument(value: DrawingDocument): string { return JSON.stringify(validateDocument(value)); }
export function deserializeDocument(value: string): DrawingDocument {
  if (typeof value !== 'string' || value.length > 150000000) throw new Error('Arquivo de pintura muito grande.');
  return validateDocument(JSON.parse(value));
}

/** Seeded randomness keeps granular tools identical through undo, redo and reopening. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let x = Math.imul(state ^ state >>> 15, 1 | state);
    x ^= x + Math.imul(x ^ x >>> 7, 61 | x);
    return ((x ^ x >>> 14) >>> 0) / 4294967296;
  };
}
