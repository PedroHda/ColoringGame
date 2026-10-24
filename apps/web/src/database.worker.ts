/// <reference lib="webworker" />
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import wasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
import { Repository } from "../../../packages/database/repository";
let sqlite: any,
  db: any,
  repo: Repository,
  mode = "";
let fallback: IDBDatabase | null = null;
async function idb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("colore-sqlite-v6", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function readFile() {
  return new Promise<Uint8Array | undefined>((resolve, reject) => {
    const request = fallback!
      .transaction("files")
      .objectStore("files")
      .get("colore.sqlite");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function persist() {
  if (!fallback) return;
  const data = sqlite.capi.sqlite3_js_db_export(db.pointer);
  await new Promise<void>((resolve, reject) => {
    const tx = fallback!.transaction("files", "readwrite");
    tx.objectStore("files").put(data, "colore.sqlite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
async function init() {
  if (repo) return;
  // Acquire one lease for either storage backend. An OPFS failure must not let
  // another tab silently open a separate fallback copy of the same profile.
  if (navigator.locks) {
    await new Promise<void>((resolve, reject) => {
      void navigator.locks
        .request("colore-v6-db-owner", { ifAvailable: true }, (lock) => {
          if (!lock) {
            reject(
              Error(
                "O banco está aberto em outra aba. Feche a outra aba e recarregue.",
              ),
            );
            return;
          }
          resolve();
          return new Promise<void>(() => {});
        })
        .catch(reject);
    });
  }
  sqlite = await sqlite3InitModule({
    locateFile: () => wasmUrl,
    print: () => {},
    printErr: () => {},
  });
  // SAH pool works without COOP/COEP in supported workers. Keep a single DB owner.
  try {
    const pool = await sqlite.installOpfsSAHPoolVfs({
      name: "colore-v6",
      directory: "/colore-v6",
      initialCapacity: 6,
    });
    db = new pool.OpfsSAHPoolDb("/colore.sqlite");
    mode = "SQLite · OPFS";
  } catch (error) {
    // A second tab must not silently open a divergent database in a fallback.
    const text = String(error);
    if (
      /NoModificationAllowed|already.*lock|access.*handle.*existing/i.test(text)
    )
      throw Error(
        "O banco está aberto em outra aba. Feche a outra aba do Colorê e recarregue.",
      );
    fallback = await idb();
    db = new sqlite.oo1.DB(":memory:", "c");
    const bytes = await readFile();
    if (bytes?.length) {
      const pointer = sqlite.wasm.allocFromTypedArray(bytes);
      const rc = sqlite.capi.sqlite3_deserialize(
        db.pointer,
        "main",
        pointer,
        bytes.length,
        bytes.length,
        sqlite.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
          sqlite.capi.SQLITE_DESERIALIZE_RESIZEABLE,
      );
      if (rc) throw Error(`Não foi possível restaurar o banco SQLite (${rc}).`);
    }
    mode = "SQLite · IndexedDB";
  }
  repo = new Repository({
    exec: (sql, bind = []) =>
      db.exec({ sql, bind, rowMode: "object", returnValue: "resultRows" }),
  });
  await persist();
}
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      await init();
      const { method, args = [] } = data;
      let result: unknown;
      if (method === "init")
        result = { player: repo.player(), mode, legacy: repo.legacy() };
      else if (method === "savePlayer") repo.savePlayer(args[0]);
      else if (method === "list") result = repo.list();
      else if (method === "get") result = repo.get(args[0]);
      else if (method === "save") repo.save(args[0]);
      else if (method === "saveWithPlayer")
        repo.saveWithPlayer(args[0], args[1]);
      else if (method === "setThumbnail")
        repo.setThumbnail(args[0], args[1], args[2]);
      else if (method === "remove") repo.remove(args[0]);
      else if (method === "backup") result = repo.backup();
      else if (method === "restore") repo.restore(args[0]);
      else if (method === "legacy") repo.legacy(args[0]);
      else throw Error("Operação desconhecida.");
      if (!["init", "list", "get", "backup"].includes(method)) await persist();
      self.postMessage({ id: data.id, result });
    } catch (error) {
      self.postMessage({
        id: data.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
};
