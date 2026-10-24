import {
  clamp, createDocument, interpolateSmoothPoints, normalizeBrushSettings, normalizeColor, normalizePoint,
  seededRandom, validateDocument,
  type BrushSettings, type DrawingDocument, type Point, type Stroke,
} from './model';

type RGB = [number, number, number];
type ActiveStroke = { stroke: Stroke; random: () => number };
const rgb = (hex: string): RGB => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const css = (color: RGB, alpha = 1) => `rgba(${color.map(v => Math.round(clamp(v, 0, 255))).join(',')},${clamp(alpha)})`;
const shade = (color: RGB, amount: number): RGB => color.map(v => amount > 0 ? v + (255 - v) * amount : v * (1 + amount)) as RGB;
const luminance = (color: RGB) => color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;

/** Approximate subtractive pigment mixing, rather than averaging two screen RGB lights. */
export function mixPigments(first: string, second: string, amount = 0.5): string {
  const a = rgb(normalizeColor(first)), b = rgb(normalizeColor(second)), t = clamp(Number.isFinite(amount) ? amount : 0.5);
  return '#' + a.map((v, i) => Math.round(v * (1 - t) + Math.sqrt(v * b[i]) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Transparent paint layer only. Pointer transforms, paper and ink contours belong to
 * the host. No event listeners, DOM globals or browser-only work run at module load.
 * Coordinates and size are expressed in document pixels, independent of CSS zoom.
 */
export class CanvasBrushEngine {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private document: DrawingDocument;
  private active: ActiveStroke | null = null;
  private disposed = false;
  private sequence = 0;
  private committedPointCount = 0;

  constructor(canvas: HTMLCanvasElement, width = 2048, height = 1280) {
    this.document = createDocument(width, height);
    this.canvas = canvas;
    canvas.width = this.document.width;
    canvas.height = this.document.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Este dispositivo não oferece Canvas 2D.');
    this.context = context;
    this.context.clearRect(0, 0, canvas.width, canvas.height);
  }

  begin(point: Point, settings: BrushSettings): void {
    this.assertOpen();
    if (this.active) this.end();
    if (this.document.strokes.length >= 20000) throw new Error('Limite de traços atingido. Exporte sua obra antes de continuar.');
    if (this.committedPointCount >= 2000000) throw new Error('Limite de pontos atingido. Exporte sua obra antes de continuar.');
    const first = normalizePoint(point, this.document.width, this.document.height);
    const seed = (Math.random() * 4294967296) >>> 0;
    this.active = {
      stroke: { id: `stroke-${Date.now().toString(36)}-${(++this.sequence).toString(36)}-${seed.toString(36)}`, points: [first], settings: normalizeBrushSettings(settings), seed },
      random: seededRandom(seed),
    };
    this.stamp(first, this.active.stroke.settings, 0, this.active.random, this.mixedColor(first, this.active.stroke.settings));
  }

  move(point: Point): void {
    this.assertOpen();
    if (!this.active) return;
    const { stroke, random } = this.active;
    if (stroke.points.length >= 100000) throw new Error('O gesto atingiu o limite de pontos. Levante o pincel para continuar.');
    if (this.committedPointCount + stroke.points.length >= 2000000) throw new Error('Limite de pontos atingido. Exporte sua obra antes de continuar.');
    const next = normalizePoint(point, this.document.width, this.document.height);
    const previous = stroke.points[stroke.points.length - 1];
    if (Math.hypot(next.x - previous.x, next.y - previous.y) < 0.15) return;
    stroke.points.push(next);
    this.segment(previous, next, stroke.settings, random, stroke.points[stroke.points.length - 3] ?? previous);
  }

  end(): Stroke | null {
    this.assertOpen();
    if (!this.active) return null;
    const stroke = this.active.stroke;
    this.active = null;
    this.document.strokes.push(stroke);
    this.committedPointCount += stroke.points.length;
    this.document.redo = [];
    return structuredClone(stroke);
  }

  /** Convert an in-progress touch into navigation without leaving a painted dot. */
  cancelActive(): void {
    this.assertOpen();
    if (!this.active) return;
    this.active = null;
    this.render();
  }

  undo(): boolean {
    this.assertOpen();
    if (this.active) this.end();
    const stroke = this.document.strokes.pop();
    if (!stroke) return false;
    this.document.redo.push(stroke);
    this.committedPointCount -= stroke.points.length;
    this.render();
    return true;
  }

  redo(): boolean {
    this.assertOpen();
    if (this.active) this.end();
    const stroke = this.document.redo.pop();
    if (!stroke) return false;
    this.document.strokes.push(stroke);
    this.committedPointCount += stroke.points.length;
    // This operation only adds the restored stroke to the existing image.
    this.replay(stroke);
    return true;
  }

  setDocument(document: DrawingDocument): void {
    this.assertOpen();
    // Validate before mutating: a failed restore must preserve the current canvas.
    const next = validateDocument(document);
    this.active = null;
    this.document = next;
    this.committedPointCount = next.strokes.reduce((count, stroke) => count + stroke.points.length, 0);
    this.canvas.width = next.width;
    this.canvas.height = next.height;
    this.render();
  }

  getDocument(): DrawingDocument {
    this.assertOpen();
    const doc = structuredClone(this.document);
    // Autosaving during a long gesture must include the paint already visible.
    if (this.active) {
      doc.strokes.push(structuredClone(this.active.stroke));
      doc.redo = [];
    }
    return doc;
  }

  clear(): void {
    this.assertOpen();
    this.active = null;
    this.document = createDocument(this.document.width, this.document.height);
    this.committedPointCount = 0;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render(): void {
    this.assertOpen();
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const stroke of this.document.strokes) this.replay(stroke);
    if (this.active) this.active.random = this.replay(this.active.stroke);
  }

  /** Samples visible paint against white paper, suitable for the colour picker. */
  sample(x: number, y: number): string {
    this.assertOpen();
    const pixel = this.pixel(x, y);
    const alpha = pixel[3] / 255;
    return '#' + pixel.slice(0, 3).map(v => Math.round(v * alpha + 255 * (1 - alpha)).toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  async exportComposite(lineArt: CanvasImageSource | null, background = '#FFFFFF'): Promise<Blob> {
    this.assertOpen();
    const surface = this.createSurface();
    const output = surface.getContext('2d');
    if (!output) throw new Error('Não foi possível preparar a exportação.');
    output.fillStyle = /^#[\da-f]{3,8}$/i.test(background) ? background : '#FFFFFF';
    output.fillRect(0, 0, this.canvas.width, this.canvas.height);
    output.drawImage(this.canvas, 0, 0);
    if (lineArt) {
      output.globalCompositeOperation = 'multiply';
      output.drawImage(lineArt, 0, 0, this.canvas.width, this.canvas.height);
      output.globalCompositeOperation = 'source-over';
    }
    // Both HTMLCanvasElement and OffscreenCanvas are supported. The final branch
    // enables pixel tests in Node without introducing a native runtime dependency.
    const target = surface as HTMLCanvasElement & {
      convertToBlob?: (options: { type: string }) => Promise<Blob>;
      toBuffer?: (format: string) => Uint8Array;
    };
    if (typeof target.convertToBlob === 'function') return target.convertToBlob({ type: 'image/png' });
    if (typeof target.toBlob === 'function') return new Promise((resolve, reject) => target.toBlob(blob => blob ? resolve(blob) : reject(new Error('Falha ao exportar o PNG.')), 'image/png'));
    if (typeof target.toBuffer === 'function') return new Blob([new Uint8Array(target.toBuffer('image/png'))], { type: 'image/png' });
    throw new Error('Exportação PNG indisponível neste renderizador.');
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.active) this.end();
    this.disposed = true;
  }

  private assertOpen(): void { if (this.disposed) throw new Error('O motor de pintura já foi encerrado.'); }

  private createSurface(): HTMLCanvasElement {
    let surface: HTMLCanvasElement;
    if (this.canvas.ownerDocument?.createElement) surface = this.canvas.ownerDocument.createElement('canvas');
    else if (typeof OffscreenCanvas !== 'undefined') surface = new OffscreenCanvas(this.canvas.width, this.canvas.height) as unknown as HTMLCanvasElement;
    else {
      const CanvasConstructor = this.canvas.constructor as new (width: number, height: number) => HTMLCanvasElement;
      surface = new CanvasConstructor(this.canvas.width, this.canvas.height);
    }
    surface.width = this.canvas.width;
    surface.height = this.canvas.height;
    return surface;
  }

  private pixel(x: number, y: number): number[] {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return [255, 255, 255, 0];
    return Array.from(this.context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data);
  }

  private replay(stroke: Stroke): () => number {
    const random = seededRandom(stroke.seed);
    this.stamp(stroke.points[0], stroke.settings, 0, random, this.mixedColor(stroke.points[0], stroke.settings));
    for (let i = 1; i < stroke.points.length; i++) this.segment(stroke.points[i - 1], stroke.points[i], stroke.settings, random, stroke.points[Math.max(0, i - 2)]);
    return random;
  }

  private segment(from: Point, to: Point, settings: BrushSettings, random: () => number, before = from): void {
    const fraction = settings.tool === 'airbrush' ? 0.2 : settings.tool === 'pencil' || settings.tool === 'pen' ? 0.075 : 0.12;
    const spacing = Math.max(0.65, settings.size * fraction);
    let previous = from;
    for (const point of interpolateSmoothPoints(before, from, to, spacing)) {
      const angle = Math.atan2(point.y - previous.y, point.x - previous.x);
      // Sample the leading edge, so a long pointer event crossing existing colour
      // picks it up rather than repeatedly sampling only its own newly laid tail.
      const ahead = settings.size * (0.25 + (point.pressure ?? 0.7) * 0.75) * 0.45;
      const color = this.mixedColor(point, settings, Math.cos(angle) * ahead, Math.sin(angle) * ahead);
      this.stamp(point, settings, angle, random, color);
      previous = point;
    }
  }

  private mixedColor(point: Point, settings: BrushSettings, offsetX = 0, offsetY = 0): string {
    if (settings.mix <= 0 || settings.tool === 'eraser') return settings.color;
    let pixel = this.pixel(point.x + offsetX, point.y + offsetY);
    if (pixel[3] === 0 && (offsetX || offsetY)) pixel = this.pixel(point.x, point.y);
    if (pixel[3] === 0) return settings.color;
    const under = '#' + pixel.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
    return mixPigments(settings.color, under, settings.mix * pixel[3] / 255);
  }

  private stamp(point: Point, s: BrushSettings, angle: number, random: () => number, inputColor: string): void {
    const ctx = this.context;
    const pressure = clamp(point.pressure ?? 0.7, 0.03, 1);
    const radius = Math.max(0.35, s.size * (0.25 + pressure * 0.75) / 2);
    let color = rgb(inputColor);
    let alpha = s.opacity * s.alpha * (0.18 + 0.82 * s.intensity);
    if (alpha <= 0) return;
    const grain = s.texture;
    switch (s.material) {
      case 'watercolor': alpha *= 0.22; break;
      case 'oil': alpha *= 0.96; color = shade(color, -0.04); break;
      case 'acrylic': alpha = Math.min(1, alpha * 1.2); break;
      case 'pastel': alpha *= 0.65; color = shade(color, 0.18); break;
      case 'graphite': { const gray = luminance(color) * 0.6; color = [gray * 0.94, gray, gray * 1.04]; alpha *= 0.68; break; }
      case 'metallic': color = shade(color, Math.sin(point.y / 10 + point.x / 40) * 0.38); break;
      case 'pearl': color = shade(color, 0.32 + Math.sin(point.x / 23) * 0.15); color = [color[0], color[1] * 0.95, Math.min(255, color[2] * 1.05)]; alpha *= 0.85; break;
      case 'natural': color = [color[0] * 0.87 + 19, color[1] * 0.79 + 13, color[2] * 0.65 + 8]; alpha *= 0.78; break;
    }
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(angle);
    ctx.globalAlpha = clamp(alpha);
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.fillStyle = css(color);
    ctx.strokeStyle = css(color);
    switch (s.tool) {
      case 'round': this.disc(radius, color, s.softness); break;
      case 'eraser': this.disc(radius, [0, 0, 0], s.softness); break;
      case 'fine':
        ctx.beginPath(); ctx.ellipse(0, 0, radius * 0.85, radius * 0.28, 0, 0, Math.PI * 2); ctx.fill();
        break;
      case 'broad':
        ctx.fillRect(-radius * 0.34, -radius, radius * 0.68, radius * 2);
        ctx.globalAlpha = alpha * 0.24; ctx.strokeStyle = css(shade(color, -0.28)); ctx.lineWidth = 0.6;
        for (let y = -radius; y < radius; y += Math.max(1.5, radius / 9)) { ctx.beginPath(); ctx.moveTo(-radius * 0.4, y); ctx.lineTo(radius * 0.4, y + 0.6); ctx.stroke(); }
        break;
      case 'pencil':
        ctx.globalAlpha = alpha * 0.28;
        this.disc(radius * 0.32, color, 0.1);
        ctx.globalAlpha = alpha * 0.65;
        this.particles(random, radius * 0.55, 16 + grain * 24, Math.max(0.35, radius * 0.045), false);
        break;
      case 'watercolor':
        ctx.globalAlpha = alpha * 0.1;
        this.disc(radius, color, 0.68);
        ctx.globalAlpha = alpha * 0.025;
        ctx.lineWidth = Math.max(0.6, radius * 0.055); ctx.beginPath(); ctx.arc(0, 0, radius * (0.82 + random() * 0.15), 0, Math.PI * 2); ctx.stroke();
        this.particles(random, radius * 0.92, 5, 0.8, false);
        break;
      case 'crayon':
        ctx.globalAlpha = alpha * 0.72;
        this.particles(random, radius, 32 + grain * 45, Math.max(0.8, radius * 0.09), true);
        break;
      case 'marker':
        ctx.rotate(-Math.PI / 5);
        ctx.beginPath(); ctx.ellipse(0, 0, radius * 0.55, radius, 0, 0, Math.PI * 2); ctx.fill();
        break;
      case 'airbrush':
        ctx.globalAlpha = alpha * 0.11;
        this.disc(radius * 1.25, color, 1);
        break;
      case 'charcoal':
        color = shade(color, -0.5); ctx.fillStyle = css(color);
        ctx.globalAlpha = alpha * 0.18; this.disc(radius, color, 0.92);
        ctx.globalAlpha = alpha * 0.6;
        this.particles(random, radius, 24 + grain * 30, Math.max(0.6, radius * 0.07), false);
        break;
      case 'pen':
        ctx.beginPath(); ctx.arc(0, 0, Math.max(0.35, radius * 0.32), 0, Math.PI * 2); ctx.fill();
        break;
      case 'texture':
        ctx.globalAlpha = alpha * 0.55;
        ctx.lineWidth = Math.max(0.65, radius * 0.035);
        for (let i = 0; i < 12 + grain * 20; i++) {
          const x = (random() - 0.5) * radius, y = (random() - 0.5) * radius * 2;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + radius * (0.2 + random() * 0.4), y + radius * 0.1); ctx.stroke();
        }
        break;
    }
    if (s.tool !== 'eraser') this.materialSurface(s, radius, color, alpha, random);
    ctx.restore();
  }

  private disc(radius: number, color: RGB, softness: number): void {
    const ctx = this.context;
    if (softness > 0.02) {
      const gradient = ctx.createRadialGradient(0, 0, Math.max(0, radius * (1 - softness) * 0.8), 0, 0, radius);
      gradient.addColorStop(0, css(color)); gradient.addColorStop(1, css(color, 0));
      ctx.fillStyle = gradient;
    } else ctx.fillStyle = css(color);
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
    // Subsequent material particles inherit a flat pigment, never this gradient.
    ctx.fillStyle = css(color);
  }

  private particles(random: () => number, radius: number, count: number, size: number, square: boolean): void {
    const ctx = this.context;
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2, distance = Math.sqrt(random()) * radius;
      const x = Math.cos(angle) * distance, y = Math.sin(angle) * distance, r = size * (0.4 + random() * 1.1);
      if (square) ctx.fillRect(x - r / 2, y - r / 2, r, r * (0.6 + random()));
      else { ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.5 + random() * 0.5), 0, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  private materialSurface(s: BrushSettings, radius: number, color: RGB, alpha: number, random: () => number): void {
    const ctx = this.context;
    const amount = 0.2 + s.texture * 0.8;
    // Clip finishing effects to the footprint of each tool, so a narrow pen does
    // not unexpectedly leave a large disc of glitter or oil outside its stroke.
    const narrow = s.tool === 'pen' ? 0.32 : s.tool === 'pencil' ? 0.55 : s.tool === 'fine' ? 0.28 : 1;
    const r = radius * narrow;
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
    switch (s.material) {
      case 'paint':
        if (s.texture > 0.02) {
          ctx.globalAlpha = alpha * 0.09 * s.texture; ctx.fillStyle = css(shade(color, -0.25));
          this.particles(random, r, 5 + s.texture * 5, Math.max(0.35, r * 0.025), false);
        }
        break;
      case 'watercolor':
        ctx.globalAlpha = alpha * 0.12; ctx.strokeStyle = css(shade(color, -0.22)); ctx.lineWidth = Math.max(0.5, r * 0.04);
        ctx.beginPath(); ctx.arc(0, 0, r * 0.93, 0, Math.PI * 2); ctx.stroke();
        break;
      case 'oil':
        ctx.globalAlpha = alpha * 0.17 * amount; ctx.strokeStyle = css(shade(color, 0.55)); ctx.lineWidth = Math.max(0.7, r * 0.055);
        for (let i = 0; i < 4; i++) { const y = (i / 4 - 0.4) * r * 1.5; ctx.beginPath(); ctx.moveTo(-r, y); ctx.lineTo(r, y + r * 0.06); ctx.stroke(); }
        break;
      case 'acrylic':
        ctx.globalAlpha = alpha * 0.07; ctx.fillStyle = css(shade(color, 0.65)); ctx.fillRect(-r, -r * 0.45, r * 2, Math.max(0.5, r * 0.1));
        break;
      case 'pastel':
        ctx.globalAlpha = alpha * 0.4 * amount; ctx.fillStyle = css(shade(color, 0.55)); this.particles(random, r, 12, Math.max(0.5, r * 0.06), true);
        break;
      case 'graphite':
        ctx.globalAlpha = alpha * 0.13; ctx.fillStyle = '#BFC7CC'; this.particles(random, r, 7, 0.65, false);
        break;
      case 'metallic':
        ctx.globalAlpha = alpha * 0.38; ctx.strokeStyle = css(shade(color, 0.7)); ctx.lineWidth = Math.max(0.6, r * 0.13);
        ctx.beginPath(); ctx.moveTo(-r, -r * 0.32); ctx.lineTo(r, -r * 0.08); ctx.stroke();
        ctx.globalAlpha = alpha * 0.25; ctx.strokeStyle = css(shade(color, -0.55));
        ctx.beginPath(); ctx.moveTo(-r, r * 0.35); ctx.lineTo(r, r * 0.55); ctx.stroke();
        break;
      case 'glitter':
        for (let i = 0; i < 3 + amount * 6; i++) {
          const angle = random() * Math.PI * 2, d = Math.sqrt(random()) * r, x = Math.cos(angle) * d, y = Math.sin(angle) * d;
          const size = Math.max(0.55, r * (0.015 + random() * 0.065));
          ctx.globalAlpha = alpha * (0.4 + random() * 0.6); ctx.fillStyle = random() > 0.35 ? '#FFF8DC' : css(shade(color, -0.4));
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
          if (random() > 0.8) { ctx.fillRect(x - size * 1.5, y, size * 3, Math.max(0.5, size * 0.3)); ctx.fillRect(x, y - size * 1.5, Math.max(0.5, size * 0.3), size * 3); }
        }
        break;
      case 'pearl':
        ctx.globalAlpha = alpha * 0.12; ctx.fillStyle = '#F5E7FF'; ctx.beginPath(); ctx.ellipse(-r * 0.18, -r * 0.22, r * 0.58, r * 0.2, -0.25, 0, Math.PI * 2); ctx.fill();
        break;
      case 'natural':
        ctx.globalAlpha = alpha * 0.3 * amount; ctx.fillStyle = css(shade(color, -0.45)); this.particles(random, r, 11, Math.max(0.7, r * 0.06), true);
        break;
    }
    ctx.restore();
  }
}
