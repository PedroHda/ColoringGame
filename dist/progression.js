export const worlds = [
  { name: 'Jardim secreto', subtitle: 'Onde as pequenas coisas florescem.', symbol: '✿', color: '#64834F', background: '#E8F0D9', id: 'garden' },
  { name: 'Céu de sonhos', subtitle: 'Um convite para deixar a imaginação voar.', symbol: '☁', color: '#8C76AD', background: '#ECE6F6', id: 'sky' },
  { name: 'Mar de cores', subtitle: 'Respire fundo. O seu mar está calmo.', symbol: '≈', color: '#548D9C', background: '#E0F0EF', id: 'sea' },
];

export function getProgress(artworks, painted) {
  const levels = artworks.slice(0, 9);
  const completed = levels.map(art => artworks.some(variant => variant.templateIndex === art.templateIndex && variant.seed === 0 && variant.regions.length > 0 && variant.regions.every(region => (painted[variant.id] || []).includes(region.id))));
  const unlocked = completed.map((_, index) => completed.slice(0, index).every(Boolean));
  const count = completed.filter(Boolean).length;
  const next = completed.findIndex(done => !done);
  return { completed, unlocked, count, stars: count * 3, next: next === -1 ? levels.length - 1 : next, finished: count === levels.length };
}
