import * as SQLite from "expo-sqlite";
import {
  createDocument,
  validateDocument,
  type DrawingDocument,
  type Stroke,
} from "../../../packages/drawing-engine/model";
import {
  initialPlayer,
  sanitizePlayer,
  type Player,
} from "../../../packages/core";
import { createSharedBackup, parseSharedBackup } from "./backup-format";
import {
  NATIVE_SCHEMA_VERSION,
  initialNativeSchema,
  nativeMigration2,
  nativeMigration3,
} from "./schema";

export interface Painting {
  id: string;
  title: string;
  stageId: string | null;
  base: string;
  completed: boolean;
  created: string;
  updated: string;
  document: DrawingDocument;
}
export type PaintingSummary = Omit<Painting, "document">;
let connection: Promise<SQLite.SQLiteDatabase> | undefined;
let writes = Promise.resolve();
function writeSerial(operation: () => Promise<void>) {
  writes = writes.catch(() => {}).then(operation);
  return writes;
}
async function transaction(
  database: SQLite.SQLiteDatabase,
  operation: (tx: SQLite.SQLiteDatabase) => Promise<void>,
) {
  // Keep FK enforcement on the configured connection. Expo's exclusive helper opens a new one.
  await database.execAsync("BEGIN IMMEDIATE");
  try {
    await operation(database);
    await database.execAsync("COMMIT");
  } catch (error) {
    try {
      await database.execAsync("ROLLBACK");
    } catch {
      /* Keep the original error. */
    }
    throw error;
  }
}
function db() {
  return (connection ??= (async () => {
    const database = await SQLite.openDatabaseAsync("colore-v6.db");
    await database.execAsync(
      "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;",
    );
    const version = await database.getFirstAsync<{ user_version: number }>(
      "PRAGMA user_version",
    );
    if ((version?.user_version ?? 0) > NATIVE_SCHEMA_VERSION)
      throw new Error(
        "Banco de uma versão mais recente. Atualize o aplicativo antes de abrir.",
      );
    for (const [target, sql] of [
      [1, initialNativeSchema],
      [2, nativeMigration2],
      [3, nativeMigration3],
    ] as const) {
      if ((version?.user_version ?? 0) < target)
        await transaction(database, async (tx) => {
          await tx.execAsync(sql);
        });
    }
    return database;
  })());
}

export async function loadPlayer(): Promise<Player> {
  await writes.catch(() => {});
  const row = await (
    await db()
  ).getFirstAsync<{ json: string }>("SELECT json FROM profiles LIMIT 1");
  if (!row) {
    const player = initialPlayer();
    await savePlayer(player);
    return player;
  }
  return validatePlayer(JSON.parse(row.json));
}
function validatePlayer(value: unknown): Player {
  const v = value as Player;
  if (
    !v ||
    typeof v.id !== "string" ||
    typeof v.name !== "string" ||
    !Number.isFinite(v.xp) ||
    !Array.isArray(v.completed) ||
    !Array.isArray(v.rewards) ||
    !Array.isArray(v.favorites) ||
    !v.preferences ||
    !v.equipped
  )
    throw new Error("Perfil inválido no arquivo de dados.");
  if (
    v.id.length > 160 ||
    v.name.length > 80 ||
    v.xp < 0 ||
    v.completed.length > 1000 ||
    v.rewards.length > 5000
  )
    throw new Error("Perfil excede os limites de segurança.");
  if (
    ![...v.completed, ...v.rewards].every(
      (id) => typeof id === "string" && id.length < 160,
    )
  )
    throw new Error("Inventário inválido.");
  return sanitizePlayer(v);
}
async function writePlayer(tx: SQLite.SQLiteDatabase, player: Player) {
  const safe = validatePlayer(player);
  await tx.runAsync(
    "INSERT INTO profiles(id,json) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json",
    safe.id,
    JSON.stringify(safe),
  );
  await tx.runAsync("DELETE FROM inventory WHERE profile_id=?", safe.id);
  for (const reward of new Set(safe.rewards))
    await tx.runAsync(
      "INSERT INTO inventory(id,profile_id) VALUES (?,?)",
      reward,
      safe.id,
    );
  for (const stage of new Set(safe.completed))
    await tx.runAsync(
      "INSERT OR IGNORE INTO stage_progress(stage_id,profile_id,completed_at) VALUES (?,?,?)",
      stage,
      safe.id,
      new Date().toISOString(),
    );
  await tx.runAsync("DELETE FROM palettes WHERE profile_id=?", safe.id);
  for (let i = 0; i < safe.favorites.length; i++)
    await tx.runAsync(
      "INSERT INTO palettes(id,profile_id,colors) VALUES (?,?,?)",
      `${safe.id}-${i}`,
      safe.id,
      JSON.stringify(safe.favorites[i]),
    );
}
export async function savePlayer(player: Player): Promise<void> {
  const database = await db();
  await writeSerial(() =>
    transaction(database, (tx) => writePlayer(tx, player)),
  );
}

export function newPainting(
  title: string,
  base: string,
  stageId: string | null = null,
  id?: string,
): Painting {
  const now = new Date().toISOString();
  return {
    id:
      id ?? `painting-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    base,
    stageId,
    completed: false,
    created: now,
    updated: now,
    document: createDocument(),
  };
}

async function writePainting(tx: SQLite.SQLiteDatabase, painting: Painting) {
  const doc = validateDocument(painting.document);
  await tx.runAsync(
    `INSERT INTO paintings(id,title,stage_id,base,completed,created,updated,width,height) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,completed=excluded.completed,updated=excluded.updated,width=excluded.width,height=excluded.height`,
    painting.id,
    painting.title.slice(0, 160),
    painting.stageId,
    painting.base,
    painting.completed ? 1 : 0,
    painting.created,
    painting.updated,
    doc.width,
    doc.height,
  );
  await tx.runAsync(
    "INSERT OR IGNORE INTO layers(id,painting_id,name,position) VALUES (?,?,?,?)",
    `${painting.id}-paint`,
    painting.id,
    "Pintura",
    1,
  );
  const old = await tx.getAllAsync<{
    id: string;
    position: number;
    undone: number;
    json: string;
  }>(
    "SELECT id,position,undone,json FROM strokes WHERE painting_id=?",
    painting.id,
  );
  const prior = new Map(old.map((row) => [row.id, row]));
  const current = new Set<string>();
  for (const [undone, list] of [
    [0, doc.strokes],
    [1, doc.redo],
  ] as const) {
    for (let position = 0; position < list.length; position++) {
      const stroke = list[position];
      current.add(stroke.id);
      const existing = prior.get(stroke.id);
      const json = JSON.stringify(stroke);
      // Finished native gestures are immutable; defensive comparison also supports corrected imports.
      if (!existing)
        await tx.runAsync(
          "INSERT INTO strokes(id,painting_id,position,undone,json) VALUES (?,?,?,?,?)",
          stroke.id,
          painting.id,
          position,
          undone,
          json,
        );
      else if (existing.json !== json)
        await tx.runAsync(
          "UPDATE strokes SET position=?,undone=?,json=? WHERE id=? AND painting_id=?",
          position,
          undone,
          json,
          stroke.id,
          painting.id,
        );
      else if (existing.position !== position || existing.undone !== undone)
        await tx.runAsync(
          "UPDATE strokes SET position=?,undone=? WHERE id=? AND painting_id=?",
          position,
          undone,
          stroke.id,
          painting.id,
        );
    }
  }
  for (const oldStroke of old)
    if (!current.has(oldStroke.id))
      await tx.runAsync(
        "DELETE FROM strokes WHERE id=? AND painting_id=?",
        oldStroke.id,
        painting.id,
      );
}
export async function savePainting(
  painting: Painting,
  player?: Player,
): Promise<void> {
  const database = await db();
  await writeSerial(() =>
    transaction(database, async (tx) => {
      await writePainting(tx, painting);
      if (player) await writePlayer(tx, player);
    }),
  );
}
type PaintingRow = {
  id: string;
  title: string;
  stage_id: string | null;
  base: string;
  completed: number;
  created: string;
  updated: string;
  width: number;
  height: number;
};
export async function listPaintings(): Promise<PaintingSummary[]> {
  await writes.catch(() => {});
  return (
    await (
      await db()
    ).getAllAsync<PaintingRow>("SELECT * FROM paintings ORDER BY updated DESC")
  ).map((row) => ({
    id: row.id,
    title: row.title,
    stageId: row.stage_id,
    base: row.base,
    completed: !!row.completed,
    created: row.created,
    updated: row.updated,
  }));
}
export async function loadPainting(id: string): Promise<Painting | null> {
  await writes.catch(() => {});
  const database = await db();
  const row = await database.getFirstAsync<PaintingRow>(
    "SELECT * FROM paintings WHERE id=?",
    id,
  );
  if (!row) return null;
  const strokes = await database.getAllAsync<{ json: string; undone: number }>(
    "SELECT json,undone FROM strokes WHERE painting_id=? ORDER BY undone,position",
    id,
  );
  const document = validateDocument({
    version: 1,
    width: row.width,
    height: row.height,
    strokes: strokes
      .filter((r) => !r.undone)
      .map((r) => JSON.parse(r.json) as Stroke),
    redo: strokes
      .filter((r) => r.undone)
      .map((r) => JSON.parse(r.json) as Stroke),
  });
  return {
    id: row.id,
    title: row.title,
    base: row.base,
    stageId: row.stage_id,
    completed: !!row.completed,
    created: row.created,
    updated: row.updated,
    document,
  };
}
export async function exportBackup(): Promise<string> {
  await writes.catch(() => {});
  const paintings = await Promise.all(
    (await listPaintings()).map((p) => loadPainting(p.id)),
  );
  const snapshots = await (
    await db()
  ).getAllAsync<{ key: string; value: string }>(
    "SELECT key,value FROM legacy_snapshots",
  );
  const legacy = Object.fromEntries(
    snapshots.map((row) => [row.key, row.value]),
  );
  return JSON.stringify(
    createSharedBackup(
      await loadPlayer(),
      paintings.filter((p): p is Painting => p !== null),
      legacy,
    ),
  );
}
export async function importBackup(text: string): Promise<void> {
  const { player, paintings, legacy } = parseSharedBackup(text);
  const database = await db();
  await writeSerial(() =>
    transaction(database, async (tx) => {
      // Restore is atomic. Old data is retained as an export before the caller invokes this.
      await tx.runAsync("DELETE FROM paintings");
      await tx.runAsync("DELETE FROM legacy_snapshots");
      await tx.runAsync("DELETE FROM palettes");
      await tx.runAsync("DELETE FROM inventory");
      await tx.runAsync("DELETE FROM stage_progress");
      await tx.runAsync("DELETE FROM profiles");
      await writePlayer(tx, player);
      for (const painting of paintings) await writePainting(tx, painting);
      for (const [key, value] of Object.entries(legacy))
        await tx.runAsync(
          "INSERT INTO legacy_snapshots(key,value) VALUES (?,?)",
          key,
          value,
        );
    }),
  );
}
