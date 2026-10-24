/** Lossless distribution packaging. Never writes the official illustration masters. */
import { readFile, writeFile, mkdir, rename, unlink, lstat, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let canvasModule;
try { canvasModule = createRequire(import.meta.url)('@napi-rs/canvas'); }
catch (rootError) {
  // EAS can install only the mobile dependency tree in this monorepo.
  // The encoder is a build-time dependency, never imported by the Android renderer.
  try { canvasModule = createRequire(path.join(ROOT, 'apps/mobile/package.json'))('@napi-rs/canvas'); }
  catch (mobileError) { throw new Error('Instale as dependências de desenvolvimento da raiz ou de apps/mobile para preparar as ilustrações.', { cause: mobileError }); }
}
const { createCanvas, loadImage } = canvasModule;
const MASTERS = path.join(ROOT, 'assets/illustrations');
const DEFAULT_OUT = path.join(ROOT, 'build/illustrations');
const ALLOWED = [path.join(ROOT, 'build'), path.join(ROOT, 'apps/mobile/assets')];
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const within = (target, base) => {
  const relative = path.relative(base, target);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
};

/** Reject links beneath the workspace as well as destinations outside the two build roots. */
export async function assertDistributionPath(input) {
  const resolved = path.resolve(ROOT, input ?? DEFAULT_OUT);
  if (!ALLOWED.some(base => within(resolved, base))) throw Error('Destino deve ficar dentro de build/ ou apps/mobile/assets/. Masters nunca são sobrescritos.');
  let current = ROOT;
  for (const part of path.relative(ROOT, resolved).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw Error(`Destino contém link simbólico: ${current}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return resolved;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let c = value;
  for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), result = Buffer.allocUnsafe(data.length + 12);
  result.writeUInt32BE(data.length, 0); name.copy(result, 4); data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}

export function inspectPng(bytes) {
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(SIGNATURE)) throw Error('Assinatura PNG inválida.');
  let header, ended = false, animated = false, idat = false;
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) throw Error('PNG incompleto.');
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    if (end > bytes.length) throw Error('Chunk PNG incompleto.');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) throw Error('Tipo de chunk PNG inválido.');
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw Error(`CRC PNG inválido (${type}).`);
    if (!header && type !== 'IHDR') throw Error('PNG não começa com IHDR.');
    if (type === 'IHDR') {
      if (header || length !== 13) throw Error('IHDR PNG inválido.');
      const width = bytes.readUInt32BE(offset + 8), height = bytes.readUInt32BE(offset + 12);
      if (width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 40000000) throw Error('Dimensões PNG excedem os limites de empacotamento.');
      header = { width, height, depth: bytes[offset + 16], colorType: bytes[offset + 17] };
    }
    if (type === 'acTL') animated = true;
    if (type === 'IDAT') idat = true;
    if (type === 'IEND') {
      if (length !== 0 || end !== bytes.length || !idat) throw Error('Final PNG inválido.');
      ended = true;
    }
    offset = end;
  }
  if (!header || !ended) throw Error('PNG sem IHDR/IEND.');
  return { ...header, animated };
}

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** The only channel conversion allowed here is exact opaque RGB equality -> gray8. */
export function encodeGrayscalePng(rgba, width, height) {
  return encodeOpaquePng(rgba, width, height, true);
}
/** RGB8 fallback preserves slightly tinted line art instead of forcing it to gray. */
export function encodeRgbPng(rgba, width, height) {
  return encodeOpaquePng(rgba, width, height, false);
}
function encodeOpaquePng(rgba, width, height, grayOnly) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 40000000 || rgba.length !== width * height * 4) throw Error('Dimensões/pixels inválidos para gray8.');
  const channels = grayOnly ? 1 : 3, stride = width * channels;
  const samples = Buffer.allocUnsafe(width * height * channels);
  for (let i = 0, pixel = 0; i < rgba.length; i += 4, pixel++) {
    if (rgba[i + 3] !== 255 || (grayOnly && (rgba[i] !== rgba[i + 1] || rgba[i] !== rgba[i + 2]))) throw Error(grayOnly ? 'gray8 exige r=g=b e alfa255 em todos os pixels.' : 'RGB8 exige alfa255 em todos os pixels.');
    samples[pixel * channels] = rgba[i];
    if (!grayOnly) { samples[pixel * channels + 1] = rgba[i + 1]; samples[pixel * channels + 2] = rgba[i + 2]; }
  }
  const filtered = Buffer.allocUnsafe((stride + 1) * height);
  const candidates = Array.from({ length: 5 }, () => Buffer.allocUnsafe(stride));
  for (let y = 0; y < height; y++) {
    const row = y * stride; let bestScore = Infinity, best = 0;
    for (let filter = 0; filter < 5; filter++) {
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? samples[row + x - channels] : 0, b = y > 0 ? samples[row - stride + x] : 0, c = x >= channels && y > 0 ? samples[row - stride + x - channels] : 0;
        const prediction = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >>> 1 : paeth(a, b, c);
        const value = (samples[row + x] - prediction) & 255;
        candidates[filter][x] = value; score += Math.min(value, 256 - value);
      }
      if (score < bestScore) { bestScore = score; best = filter; }
    }
    const output = y * (stride + 1); filtered[output] = best; candidates[best].copy(filtered, output + 1);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = grayOnly ? 0 : 2;
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(filtered, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

async function decode(bytes, header = inspectPng(bytes)) {
  // The native decoder can mistake SVG text inside C2PA credentials for an SVG
  // image. Ignore only this non-pixel ancillary chunk in its temporary input;
  // masters and unoptimised copies retain their original provenance bytes.
  const parts = [bytes.subarray(0, 8)];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    if (bytes.toString('ascii', offset + 4, offset + 8) !== 'caBX') parts.push(bytes.subarray(offset, end));
    offset = end;
  }
  const image = await loadImage(Buffer.concat(parts));
  if (image.width !== header.width || image.height !== header.height) throw Error('Dimensões decodificadas divergem do IHDR.');
  const canvas = createCanvas(header.width, header.height), context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const rgba = context.getImageData(0, 0, header.width, header.height).data;
  return { canvas, rgba, hash: sha256(rgba), width: header.width, height: header.height };
}

async function writeAtomic(filename, bytes) {
  await assertDistributionPath(filename);
  // Repeated builds still verify every pixel; avoid rewriting identical output
  // and triggering another sync/upload in OneDrive and similar workspaces.
  try { if ((await readFile(filename)).equals(bytes)) return; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = `${filename}.tmp-${process.pid}`;
  await assertDistributionPath(temporary);
  try { await writeFile(temporary, bytes, { flag: 'wx' }); await rename(temporary, filename); }
  catch (error) { try { await unlink(temporary); } catch { /* No recursive cleanup. */ } throw error; }
}

/**
 * out: build destination; only: optional stage ID array for small verification runs.
 * Official source and catalogue/manifest must already agree. Results never update them.
 */
export async function optimizeIllustrations({ out = DEFAULT_OUT, only, thumbnails = true } = {}) {
  const destination = await assertDistributionPath(out);
  const catalog = JSON.parse(await readFile(path.join(ROOT, 'packages/game-content/catalog.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(MASTERS, 'manifest.json'), 'utf8'));
  if (!Array.isArray(catalog.paths) || !Array.isArray(manifest.assets)) throw Error('Catálogo/manifesto inválido. Execute a validação de assets.');
  if (only !== undefined && (!Array.isArray(only) || only.some(id => typeof id !== 'string' || !/^p\d{2}-s\d{2}$/.test(id)))) throw Error('Filtro de fases inválido.');
  const selected = only && new Set(only), records = new Map(manifest.assets.map(asset => [asset.id, asset]));
  const stages = catalog.paths.flatMap(chapter => chapter.stages).filter(stage => stage.asset && (!selected || selected.has(stage.id)));
  if (selected && stages.length !== selected.size) throw Error('Uma fase solicitada não possui asset ativo no catálogo.');
  await assertDistributionPath(destination); await mkdir(destination, { recursive: true });
  const files = [];
  for (const stage of stages) {
    if (!/^p\d{2}-s\d{2}$/.test(stage.id) || stage.asset !== `/illustrations/${stage.id}.png`) throw Error('Asset ativo tem caminho inesperado.');
    const record = records.get(stage.id);
    if (!record || record.status !== 'ready' || !/^[a-f0-9]{64}$/i.test(record.sha256 ?? '')) throw Error(`Asset ${stage.id} ainda não foi validado.`);
    const source = path.join(MASTERS, `${stage.id}.png`), before = await stat(source);
    const original = await readFile(source), after = await stat(source);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || sha256(original) !== record.sha256) throw Error(`Asset ${stage.id} mudou durante a leitura ou diverge do manifesto. Valide-o antes de empacotar.`);
    const header = inspectPng(original), decoded = await decode(original, header);
    let opaque = header.depth === 8 && !header.animated, grayscale = opaque;
    for (let i = 0; i < decoded.rgba.length; i += 4) {
      if (decoded.rgba[i + 3] !== 255) { opaque = false; grayscale = false; }
      if (decoded.rgba[i] !== decoded.rgba[i + 1] || decoded.rgba[i] !== decoded.rgba[i + 2]) grayscale = false;
    }
    let output = original, encoding = 'original';
    if (opaque) {
      const candidate = grayscale ? encodeGrayscalePng(decoded.rgba, header.width, header.height) : encodeRgbPng(decoded.rgba, header.width, header.height);
      const checked = await decode(candidate);
      if (checked.hash !== decoded.hash || checked.width !== decoded.width || checked.height !== decoded.height) throw Error(`Falha de igualdade de pixels em ${stage.id}; cópia otimizada recusada.`);
      if (candidate.length < original.length) { output = candidate; encoding = grayscale ? 'grayscale8' : 'rgb8'; }
    }
    // Verify the exact buffer about to be written, even if the safe fallback won.
    if (sha256((await decode(output)).rgba) !== decoded.hash) throw Error(`Pixels da distribuição divergentes em ${stage.id}.`);
    const filename = `${stage.id}.png`; await writeAtomic(path.join(destination, filename), output);
    const item = { id: stage.id, file: filename, width: decoded.width, height: decoded.height, originalBytes: original.length, bytes: output.length, savedBytes: original.length - output.length, encoding, sourceSha256: record.sha256, rgbaSha256: decoded.hash, outputSha256: sha256(output), pixelEquality: true };
    if (thumbnails) {
      const scale = Math.min(320 / decoded.width, 200 / decoded.height, 1), width = Math.max(1, Math.round(decoded.width * scale)), height = Math.max(1, Math.round(decoded.height * scale));
      const preview = createCanvas(width, height), ctx = preview.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(decoded.canvas, 0, 0, width, height);
      let bytes = preview.toBuffer('image/png');
      if (!header.animated) {
        const previewRgba = ctx.getImageData(0, 0, width, height).data;
        if (previewRgba.every((value, index) => index % 4 !== 3 || value === 255)) {
          const compressed = encodeRgbPng(previewRgba, width, height);
          if (compressed.length < bytes.length) bytes = compressed;
        }
      }
      const file = `${stage.id}.thumb.png`;
      inspectPng(bytes); await writeAtomic(path.join(destination, file), bytes);
      item.thumbnail = { file, width, height, bytes: bytes.length, derivedPreview: true };
    }
    files.push(item);
  }
  const report = { schemaVersion: 1, method: 'Exact RGBA equality; opaque grayscale8 only when r=g=b, otherwise lossless RGB8. Adaptive PNG filters/zlib9; 16-bit/translucent/animated or non-smaller files stay byte-identical. Masters retain source provenance; source SHA256 links every derived distribution.', files, originalBytes: files.reduce((sum, file) => sum + file.originalBytes, 0), bytes: files.reduce((sum, file) => sum + file.bytes, 0), thumbnailBytes: files.reduce((sum, file) => sum + (file.thumbnail?.bytes ?? 0), 0) };
  await writeAtomic(path.join(destination, 'distribution-manifest.json'), Buffer.from(JSON.stringify(report, null, 2) + '\n'));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--out' || !args[1])) throw Error('Uso: node scripts/optimize-illustrations.mjs [--out build/illustrations]');
    const report = await optimizeIllustrations({ ...(args.length ? { out: args[1] } : {}) });
    console.log(JSON.stringify({ assets: report.files.length, originalBytes: report.originalBytes, bytes: report.bytes, savedBytes: report.originalBytes - report.bytes, thumbnailBytes: report.thumbnailBytes, pixelEquality: report.files.every(file => file.pixelEquality) }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
