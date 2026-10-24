import test from "node:test";
import assert from "node:assert/strict";
import { zoomAt, clampPan } from "./viewport";
test("zoom mantém a posição da arte sob o gesto em diferentes escalas e focos", () => {
  const center = { x: 400, y: 250 };
  for (const focal of [
    { x: 100, y: 100 },
    { x: 400, y: 250 },
    { x: 700, y: 400 },
  ])
    for (const from of [1, 2, 4])
      for (const to of [1, 1.5, 3, 5]) {
        const previous = { x: 40, y: -25 },
          next = zoomAt(focal, center, previous, from, to);
        const before = {
          x: (focal.x - center.x - previous.x) / from,
          y: (focal.y - center.y - previous.y) / from,
        };
        const after = {
          x: (focal.x - center.x - next.x) / to,
          y: (focal.y - center.y - next.y) / to,
        };
        assert(Math.abs(before.x - after.x) < 1e-8);
        assert(Math.abs(before.y - after.y) < 1e-8);
      }
});
test("deslocamento não permite perder o papel e retorna à origem em 100%", () => {
  assert.deepEqual(clampPan({ x: 900, y: -900 }, 1, 800, 500), { x: 0, y: 0 });
  assert.deepEqual(clampPan({ x: 900, y: -900 }, 2, 800, 500), {
    x: 400,
    y: -250,
  });
});
