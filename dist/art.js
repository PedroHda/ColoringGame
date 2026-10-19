import { extraTemplates } from './scenes.js';
import { normalizePaint, paintFill, textures, finishes } from './paint-effects.js';
import { applyDifficulty, normalizeDifficulty } from './difficulty.js';
// Editable vector regions make the prototype playable without an image service.
// Coordinates of labels live inside their respective shapes.
const shape = (d, color, x, y) => ({ tag: 'path', attrs: { d }, color, x, y });
const ellipse = (cx, cy, rx, ry, color, rotation = 0) => ({ tag: 'ellipse', attrs: { cx, cy, rx, ry, ...(rotation ? { transform: `rotate(${rotation} ${cx} ${cy})` } : {}) }, color, x: cx, y: cy });

export const palettes = [
  [ ['Mel de sol', '#E9B75D'], ['Rosa de barro', '#D99078'], ['Folha de sálvia', '#A4B58A'], ['Verde da mata', '#3F6B5A'], ['Terra quentinha', '#AD856B'], ['Creme de baunilha', '#F1DCA8'] ],
  [ ['Luz de pêssego', '#E8AD7E'], ['Flor de hibisco', '#CA7D7E'], ['Chá de matcha', '#AEC194'], ['Lago tranquilo', '#477C78'], ['Argila rosada', '#AA8277'], ['Areia dourada', '#EADCBA'] ],
  [ ['Sol de outono', '#DDA653'], ['Pétala de lavanda', '#B59BBC'], ['Oliva suave', '#B4B283'], ['Floresta azul', '#476779'], ['Café com leite', '#A88C72'], ['Manhã de verão', '#EEE1AB'] ],
  [ ['Sol de baunilha', '#EDC86C'], ['Rosa de sonho', '#DC9AA5'], ['Brisa de lavanda', '#B9AED8'], ['Céu profundo', '#716693'], ['Canela suave', '#B18B78'], ['Nuvem de creme', '#F2E7CF'] ],
  [ ['Areia dourada', '#E8C780'], ['Coral do mar', '#E69C87'], ['Água cristalina', '#9BC7BA'], ['Azul da enseada', '#558C99'], ['Terra da praia', '#B89D81'], ['Espuma suave', '#E4EFDF'] ],
];

const tropical = () => [
  ellipse(370, 143, 62, 62, 1),
  shape('M99 406 C192 398 290 401 445 363 L451 377 C321 411 222 420 103 421Z', 5, 158, 410),
  shape('M145 403 C98 388 71 349 79 314 C124 319 153 352 145 403Z', 3, 112, 358),
  shape('M147 402 C139 358 156 319 190 309 C202 347 182 384 147 402Z', 4, 170, 351),
  shape('M118 341 C70 332 51 296 58 269 C98 269 124 300 118 341Z', 3, 87, 300),
  shape('M422 377 C421 332 446 304 477 305 C480 342 456 367 422 377Z', 3, 450, 339),
  shape('M445 332 C440 296 451 269 477 258 C493 289 480 316 445 332Z', 4, 465, 294),
  shape('M428 368 C402 360 389 338 395 317 C425 321 439 343 428 368Z', 6, 413, 343),
  shape('M284 361 C287 413 274 455 249 493 C239 437 247 390 261 361Z', 4, 263, 425),
  shape('M285 362 C307 410 308 455 295 507 C272 464 266 405 271 364Z', 3, 290, 454),
  shape('M276 388 L288 389 L284 426 L270 429Z', 5, 279, 409),
  shape('M315 381 L326 378 L327 414 L314 416Z', 5, 320, 402),
  shape('M267 181 C217 201 205 251 210 310 C215 365 248 394 299 390 C350 386 371 339 361 285 L347 207Z', 4, 237, 263),
  shape('M270 265 C231 264 226 290 234 322 C244 358 285 368 315 339 C326 321 305 278 270 265Z', 3, 268, 312),
  shape('M277 278 C254 281 252 301 265 317 C273 329 292 332 303 321 C297 301 291 287 277 278Z', 6, 280, 307),
  shape('M306 244 C331 232 350 252 354 284 C360 317 350 346 329 356 C337 312 320 284 306 244Z', 6, 337, 293),
  shape('M264 186 C263 141 296 115 329 129 C359 139 368 175 354 210 L323 249 C288 245 271 220 264 186Z', 4, 287, 179),
  shape('M313 157 C334 147 355 162 354 184 C356 207 335 227 318 237 C297 224 292 200 298 180 C301 169 306 161 313 157Z', 6, 326, 207),
  shape('M348 158 C393 143 442 155 474 188 C437 204 386 207 350 191Z', 1, 412, 177),
  shape('M350 191 C395 204 440 199 474 188 C457 221 399 241 350 210Z', 2, 412, 214),
  shape('M447 167 C459 173 468 180 474 188 L452 197 C456 188 453 176 447 167Z', 4, 460, 184),
  ellipse(318, 177, 7, 7, 4),
  shape('M179 247 C160 230 162 208 179 199 C196 216 198 233 179 247Z', 2, 178, 222),
  shape('M155 260 C127 262 114 242 120 223 C147 221 161 236 155 260Z', 1, 138, 243),
  ellipse(196, 147, 7, 7, 1),
  ellipse(449, 448, 6, 6, 2),
  ellipse(156, 470, 5, 5, 3),
];

const greenhouse = () => [
  ellipse(292, 212, 164, 164, 6),
  shape('M109 425 C200 418 371 418 467 425 L467 438 L109 438Z', 5, 285, 430),
  shape('M203 328 L348 328 L332 421 L220 421Z', 2, 278, 383),
  shape('M197 317 Q197 311 205 311 L347 311 Q355 311 355 319 L355 337 L197 337Z', 5, 278, 324),
  shape('M273 311 C272 259 268 201 281 141 L289 143 C278 204 284 260 283 311Z', 4, 278, 261),
  shape('M281 219 C226 225 196 197 193 163 C235 157 277 175 281 219Z', 4, 232, 191),
  shape('M281 264 C221 281 191 257 182 228 C226 208 267 230 281 264Z', 3, 226, 247),
  shape('M280 188 C281 136 314 106 352 113 C355 151 326 184 280 188Z', 3, 318, 145),
  shape('M280 242 C290 203 331 181 365 195 C356 232 321 253 280 242Z', 4, 327, 220),
  shape('M278 299 C307 258 346 254 370 279 C345 312 309 321 278 299Z', 3, 329, 289),
  shape('M151 367 L199 367 L192 420 L159 420Z', 6, 176, 396),
  shape('M166 365 L166 324 C147 326 137 308 143 291 C155 283 168 292 170 302 L170 278 Q177 264 184 278 L184 316 C188 304 203 304 207 316 C212 337 197 345 184 342 L184 365Z', 3, 177, 329),
  shape('M381 377 L435 377 L428 420 L388 420Z', 1, 409, 400),
  ellipse(408, 356, 18, 24, 4),
  ellipse(390, 351, 12, 18, 3, -35),
  ellipse(426, 352, 12, 18, 3, 35),
  ellipse(124, 208, 8, 8, 2),
  ellipse(427, 158, 6, 6, 1),
  ellipse(383, 470, 5, 5, 2),
  shape('M133 479 Q145 449 159 479 Q144 490 133 479Z', 3, 147, 476),
  shape('M442 254 Q454 224 468 254 Q453 265 442 254Z', 1, 456, 251),
];

const mushrooms = () => [
  ellipse(300, 219, 158, 158, 6),
  shape('M99 434 C146 408 187 424 222 413 C266 395 291 419 333 407 C379 397 427 414 470 432 C359 451 221 454 99 434Z', 3, 300, 434),
  shape('M251 272 C258 328 239 368 239 405 C256 427 310 422 325 404 C308 361 303 310 310 270Z', 6, 282, 355),
  shape('M161 264 C171 198 228 146 280 148 C343 144 403 195 414 263 C362 299 213 304 161 264Z', 2, 260, 230),
  shape('M161 264 C230 282 345 283 414 263 C403 303 187 310 161 264Z', 5, 284, 290),
  ellipse(230, 208, 20, 14, 6, -27),
  ellipse(301, 181, 17, 12, 6, 8),
  ellipse(352, 231, 22, 15, 6, 29),
  ellipse(286, 243, 12, 10, 1),
  shape('M369 352 C373 375 372 395 366 419 L400 424 C390 400 390 375 395 350Z', 6, 383, 392),
  shape('M337 348 C346 310 374 289 395 298 C421 305 437 328 440 352 C414 369 358 367 337 348Z', 1, 389, 330),
  shape('M337 348 C363 355 411 361 440 352 C425 376 349 373 337 348Z', 5, 391, 361),
  ellipse(375, 324, 10, 8, 6, -20),
  ellipse(410, 339, 8, 6, 6),
  shape('M147 368 L144 421 L168 420 L164 368Z', 6, 155, 398),
  shape('M115 368 C118 339 142 317 157 320 C182 321 199 344 198 369 C173 381 140 383 115 368Z', 2, 157, 354),
  ellipse(143, 347, 9, 7, 6),
  ellipse(174, 359, 8, 6, 1),
  shape('M211 417 C175 409 165 389 174 369 C204 373 216 391 211 417Z', 4, 192, 393),
  shape('M220 423 C212 392 228 371 248 369 C255 392 244 413 220 423Z', 3, 233, 394),
  shape('M429 420 C421 394 435 374 455 373 C463 398 449 414 429 420Z', 4, 443, 396),
  shape('M108 423 C90 408 93 389 109 380 C127 397 127 413 108 423Z', 3, 108, 402),
  ellipse(172, 164, 7, 7, 1),
  ellipse(439, 213, 6, 6, 2),
  ellipse(348, 473, 6, 6, 1),
];

export const templates = [
  { id: 'tropical', title: 'Jardim tropical', category: 'Natureza', description: 'Um encontro entre folhas e asas.', build: tropical },
  { id: 'greenhouse', title: 'Cantinho verde', category: 'Botânica', description: 'Pequenas folhas, grandes respiros.', build: greenhouse },
  { id: 'mushrooms', title: 'Bosque encantado', category: 'Imaginação', description: 'Um mundo pequeno para descobrir.', build: mushrooms },
  ...extraTemplates,
];

export function createArt(templateIndex, seed = 0, level = 'medium') {
  const template = templates[templateIndex % templates.length];
  const regions = template.build().map((region, index) => ({ ...region, id: `r${index}`, attrs: { ...region.attrs } }));
  const backgroundLabels = [[370, 143], [160, 180], [300, 100], [300, 115], [441, 123], [160, 240], [300, 112], [180, 240], [300, 105]];
  [regions[0].x, regions[0].y] = backgroundLabels[templateIndex % templates.length];
  // Seeded changes affect colors, placement, silhouette and decoration; no network needed.
  const palette = palettes[seed ? Math.abs(seed) % palettes.length : templateIndex >= 6 ? 4 : templateIndex >= 3 ? 3 : 0];
  if (seed) {
    const offset = (seed % 19) - 9;
    const background = regions[0];
    background.attrs.cx = Number(background.attrs.cx) + offset;
    background.attrs.cy = Number(background.attrs.cy) + (seed % 13) - 6;
    background.x += offset;
    background.y += (seed % 13) - 6;
    const count = 3 + seed % 5;
    for (let i = 0; i < count; i++) {
      const x = 104 + ((seed * 31 + i * 127) % 370);
      const y = 95 + ((seed * 17 + i * 83) % 35);
      regions.push({ ...ellipse(x, y, 4 + i % 3, 4 + i % 3, 1 + i % 3), id: `extra${i}` });
    }
  }
  const difficulty = normalizeDifficulty(level);
  const adapted = applyDifficulty(regions, palette, difficulty, templateIndex);
  return { id: `${template.id}-${seed}${difficulty === 'medium' ? '' : `-${difficulty}`}`, templateIndex, seed, difficulty, title: seed ? `${template.title} · ${seed}` : template.title, category: template.category, description: template.description, ...adapted };
}

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
let renderSerial = 0;

export function renderArt(art, { painted = [], selected = 1, preview = false, hideNumbers = false, customPaint = null } = {}) {
  const paintedSet = new Set(painted);
  const mirror = art.seed % 2 ? 'translate(600 0) scale(-1 1)' : '';
  const prefix = `art${++renderSerial}`;
  const definitions = [];
  const regions = art.regions.map(region => {
    const custom = customPaint !== null;
    const paint = custom ? normalizePaint(customPaint[region.id]) : null;
    const filled = custom ? !!paint : preview || paintedSet.has(region.id);
    const color = art.palette[region.color - 1][1];
    const effect = paint ? paintFill(paint, `${prefix}-${region.id}-paint`) : null;
    if (effect) definitions.push(effect.definitions);
    const attrs = Object.entries(region.attrs).filter(([key]) => !mirror || key !== 'transform').map(([key, value]) => `${key}="${escape(value)}"`).join(' ');
    const labelX = mirror ? 600 - region.x : region.x;
    const label = !custom && !filled && !hideNumbers ? `<text x="${labelX}" y="${region.y}" class="region-number" aria-hidden="true">${region.color}</text>` : '';
    const disabled = filled && !custom;
    const materialLabel = paint ? `${textures.find(item => item.id === paint.texture).name}, ${finishes.find(item => item.id === paint.finish).name}` : '';
    const interaction = preview ? '' : ` data-region="${region.id}" data-color="${region.color}" data-painted="${filled}" ${region.clip ? `data-clip="${region.clip.join(',')}"` : ''} role="button" tabindex="${disabled ? '-1' : '0'}" aria-label="Área ${art.regions.indexOf(region) + 1}${custom ? paint ? `, ${paint.color}, ${materialLabel}, toque para recolorir` : ', por pintar com sua cor' : `, cor ${region.color}${filled ? ', colorida' : ', por pintar'}`}" aria-disabled="${disabled}"`;
    const transform = mirror ? `transform="${escape([mirror, region.attrs.transform || ''].join(' '))}"` : '';
    let clip = '', partition = '';
    if (region.clip) {
      const [x, y, width, height] = region.clip;
      const clipId = `${prefix}-${region.id}`;
      const sourceId = `${clipId}-shape`;
      definitions.push(`<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><rect x="${x}" y="${y}" width="${width}" height="${height}"/></clipPath>`);
      const sourceAttrs = Object.entries(region.attrs).filter(([key]) => key !== 'transform').map(([key, value]) => `${key}="${escape(value)}"`).join(' ');
      definitions.push(`<clipPath id="${sourceId}" clipPathUnits="userSpaceOnUse"><${region.tag} ${sourceAttrs}/></clipPath>`);
      clip = `clip-path="url(#${clipId})"`;
      const partitionTransform = mirror ? transform : region.attrs.transform ? `transform="${escape(region.attrs.transform)}"` : '';
      partition = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="${filled ? '#425D4A' : '#8D9684'}" stroke-width="1.1" ${partitionTransform} clip-path="url(#${sourceId})" pointer-events="none" class="partition-line"/>`;
    }
    const fill = custom ? effect?.fill || '#fffef9' : filled ? color : !preview && selected === region.color ? color + '32' : '#fffef9';
    return `<g class="region ${filled ? 'painted' : ''} ${!custom && !filled && selected === region.color ? 'matching' : ''}"${interaction}><${region.tag} ${attrs} ${transform} ${clip} fill="${fill}" stroke="${filled ? '#425D4A' : '#8D9684'}" stroke-width="${preview ? 1.5 : 1.35}" stroke-linejoin="round"/>${partition}${label}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 550" class="art-svg ${preview ? 'preview-svg' : ''}" ${preview ? `role="img" aria-label="${escape(art.title)}"` : 'role="group" aria-label="Desenho para colorir"'}><defs>${definitions.join('')}</defs><g>${regions}</g></svg>`;
}
