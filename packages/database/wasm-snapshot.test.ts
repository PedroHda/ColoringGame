import test from "node:test";
import assert from "node:assert/strict";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
test("arquivo SQLite WASM usado pelo fallback pode ser serializado e reaberto sem perder dados", async () => {
  const sqlite = await sqlite3InitModule({
    print: () => {},
    printErr: () => {},
  });
  const first = new sqlite.oo1.DB(":memory:", "c");
  first.exec("CREATE TABLE paint(id TEXT PRIMARY KEY, points TEXT);");
  first.exec({
    sql: "INSERT INTO paint VALUES(?,?)",
    bind: ["stroke-1", '[{"x":4,"y":9}]'],
  });
  const bytes = sqlite.capi.sqlite3_js_db_export(first.pointer!);
  first.close();
  const second = new sqlite.oo1.DB(":memory:", "c");
  const pointer = sqlite.wasm.allocFromTypedArray(bytes);
  const rc = sqlite.capi.sqlite3_deserialize(
    second.pointer!,
    "main",
    pointer,
    bytes.length,
    bytes.length,
    sqlite.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
      sqlite.capi.SQLITE_DESERIALIZE_RESIZEABLE,
  );
  assert.equal(rc, 0);
  const row = second.selectObject("SELECT * FROM paint WHERE id=?", [
    "stroke-1",
  ]);
  assert.equal(row?.points, '[{"x":4,"y":9}]');
  second.exec({
    sql: "INSERT INTO paint VALUES(?,?)",
    bind: ["stroke-2", "[]"],
  });
  assert.equal(second.selectValue("SELECT count(*) FROM paint"), 2);
  second.close();
});
