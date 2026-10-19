import { renderArt } from './art.js';
import { worlds, getProgress } from './progression.js';
import { difficulties, difficultyInfo } from './difficulty.js';

const $ = id => document.getElementById(id);
const lockIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>';
const landscape = index => {
  const scenes = [
    '<circle cx="810" cy="52" r="37" fill="#EBD795"/><path d="M0 270Q150 170 340 250T710 250T1000 210V420H0Z" fill="#DBE9C5"/><path d="M0 345Q220 280 420 330T830 315T1100 350V420H0Z" fill="#D2E3B8"/><path d="M64 276V226M45 248Q20 202 55 191Q80 200 64 241M67 239Q84 204 104 215Q116 240 67 256" fill="#A4BF86" stroke="#91AE76" stroke-width="4"/><path d="M931 302V258M915 274Q895 235 924 225Q947 236 932 268M935 274Q959 240 977 259Q985 281 935 288" fill="#A4BF86" stroke="#91AE76" stroke-width="4"/>',
    '<circle cx="843" cy="71" r="33" fill="#EBD8A8"/><path d="M40 120Q20 100 40 85Q35 60 60 59Q82 36 103 62Q133 62 132 87Q156 115 124 121Z" fill="#FFFFFF95"/><path d="M702 153Q680 130 705 114Q704 90 729 89Q750 72 772 94Q800 90 805 116Q831 134 805 151Z" fill="#FFFFFF95"/><path d="M0 350Q170 282 330 340T660 340T1000 312V420H0Z" fill="#DBD2EE"/><path d="M0 389Q200 336 420 378T760 370T1000 370V420H0Z" fill="#CEC1E5"/>',
    '<circle cx="835" cy="70" r="34" fill="#EDD9A6"/><path d="M0 280Q90 240 180 280T360 280T540 280T720 280T900 280T1080 280V420H0Z" fill="#C2E2DF"/><path d="M0 340Q110 300 220 340T440 340T660 340T880 340T1100 340V420H0Z" fill="#A6D3D4"/><path d="M0 400Q200 365 410 393T800 388T1100 400V420H0Z" fill="#E2D8B9"/><circle cx="70" cy="182" r="9" fill="none" stroke="#95BFBD" stroke-width="3"/><circle cx="98" cy="148" r="6" fill="none" stroke="#95BFBD" stroke-width="3"/>',
  ];
  return `<svg viewBox="0 0 1000 420" preserveAspectRatio="none" class="map-landscape" aria-hidden="true">${scenes[index]}</svg>`;
};

export function setupJourney(api) {
  let worldIndex = 0;
  let libraryFilter = 'all';
  let collectionFilter = 'complete';
  const progress = () => getProgress(api.artworks(), api.painted());

  function hero() {
    const status = progress();
    const art = api.phaseArt(status.next);
    const count = (api.painted()[art.id] || []).length;
    const world = worlds[Math.floor(status.next / 3)];
    $('continue-card').style.setProperty('--hero-bg', world.background);
    $('continue-card').innerHTML = `<div class="hero-copy"><span class="hero-chip">${world.symbol} MUNDO ${Math.floor(status.next / 3) + 1} · ${world.name.toUpperCase()}</span><h2>${status.finished ? 'Você fez tudo florescer.' : art.title}</h2><p>${status.finished ? 'Nove pequenas conquistas. Agora é hora de explorar suas próprias combinações.' : art.description}</p><button class="primary-button hero-button" data-start="${status.next}">${status.finished ? 'Revisitar a jornada' : `${count ? 'Continuar' : 'Jogar'} fase ${status.next + 1}`} <span>→</span></button><span class="hero-detail">${status.count} de 9 fases concluídas <span>·</span> ${difficultyInfo(art.difficulty).name} · ${art.regions.length} áreas para colorir</span></div><div class="hero-art" aria-hidden="true"><span class="hero-sparkle s1">✧</span>${renderArt(art, { preview: true })}<span class="hero-sparkle s2">✦</span><span class="hero-art-label">sua próxima descoberta</span></div>`;
    $('header-stars').textContent = String(status.stars);
    $('journey-stars').innerHTML = `${status.stars} <small>/ 27</small>`;
  }

  function map() {
    const status = progress();
    const world = worlds[worldIndex];
    $('world-tabs').innerHTML = worlds.map((item, index) => {
      const done = status.completed.slice(index * 3, index * 3 + 3).filter(Boolean).length;
      return `<button data-world="${index}" aria-pressed="${worldIndex === index}" style="--world-accent:${item.color};--world-bg:${item.background}"><span class="world-symbol">${item.symbol}</span><span><small>MUNDO ${index + 1}</small><strong>${item.name}</strong></span><span class="world-count">${done}/3</span></button>`;
    }).join('');
    $('level-map').style.setProperty('--map-bg', world.background);
    $('level-map').style.setProperty('--map-accent', world.color);
    $('level-map').innerHTML = `<div class="map-caption"><span>${world.symbol}</span><div><h3>${world.name}</h3><p>${world.subtitle}</p></div><span class="map-chapter">CAPÍTULO ${String(worldIndex + 1).padStart(2, '0')}</span></div>${landscape(worldIndex)}<svg class="map-trail" viewBox="0 0 1000 220" preserveAspectRatio="none" aria-hidden="true"><path d="M135 130C290-20 362 230 500 130S715 10 865 130" fill="none" stroke="white" stroke-width="13" stroke-linecap="round"/><path d="M135 130C290-20 362 230 500 130S715 10 865 130" fill="none" stroke="#9DAF8A80" stroke-width="2" stroke-dasharray="5 9" stroke-linecap="round"/></svg><div class="level-nodes">${api.artworks().slice(worldIndex * 3, worldIndex * 3 + 3).map((_, localIndex) => {
      const index = worldIndex * 3 + localIndex;
      const art = api.phaseArt(index);
      const completed = status.completed[index];
      const locked = !status.unlocked[index] && !completed;
      const count = (api.painted()[art.id] || []).length;
      const percent = Math.floor(count / art.regions.length * 100);
      return `<button class="level-node ${locked ? 'locked' : completed ? 'complete' : 'available'} ${index === status.next ? 'current-level' : ''}" data-start="${index}" aria-label="Fase ${index + 1}: ${art.title}, ${locked ? 'bloqueada' : completed ? 'concluída' : count ? `${percent}% colorida` : 'disponível'}" aria-disabled="${locked}"><span class="level-number">${locked ? lockIcon : completed ? '✓' : index + 1}</span><span class="level-art">${renderArt(art, { preview: true })}${locked ? `<span class="lock-bubble">${lockIcon}</span>` : ''}</span><span class="level-stars ${completed ? 'earned' : ''}" aria-hidden="true">✦ ✦ ✦</span><strong>${art.title}</strong><span class="level-status">${difficultyInfo(art.difficulty).name} · ${locked ? `Conclua a fase ${index} para abrir` : completed ? 'Completo. Feito por você!' : count ? `Continuar · ${percent}%` : `${art.regions.length} áreas · vamos colorir?`}</span>${index === status.next && !status.finished ? '<span class="you-are-here">Você está aqui</span>' : ''}</button>`;
    }).join('')}</div>`;
  }

  function artCard(art, index, collection = false) {
    const saved = api.painted()[art.id] || [];
    const complete = api.isComplete(art);
    const percent = Math.floor(saved.length / art.regions.length * 100);
    const theme = worlds[Math.min(2, Math.floor(art.templateIndex / 3))];
    const level = difficultyInfo(art.difficulty);
    return `<button class="drawing-card" data-free-art="${art.id}" aria-label="Colorir ${art.title} no modo livre, nível ${level.name}"><span class="drawing-preview" style="background:${theme.background}">${renderArt(art, { preview: !collection, painted: saved, selected: 0, hideNumbers: true })}<span class="drawing-badge ${complete ? 'done' : ''}">${complete ? '✓ Concluído' : saved.length ? `${percent}% colorido` : art.seed ? 'Variação' : `Fase ${index + 1}`}</span><span class="drawing-difficulty ${level.id}">${level.symbol} ${level.name}</span></span><span class="drawing-card-body"><span class="eyebrow">${theme.name}</span><strong>${art.title}</strong><span class="drawing-card-bottom"><span>${complete ? 'Rever minha arte' : saved.length ? 'Continuar colorindo' : `${art.regions.length} áreas · ${art.palette.length} cores`}</span><span class="drawing-arrow">↗</span></span></span></button>`;
  }

  function library() {
    const level = api.libraryDifficulty();
    $('library-filters').innerHTML = [['all', 'Todos os desenhos'], ...worlds.map((world, index) => [String(index), `${world.symbol} ${world.name}`])].map(([key, label]) => `<button data-library-filter="${key}" aria-pressed="${libraryFilter === key}">${label}</button>`).join('');
    $('difficulty-filters').innerHTML = difficulties.map(item => `<button data-library-difficulty="${item.id}" aria-label="Mostrar desenhos no nível ${item.name}" aria-pressed="${item.id === level}"><span aria-hidden="true">${item.symbol}</span> ${item.name}<small>${item.colors} cores</small></button>`).join('');
    $('art-library').innerHTML = api.artworks().filter(art => art.seed === 0 && art.difficulty === level && (libraryFilter === 'all' || Math.floor(art.templateIndex / 3) === Number(libraryFilter))).map(art => artCard(art, art.templateIndex)).join('');
    const extras = api.artworks().filter(art => art.seed > 0 && art.difficulty === level);
    $('extra-drawings').innerHTML = extras.length ? `<div class="section-heading extras-heading"><div><p class="eyebrow">CRIADAS NO SEU ATELIÊ</p><h2>Mais combinações, mais descobertas</h2></div><span class="small-muted">${extras.length} ${extras.length === 1 ? 'variação local' : 'variações locais'}</span></div><div class="art-library">${extras.map(art => artCard(art, art.templateIndex)).join('')}</div>` : '';
  }

  function collection() {
    const all = api.artworks();
    const complete = all.filter(api.isComplete);
    const partial = all.filter(art => (api.painted()[art.id] || []).length > 0 && !api.isComplete(art));
    $('complete-filter-count').textContent = String(complete.length);
    $('progress-filter-count').textContent = String(partial.length);
    $('collection-count').textContent = String(complete.length);
    document.querySelectorAll('[data-collection-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.collectionFilter === collectionFilter)));
    const visible = collectionFilter === 'complete' ? complete : partial;
    $('collection-gallery').innerHTML = visible.length ? visible.map(art => artCard(art, art.templateIndex, true)).join('') : `<div class="empty-album"><span>✿</span><h2>${collectionFilter === 'complete' ? 'Sua primeira conquista está por vir.' : 'Uma nova pausa está esperando.'}</h2><p>${collectionFilter === 'complete' ? 'Complete um desenho para guardar suas cores por aqui.' : 'Comece um desenho e volte quando quiser continuar.'}</p><button class="primary-button" data-view="library">Encontrar meu desenho →</button></div>`;
  }

  document.addEventListener('click', event => {
    const viewButton = event.target.closest('button[data-view]');
    if (viewButton?.dataset.view) { api.navigate(viewButton.dataset.view); return; }
    const startButton = event.target.closest('[data-start]');
    if (startButton) {
      const index = Number(startButton.dataset.start);
      const status = progress();
      if (!status.unlocked[index] && !status.completed[index]) { api.toast(`Complete as fases anteriores para abrir a fase ${index + 1}. No modo livre, você pode escolher qualquer desenho.`); return; }
      api.open(api.artworks()[index].id, 'journey'); return;
    }
    const freeButton = event.target.closest('[data-free-art]');
    if (freeButton) { api.open(freeButton.dataset.freeArt, 'free'); return; }
    const worldButton = event.target.closest('[data-world]');
    if (worldButton) { worldIndex = Number(worldButton.dataset.world); map(); return; }
    const filter = event.target.closest('[data-library-filter]');
    if (filter) { libraryFilter = filter.dataset.libraryFilter; library(); return; }
    const difficulty = event.target.closest('[data-library-difficulty]');
    if (difficulty) { api.setLibraryDifficulty(difficulty.dataset.libraryDifficulty); library(); $('difficulty-filters').querySelector(`[data-library-difficulty="${difficulty.dataset.libraryDifficulty}"]`)?.focus({ preventScroll: true }); return; }
    const albumFilter = event.target.closest('[data-collection-filter]');
    if (albumFilter) { collectionFilter = albumFilter.dataset.collectionFilter; collection(); }
  });

  return {
    render() { hero(); map(); library(); collection(); },
    progress,
    focusCurrentWorld() { worldIndex = Math.floor(progress().next / 3); map(); },
  };
}
