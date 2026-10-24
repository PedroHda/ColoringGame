import { sanitizePlayer, type Player } from "../../../packages/core";
import { validateDocument } from "../../../packages/drawing-engine/model";
import type { Backup, Drawing } from "../../../packages/shared-types";
import type { Painting } from "./storage";

import { clothingByAsset } from "../../../packages/core/wardrobe";
import { isArtworkAsset } from "../../../packages/core/assets";
export function toSharedDrawing(painting: Painting): Drawing {
  const clothing = painting.base.startsWith("/clothing/");
  return {
    id: painting.id,
    title: painting.title,
    stageId: painting.stageId,
    kind: clothing ? "clothing" : "scene",
    ...(clothing
      ? { subjectId: clothingByAsset(painting.base)?.slot ?? "shirt" }
      : {}),
    asset: painting.base,
    createdAt: painting.created,
    updatedAt: painting.updated,
    completed: painting.completed,
    document: validateDocument(painting.document),
    thumbnail: null,
  };
}
export function createSharedBackup(
  player: Player,
  paintings: Painting[],
  legacy: Record<string, string> = {},
): Backup {
  return {
    format: "colore-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    player: sanitizePlayer(player),
    drawings: paintings.map(toSharedDrawing),
    legacy,
  };
}
export function parseSharedBackup(text: string): {
  player: Player;
  paintings: Painting[];
  legacy: Record<string, string>;
} {
  if (text.length > 100_000_000) throw new Error("Backup excede 100 MB.");
  const data = JSON.parse(text) as Backup;
  if (
    !data ||
    data.format !== "colore-backup" ||
    data.version !== 1 ||
    !Array.isArray(data.drawings) ||
    data.drawings.length > 1000 ||
    !data.player ||
    !Number.isFinite(data.player.xp) ||
    !Array.isArray(data.player.completed)
  )
    throw new Error("Formato ou versão de backup inválidos.");
  const paintings: Painting[] = data.drawings.map((drawing) => {
    if (
      !drawing ||
      typeof drawing.id !== "string" ||
      !drawing.id ||
      drawing.id.length > 100 ||
      typeof drawing.title !== "string" ||
      drawing.title.length > 160 ||
      !Number.isFinite(Date.parse(drawing.createdAt)) ||
      !Number.isFinite(Date.parse(drawing.updatedAt)) ||
      typeof drawing.completed !== "boolean" ||
      !(drawing.stageId === null || typeof drawing.stageId === "string") ||
      !["scene", "clothing"].includes(drawing.kind) ||
      !isArtworkAsset(drawing.asset)
    )
      throw new Error("Obra inválida no backup.");
    return {
      id: drawing.id,
      title: drawing.title,
      stageId: drawing.stageId,
      base: drawing.asset,
      created: drawing.createdAt,
      updated: drawing.updatedAt,
      completed: drawing.completed,
      document: validateDocument(drawing.document),
    };
  });
  if (new Set(paintings.map((p) => p.id)).size !== paintings.length)
    throw new Error("O backup contém obras com identificadores duplicados.");
  const legacy: Record<string, string> = {};
  if (data.legacy) {
    if (
      typeof data.legacy !== "object" ||
      Array.isArray(data.legacy) ||
      Object.keys(data.legacy).length > 1000
    )
      throw new Error("Cópias de dados antigos inválidas.");
    for (const [key, value] of Object.entries(data.legacy)) {
      if (
        !key.startsWith("colore-") ||
        key.length > 200 ||
        typeof value !== "string" ||
        value.length >= 10000000
      )
        throw new Error("Cópia de dados antigos inválida.");
      Object.defineProperty(legacy, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return { player: sanitizePlayer(data.player), paintings, legacy };
}
