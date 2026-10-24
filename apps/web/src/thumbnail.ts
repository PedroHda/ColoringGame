import { CanvasBrushEngine } from "../../../packages/drawing-engine/index";
import type { DrawingSummary } from "../../../packages/shared-types/index";
import { database } from "./database";

// Regenerate derived previews after a portable backup import. Keep full editable
// documents in SQLite and serialize rendering to limit peak canvas memory.
let queue = Promise.resolve();
const pending = new Map<string, Promise<Uint8Array>>();
export function thumbnailFor(work: DrawingSummary): Promise<Uint8Array> {
  if (work.thumbnail) return Promise.resolve(new Uint8Array(work.thumbnail));
  const key = `${work.id}:${work.updatedAt}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const task = queue.then(async () => {
    const drawing = await database.get(work.id);
    if (!drawing) throw Error("Obra não encontrada.");
    if (drawing.thumbnail) return new Uint8Array(drawing.thumbnail);
    const canvas = document.createElement("canvas");
    const engine = new CanvasBrushEngine(
      canvas,
      drawing.document.width,
      drawing.document.height,
    );
    try {
      engine.setDocument(drawing.document);
      const lines = new Image();
      lines.src = drawing.asset;
      await lines.decode();
      const blob = await engine.exportComposite(lines, "#ffffff");
      const bitmap = await createImageBitmap(blob);
      const thumb = document.createElement("canvas");
      thumb.width = 320;
      thumb.height = Math.round(
        (320 * drawing.document.height) / drawing.document.width,
      );
      thumb
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, thumb.width, thumb.height);
      bitmap.close();
      const png = await new Promise<Blob>((resolve, reject) =>
        thumb.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(Error("Não foi possível criar a miniatura.")),
          "image/png",
        ),
      );
      const bytes = new Uint8Array(await png.arrayBuffer());
      await database.setThumbnail(drawing.id, drawing.updatedAt, bytes);
      return bytes;
    } finally {
      engine.dispose();
    }
  });
  pending.set(key, task);
  queue = task.then(
    () => {},
    () => {},
  );
  void task.finally(() => pending.delete(key)).catch(() => {});
  return task;
}
