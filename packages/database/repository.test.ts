import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdtempSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Repository, type SqlDb } from "./repository";
import { SCHEMA_VERSION, schema } from "./schema";
import { completeStage, initialPlayer, migrateLegacy } from "../core/index";
import { stages, paths } from "../game-content/index";
import {
  createDocument,
  getDefaultBrushSettings,
  type Stroke,
} from "../drawing-engine/model";
import type { Drawing } from "../shared-types/index";

function adapter(db: DatabaseSync): SqlDb {
  return {
    exec(sql, bind = []) {
      // DatabaseSync.exec handles schema batches; prepared statements exercise the
      // exact parameter binding and BLOB values used by the browser repository.
      if (sql.trim().replace(/;$/, "").includes(";")) {
        db.exec(sql);
        return [];
      }
      return db.prepare(sql).all(...(bind as SQLInputValue[]));
    },
  };
}
function setup(path = ":memory:") {
  const db = new DatabaseSync(path),
    sql = adapter(db),
    repo = new Repository(sql);
  return { db, sql, repo };
}
function stroke(id = "one"): Stroke {
  return {
    id,
    seed: 2512,
    settings: getDefaultBrushSettings("crayon"),
    points: [
      { x: 30, y: 40, pressure: 0.4 },
      { x: 120, y: 80, pressure: 0.8 },
    ],
  };
}
function drawing(id = "painting"): Drawing {
  const document = createDocument(320, 200);
  document.strokes.push(stroke());
  return {
    id,
    title: "Meu primeiro traço",
    stageId: stages[0].id,
    kind: "scene",
    asset: stages[0].asset ?? "/illustrations/p01-s01.png",
    createdAt: "2026-10-23T10:00:00.000Z",
    updatedAt: "2026-10-23T10:00:00.000Z",
    completed: false,
    document,
  };
}
const count = (sql: SqlDb, table: string) =>
  Number(sql.exec(`SELECT COUNT(*) AS count FROM ${table}`)[0].count);

test("concluir uma pintura grava XP e arte juntos e reverte ambos em falha de SQL", (context) => {
  const { db, sql, repo } = setup();
  context.after(() => db.close());
  const player = initialPlayer();
  repo.savePlayer(player);
  const art = drawing();
  for (const asset of [
    "//example.invalid/tracker.png",
    "/illustrations/../secret",
    "/clothing/a.svg?tracking=1",
  ])
    assert.throws(() => repo.save({ ...art, asset }), /Obra inválida/);
  repo.save(art);
  const next = { ...art, completed: true };
  const rewarded = completeStage(player, stages[0].id).player;
  sql.exec(
    "CREATE TRIGGER fail_completion BEFORE UPDATE ON drawings WHEN NEW.completed=1 BEGIN SELECT RAISE(ABORT,'completion interrupted'); END;",
  );
  assert.throws(
    () => repo.saveWithPlayer(next, rewarded),
    /completion interrupted/,
  );
  assert.equal(repo.player()!.xp, 0);
  assert.equal(repo.get(art.id)!.completed, false);
  sql.exec("DROP TRIGGER fail_completion");
  repo.saveWithPlayer(next, rewarded);
  assert.equal(repo.player()!.xp, rewarded.xp);
  assert.equal(repo.get(art.id)!.completed, true);
});

test("regenerar miniatura nunca substitui traços novos nem aceita uma prévia obsoleta", (context) => {
  const { db, repo } = setup();
  context.after(() => db.close());
  repo.savePlayer(initialPlayer());
  const old = drawing();
  repo.save(old);
  const next = {
    ...old,
    updatedAt: "2026-10-24T11:00:00.000Z",
    document: {
      ...old.document,
      strokes: [...old.document.strokes, stroke("two")],
    },
  };
  repo.save(next);
  repo.setThumbnail(old.id, old.updatedAt, new Uint8Array([1, 2, 3]));
  assert.equal(repo.get(old.id)!.thumbnail, null);
  repo.setThumbnail(next.id, next.updatedAt, new Uint8Array([4, 5, 6]));
  const saved = repo.get(next.id)!;
  assert.deepEqual([...saved.thumbnail!], [4, 5, 6]);
  assert.equal(saved.document.strokes.length, 2);
  assert.equal(saved.updatedAt, next.updatedAt);
  assert.throws(
    () => repo.setThumbnail(next.id, next.updatedAt, new Uint8Array()),
    /Miniatura inválida/,
  );
});

test("a real SQLite database seeds 15 paths/75 stages, versions its schema and enforces parent FKs", (context) => {
  const { db, sql, repo } = setup();
  context.after(() => db.close());
  assert.equal(paths.length, 15);
  assert.equal(stages.length, 75);
  assert.equal(count(sql, "historical_paths"), 15);
  assert.equal(count(sql, "stages"), 75);
  assert.equal(
    sql.exec("SELECT MAX(version) AS version FROM schema_migrations")[0]
      .version,
    SCHEMA_VERSION,
  );
  assert.equal(sql.exec("PRAGMA foreign_keys")[0].foreign_keys, 1);
  assert.throws(() => repo.save(drawing()), /FOREIGN KEY/);
  assert.equal(count(sql, "drawings"), 0);
  assert.equal(count(sql, "strokes"), 0);
  repo.savePlayer(initialPlayer());
  repo.save(drawing());
  assert.throws(
    () =>
      sql.exec("INSERT INTO stage_progress VALUES(?,?,?)", [
        "local-player",
        "missing-stage",
        "today",
      ]),
    /FOREIGN KEY/,
  );
  assert.throws(
    () =>
      sql.exec("INSERT INTO strokes VALUES(?,?,?,?,?,?,?,?)", [
        "painting",
        "bad-layer",
        1,
        "{}",
        "[]",
        1,
        "missing-layer",
        0,
      ]),
    /FOREIGN KEY/,
  );
  assert.throws(
    () =>
      sql.exec("INSERT INTO strokes VALUES(?,?,?,?,?,?,?,?)", [
        "painting",
        "bad-flag",
        1,
        "{}",
        "[]",
        1,
        "paint",
        2,
      ]),
    /CHECK/,
  );
  assert.deepEqual(sql.exec("PRAGMA foreign_key_check"), []);
});

test("resuming an active stroke updates points/settings, dimensions and source metadata", (context) => {
  const { db, repo } = setup();
  context.after(() => db.close());
  repo.savePlayer(initialPlayer());
  const original = drawing();
  repo.save(original);
  const updated = structuredClone(original);
  updated.title = "Traço continuado";
  updated.document.width = 640;
  updated.document.height = 400;
  updated.asset = "/illustrations/p01-s02.png";
  updated.stageId = stages[1].id;
  updated.completed = true;
  updated.document.strokes[0].points.push({ x: 240, y: 120, pressure: 0.5 });
  updated.document.strokes[0].settings.color = "#aabbcc";
  updated.document.strokes[0].layerId = "glaze";
  updated.document.strokes[0].seed = 77;
  repo.save(updated);
  const loaded = repo.get(updated.id)!;
  assert.equal(loaded.document.strokes[0].points.length, 3);
  assert.equal(
    loaded.document.strokes[0].settings.color,
    "#AABBCC",
    "persist the defensive normalised copy",
  );
  assert.equal(
    updated.document.strokes[0].settings.color,
    "#aabbcc",
    "saving does not mutate its caller",
  );
  assert.equal(loaded.document.strokes[0].seed, 77);
  assert.equal(loaded.document.strokes[0].layerId, "glaze");
  assert.equal(loaded.document.width, 640);
  assert.equal(loaded.document.height, 400);
  assert.equal(loaded.asset, updated.asset);
  assert.equal(loaded.stageId, stages[1].id);
  assert.equal(loaded.completed, true);
});

test("undo/redo stack order, edits and discarded history survive repeated SQLite saves", (context) => {
  const { db, repo, sql } = setup();
  context.after(() => db.close());
  repo.savePlayer(initialPlayer());
  const art = drawing();
  art.document.strokes = [stroke("a"), stroke("b"), stroke("c")];
  repo.save(art);
  art.document.redo.push(art.document.strokes.pop()!);
  art.document.redo.push(art.document.strokes.pop()!);
  repo.save(art);
  let loaded = repo.get(art.id)!;
  assert.deepEqual(
    loaded.document.strokes.map((s) => s.id),
    ["a"],
  );
  assert.deepEqual(
    loaded.document.redo.map((s) => s.id),
    ["c", "b"],
  );
  loaded.document.strokes.push(loaded.document.redo.pop()!);
  repo.save(loaded);
  loaded = repo.get(art.id)!;
  assert.deepEqual(
    loaded.document.strokes.map((s) => s.id),
    ["a", "b"],
  );
  assert.deepEqual(
    loaded.document.redo.map((s) => s.id),
    ["c"],
  );
  loaded.document.redo = [];
  loaded.document.strokes.push(stroke("new"));
  repo.save(loaded);
  assert.equal(count(sql, "strokes"), 3);
  assert.equal(sql.exec("SELECT id FROM strokes WHERE id='c'").length, 0);
  repo.remove(art.id);
  assert.equal(count(sql, "layers"), 0);
  assert.equal(count(sql, "strokes"), 0);
});

test("unchanged autosaves avoid rewriting payload and thumbnails are real BLOBs", (context) => {
  const { db, repo, sql } = setup();
  context.after(() => db.close());
  repo.savePlayer(initialPlayer());
  const art = drawing();
  art.thumbnail = new Uint8Array([137, 80, 78, 71]);
  repo.save(art);
  sql.exec("CREATE TABLE stroke_writes(count INTEGER)");
  sql.exec("INSERT INTO stroke_writes VALUES(0)");
  sql.exec(
    "CREATE TRIGGER log_stroke_update AFTER UPDATE ON strokes BEGIN UPDATE stroke_writes SET count=count+1; END;",
  );
  repo.save(art);
  assert.equal(sql.exec("SELECT count FROM stroke_writes")[0].count, 0);
  art.document.strokes[0].points[0].x = 60;
  repo.save(art);
  assert.equal(sql.exec("SELECT count FROM stroke_writes")[0].count, 1);
  assert.deepEqual(repo.get(art.id)!.thumbnail, art.thumbnail);
  art.thumbnail = null;
  repo.save(art);
  assert.equal(repo.get(art.id)!.thumbnail, null);
  assert.equal(repo.backup().drawings[0].thumbnail, null);
  assert.ok(!JSON.stringify(repo.backup()).includes("base64"));
});

test("invalid imports reject before writes, including duplicate artwork IDs and malformed legacy", (context) => {
  const { db, repo } = setup();
  context.after(() => db.close());
  repo.savePlayer(initialPlayer("Original"));
  repo.save(drawing());
  const before = repo.get("painting")!,
    backup = repo.backup();
  backup.player.name = "Deve ser rejeitado";
  backup.drawings.push(drawing("second"));
  backup.drawings[1].document.strokes[0].settings.opacity = 8;
  assert.throws(() => repo.restore(backup), /Configuração inválida/);
  assert.equal(repo.player()!.name, "Original");
  assert.deepEqual(repo.get("painting"), before);
  assert.equal(repo.get("second"), null);
  const duplicate = repo.backup();
  duplicate.drawings.push(structuredClone(duplicate.drawings[0]));
  assert.throws(() => repo.restore(duplicate), /duplicadas/);
  const malformed = repo.backup();
  malformed.legacy = { "colore-history-v1": 10 } as unknown as Record<
    string,
    string
  >;
  assert.throws(() => repo.restore(malformed), /antigo inválido/);
});

test("an actual mid-transaction SQLite failure rolls back the profile and every imported drawing", (context) => {
  const { db, repo, sql } = setup();
  context.after(() => db.close());
  repo.savePlayer(initialPlayer("Antes"));
  repo.save(drawing());
  const before = repo.get("painting")!,
    backup = repo.backup();
  backup.player.name = "Depois";
  backup.drawings[0].title = "Mudança parcial";
  const failing = drawing("broken");
  failing.document.strokes[0].id = "force-failure";
  backup.drawings.push(failing);
  sql.exec(
    "CREATE TRIGGER import_failure BEFORE INSERT ON strokes WHEN NEW.id='force-failure' BEGIN SELECT RAISE(ABORT,'injected SQLite failure'); END;",
  );
  assert.throws(() => repo.restore(backup), /injected SQLite failure/);
  assert.equal(repo.player()!.name, "Antes");
  assert.deepEqual(repo.get("painting"), before);
  assert.equal(repo.get("broken"), null);
  assert.deepEqual(sql.exec("PRAGMA foreign_key_check"), []);
  sql.exec("DROP TRIGGER import_failure");
  repo.save(drawing("after-rollback"));
  assert.ok(repo.get("after-rollback"));
});

test("75 completed stages and idempotent rewards round-trip without duplicate relational rows", (context) => {
  const { db, repo, sql } = setup();
  context.after(() => db.close());
  let player = initialPlayer();
  for (const stage of stages) player = completeStage(player, stage.id).player;
  repo.savePlayer(player);
  repo.savePlayer(player);
  assert.deepEqual(repo.player(), player);
  assert.equal(count(sql, "stage_progress"), 75);
  assert.equal(count(sql, "inventory"), new Set(player.rewards).size);
  assert.equal(
    sql.exec("SELECT amount FROM experience WHERE event_id='total'")[0].amount,
    player.xp,
  );
  assert.equal(
    player.rewards.filter((reward) => reward.startsWith("path:")).length,
    15,
  );
  assert.equal(completeStage(repo.player()!, stages[74].id).xpGranted, 0);
  sql.exec("UPDATE stage_progress SET completed_at=? WHERE stage_id=?", [
    "2026-10-20T01:00:00.000Z",
    stages[0].id,
  ]);
  repo.savePlayer(player);
  assert.equal(
    sql.exec("SELECT completed_at FROM stage_progress WHERE stage_id=?", [
      stages[0].id,
    ])[0].completed_at,
    "2026-10-20T01:00:00.000Z",
  );
  assert.deepEqual(sql.exec("PRAGMA foreign_key_check"), []);
});

test("legacy backups are preserved byte-for-byte and migration can resume after a partial import", (context) => {
  const { db, repo } = setup();
  context.after(() => db.close());
  const oldStages = stages.filter((stage) => stage.legacyId);
  assert.ok(oldStages.length >= 2);
  const old = {
    version: 1,
    numbered: {
      [`${oldStages[0].legacyId}:easy`]: Array.from(
        { length: 24 },
        (_, i) => i,
      ),
    },
  };
  const original = JSON.stringify(old);
  repo.legacy({ "colore-history-v1": original });
  let migrated = migrateLegacy(initialPlayer(), old);
  assert.equal(migrated.imported, 1);
  repo.savePlayer(migrated.player);
  const firstXp = migrated.player.xp;
  migrated = migrateLegacy(repo.player()!, old);
  assert.equal(migrated.imported, 0);
  assert.equal(migrated.player.xp, firstXp);
  old.numbered[`${oldStages[1].legacyId}:medium`] = Array.from(
    { length: 40 },
    (_, i) => i,
  );
  migrated = migrateLegacy(repo.player()!, old);
  assert.equal(migrated.imported, 1);
  repo.savePlayer(migrated.player);
  assert.equal(repo.player()!.xp, firstXp + 120);
  assert.equal(repo.player()!.completed.length, 2);
  repo.legacy({ "colore-history-v1": JSON.stringify(old) });
  assert.equal(
    repo.legacy()["colore-history-v1"],
    original,
    "do not overwrite the first recovery copy",
  );
  assert.equal(migrateLegacy(repo.player()!, old).imported, 0);
});

test("a file database reopens with editable art and valid undo stack after process-like restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "colore-sqlite-test-")),
    filename = join(directory, "paintings.sqlite");
  let open: ReturnType<typeof setup> | undefined;
  try {
    open = setup(filename);
    open.repo.savePlayer(initialPlayer("Persistente"));
    const art = drawing();
    art.document.redo = [stroke("undone")];
    open.repo.save(art);
    open.db.close();
    open = undefined;
    open = setup(filename);
    assert.equal(open.repo.player()!.name, "Persistente");
    assert.deepEqual(open.repo.get(art.id)!.document, art.document);
    assert.equal(
      open.sql.exec("PRAGMA integrity_check")[0].integrity_check,
      "ok",
    );
  } finally {
    open?.db.close();
    unlinkSync(filename);
    rmdirSync(directory);
  }
});

test("schema V1 migrates its existing strokes/layers transactionally; future versions are untouched", (context) => {
  const old = new DatabaseSync(":memory:"),
    sql = adapter(old);
  context.after(() => old.close());
  const oldStrokeSchema =
    "CREATE TABLE IF NOT EXISTS strokes(drawing_id TEXT NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,id TEXT NOT NULL,position INTEGER NOT NULL,settings TEXT NOT NULL,points TEXT NOT NULL,seed INTEGER NOT NULL,layer_id TEXT NOT NULL DEFAULT 'paint',undone INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(drawing_id,id));";
  const v1 = schema.replace(
    /CREATE TABLE IF NOT EXISTS strokes\([^;]+;/,
    oldStrokeSchema,
  );
  sql.exec(v1);
  sql.exec("INSERT INTO schema_migrations VALUES(?,?)", [1, "2026-10-20"]);
  sql.exec("INSERT INTO profiles VALUES(?,?)", [
    "local-player",
    JSON.stringify(initialPlayer()),
  ]);
  const art = drawing();
  sql.exec("INSERT INTO drawings VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", [
    art.id,
    "local-player",
    art.title,
    null,
    art.kind,
    null,
    art.asset,
    320,
    200,
    art.createdAt,
    art.updatedAt,
    0,
    null,
  ]);
  const mark = stroke();
  sql.exec("INSERT INTO strokes VALUES(?,?,?,?,?,?,?,?)", [
    art.id,
    mark.id,
    0,
    JSON.stringify(mark.settings),
    JSON.stringify(mark.points),
    mark.seed,
    "old-glaze",
    0,
  ]);
  const repo = new Repository(sql);
  assert.equal(repo.get(art.id)!.document.strokes[0].layerId, "old-glaze");
  assert.equal(
    sql.exec("SELECT MAX(version) AS version FROM schema_migrations")[0]
      .version,
    2,
  );
  assert.deepEqual(sql.exec("PRAGMA foreign_key_check"), []);
  assert.throws(
    () =>
      sql.exec("UPDATE strokes SET layer_id=? WHERE drawing_id=?", [
        "missing",
        art.id,
      ]),
    /FOREIGN KEY/,
  );
  const future = new DatabaseSync(":memory:");
  context.after(() => future.close());
  future.exec(
    "CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT); INSERT INTO schema_migrations VALUES(999,'future');",
  );
  assert.throws(() => new Repository(adapter(future)), /versão mais recente/);
  assert.equal(
    future.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      .length,
    1,
    "do not create tables in a newer database",
  );
});

test("a failed schema upgrade rolls back DDL, version markers and layer repairs", (context) => {
  const db = new DatabaseSync(":memory:"),
    sql = adapter(db);
  context.after(() => db.close());
  const oldStrokeSchema =
    "CREATE TABLE IF NOT EXISTS strokes(drawing_id TEXT NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,id TEXT NOT NULL,position INTEGER NOT NULL,settings TEXT NOT NULL,points TEXT NOT NULL,seed INTEGER NOT NULL,layer_id TEXT NOT NULL DEFAULT 'paint',undone INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(drawing_id,id));";
  sql.exec(
    schema.replace(
      /CREATE TABLE IF NOT EXISTS strokes\([^;]+;/,
      oldStrokeSchema,
    ),
  );
  sql.exec("INSERT INTO schema_migrations VALUES(?,?)", [1, "2026-10-20"]);
  sql.exec("INSERT INTO profiles VALUES(?,?)", [
    "local-player",
    JSON.stringify(initialPlayer()),
  ]);
  const art = drawing(),
    mark = stroke();
  sql.exec("INSERT INTO drawings VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", [
    art.id,
    "local-player",
    art.title,
    null,
    art.kind,
    null,
    art.asset,
    320,
    200,
    art.createdAt,
    art.updatedAt,
    0,
    null,
  ]);
  sql.exec("INSERT INTO strokes VALUES(?,?,?,?,?,?,?,?)", [
    art.id,
    mark.id,
    -1,
    JSON.stringify(mark.settings),
    JSON.stringify(mark.points),
    mark.seed,
    "old-layer",
    0,
  ]);
  assert.throws(() => new Repository(sql), /CHECK/);
  assert.equal(
    sql.exec("SELECT MAX(version) AS version FROM schema_migrations")[0]
      .version,
    1,
  );
  assert.equal(
    sql.exec("SELECT position FROM strokes")[0].position,
    -1,
    "the original recovery data remains",
  );
  assert.equal(count(sql, "layers"), 0, "repair inserts are rolled back");
  assert.equal(
    sql.exec("SELECT name FROM sqlite_master WHERE name='strokes_v2'").length,
    0,
  );
});
