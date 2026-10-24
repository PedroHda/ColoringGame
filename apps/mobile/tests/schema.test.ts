import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  initialNativeSchema,
  nativeMigration2,
  nativeMigration3,
  NATIVE_SCHEMA_VERSION,
} from "../src/schema";
function addPainting(db: DatabaseSync, id: string) {
  db.prepare("INSERT INTO paintings VALUES (?,?,?,?,?,?,?,?,?)").run(
    id,
    "Memória",
    null,
    "/illustrations/p01-s01.png",
    0,
    "2026-10-23T12:00:00Z",
    "2026-10-23T12:00:00Z",
    2048,
    1280,
  );
}
test("migrações nativas preservam traços anteriores e aceitam IDs locais por obra", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(initialNativeSchema);
  addPainting(db, "first");
  db.prepare("INSERT INTO strokes VALUES (?,?,?,?,?)").run(
    "ink-1",
    "first",
    0,
    0,
    '{"points":[{"x":7,"y":9}]}',
  );
  db.exec("BEGIN");
  db.exec(nativeMigration2);
  db.exec(nativeMigration3);
  db.exec("COMMIT");
  assert.equal(
    db.prepare("PRAGMA user_version").get()!.user_version,
    NATIVE_SCHEMA_VERSION,
  );
  assert.equal(
    db.prepare("SELECT json FROM strokes WHERE painting_id=?").get("first")!
      .json,
    '{"points":[{"x":7,"y":9}]}',
  );
  addPainting(db, "second");
  db.prepare("INSERT INTO strokes VALUES (?,?,?,?,?)").run(
    "ink-1",
    "second",
    0,
    0,
    "{}",
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM strokes").get()!.n, 2);
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO strokes VALUES (?,?,?,?,?)")
        .run("ink-1", "second", 1, 0, "{}"),
    /UNIQUE/,
  );
  db.prepare("DELETE FROM paintings WHERE id=?").run("first");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM strokes").get()!.n, 1);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  db.close();
});
test("uma restauração inválida dentro de transação mantém a pintura anterior", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(initialNativeSchema);
  db.exec(nativeMigration2);
  db.exec(nativeMigration3);
  addPainting(db, "saved");
  db.exec("BEGIN");
  db.exec("DELETE FROM paintings");
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO strokes VALUES (?,?,?,?,?)")
        .run("bad", "missing", 0, 0, "{}"),
    /FOREIGN KEY/,
  );
  db.exec("ROLLBACK");
  assert.equal(db.prepare("SELECT id FROM paintings").get()!.id, "saved");
  db.close();
});
