import type { Player } from "../../../packages/core/index";
import type {
  Drawing,
  DrawingSummary,
  Backup,
} from "../../../packages/shared-types/index";
const worker = new Worker(new URL("./database.worker.ts", import.meta.url), {
  type: "module",
});
if (import.meta.hot) import.meta.hot.dispose(() => worker.terminate());
let counter = 0;
const pending = new Map<
  number,
  { resolve: (value: any) => void; reject: (error: Error) => void }
>();
worker.onmessage = ({ data }) => {
  const task = pending.get(data.id);
  if (task) {
    pending.delete(data.id);
    if (data.error) task.reject(new Error(data.error));
    else task.resolve(data.result);
  }
};
worker.onerror = (event) => {
  for (const task of pending.values()) task.reject(new Error(event.message));
  pending.clear();
};
function call<T>(method: string, args: unknown[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++counter;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, method, args });
  });
}
export const database = {
  init: () =>
    call<{
      player: Player | null;
      mode: string;
      legacy: Record<string, string>;
    }>("init"),
  savePlayer: (p: Player) => call<void>("savePlayer", [p]),
  list: () => call<DrawingSummary[]>("list"),
  get: (id: string) => call<Drawing | null>("get", [id]),
  save: (drawing: Drawing) => call<void>("save", [drawing]),
  saveWithPlayer: (drawing: Drawing, player: Player) =>
    call<void>("saveWithPlayer", [drawing, player]),
  setThumbnail: (id: string, updatedAt: string, bytes: Uint8Array) =>
    call<void>("setThumbnail", [id, updatedAt, bytes]),
  remove: (id: string) => call<void>("remove", [id]),
  backup: () => call<Backup>("backup"),
  restore: (backup: Backup) => call<void>("restore", [backup]),
  legacy: (records: Record<string, string>) => call<void>("legacy", [records]),
};
