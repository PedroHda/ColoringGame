import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chapters, stylePrompt } from '../packages/game-content/content-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const illustrationDir = path.join(root, 'assets/illustrations');
const contentDir = path.join(root, 'packages/game-content');
const sync = process.argv.includes('--sync');
const strict = process.argv.includes('--complete');
const pad = (n) => String(n).padStart(2, '0');
const reviewFile = path.join(illustrationDir, 'visual-review.json');
const reviews = fs.existsSync(reviewFile) ? new Map(JSON.parse(fs.readFileSync(reviewFile, 'utf8')).assets.map((review) => [review.id, review])) : new Map();

function inspectPng(file) {
  const bytes = fs.readFileSync(file);
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('O arquivo não tem assinatura PNG.');
  let width, height, depth, color, interlace;
  const chunks = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const len = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; color = data[9]; interlace = data[12];
    }
    if (type === 'IDAT') chunks.push(data);
    offset += len + 12;
  }
  if (width * height > 40_000_000) throw new Error('Dimensões excedem o limite seguro de inspeção.');
  const channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 })[color];
  if (depth !== 8 || !channels || interlace !== 0) throw new Error('PNG requer inspeção manual: formato não suportado pelo verificador de pixels.');
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  let previous = Buffer.alloc(stride);
  let colored = 0, white = 0, opaque = 0;
  const paeth = (a, b, c) => { const p = a + b - c; const pa = Math.abs(p-a), pb = Math.abs(p-b), pc = Math.abs(p-c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0, offset = 0; y < height; y++) {
    const filter = raw[offset++];
    const current = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? current[x - channels] : 0;
      const b = previous[x], c = x >= channels ? previous[x - channels] : 0;
      const prediction = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : filter === 4 ? paeth(a,b,c) : NaN;
      if (!Number.isFinite(prediction)) throw new Error('Filtro PNG inválido.');
      current[x] = (raw[offset++] + prediction) & 255;
    }
    for (let x = 0; x < stride; x += channels) {
      const r = current[x], g = color === 0 || color === 4 ? r : current[x+1], b = color === 0 || color === 4 ? r : current[x+2];
      const alpha = color === 4 ? current[x+1] : color === 6 ? current[x+3] : 255;
      if (alpha >= 250) opaque++;
      if (Math.max(r,g,b) - Math.min(r,g,b) > 12 && alpha > 20) colored++;
      if (r >= 242 && g >= 242 && b >= 242 && alpha >= 250) white++;
    }
    previous = current;
  }
  const pixels = width * height;
  return { width, height, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, whiteRatio: white/pixels, coloredRatio: colored/pixels, opaqueRatio: opaque/pixels };
}

fs.mkdirSync(illustrationDir, { recursive: true });
const seenHashes = new Map();
const assets = [];
const prompts = [];
const paths = chapters.map((chapter, pathIndex) => {
  const pathId = `path-${pad(pathIndex + 1)}`;
  const stages = chapter.stages.map(([title, intro, outro, scene, legacyId], stageIndex) => {
    const id = `p${pad(pathIndex+1)}-s${pad(stageIndex+1)}`;
    const relative = `${id}.png`;
    const filename = path.join(illustrationDir, relative);
    let stats = { width: 0, height: 0 };
    let status = 'missing';
    const issues = [];
    let resolutionStatus = 'missing';
    if (fs.existsSync(filename)) {
      try {
        stats = inspectPng(filename);
        resolutionStatus = stats.width >= 2048 && stats.height >= 1280 ? 'target' : 'below-target';
        if (stats.width < 1400 || stats.height < 800 || stats.width/stats.height > 2.5) issues.push('Resolução inferior à versão jogável ou proporção inadequada.');
        if (stats.whiteRatio < 0.62 && !(stats.whiteRatio > 0.50 && reviews.get(id)?.status === 'approved')) issues.push('Espaço branco inferior ao limiar automático; exige maioria branca e aprovação visual individual registrada.');
        if (stats.coloredRatio > 0.001) issues.push('Foram detectados pixels coloridos.');
        if (stats.opaqueRatio < 0.99) issues.push('O fundo precisa ser predominantemente branco e opaco.');
        if (seenHashes.has(stats.sha256)) issues.push(`Arquivo idêntico à fase ${seenHashes.get(stats.sha256)}.`);
        seenHashes.set(stats.sha256, id);
        status = issues.length ? 'rejected' : 'ready';
      } catch (error) { status = 'rejected'; issues.push(error.message); }
    }
    assets.push({ id, status, resolutionStatus, file: relative, ...stats, visualReview: reviews.get(id) ?? null, issues });
    prompts.push({ id, title, category: 'historical-scene', prompt: stylePrompt + scene });
    return { id, pathId, index: stageIndex, title, intro, outro, asset: status === 'ready' ? `/illustrations/${relative}` : null, width: stats.width, height: stats.height, resolutionStatus, ...(legacyId ? { legacyId } : {}) };
  });
  const { title, era, intro, outro, reward, palette } = chapter;
  return { id: pathId, index: pathIndex, title, era, intro, outro, reward, palette, stages };
});
const ready = assets.filter((asset) => asset.status === 'ready').length;
const missing = assets.filter((asset) => asset.status === 'missing').length;
const rejected = assets.filter((asset) => asset.status === 'rejected');
const belowTarget = assets.filter((asset) => asset.resolutionStatus === 'below-target').length;
const catalog = { schemaVersion: 1, note: '15 caminhos temáticos, não uma cronologia universal. Só asset !== null indica uma arte instalada e validada.', paths };
if (sync) {
  fs.writeFileSync(path.join(contentDir, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
  fs.writeFileSync(path.join(illustrationDir, 'manifest.json'), JSON.stringify({ schemaVersion: 1, required: 75, ready, missing, belowTarget, rejected: rejected.length, assets }, null, 2) + '\n');
  fs.writeFileSync(path.join(illustrationDir, 'prompts.json'), JSON.stringify({ schemaVersion: 1, tool: 'built-in image_gen', images: prompts }, null, 2) + '\n');
} else {
  const existing = JSON.parse(fs.readFileSync(path.join(contentDir, 'catalog.json'), 'utf8'));
  if (JSON.stringify(existing) !== JSON.stringify(catalog)) throw new Error('Catálogo diverge dos arquivos: execute node scripts/validate-assets.mjs --sync.');
}
console.log(JSON.stringify({ paths: paths.length, stages: assets.length, ready, missing, belowTarget, rejected: rejected.length, invalid: rejected.map(({id,issues}) => ({id,issues})) }, null, 2));
if (rejected.length || (strict && (ready !== 75 || belowTarget > 0))) process.exitCode = 1;
