import test from "node:test";
import assert from "node:assert/strict";
import {
  initialPlayer,
  completeStage,
  getLevel,
  xpForLevel,
  isStageUnlocked,
  migrateLegacy,
  sanitizePlayer,
  isToolUnlocked,
  isMaterialUnlocked,
  discover,
  levelProgress,
  collectAchievements,
} from "./index";
import { stages, paths } from "../game-content/index";
import { wardrobe, isClothingUnlocked } from "./wardrobe";
test("roupas históricas exigem seu caminho e entram no inventário uma única vez", () => {
  let player = initialPlayer();
  assert.equal(
    wardrobe.filter((item) => isClothingUnlocked(player, item)).length,
    3,
  );
  for (const stage of stages) player = completeStage(player, stage.id).player;
  assert.equal(
    wardrobe.filter((item) => isClothingUnlocked(player, item)).length,
    9,
  );
  assert.equal(
    player.rewards.filter((id) => id.startsWith("wardrobe:")).length,
    6,
  );
  const repeated = completeStage(player, stages[stages.length - 1].id).player;
  assert.deepEqual(repeated.rewards, player.rewards);
});
test("75 etapas em 15 caminhos respeitam sequência e recompensas únicas", () => {
  assert.equal(paths.length, 15);
  assert.equal(stages.length, 75);
  let p = initialPlayer();
  assert(!isStageUnlocked(p, stages[1].id));
  for (const stage of stages) {
    const r = completeStage(p, stage.id);
    assert(r.xpGranted >= 120);
    p = r.player;
    assert.equal(completeStage(p, stage.id).xpGranted, 0);
  }
  assert.equal(p.completed.length, 75);
  assert.equal(p.rewards.filter((r) => r.startsWith("path:")).length, 15);
  assert(p.rewards.includes("achievement:all"));
});
test("50 níveis têm limiares crescentes e saturam no último", () => {
  for (let level = 1; level <= 50; level++) {
    assert.equal(getLevel(xpForLevel(level)), level);
    if (level > 1) assert(xpForLevel(level) > xpForLevel(level - 1));
  }
  assert.equal(getLevel(1e9), 50);
});
test("migração reconhece conclusões sem apagar dados e é idempotente", () => {
  const stage = stages.find((s) => s.legacyId)!;
  const old = {
    version: 1,
    numbered: {
      [`${stage.legacyId}:easy`]: Array.from({ length: 24 }, (_, i) => i),
    },
  };
  const original = JSON.stringify(old);
  const result = migrateLegacy(initialPlayer(), old);
  assert(result.player.completed.includes(stage.id));
  assert.equal(result.imported, 1);
  assert.equal(migrateLegacy(result.player, old).imported, 0);
  assert.equal(JSON.stringify(old), original);
});
test("perfil inválido não injeta cores nem duplica progresso", () => {
  const p = sanitizePlayer({
    skin: "url(evil)",
    xp: -4,
    completed: [stages[0].id, stages[0].id, "none"],
  });
  assert.equal(p.xp, 0);
  assert.equal(p.completed.length, 1);
  assert.match(p.skin, /^#[A-Fa-f\d]{6}$/);
});

test("dados não finitos e níveis fora da faixa não produzem NaN nem liberam IDs inventados", () => {
  for (const value of [NaN, Infinity, -Infinity, -5]) {
    assert.equal(getLevel(value), 1);
    assert.equal(levelProgress(value).ratio, 0);
    assert.equal(xpForLevel(value), 0);
  }
  const p = { ...initialPlayer(), xp: 1000000 };
  assert.equal(isToolUnlocked(p, "invented"), false);
  assert.equal(isMaterialUnlocked(p, "invented"), false);
  assert.equal(isToolUnlocked(p, "toString"), false);
  assert.equal(discover(p, "tool", "invented"), p);
});

test("sanitização restringe aparência e preferências mantendo IDs compartilhados web/nativo", () => {
  const p = sanitizePlayer({
    id: "injected-id",
    name: " ",
    hair: "bald",
    expression: "serene",
    outfit: "missing",
    shoes: "sandals",
    preferences: {
      music: 2,
      effects: -1,
      narration: Infinity,
      haptics: "false",
    },
  });
  assert.equal(p.id, "local-player");
  assert.equal(p.name, "Viajante");
  assert.equal(p.hair, "bald");
  assert.equal(p.expression, "serene");
  assert.equal(p.outfit, "shirt");
  assert.equal(p.shoes, "sandals");
  assert.equal(p.preferences.haptics, true);
  assert.equal(p.preferences.music, 1);
  assert.equal(p.preferences.effects, 0);
});

test("descobertas e conquistas possuem critérios objetivos e XP concedido uma vez", () => {
  let p = { ...initialPlayer(), xp: 1000000 };
  const before = p.xp;
  p = discover(p, "tool", "watercolor");
  p = discover(p, "material", "watercolor");
  assert.ok(p.rewards.includes("achievement:watercolor"));
  assert.equal(p.xp, before + 70);
  const repeated = discover(p, "material", "watercolor");
  assert.equal(repeated, p);
  assert.equal(collectAchievements(p).xp, p.xp);
  const invalid = {
    ...initialPlayer(),
    rewards: [
      "material:a",
      "material:b",
      "material:c",
      "material:d",
      "material:e",
    ],
  };
  assert.ok(
    !collectAchievements(invalid).rewards.includes("achievement:pigments"),
  );
});

test("migração parcial retoma mesmo após marca global antiga e não inventa traços", () => {
  const old = stages.filter((stage) => stage.legacyId);
  assert.ok(old.length >= 2);
  const p = { ...initialPlayer(), rewards: ["migration:v5"] };
  const raw = {
    version: 1,
    numbered: {
      [`${old[1].legacyId}:hard`]: Array.from({ length: 70 }, (_, i) => i),
    },
  };
  const next = migrateLegacy(p, raw);
  assert.equal(next.imported, 1);
  assert.equal(next.player.xp, 120);
  assert.ok(next.player.rewards.includes(`migration:v5:${old[1].id}`));
  assert.equal(migrateLegacy(next.player, raw).imported, 0);
  assert.equal(migrateLegacy(next.player, raw).player.xp, 120);
});
