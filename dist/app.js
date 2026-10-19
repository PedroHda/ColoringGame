import { createArt, renderArt, templates } from './art.js';
import { setupJourney } from './journey.js';
import { setupFreePaint } from './free-paint.js';
import { worlds, getProgress } from './progression.js';
import { difficulties, difficultyInfo, normalizeDifficulty, recommendedDifficulty } from './difficulty.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'colore-studio-v1';
const icons = {
  undo: '<path d="M8 5 3 10l5 5M3 10h10a7 7 0 0 1 0 14" transform="translate(0 -3) scale(.9)"/>',
  zoom: '<circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5M10 7v6M7 10h6"/>',
  zoomOut: '<circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5M7 10h6"/>',
  hint: '<path d="M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/><path d="M12 1V0M3 5 1 4M21 5l2-1"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  sparkle: '<path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8ZM21 2v4m-2-2h4"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const initial = () => ({ version: 1, current: 'tropical-0', generated: [], painted: {}, selected: 1, view: 'journey', mode: 'journey', libraryDifficulty: 'medium' });
let storageAvailable = true;

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initial();
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.generated) || typeof data.painted !== 'object' || !data.painted || Array.isArray(data.painted)) return initial();
    const generated = data.generated.filter(item => Number.isInteger(item.templateIndex) && item.templateIndex >= 0 && item.templateIndex < templates.length && Number.isSafeInteger(item.seed) && item.seed > 0 && item.seed < 1000000);
    return { ...initial(), current: typeof data.current === 'string' ? data.current : 'tropical-0', generated, painted: data.painted, selected: Number.isInteger(data.selected) && data.selected >= 1 && data.selected <= 8 ? data.selected : 1, view: ['journey', 'library', 'free', 'collection', 'play'].includes(data.view) ? data.view : 'journey', mode: data.mode === 'free' ? 'free' : 'journey', libraryDifficulty: normalizeDifficulty(data.libraryDifficulty) };
  } catch { storageAvailable = false; return initial(); }
}

let state = readState();
let artworks = [];
let currentArt;
let undoHistory = [];
let hideNumbers = false;
let zoomed = false;
let toastTimer;
let generationBusy = false;
let journey;
let freePaint;
const labelPositions = new Map();
const routes = { journey: '#jornada', library: '#desenhos', free: '#livre', collection: '#colecao', play: '#colorir' };

function navigate(view, scroll = true) {
  if (!routes[view]) return;
  state.view = view;
  document.body.dataset.view = view;
  for (const name of Object.keys(routes)) $(`${name}-view`).hidden = name !== view;
  if (view === 'play') positionLabels();
  document.querySelectorAll('.navigation [data-view]').forEach(button => {
    const active = button.dataset.view === view || view === 'play' && button.dataset.view === 'journey';
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  journey?.render();
  if (view === 'free') freePaint?.render();
  if (location.hash !== routes[view]) history.pushState(null, '', routes[view]);
  save();
  if (scroll) { window.scrollTo({ top: 0, behavior: 'instant' }); const heading = [...$(`${view}-view`).querySelectorAll('h1,h2')].find(item => item.getClientRects().length); heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true }); }
}

function rebuildArtworks() {
  artworks = [...templates.map((_, index) => createArt(index)), ...templates.flatMap((_, index) => ['easy', 'hard'].map(level => createArt(index, 0, level))), ...state.generated.flatMap(item => difficulties.map(level => createArt(item.templateIndex, item.seed, level.id)))];
  // Keep only unique, valid regions from persisted progress.
  for (const art of artworks) {
    const valid = new Set(art.regions.map(region => region.id));
    const saved = Array.isArray(state.painted[art.id]) ? state.painted[art.id] : [];
    state.painted[art.id] = [...new Set(saved.filter(id => valid.has(id)))];
  }
  currentArt = artworks.find(art => art.id === state.current) || artworks[0];
  state.current = currentArt.id;
}

function phaseArt(index) {
  const options = artworks.filter(art => art.templateIndex === index && art.seed === 0);
  return options.find(isComplete) || options.find(art => paintedFor(art).length > 0) || options.find(art => art.difficulty === recommendedDifficulty(index));
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageAvailable = true; }
  catch { storageAvailable = false; }
  $('save-status').innerHTML = `<span></span>${storageAvailable ? 'Progresso salvo neste dispositivo' : 'Progresso apenas nesta sessão'}`;
}

function paintedFor(art = currentArt) { return state.painted[art.id] || []; }
function remaining(color) { return currentArt.regions.filter(region => region.color === color && !paintedFor().includes(region.id)); }
function isComplete(art) { return paintedFor(art).length === art.regions.length; }
function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3300);
}

function renderBoard() {
  $('artboard').innerHTML = renderArt(currentArt, { painted: paintedFor(), selected: state.selected, hideNumbers });
  $('artboard').classList.toggle('zoomed', zoomed);
  if (state.view === 'play') positionLabels();
}

// Nested illustrations can cover a region's original number. Keep every number
// in the visible part of its own shape, including after mirroring a drawing.
function positionLabels() {
  const svg = $('artboard').querySelector('svg');
  const matrix = svg?.getScreenCTM();
  if (!matrix || $('play-view').hidden) return;
  const rootInverse = matrix.inverse();
  const entries = [...svg.querySelectorAll('[data-region]')].map(node => ({ node, shape: node.firstElementChild, label: node.querySelector('text'), clip: node.dataset.clip?.split(',').map(Number) }));
  const point = svg.createSVGPoint();
  const cached = labelPositions.get(currentArt.id) || {};
  const inside = (entry, x, y) => {
    point.x = x; point.y = y;
    const local = point.matrixTransform(matrix).matrixTransform(entry.shape.getScreenCTM().inverse());
    if (entry.clip) { const [cx, cy, width, height] = entry.clip; if (local.x < cx || local.x > cx + width || local.y < cy || local.y > cy + height) return false; }
    return entry.shape.isPointInFill(local);
  };
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (!entry.label) continue;
    const id = entry.node.dataset.region;
    let candidate = cached[id];
    if (!candidate) {
      const original = [Number(entry.label.getAttribute('x')), Number(entry.label.getAttribute('y'))];
      const visible = (x, y) => inside(entry, x, y) && !entries.slice(index + 1).some(other => inside(other, x, y));
      if (visible(...original)) candidate = original;
      else {
        const rect = entry.shape.getBoundingClientRect();
        point.x = rect.left; point.y = rect.top;
        const start = point.matrixTransform(rootInverse);
        point.x = rect.right; point.y = rect.bottom;
        const end = point.matrixTransform(rootInverse);
        const options = [];
        for (let a = 1; a < 20; a++) for (let b = 1; b < 20; b++) options.push([start.x + (end.x - start.x) * a / 20, start.y + (end.y - start.y) * b / 20]);
        options.sort((a, b) => Math.hypot(a[0] - original[0], a[1] - original[1]) - Math.hypot(b[0] - original[0], b[1] - original[1]));
        candidate = options.find(([x, y]) => visible(x, y) && visible(x - 3, y) && visible(x + 3, y) && visible(x, y - 3) && visible(x, y + 3)) || options.find(([x, y]) => visible(x, y));
      }
      if (candidate) cached[id] = candidate;
      else console.warn(`Região sem posição visível: ${currentArt.id}/${id}`);
    }
    if (candidate) { entry.label.setAttribute('x', candidate[0]); entry.label.setAttribute('y', candidate[1]); }
  }
  labelPositions.set(currentArt.id, cached);
}

function renderPalette() {
  $('palette').style.setProperty('--palette-count', currentArt.palette.length);
  $('palette').classList.toggle('eight-colors', currentArt.palette.length === 8);
  $('palette').classList.toggle('four-colors', currentArt.palette.length === 4);
  $('palette').innerHTML = currentArt.palette.map(([name, color], index) => {
    const number = index + 1;
    const left = remaining(number).length;
    return `<button class="color-button" data-palette="${number}" aria-label="Cor ${number}: ${name}, ${left} áreas restantes" aria-pressed="${state.selected === number}"><span class="swatch" style="background:${color}"><span class="${left === 0 ? 'swatch-check' : ''}">${left === 0 ? '✓' : number}</span></span><span class="remaining">${left === 0 ? 'completa' : `${left} ${left === 1 ? 'área' : 'áreas'}`}</span></button>`;
  }).join('');
  const [name, color] = currentArt.palette[state.selected - 1];
  $('selected-color-note').innerHTML = `<span class="color-dot" style="background:${color}"></span> ${state.selected} · ${name}`;
}

function renderProgress() {
  const total = currentArt.regions.length;
  const count = paintedFor().length;
  // Round down so an unfinished picture never appears to be 100% complete.
  const percent = Math.floor(count / total * 100);
  $('progress-percent').innerHTML = `${percent}<span>%</span>`;
  $('progress-fill').style.width = `${percent}%`;
  $('progress-track').setAttribute('aria-valuenow', String(percent));
  $('progress-detail').textContent = `${count} de ${total} áreas coloridas`;
  $('progress-finish').textContent = count === total ? 'você fez florescer ♡' : 'cada cor conta ♡';
  $('hint-button').innerHTML = count === total ? '✓ Seu desenho está completo' : `${icon('hint')} Uma ajudinha?`;
  $('hint-button').disabled = count === total;
  $('undo-button').disabled = undoHistory.length === 0;
  $('collection-count').textContent = String(artworks.filter(isComplete).length);
  $('header-stars').textContent = String(getProgress(artworks, state.painted).stars);
  $('download-button').innerHTML = `${icon('download')} ${count === total ? 'Baixar minha arte' : 'Baixar meu progresso'}`;
}

function renderLevelNavigation() {
  const index = currentArt.templateIndex;
  const progress = getProgress(artworks, state.painted);
  $('previous-level').disabled = !!currentArt.seed || index === 0;
  $('following-level').disabled = !!currentArt.seed || index === 8;
  $('following-level').textContent = state.mode === 'journey' && index < 8 && !progress.unlocked[index + 1] ? 'Conclua para avançar ♧' : 'Próximo desenho →';
}

function updateGame() { renderBoard(); renderPalette(); renderProgress(); renderLevelNavigation(); save(); }

function selectColor(color) {
  if (color < 1 || color > currentArt.palette.length) return;
  state.selected = color;
  renderBoard(); renderPalette(); save();
}

function selectArt(id, scroll = true, mode = state.mode) {
  const art = artworks.find(item => item.id === id);
  if (!art) return;
  currentArt = art;
  state.current = id;
  state.mode = mode;
  state.selected = art.regions.find(region => !paintedFor(art).includes(region.id))?.color || 1;
  undoHistory = [];
  zoomed = false;
  $('zoom-button').innerHTML = icon('zoom');
  $('zoom-button').setAttribute('aria-label', 'Ampliar desenho');
  $('canvas-viewport').scrollTo(0, 0);
  $('art-title').textContent = art.title;
  const world = worlds[Math.min(2, Math.floor(art.templateIndex / 3))];
  $('art-category').textContent = art.seed ? `ATELIÊ · VARIAÇÃO ${art.seed}` : `MUNDO ${Math.floor(art.templateIndex / 3) + 1} · FASE ${String(art.templateIndex + 1).padStart(2, '0')}`;
  $('phase-breadcrumb').textContent = `${world.name} · ${art.seed ? 'Variação local' : `Fase ${art.templateIndex + 1} de 9`}${mode === 'free' ? ' · Galeria por números' : ''}`;
  const info = difficultyInfo(art.difficulty);
  $('difficulty-controls').innerHTML = difficulties.map(level => `<button data-difficulty="${level.id}" aria-label="Dificuldade ${level.name}" aria-pressed="${level.id === art.difficulty}"><span aria-hidden="true">${level.symbol}</span> ${level.name}</button>`).join('');
  $('difficulty-description').textContent = `${info.description} Seu progresso é salvo por nível.`;
  $('difficulty-badge').innerHTML = `<span></span> ${info.name} · ${art.palette.length} cores`;
  $('difficulty-badge').dataset.level = art.difficulty;
  document.body.dataset.difficulty = art.difficulty;
  document.querySelector('.phase-reward').hidden = !!art.seed;
  updateGame();
  if (scroll) navigate('play');
}

function paintRegion(id, keyboard = false) {
  const region = currentArt.regions.find(item => item.id === id);
  if (!region || paintedFor().includes(id)) return;
  if (region.color !== state.selected) {
    const target = $('artboard').querySelector(`[data-region="${id}"]`);
    target.classList.remove('wrong');
    requestAnimationFrame(() => target.classList.add('wrong'));
    toast(`Essa área pede a cor ${region.color}. Escolha ${currentArt.palette[region.color - 1][0].toLowerCase()} na paleta.`);
    return;
  }
  paintedFor().push(id);
  undoHistory.push(id);
  const completedColor = !remaining(state.selected).length;
  if (completedColor && !isComplete(currentArt)) {
    const next = currentArt.regions.find(item => !paintedFor().includes(item.id));
    state.selected = next.color;
  }
  updateGame();
  $('artboard').querySelector(`[data-region="${id}"]`)?.classList.add('just-painted');
  if (keyboard) $('artboard').querySelector(`.matching[tabindex="0"]`)?.focus({ preventScroll: true });
  if (isComplete(currentArt)) celebrate();
  else if (completedColor) toast('Uma cor completa. Seu jardim está ganhando vida!');
}

function undo() {
  const id = undoHistory.pop();
  if (!id) return;
  state.painted[currentArt.id] = paintedFor().filter(item => item !== id);
  state.selected = currentArt.regions.find(region => region.id === id).color;
  updateGame();
}

function hint() {
  let candidate = remaining(state.selected)[0];
  if (!candidate) {
    candidate = currentArt.regions.find(region => !paintedFor().includes(region.id));
    if (!candidate) return;
    selectColor(candidate.color);
  }
  if (hideNumbers) { hideNumbers = false; updateNumbersButton(); renderBoard(); }
  const target = $('artboard').querySelector(`[data-region="${candidate.id}"]`);
  target.classList.remove('hinted');
  requestAnimationFrame(() => target.classList.add('hinted'));
  if (zoomed) target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  target.focus({ preventScroll: !zoomed });
  toast(`Um pontinho de luz na área da cor ${candidate.color}. Toque nela para pintar.`);
}

function updateNumbersButton() {
  $('numbers-button').setAttribute('aria-pressed', String(hideNumbers));
  $('numbers-button').setAttribute('aria-label', hideNumbers ? 'Mostrar números' : 'Ocultar números');
  $('numbers-button').title = hideNumbers ? 'Mostrar números' : 'Ocultar números';
}

function generateArt() {
  if (generationBusy) return;
  generationBusy = true;
  const seed = Math.max(0, ...state.generated.map(item => item.seed)) + 1;
  state.generated.push({ templateIndex: (seed - 1) % templates.length, seed });
  rebuildArtworks();
  selectArt(createArt((seed - 1) % templates.length, seed, state.libraryDifficulty).id, true, 'free');
  generationBusy = false;
  toast('Um novo respiro: variação criada localmente, com novas cores e detalhes.');
}

function celebrate() {
  const completedId = currentArt.id;
  $('completed-art').innerHTML = renderArt(currentArt, { preview: true });
  const progress = getProgress(artworks, state.painted);
  document.querySelector('.completion-stars').textContent = currentArt.seed ? '✿' : '✦ ✦ ✦';
  $('completion-eyebrow').textContent = `${currentArt.seed ? 'SUA NOVA COMBINAÇÃO' : `FASE ${currentArt.templateIndex + 1} CONCLUÍDA`} · ${difficultyInfo(currentArt.difficulty).name.toUpperCase()}`;
  $('completion-title').textContent = progress.finished && !currentArt.seed ? 'Você coloriu um mundo inteiro!' : 'Olha o que floresceu!';
  $('completion-message').textContent = currentArt.seed ? 'Sua variação já está guardada na coleção.' : 'Três estrelas para guardar. Sua arte já está na coleção.';
  $('next-art-button').textContent = currentArt.seed || progress.finished ? 'Ver minha jornada →' : state.mode === 'free' ? 'Descobrir outro desenho →' : 'Próxima fase →';
  setTimeout(() => {
    if (state.current !== completedId || !isComplete(currentArt)) return;
    if (!$('completion-modal').open) $('completion-modal').showModal();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.setAttribute('aria-hidden', 'true');
    confetti.innerHTML = Array.from({ length: 35 }, (_, i) => `<i style="left:${(i * 37) % 100}%;background:${currentArt.palette[i % currentArt.palette.length][1]};animation-delay:${(i % 7) * .09}s;animation-duration:${2 + (i % 5) * .2}s"></i>`).join('');
    document.body.append(confetti);
    setTimeout(() => confetti.remove(), 3800);
  }, 350);
}

async function downloadArt() {
  let svgUrl;
  try {
    const svg = renderArt(currentArt, { painted: paintedFor(), selected: 0, hideNumbers: true });
    svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = svgUrl; });
    const canvas = document.createElement('canvas');
    canvas.width = 1600; canvas.height = 1600;
    const context = canvas.getContext('2d');
    context.fillStyle = '#FAF9F2'; context.fillRect(0, 0, 1600, 1600);
    context.drawImage(image, 70, 55, 1460, 1338);
    context.textAlign = 'center'; context.fillStyle = '#526B4D'; context.font = '36px Georgia, serif';
    context.fillText(`${currentArt.title} · ${difficultyInfo(currentArt.difficulty).name}`, 800, 1455);
    context.fillStyle = '#939B83'; context.font = '22px Arial, sans-serif';
    context.fillText('colorê.  ·  uma cor de cada vez', 800, 1515);
    const png = canvas.toDataURL('image/png');
    $('export-image').src = png;
    $('export-link').href = png;
    $('export-link').download = `colore-${currentArt.id}.png`;
    if ($('completion-modal').open) $('completion-modal').close();
    if (!$('export-modal').open) $('export-modal').showModal();
  } catch { toast('Não consegui baixar a imagem agora. Tente novamente neste navegador.'); }
  finally { if (svgUrl) URL.revokeObjectURL(svgUrl); }
}

$('undo-button').innerHTML = icon('undo');
$('zoom-button').innerHTML = icon('zoom');
$('new-art-button').innerHTML = `${icon('sparkle')} Criar novo desenho`;
$('artboard').addEventListener('click', event => {
  const region = event.target.closest('[data-region]');
  if (region) paintRegion(region.dataset.region, event.detail === 0);
});
$('artboard').addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const region = event.target.closest('[data-region]');
  if (region) { event.preventDefault(); paintRegion(region.dataset.region, true); }
});
$('palette').addEventListener('click', event => {
  const button = event.target.closest('[data-palette]');
  if (button) { selectColor(Number(button.dataset.palette)); $('palette').querySelector(`[data-palette="${state.selected}"]`)?.focus({ preventScroll: true }); }
});
$('undo-button').addEventListener('click', undo);
$('hint-button').addEventListener('click', hint);
$('numbers-button').addEventListener('click', () => { hideNumbers = !hideNumbers; updateNumbersButton(); renderBoard(); });
$('zoom-button').addEventListener('click', () => {
  zoomed = !zoomed;
  $('artboard').classList.toggle('zoomed', zoomed);
  $('zoom-button').innerHTML = icon(zoomed ? 'zoomOut' : 'zoom');
  $('zoom-button').setAttribute('aria-label', zoomed ? 'Reduzir desenho' : 'Ampliar desenho');
  $('zoom-button').title = zoomed ? 'Reduzir desenho' : 'Ampliar desenho';
  if (!zoomed) $('canvas-viewport').scrollTo(0, 0);
});
$('download-button').addEventListener('click', downloadArt);
$('completion-download').addEventListener('click', downloadArt);
$('new-art-button').addEventListener('click', generateArt);
$('difficulty-controls').addEventListener('click', event => {
  const button = event.target.closest('[data-difficulty]');
  if (!button || button.dataset.difficulty === currentArt.difficulty) return;
  const level = normalizeDifficulty(button.dataset.difficulty);
  selectArt(createArt(currentArt.templateIndex, currentArt.seed, level).id, true, state.mode);
  $('difficulty-controls').querySelector(`[data-difficulty="${level}"]`)?.focus({ preventScroll: true });
});
$('next-art-button').addEventListener('click', () => {
  $('completion-modal').close();
  const progress = getProgress(artworks, state.painted);
  if (currentArt.seed || progress.finished) { journey.focusCurrentWorld(); navigate('journey'); return; }
  const next = state.mode === 'free' ? (currentArt.templateIndex + 1) % 9 : progress.next;
  const nextArt = state.mode === 'journey' ? phaseArt(next) : artworks.find(art => art.templateIndex === next && art.seed === 0 && art.difficulty === currentArt.difficulty);
  selectArt(nextArt.id, true, state.mode);
});
$('back-to-map').addEventListener('click', () => { $('completion-modal').close(); journey.focusCurrentWorld(); navigate('journey'); });
function adjacentLevel(direction) {
  if (currentArt.seed) return;
  const index = currentArt.templateIndex + direction;
  if (index < 0 || index > 8) return;
  const progress = getProgress(artworks, state.painted);
  if (state.mode === 'journey' && !progress.unlocked[index] && !progress.completed[index]) { toast('Complete este desenho para desbloquear a próxima fase.'); return; }
  const nextArt = state.mode === 'journey' ? phaseArt(index) : artworks.find(art => art.templateIndex === index && art.seed === 0 && art.difficulty === currentArt.difficulty);
  selectArt(nextArt.id, true, state.mode);
}
$('previous-level').addEventListener('click', () => adjacentLevel(-1));
$('following-level').addEventListener('click', () => adjacentLevel(1));
$('help-button').addEventListener('click', () => $('help-modal').showModal());
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } }));
document.addEventListener('keydown', event => {
  if (state.view !== 'play' || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  if (/^[1-8]$/.test(event.key) && Number(event.key) <= currentArt.palette.length) { event.preventDefault(); selectColor(Number(event.key)); }
});

rebuildArtworks();
freePaint = setupFreePaint({ artworks: () => artworks, toast, exportPng: (png, filename) => { $('export-image').src = png; $('export-link').href = png; $('export-link').download = filename; if (!$('export-modal').open) $('export-modal').showModal(); } });
journey = setupJourney({ artworks: () => artworks, painted: () => state.painted, phaseArt, libraryDifficulty: () => state.libraryDifficulty, setLibraryDifficulty: level => { state.libraryDifficulty = level; save(); }, isComplete, toast, navigate, open: (id, mode) => selectArt(id, true, mode) });
selectArt(state.current, false);
journey.focusCurrentWorld();
navigate(Object.keys(routes).find(key => routes[key] === location.hash) || state.view, false);
window.addEventListener('popstate', () => navigate(Object.keys(routes).find(key => routes[key] === location.hash) || 'journey'));
window.addEventListener('hashchange', () => { const view = Object.keys(routes).find(key => routes[key] === location.hash); if (view && view !== state.view) navigate(view); });
