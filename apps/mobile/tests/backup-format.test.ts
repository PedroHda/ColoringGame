import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDocument,
  getDefaultBrushSettings,
} from "../../../packages/drawing-engine/model";
import { initialPlayer } from "../../../packages/core";
import { createSharedBackup, parseSharedBackup } from "../src/backup-format";
import type { Painting } from "../src/storage";
function fixture(): Painting {
  const document = createDocument(2048, 1280);
  document.strokes.push({
    id: "ink-1",
    seed: 42,
    settings: getDefaultBrushSettings(),
    points: [
      { x: 30, y: 40, pressure: 0.8 },
      { x: 60, y: 90, pressure: 0.5 },
    ],
  });
  return {
    id: "painting-1",
    title: "Minha memória",
    stageId: "p01-s01",
    base: "/illustrations/p01-s01.png",
    created: "2026-10-23T12:00:00Z",
    updated: "2026-10-23T12:05:00Z",
    completed: true,
    document,
  };
}
test("o backup mobile usa o contrato web e preserva traços e cópias antigas no roundtrip", () => {
  const painting = fixture(),
    backup = createSharedBackup(initialPlayer("Lia"), [painting], {
      "colore-history-v1": '{"version":1}',
    });
  assert.equal(backup.format, "colore-backup");
  assert.equal(backup.drawings[0].asset, painting.base);
  assert.equal(backup.drawings[0].kind, "scene");
  const loaded = parseSharedBackup(JSON.stringify(backup));
  assert.deepEqual(loaded.paintings, [painting]);
  assert.equal(loaded.player.name, "Lia");
  assert.deepEqual(loaded.legacy, { "colore-history-v1": '{"version":1}' });
});
test("roupa compartilhada mantém o slot e o desenho editável", () => {
  const painting = fixture();
  painting.base = "/clothing/shirt.svg";
  painting.stageId = null;
  const player = initialPlayer();
  player.equipped.shirt = painting.id;
  const backup = createSharedBackup(player, [painting]);
  assert.equal(backup.drawings[0].subjectId, "shirt");
  assert.equal(backup.drawings[0].kind, "clothing");
  assert.equal(
    parseSharedBackup(JSON.stringify(backup)).player.equipped.shirt,
    painting.id,
  );
});
test("duas obras independentes podem preservar o mesmo ID local de traço", () => {
  const first = fixture(),
    second = fixture();
  second.id = "painting-2";
  const backup = createSharedBackup(initialPlayer(), [first, second]);
  const loaded = parseSharedBackup(JSON.stringify(backup));
  assert.equal(loaded.paintings.length, 2);
  assert.equal(
    loaded.paintings[0].document.strokes[0].id,
    loaded.paintings[1].document.strokes[0].id,
  );
});
test("acessórios históricos preservam o encaixe do avatar no backup para a web", () => {
  const painting = fixture();
  painting.base = "/clothing/explorer-hat.svg";
  painting.stageId = null;
  const backup = createSharedBackup(initialPlayer(), [painting]);
  assert.equal(backup.drawings[0].subjectId, "hat");
  assert.equal(
    parseSharedBackup(JSON.stringify(backup)).paintings[0].base,
    painting.base,
  );
});
test("backup com caminhos externos, traços corrompidos ou IDs duplicados é rejeitado antes da transação", () => {
  const badAsset = createSharedBackup(initialPlayer(), [fixture()]);
  badAsset.drawings[0].asset = "https://example.invalid/painting.png";
  assert.throws(
    () => parseSharedBackup(JSON.stringify(badAsset)),
    /Obra inválida/,
  );
  const badStroke = createSharedBackup(initialPlayer(), [fixture()]);
  badStroke.drawings[0].document.strokes[0].settings.opacity = 7;
  assert.throws(
    () => parseSharedBackup(JSON.stringify(badStroke)),
    /opacidade|opacity|Configuração/i,
  );
  const repeated = createSharedBackup(initialPlayer(), [fixture(), fixture()]);
  assert.throws(
    () => parseSharedBackup(JSON.stringify(repeated)),
    /duplicados/,
  );
});
