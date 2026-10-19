export const difficulties = [
  { id: 'easy', name: 'Fácil', colors: 4, symbol: '●', description: 'Menos detalhes, 4 cores e um ritmo bem tranquilo.' },
  { id: 'medium', name: 'Médio', colors: 6, symbol: '●●', description: 'O desenho original, com 6 cores para explorar.' },
  { id: 'hard', name: 'Difícil', colors: 8, symbol: '●●●', description: 'Áreas menores, detalhes extras e 8 cores.' },
];

export const normalizeDifficulty = value => difficulties.some(item => item.id === value) ? value : 'medium';
export const recommendedDifficulty = index => ['easy', 'medium', 'hard'][index % 3];
export const difficultyInfo = value => difficulties.find(item => item.id === normalizeDifficulty(value));

const splitRegions = [
  [2, 3, 4, 5, 6, 7, 8, 9, 13, 14, 15, 18, 19],
  [2, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  [2, 3, 10, 15, 18, 19, 20, 21],
  [1, 2, 3, 4, 5, 6, 7, 8, 11, 17, 18, 19],
  [1, 2, 3, 4, 8, 9, 10, 11, 12, 13],
  [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  [1, 2, 3, 4, 6, 8, 9, 10, 11, 12, 13, 14, 18, 19, 20],
  [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 17, 18],
  [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 18, 19, 20],
];
const eyes = [[318, 177], [300, 180], [420, 193], [309, 214], [266, 342]];

function bounds(region) {
  const a = region.attrs;
  if (region.tag === 'ellipse') return [a.cx - a.rx, a.cy - a.ry, a.rx * 2, a.ry * 2];
  const coords = (a.d.match(/-?\d*\.?\d+/g) || []).map(Number);
  const xs = coords.filter((_, i) => i % 2 === 0);
  const ys = coords.filter((_, i) => i % 2 === 1);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}

function labelFor(region, clip) {
  let x = clip[0] + clip[2] / 2;
  let y = clip[1] + clip[3] / 2;
  const rotation = region.attrs.transform?.match(/rotate\(([-\d.]+) ([-\d.]+) ([-\d.]+)\)/);
  if (rotation) {
    const angle = Number(rotation[1]) * Math.PI / 180;
    const cx = Number(rotation[2]), cy = Number(rotation[3]);
    [x, y] = [cx + (x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle), cy + (x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle)];
  }
  return { x, y };
}

const lighter = hex => '#' + hex.slice(1).match(/../g).map(part => Math.round(parseInt(part, 16) * .73 + 255 * .27).toString(16).padStart(2, '0')).join('');

export function applyDifficulty(regions, palette, value, templateIndex) {
  const difficulty = normalizeDifficulty(value);
  if (difficulty === 'medium') return { regions, palette };
  if (difficulty === 'easy') {
    const simplified = regions.filter((region, index) => index === 0 || region.tag !== 'ellipse' || region.attrs.rx > 20 || region.attrs.ry > 20 || eyes.some(([x, y]) => region.attrs.cx === x && region.attrs.cy === y));
    const colorMap = [0, 1, 2, 3, 4, 4, 1];
    return { regions: simplified.map(region => ({ ...region, color: colorMap[region.color] })), palette: palette.slice(0, 4) };
  }
  const moreColors = [...palette, ['Folha iluminada', lighter(palette[3][1])], ['Pétala suave', lighter(palette[1][1])]];
  const detailed = regions.flatMap((region, index) => {
    if (!splitRegions[templateIndex].includes(index)) return [region];
    const box = bounds(region);
    if (Math.min(box[2], box[3]) < 20 || box[2] * box[3] < 1200) return [region];
    const vertical = box[2] >= box[3];
    return [0, 1].map(part => {
      const clip = vertical ? [box[0] + part * box[2] / 2, box[1], box[2] / 2, box[3]] : [box[0], box[1] + part * box[3] / 2, box[2], box[3] / 2];
      return { ...region, ...labelFor(region, clip), id: `${region.id}-${part}`, color: part ? 7 + index % 2 : region.color, clip };
    });
  });
  [[90, 120], [130, 94], [510, 166], [516, 245], [506, 350], [474, 482], [110, 483], [84, 381]].forEach(([x, y], index) => detailed.push({ id: `detail${index}`, tag: 'ellipse', attrs: { cx: x, cy: y, rx: 8, ry: 8 }, x, y, color: index + 1 }));
  return { regions: detailed, palette: moreColors };
}
