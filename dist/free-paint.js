import { renderArt } from './art.js';
import { difficulties, difficultyInfo } from './difficulty.js';
import { textures, finishes, normalizePaint, sanitizePaintings, hsvToHex, hexToHsv, paintFill } from './paint-effects.js';

const KEY = 'colore-freepaint-v1';
const $ = id => document.getElementById(id);

export function setupFreePaint(api) {
  const all = () => api.artworks();
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* Start with a clean atelier. */ }
  const state = {
    paintings: sanitizePaintings(stored.paintings, all()),
    current: all().some(art => art.id === stored.current) ? stored.current : 'tropical-0',
    level: difficulties.some(level => level.id === stored.level) ? stored.level : 'medium',
    active: stored.active === true,
    paint: normalizePaint(stored.paint) || { color: '#719460', texture: 'none', finish: 'matte' },
    recent: Array.isArray(stored.recent) ? stored.recent.filter(color => /^#[\da-f]{6}$/i.test(color)).slice(0, 8) : [],
  };
  let hsv = hexToHsv(state.paint.color), erasing = false, zoomed = false, exporting = false;
  let storageAvailable = true;
  const histories = new Map();
  const art = () => all().find(item => item.id === state.current) || all()[0];
  const painted = () => state.paintings[art().id] || {};
  const history = () => { if (!histories.has(art().id)) histories.set(art().id, []); return histories.get(art().id); };

  $('free-view').innerHTML = `
    <div id="free-gallery"><div class="page-heading"><div><p class="eyebrow">SEU ATELIÊ SEM REGRAS</p><h1>Pintura <em>livre.</em></h1><p>O desenho é o ponto de partida. As cores são todas suas.</p></div><span class="free-heading-symbol" aria-hidden="true">◌</span></div>
      <div class="free-intro"><span aria-hidden="true">✧</span><p>Sem números ou cores certas. Escolha uma ilustração e combine cores, texturas e brilhos em cada área.</p></div>
      <div class="library-difficulty"><div><strong>Quantos detalhes você quer?</strong><p>Todos os desenhos estão abertos para sua criatividade.</p></div><div id="free-levels" role="group" aria-label="Detalhes da pintura livre"></div></div>
      <div id="free-drawings" class="art-library"></div></div>
    <div id="free-studio" hidden>
      <div class="play-topbar"><button class="back-button" id="free-back">← <span>Escolher outro desenho</span></button><p>Pintura livre · sem números</p><span class="free-studio-mark">✧ FEITO DO SEU JEITO</span></div>
      <div class="free-workspace"><div class="free-canvas-column"><div class="canvas-card"><div class="canvas-header"><div><p class="eyebrow">SEU PEQUENO ATELIÊ</p><h1 id="free-title"></h1></div><span class="difficulty" id="free-detail-badge"></span></div>
        <div class="free-viewport" id="free-viewport"><div id="free-artboard" class="artboard"></div></div>
        <div class="free-canvas-footer"><span id="free-save" class="save-status" role="status"></span><div class="free-canvas-tools"><button id="free-undo" aria-label="Desfazer pintura livre" title="Desfazer">↶</button><button id="free-zoom" aria-label="Ampliar pintura livre" title="Ampliar">＋</button></div></div></div>
        <div class="free-canvas-note"><span>✿</span><p>Toque para preencher uma área. Toque de novo para mudar a cor ou o acabamento.</p></div></div>
      <aside class="free-controls" aria-label="Materiais de pintura">
        <div class="free-material-heading"><div><p class="eyebrow">SUA COR, SEU MOMENTO</p><h2>Crie sua mistura.</h2></div><div id="free-paint-preview" class="free-paint-preview" aria-label="Prévia da tinta"></div></div>
        <div class="free-wheel-row"><div id="free-wheel" class="free-wheel" role="slider" tabindex="0" aria-label="Círculo de cores" aria-valuemin="0" aria-valuemax="359" aria-describedby="free-wheel-help"><span id="free-wheel-thumb"></span></div></div>
        <p id="free-wheel-help" class="free-control-help">Arraste pelo círculo. No teclado, ← → mudam o tom e ↑ ↓ a saturação.</p>
        <label class="free-range-label" for="free-value">Luminosidade <output id="free-value-label"></output></label><input id="free-value" class="free-value" type="range" min="0" max="100" aria-label="Luminosidade da cor">
        <div class="free-color-fields"><label class="free-hex-label">HEX<input id="free-hex" type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Cor hexadecimal"></label><label>R<input id="free-red" type="number" min="0" max="255" step="1" aria-label="Vermelho RGB"></label><label>G<input id="free-green" type="number" min="0" max="255" step="1" aria-label="Verde RGB"></label><label>B<input id="free-blue" type="number" min="0" max="255" step="1" aria-label="Azul RGB"></label></div>
        <div class="free-recent" id="free-recent" role="group" aria-label="Cores usadas"></div>
        <fieldset class="free-materials"><legend>Textura</legend><div class="free-effect-options">${textures.map(item => `<button data-texture="${item.id}" aria-pressed="false"><span aria-hidden="true">${item.symbol}</span>${item.name}</button>`).join('')}</div></fieldset>
        <fieldset class="free-materials"><legend>Brilho</legend><div class="free-effect-options">${finishes.map(item => `<button data-finish="${item.id}" aria-pressed="false"><span aria-hidden="true">${item.symbol}</span>${item.name}</button>`).join('')}</div></fieldset>
        <div class="free-tool-options" role="group" aria-label="Ferramenta de pintura"><button id="free-fill" aria-pressed="true">◒ Preencher</button><button id="free-erase" aria-pressed="false">◇ Borracha</button></div>
        <p id="free-material-note" class="free-material-note" aria-live="polite"></p>
        <div class="free-progress"><span id="free-progress"></span><span>sem pressa ♡</span></div><button class="primary-button" id="free-export">↓ Salvar minha arte em PNG</button>
      </aside></div></div>`;

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageAvailable = true; }
    catch { storageAvailable = false; }
    $('free-save').textContent = storageAvailable ? '● Pintura salva neste dispositivo' : '● Pintura apenas nesta sessão';
  }

  function renderGallery() {
    $('free-levels').innerHTML = difficulties.map(item => `<button data-free-level="${item.id}" aria-pressed="${state.level === item.id}">${item.name}</button>`).join('');
    const visible = all().filter(item => item.seed === 0 && item.difficulty === state.level);
    $('free-drawings').innerHTML = visible.map(item => {
      const saved = state.paintings[item.id] || {}, count = Object.keys(saved).length;
      return `<button class="drawing-card" data-free-drawing="${item.id}" aria-label="Pintura livre: ${item.title}, ${difficultyInfo(item.difficulty).name}"><span class="drawing-preview free-drawing-preview">${renderArt(item, { preview: true, customPaint: count ? saved : null })}<span class="drawing-badge">${count ? `${count} áreas com suas cores` : 'Sua próxima criação'}</span></span><span class="drawing-card-body"><span class="eyebrow">PINTURA LIVRE · ${difficultyInfo(item.difficulty).name}</span><strong>${item.title}</strong><span class="drawing-card-bottom"><span>${count ? 'Continuar minha criação' : `${item.regions.length} áreas · cores ilimitadas`}</span><span class="drawing-arrow">↗</span></span></span></button>`;
    }).join('');
  }

  function renderBoard(focusId) {
    $('free-artboard').innerHTML = renderArt(art(), { customPaint: painted(), hideNumbers: true });
    $('free-artboard').classList.toggle('zoomed', zoomed);
    $('free-artboard').classList.toggle('erasing', erasing);
    $('free-undo').disabled = !history().length;
    $('free-progress').textContent = `${Object.keys(painted()).length} de ${art().regions.length} áreas com suas cores`;
    if (focusId) $('free-artboard').querySelector(`[data-region="${focusId}"]`)?.focus({ preventScroll: true });
  }

  function renderPicker() {
    const color = state.paint.color;
    const radians = hsv.h * Math.PI / 180;
    $('free-wheel-thumb').style.left = `${50 + Math.cos(radians) * hsv.s * 46}%`;
    $('free-wheel-thumb').style.top = `${50 + Math.sin(radians) * hsv.s * 46}%`;
    $('free-wheel-thumb').style.background = color;
    $('free-wheel').setAttribute('aria-valuenow', String(Math.round(hsv.h) % 360));
    $('free-wheel').setAttribute('aria-valuetext', `${color}, saturação ${Math.round(hsv.s * 100)}%`);
    $('free-value').value = Math.round(hsv.v * 100);
    $('free-value-label').textContent = `${Math.round(hsv.v * 100)}%`;
    $('free-value').style.background = `linear-gradient(to right, #000, ${hsvToHex(hsv.h, hsv.s, 1)})`;
    $('free-hex').value = color;
    ['red','green','blue'].forEach((name, index) => { $(`free-${name}`).value = parseInt(color.slice(index * 2 + 1, index * 2 + 3), 16); });
    const effect = paintFill(state.paint, 'free-swatch');
    $('free-paint-preview').innerHTML = `<svg viewBox="0 0 600 600" aria-hidden="true"><defs>${effect.definitions}</defs><rect width="600" height="600" fill="${effect.fill}"/></svg>`;
    document.querySelectorAll('[data-texture]').forEach(button => button.setAttribute('aria-pressed', String(state.paint.texture === button.dataset.texture)));
    document.querySelectorAll('[data-finish]').forEach(button => button.setAttribute('aria-pressed', String(state.paint.finish === button.dataset.finish)));
    $('free-fill').setAttribute('aria-pressed', String(!erasing));
    $('free-erase').setAttribute('aria-pressed', String(erasing));
    $('free-material-note').textContent = erasing ? 'Borracha: toque em uma área para retirar sua pintura.' : `${textures.find(item => item.id === state.paint.texture).name} + ${finishes.find(item => item.id === state.paint.finish).name}. Toque em qualquer área para aplicar.`;
    const recent = state.recent.length ? state.recent : ['#E8B65D','#D58876','#719460','#3D6C5B','#9E85B0','#6A9CAA'];
    $('free-recent').innerHTML = `<span>${state.recent.length ? 'Suas cores' : 'Inspire-se'}</span>${recent.map(c => `<button data-recent-color="${c}" style="--recent-color:${c}" aria-label="Usar cor ${c}"></button>`).join('')}`;
    $('free-artboard').classList.toggle('erasing', erasing);
  }

  function setColor(hex) {
    state.paint.color = hex.toUpperCase(); hsv = hexToHsv(hex); erasing = false;
    renderPicker(); save();
  }

  function render() {
    $('free-gallery').hidden = state.active;
    $('free-studio').hidden = !state.active;
    if (state.active) {
      $('free-title').textContent = art().title;
      $('free-detail-badge').textContent = `${difficultyInfo(art().difficulty).name} · suas cores`;
      renderBoard(); renderPicker();
    } else renderGallery();
  }

  function paintRegion(id, keyboard) {
    if (!art().regions.some(region => region.id === id)) return;
    const previous = painted()[id] || null, next = erasing ? null : { ...state.paint };
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    history().push({ id, previous });
    if (!state.paintings[art().id]) state.paintings[art().id] = {};
    if (next) state.paintings[art().id][id] = next; else delete state.paintings[art().id][id];
    if (next) state.recent = [next.color, ...state.recent.filter(color => color !== next.color)].slice(0, 8);
    renderBoard(keyboard ? id : null); renderPicker(); save();
  }

  async function exportArt() {
    if (exporting) return;
    exporting = true; $('free-export').disabled = true; $('free-export').textContent = 'Preparando sua arte…';
    let url;
    try {
      const current = art();
      const svg = renderArt(current, { preview: true, customPaint: painted() });
      url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1600;
      const context = canvas.getContext('2d');
      context.fillStyle = '#FAF9F2'; context.fillRect(0, 0, 1600, 1600);
      context.drawImage(image, 70, 55, 1460, 1338);
      context.textAlign = 'center'; context.fillStyle = '#526B4D'; context.font = '36px Georgia, serif';
      context.fillText(`${current.title} · pintura livre`, 800, 1455);
      context.fillStyle = '#939B83'; context.font = '22px Arial, sans-serif';
      context.fillText('colorê. · feito do seu jeito', 800, 1515);
      api.exportPng(canvas.toDataURL('image/png'), `colore-livre-${current.id}.png`);
    } catch { api.toast('Não consegui preparar o PNG agora. Tente novamente.'); }
    finally { if (url) URL.revokeObjectURL(url); exporting = false; $('free-export').disabled = false; $('free-export').textContent = '↓ Salvar minha arte em PNG'; }
  }

  $('free-view').addEventListener('click', event => {
    const drawing = event.target.closest('[data-free-drawing]');
    if (drawing) { state.current = drawing.dataset.freeDrawing; state.active = true; zoomed = false; $('free-zoom').textContent = '＋'; $('free-zoom').setAttribute('aria-label', 'Ampliar pintura livre'); render(); save(); window.scrollTo({ top: 0 }); $('free-title').tabIndex = -1; $('free-title').focus({ preventScroll: true }); return; }
    const level = event.target.closest('[data-free-level]');
    if (level) { state.level = level.dataset.freeLevel; renderGallery(); save(); $('free-levels').querySelector(`[data-free-level="${state.level}"]`)?.focus(); return; }
    const texture = event.target.closest('[data-texture]'), finish = event.target.closest('[data-finish]'), recent = event.target.closest('[data-recent-color]');
    if (texture) { state.paint.texture = texture.dataset.texture; erasing = false; renderPicker(); save(); }
    if (finish) { state.paint.finish = finish.dataset.finish; erasing = false; renderPicker(); save(); }
    if (recent) setColor(recent.dataset.recentColor);
  });
  $('free-artboard').addEventListener('click', event => { const target = event.target.closest('[data-region]'); if (target) paintRegion(target.dataset.region, event.detail === 0); });
  $('free-artboard').addEventListener('keydown', event => { const target = event.target.closest('[data-region]'); if (target && ['Enter',' '].includes(event.key)) { event.preventDefault(); paintRegion(target.dataset.region, true); } });
  $('free-back').addEventListener('click', () => { state.active = false; render(); save(); window.scrollTo({ top: 0 }); });
  $('free-undo').addEventListener('click', () => {
    const action = history().pop(); if (!action) return;
    if (action.previous) state.paintings[art().id][action.id] = action.previous; else delete state.paintings[art().id][action.id];
    renderBoard(); save();
  });
  $('free-fill').addEventListener('click', () => { erasing = false; renderPicker(); });
  $('free-erase').addEventListener('click', () => { erasing = true; renderPicker(); });
  $('free-zoom').addEventListener('click', () => {
    zoomed = !zoomed; $('free-artboard').classList.toggle('zoomed', zoomed);
    $('free-zoom').textContent = zoomed ? '−' : '＋'; $('free-zoom').setAttribute('aria-label', zoomed ? 'Reduzir pintura livre' : 'Ampliar pintura livre');
    if (!zoomed) $('free-viewport').scrollTo(0, 0);
  });
  $('free-export').addEventListener('click', exportArt);
  const wheel = $('free-wheel');
  function fromPointer(event) {
    const rect = wheel.getBoundingClientRect(), radius = rect.width * .46;
    const dx = event.clientX - rect.left - rect.width/2, dy = event.clientY - rect.top - rect.height/2;
    hsv.h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    hsv.s = Math.min(1, Math.hypot(dx, dy) / radius);
    state.paint.color = hsvToHex(hsv.h, hsv.s, hsv.v); erasing = false; renderPicker();
  }
  let pointerId = null;
  wheel.addEventListener('pointerdown', event => { if (!event.isPrimary || event.button !== 0) return; event.preventDefault(); pointerId = event.pointerId; wheel.setPointerCapture(pointerId); wheel.focus({ preventScroll: true }); fromPointer(event); });
  wheel.addEventListener('pointermove', event => { if (pointerId === event.pointerId) fromPointer(event); });
  function endPointer(event) { if (event.pointerId === pointerId) { pointerId = null; save(); } }
  wheel.addEventListener('pointerup', endPointer); wheel.addEventListener('pointercancel', endPointer); wheel.addEventListener('lostpointercapture', endPointer);
  wheel.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') hsv.h = (hsv.h + 355) % 360;
    if (event.key === 'ArrowRight') hsv.h = (hsv.h + 5) % 360;
    if (event.key === 'ArrowUp') hsv.s = Math.min(1, hsv.s + .05);
    if (event.key === 'ArrowDown') hsv.s = Math.max(0, hsv.s - .05);
    if (event.key === 'Home') hsv.s = 0;
    if (event.key === 'End') hsv.s = 1;
    state.paint.color = hsvToHex(hsv.h, hsv.s, hsv.v); erasing = false; renderPicker(); save();
  });
  $('free-value').addEventListener('input', event => { hsv.v = Number(event.target.value) / 100; state.paint.color = hsvToHex(hsv.h, hsv.s, hsv.v); erasing = false; renderPicker(); save(); });
  $('free-hex').addEventListener('input', event => { const value = event.target.value.trim(); if (/^#[\da-f]{6}$/i.test(value)) setColor(value); });
  $('free-hex').addEventListener('change', event => {
    const value = event.target.value.trim();
    if (/^#[\da-f]{6}$/i.test(value)) setColor(value);
    else { api.toast('Use uma cor no formato #RRGGBB, como #719460.'); renderPicker(); }
  });
  ['red','green','blue'].forEach(name => $(`free-${name}`).addEventListener('change', () => {
    const channels = ['red','green','blue'].map(channel => Number($(`free-${channel}`).value));
    if (channels.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) setColor('#' + channels.map(value => value.toString(16).padStart(2,'0')).join(''));
    else { api.toast('Cada canal RGB vai de 0 a 255.'); renderPicker(); }
  }));
  ['red','green','blue'].forEach(name => $(`free-${name}`).addEventListener('input', () => {
    const values = ['red','green','blue'].map(channel => $(`free-${channel}`).value);
    const channels = values.map(Number);
    if (values.every(value => value !== '') && channels.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) setColor('#' + channels.map(value => value.toString(16).padStart(2,'0')).join(''));
  }));
  render();
  return { render };
}
