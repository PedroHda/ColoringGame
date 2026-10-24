import { paths, stages } from "../game-content/index";
import { wardrobe } from "./wardrobe";

export interface Player {
  id: string;
  name: string;
  skin: string;
  hair: string;
  hairColor: string;
  face: string;
  expression: string;
  outfit: string;
  shoes: string;
  accessory: string;
  xp: number;
  completed: string[];
  rewards: string[];
  favorites: string[][];
  equipped: Record<string, string>;
  preferences: {
    music: number;
    effects: number;
    narration: number;
    haptics: boolean;
  };
}
export function initialPlayer(name = "Viajante"): Player {
  return {
    id: "local-player",
    name,
    skin: "#B98260",
    hair: "curly",
    hairColor: "#3D3028",
    face: "round",
    expression: "smile",
    outfit: "shirt",
    shoes: "boots",
    accessory: "none",
    xp: 0,
    completed: [],
    rewards: [],
    favorites: [],
    equipped: {},
    preferences: { music: 0, effects: 0.25, narration: 0.8, haptics: true },
  };
}
export const LEVEL_CAP = 50;
export const xpForLevel = (level: number) =>
  Math.round(
    20 *
      Math.pow(
        Math.max(
          1,
          Math.min(50, Number.isFinite(level) ? Math.floor(level) : 1),
        ) - 1,
        1.65,
      ),
  );
export function getLevel(xp: number) {
  const safe = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let level = 1;
  while (level < LEVEL_CAP && safe >= xpForLevel(level + 1)) level++;
  return level;
}
export function levelProgress(xp: number) {
  const safe = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  const level = getLevel(safe),
    start = xpForLevel(level),
    end = level === 50 ? start : xpForLevel(level + 1);
  return {
    level,
    start,
    end,
    ratio:
      level === 50
        ? 1
        : Math.max(0, Math.min(1, (safe - start) / (end - start))),
  };
}
export function isStageUnlocked(player: Player, id: string) {
  const index = stages.findIndex((s) => s.id === id);
  return (
    index >= 0 &&
    stages.slice(0, index).every((s) => player.completed.includes(s.id))
  );
}
export const toolUnlocks: Record<string, number> = {
  round: 1,
  eraser: 1,
  pencil: 2,
  fine: 4,
  broad: 5,
  marker: 6,
  crayon: 8,
  watercolor: 10,
  texture: 13,
  charcoal: 16,
  airbrush: 20,
  pen: 22,
};
export const materialUnlocks: Record<string, number> = {
  paint: 1,
  natural: 1,
  graphite: 2,
  acrylic: 4,
  pastel: 8,
  watercolor: 10,
  oil: 13,
  metallic: 25,
  glitter: 30,
  pearl: 40,
};
export const isToolUnlocked = (p: Player, id: string) =>
  Object.hasOwn(toolUnlocks, id) && getLevel(p.xp) >= toolUnlocks[id];
export const isMaterialUnlocked = (p: Player, id: string) =>
  Object.hasOwn(materialUnlocks, id) && getLevel(p.xp) >= materialUnlocks[id];
export const achievements = [
  {
    id: "first",
    title: "Primeira pintura",
    description: "Concluir uma fase inédita.",
    test: (p: Player) => p.completed.length >= 1,
  },
  {
    id: "path",
    title: "Um caminho inteiro",
    description: "Concluir as cinco etapas de um caminho.",
    test: (p: Player) =>
      paths.some((path) =>
        path.stages.every((s) => p.completed.includes(s.id)),
      ),
  },
  {
    id: "five-paths",
    title: "Artista viajante",
    description: "Concluir cinco caminhos.",
    test: (p: Player) =>
      paths.filter((path) =>
        path.stages.every((s) => p.completed.includes(s.id)),
      ).length >= 5,
  },
  {
    id: "watercolor",
    title: "Encontros com a aquarela",
    description: "Experimentar a ferramenta e o material de aquarela.",
    test: (p: Player) =>
      p.rewards.includes("tool:watercolor") &&
      p.rewards.includes("material:watercolor"),
  },
  {
    id: "colors",
    title: "Explorador das cores",
    description: "Guardar três paletas favoritas.",
    test: (p: Player) => p.favorites.length >= 3,
  },
  {
    id: "pigments",
    title: "Colecionador de pigmentos",
    description: "Experimentar cinco materiais distintos.",
    test: (p: Player) =>
      new Set(
        p.rewards.filter(
          (id) =>
            id.startsWith("material:") &&
            Object.hasOwn(materialUnlocks, id.slice(9)),
        ),
      ).size >= 5,
  },
  {
    id: "all",
    title: "As cores do amanhã",
    description: "Concluir os quinze caminhos.",
    test: (p: Player) => stages.every((s) => p.completed.includes(s.id)),
  },
];
export function collectAchievements(player: Player) {
  const p = { ...player, rewards: [...player.rewards] };
  for (const a of achievements)
    if (a.test(p) && !p.rewards.includes(`achievement:${a.id}`)) {
      p.rewards.push(`achievement:${a.id}`);
      p.xp += 40;
    }
  return p;
}
export function completeStage(player: Player, id: string) {
  if (player.completed.includes(id) || !isStageUnlocked(player, id))
    return { player, xpGranted: 0, newRewards: [] as string[] };
  let next = {
    ...player,
    completed: [...player.completed, id],
    rewards: [...player.rewards],
    xp: player.xp + 120,
  };
  const path = paths.find((p) => p.stages.some((s) => s.id === id));
  if (
    path &&
    path.stages.every((s) => next.completed.includes(s.id)) &&
    !next.rewards.includes(`path:${path.id}`)
  ) {
    next.xp += 220;
    next.rewards.push(`path:${path.id}`);
    for (const item of wardrobe.filter((item) => item.unlockPath === path.id))
      if (!next.rewards.includes(`wardrobe:${item.id}`))
        next.rewards.push(`wardrobe:${item.id}`);
  }
  next = collectAchievements(next);
  return {
    player: next,
    xpGranted: next.xp - player.xp,
    newRewards: next.rewards.filter((id) => !player.rewards.includes(id)),
  };
}
export function discover(
  player: Player,
  kind: "tool" | "material",
  id: string,
) {
  const allowed =
    kind === "tool"
      ? isToolUnlocked(player, id)
      : isMaterialUnlocked(player, id);
  const reward = `${kind}:${id}`;
  if (!allowed || player.rewards.includes(reward)) return player;
  return collectAchievements({
    ...player,
    xp: player.xp + 15,
    rewards: [...player.rewards, reward],
  });
}
export function sanitizePlayer(raw: unknown): Player {
  const p = initialPlayer();
  if (!raw || typeof raw !== "object") return p;
  const v = raw as Partial<Player>;
  if (typeof v.name === "string") p.name = v.name.slice(0, 48).trim() || p.name;
  const appearances = {
    hair: ["curly", "short", "long", "straight", "bald"],
    face: ["round", "oval"],
    expression: ["smile", "calm", "surprise", "serene"],
    outfit: ["shirt", "coat", "dress"],
    shoes: ["boots", "sandals"],
    accessory: ["none", "glasses", "hat", "bag"],
  };
  for (const k of [
    "hair",
    "face",
    "expression",
    "outfit",
    "shoes",
    "accessory",
  ] as const)
    if (typeof v[k] === "string" && appearances[k].includes(v[k]!))
      p[k] = v[k]!;
  for (const k of ["skin", "hairColor"] as const)
    if (/^#[\da-f]{6}$/i.test(v[k] ?? "")) p[k] = v[k]!;
  p.xp = Number.isFinite(v.xp) ? Math.max(0, Math.min(1000000, v.xp!)) : 0;
  p.completed = [
    ...new Set(
      (Array.isArray(v.completed) ? v.completed : []).filter((id) =>
        stages.some((s) => s.id === id),
      ),
    ),
  ];
  p.rewards = [
    ...new Set(
      (Array.isArray(v.rewards) ? v.rewards : []).filter(
        (id) => typeof id === "string" && id.length < 100,
      ),
    ),
  ];
  p.favorites = (Array.isArray(v.favorites) ? v.favorites : [])
    .slice(0, 30)
    .filter((a) => Array.isArray(a) && a.length <= 12)
    .map((a) =>
      a.filter((c) => typeof c === "string" && /^#[\da-f]{6}$/i.test(c)),
    )
    .filter((a) => a.length > 0);
  if (v.equipped && typeof v.equipped === "object")
    for (const [key, value] of Object.entries(v.equipped))
      if (
        [
          "shirt",
          "coat",
          "dress",
          "hat",
          "bag",
          "shoes",
          "cape",
          "gloves",
        ].includes(key) &&
        typeof value === "string" &&
        value.length < 100
      )
        p.equipped[key] = value;
  if (v.preferences)
    for (const k of ["music", "effects", "narration"] as const)
      p.preferences[k] = Math.max(
        0,
        Math.min(1, Number(v.preferences[k]) || 0),
      );
  p.preferences.haptics =
    typeof v.preferences?.haptics === "boolean" ? v.preferences.haptics : true;
  return p;
}
export function migrateLegacy(player: Player, raw: unknown) {
  const next = sanitizePlayer(player);
  let imported = 0;
  if (raw && typeof raw === "object") {
    const record = raw as {
      version?: number;
      numbered?: Record<string, unknown>;
    };
    if (
      record.version === 1 &&
      record.numbered &&
      typeof record.numbered === "object" &&
      !Array.isArray(record.numbered)
    )
      for (const stage of stages) {
        if (!stage.legacyId) continue;
        const completed = [
          ["easy", 24],
          ["medium", 40],
          ["hard", 70],
        ].some(([level, count]) => {
          const value = record.numbered![`${stage.legacyId}:${level}`];
          return (
            Array.isArray(value) &&
            Array.from({ length: Number(count) }, (_, id) => id).every((id) =>
              value.includes(id),
            )
          );
        });
        const marker = `migration:v5:${stage.id}`;
        if (
          completed &&
          !next.completed.includes(stage.id) &&
          !next.rewards.includes(marker)
        ) {
          next.completed.push(stage.id);
          next.xp += 120;
          next.rewards.push(marker);
          imported++;
        }
      }
  }
  if (!next.rewards.includes("migration:v5")) next.rewards.push("migration:v5");
  return { player: next, imported };
}
