export const textures = [
  { id: 'none', name: 'Lisa', symbol: '○' },
  { id: 'paper', name: 'Papel', symbol: '⠿' },
  { id: 'watercolor', name: 'Aquarela', symbol: '◌' },
  { id: 'linen', name: 'Tecido', symbol: '▦' },
];
export const finishes = [
  { id: 'matte', name: 'Fosco', symbol: '●' },
  { id: 'satin', name: 'Acetinado', symbol: '◐' },
  { id: 'glitter', name: 'Glitter', symbol: '✧' },
  { id: 'metallic', name: 'Metálico', symbol: '✦' },
];

export function normalizePaint(paint) {
  if (!paint || typeof paint !== 'object' || !/^#[\da-f]{6}$/i.test(paint.color)) return null;
  return {
    color: paint.color.toUpperCase(),
    texture: textures.some(item => item.id === paint.texture) ? paint.texture : 'none',
    finish: finishes.some(item => item.id === paint.finish) ? paint.finish : 'matte',
  };
}

export function sanitizePaintings(saved, artworks) {
  const clean = {};
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return clean;
  for (const art of artworks) {
    const source = Object.hasOwn(saved, art.id) && saved[art.id];
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    const regions = {};
    for (const region of art.regions) {
      const paint = Object.hasOwn(source, region.id) && normalizePaint(source[region.id]);
      if (paint) regions[region.id] = paint;
    }
    if (Object.keys(regions).length) clean[art.id] = regions;
  }
  return clean;
}

export function hsvToHex(h, s, v) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s)); v = Math.max(0, Math.min(1, v));
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  const channels = h < 60 ? [c,x,0] : h < 120 ? [x,c,0] : h < 180 ? [0,c,x] : h < 240 ? [0,x,c] : h < 300 ? [x,0,c] : [c,0,x];
  return '#' + channels.map(value => Math.round((value + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function hexToHsv(hex) {
  const [r,g,b] = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255);
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
  const h = !d ? 0 : max === r ? 60 * (((g-b)/d) % 6) : max === g ? 60 * ((b-r)/d + 2) : 60 * ((r-g)/d + 4);
  return { h: (h + 360) % 360, s: max ? d/max : 0, v: max };
}

// Self-contained vector finishes keep the canvas and exported PNG identical.
export function paintFill(raw, id) {
  const paint = normalizePaint(raw);
  if (!paint) return { fill: '#FFFEF9', definitions: '' };
  if (paint.texture === 'none' && paint.finish === 'matte') return { fill: paint.color, definitions: '' };
  let definitions = '', layers = '';
  if (paint.texture === 'paper') {
    definitions += `<pattern id="${id}-paper" width="11" height="13" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".7" fill="#233B31" opacity=".23"/><circle cx="7" cy="9" r=".65" fill="white" opacity=".5"/><path d="m8 2 1 1M2 11h1" stroke="white" stroke-width=".6" opacity=".4"/></pattern>`;
    layers += `<rect width="600" height="600" fill="url(#${id}-paper)"/>`;
  } else if (paint.texture === 'watercolor') {
    definitions += `<pattern id="${id}-wash" width="125" height="103" patternUnits="userSpaceOnUse"><path d="M-10 22Q30-8 74 16T145 7V43Q100 72 59 42T-10 65Z" fill="white" opacity=".17"/><path d="M0 74Q41 46 77 73T132 63V108H0Z" fill="#21382A" opacity=".09"/><ellipse cx="33" cy="63" rx="26" ry="17" fill="white" opacity=".13"/><circle cx="95" cy="30" r="17" fill="white" opacity=".11"/></pattern>`;
    layers += `<rect width="600" height="600" fill="url(#${id}-wash)"/>`;
  } else if (paint.texture === 'linen') {
    definitions += `<pattern id="${id}-linen" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 1H7M1 0V7" stroke="white" stroke-width=".8" opacity=".3"/><path d="M0 4H7M4 0V7" stroke="#203528" stroke-width=".6" opacity=".13"/></pattern>`;
    layers += `<rect width="600" height="600" fill="url(#${id}-linen)"/>`;
  }
  if (paint.finish === 'satin' || paint.finish === 'metallic') {
    const stops = paint.finish === 'satin'
      ? '<stop stop-color="white" stop-opacity=".04"/><stop offset=".35" stop-color="white" stop-opacity=".5"/><stop offset=".62" stop-color="white" stop-opacity="0"/><stop offset="1" stop-color="#142A25" stop-opacity=".18"/>'
      : '<stop stop-color="#142A25" stop-opacity=".3"/><stop offset=".24" stop-color="white" stop-opacity=".15"/><stop offset=".39" stop-color="white" stop-opacity=".75"/><stop offset=".47" stop-color="#142A25" stop-opacity=".32"/><stop offset=".64" stop-color="white" stop-opacity=".42"/><stop offset="1" stop-color="#142A25" stop-opacity=".2"/>';
    definitions += `<linearGradient id="${id}-shine" x1="0" y1="0" x2="1" y2=".8">${stops}</linearGradient>`;
    layers += `<rect width="600" height="600" fill="url(#${id}-shine)"/>`;
  } else if (paint.finish === 'glitter') {
    definitions += `<pattern id="${id}-glitter" width="27" height="29" patternUnits="userSpaceOnUse"><circle cx="5" cy="7" r=".9" fill="white" opacity=".9"/><circle cx="20" cy="23" r=".8" fill="#FFE7A1"/><circle cx="23" cy="9" r=".55" fill="white"/><path d="m13 13 .8 2.2L16 16l-2.2.8L13 19l-.8-2.2L10 16l2.2-.8Z" fill="white" opacity=".95"/><path d="m2 24 1 1m15-20 1 1" stroke="#24452E" stroke-width=".8" opacity=".3"/></pattern>`;
    layers += `<rect width="600" height="600" fill="url(#${id}-glitter)"/>`;
  }
  definitions += `<pattern id="${id}" width="600" height="600" patternUnits="userSpaceOnUse"><rect width="600" height="600" fill="${paint.color}"/>${layers}</pattern>`;
  return { fill: `url(#${id})`, definitions };
}
