import { schema, migrations, SCHEMA_VERSION } from "./schema";
import { paths, stages } from "../game-content/index";
import { wardrobe } from "../core/wardrobe";
import { isArtworkAsset } from "../core/assets";
import {
  sanitizePlayer,
  toolUnlocks,
  materialUnlocks,
  getLevel,
} from "../core/index";
import type { Player } from "../core/index";
import { validateDocument } from "../drawing-engine/model";
import type { Drawing, DrawingSummary, Backup } from "../shared-types/index";
export interface SqlDb {
  exec(sql: string, bind?: unknown[]): Record<string, any>[];
}
export class Repository {
  constructor(private db: SqlDb) {
    db.exec("PRAGMA foreign_keys=ON");
    const hasVersion =
      db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
      ).length > 0;
    const version = hasVersion
      ? Number(
          db.exec("SELECT MAX(version) AS version FROM schema_migrations")[0]
            ?.version ?? 0,
        )
      : 0;
    if (version > SCHEMA_VERSION)
      throw Error("Banco criado por uma versão mais recente.");
    this.transaction(() => {
      db.exec(schema);
      for (let next = version + 1; next <= SCHEMA_VERSION; next++) {
        if (version > 0 && migrations[next]) db.exec(migrations[next]);
        db.exec("INSERT OR IGNORE INTO schema_migrations VALUES(?,?)", [
          next,
          new Date().toISOString(),
        ]);
      }
      for (const p of paths)
        db.exec("INSERT OR IGNORE INTO historical_paths VALUES(?,?)", [
          p.id,
          p.title,
        ]);
      for (const s of stages)
        db.exec("INSERT OR IGNORE INTO stages VALUES(?,?,?)", [
          s.id,
          s.pathId,
          s.title,
        ]);
      for (const item of wardrobe)
        db.exec("INSERT OR REPLACE INTO clothing VALUES(?,?)", [
          item.id,
          item.asset,
        ]);
    });
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* Preserve original error. */
      }
      throw e;
    }
  }
  player(): Player | null {
    const row = this.db.exec("SELECT data FROM profiles WHERE id=?", [
      "local-player",
    ])[0];
    return row ? sanitizePlayer(JSON.parse(row.data)) : null;
  }
  savePlayer(player: Player) {
    const p = sanitizePlayer(player);
    this.transaction(() => this.writePlayer(p));
  }
  private writePlayer(p: Player) {
    const run = (sql: string, args: unknown[] = []) => this.db.exec(sql, args);
    run(
      "INSERT INTO profiles VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      [p.id, JSON.stringify(p)],
    );
    run("INSERT OR REPLACE INTO characters VALUES(?,?)", [
      p.id,
      JSON.stringify({
        skin: p.skin,
        hair: p.hair,
        hairColor: p.hairColor,
        face: p.face,
        expression: p.expression,
        outfit: p.outfit,
        shoes: p.shoes,
        accessory: p.accessory,
      }),
    ]);
    const completedAt = new Map(
      run(
        "SELECT stage_id,completed_at FROM stage_progress WHERE profile_id=?",
        [p.id],
      ).map((row) => [row.stage_id, row.completed_at]),
    );
    for (const table of [
      "stage_progress",
      "inventory",
      "unlocked_tools",
      "materials",
      "achievements",
      "palettes",
      "equipment",
    ])
      run(`DELETE FROM ${table} WHERE profile_id=?`, [p.id]);
    for (const id of p.completed)
      run("INSERT INTO stage_progress VALUES(?,?,?)", [
        p.id,
        id,
        completedAt.get(id) ?? new Date().toISOString(),
      ]);
    for (const reward of p.rewards) {
      run("INSERT INTO inventory VALUES(?,?,?)", [
        p.id,
        reward,
        reward.split(":")[0],
      ]);
      if (reward.startsWith("achievement:"))
        run("INSERT INTO achievements VALUES(?,?)", [p.id, reward.slice(12)]);
    }
    for (const [tool, level] of Object.entries(toolUnlocks))
      if (getLevel(p.xp) >= level)
        run("INSERT INTO unlocked_tools VALUES(?,?)", [p.id, tool]);
    for (const [material, level] of Object.entries(materialUnlocks))
      if (getLevel(p.xp) >= level)
        run("INSERT INTO materials VALUES(?,?)", [p.id, material]);
    p.favorites.forEach((colors, index) =>
      run("INSERT INTO palettes VALUES(?,?,?)", [
        p.id,
        index,
        JSON.stringify(colors),
      ]),
    );
    for (const [slot, id] of Object.entries(p.equipped))
      run("INSERT INTO equipment VALUES(?,?,?)", [p.id, slot, id]);
    run("INSERT OR REPLACE INTO preferences VALUES(?,?)", [
      p.id,
      JSON.stringify(p.preferences),
    ]);
    run("INSERT OR REPLACE INTO experience VALUES(?,?,?)", [
      p.id,
      "total",
      p.xp,
    ]);
  }
  list(): DrawingSummary[] {
    return this.db
      .exec("SELECT * FROM drawings ORDER BY updated_at DESC")
      .map((row) => this.summary(row));
  }
  private summary(row: Record<string, any>): DrawingSummary {
    return {
      id: row.id,
      title: row.title,
      stageId: row.stage_id,
      kind: row.kind,
      subjectId: row.subject_id ?? undefined,
      asset: row.asset,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completed: Boolean(row.completed),
      thumbnail: row.thumbnail,
    };
  }
  get(id: string): Drawing | null {
    const row = this.db.exec("SELECT * FROM drawings WHERE id=?", [id])[0];
    if (!row) return null;
    const records = this.db.exec(
      "SELECT * FROM strokes WHERE drawing_id=? ORDER BY position",
      [id],
    );
    const convert = (r: Record<string, any>) => ({
      id: r.id,
      points: JSON.parse(r.points),
      settings: JSON.parse(r.settings),
      seed: r.seed,
      ...(r.layer_id !== "paint" ? { layerId: r.layer_id } : {}),
    });
    return {
      ...this.summary(row),
      document: validateDocument({
        version: 1,
        width: row.width,
        height: row.height,
        strokes: records.filter((r) => !r.undone).map(convert),
        redo: records.filter((r) => r.undone).map(convert),
      }),
    };
  }
  save(drawing: Drawing) {
    const safe = this.validateDrawing(drawing);
    this.transaction(() => this.writeDrawing(safe));
  }
  saveWithPlayer(drawing: Drawing, player: Player) {
    const safe = this.validateDrawing(drawing),
      profile = sanitizePlayer(player);
    this.transaction(() => {
      this.writePlayer(profile);
      this.writeDrawing(safe);
    });
  }
  private validateDrawing(d: Drawing): Drawing {
    if (
      !d ||
      typeof d.id !== "string" ||
      d.id.length > 100 ||
      !d.id ||
      typeof d.title !== "string" ||
      d.title.length > 160 ||
      !["scene", "clothing"].includes(d.kind) ||
      !isArtworkAsset(d.asset) ||
      typeof d.completed !== "boolean"
    )
      throw Error("Obra inválida.");
    if (d.stageId !== null && !stages.some((s) => s.id === d.stageId))
      throw Error("Fase desconhecida.");
    if (
      d.subjectId !== undefined &&
      (typeof d.subjectId !== "string" || d.subjectId.length > 100)
    )
      throw Error("Peça de roupa inválida.");
    if (
      typeof d.createdAt !== "string" ||
      typeof d.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(d.createdAt)) ||
      !Number.isFinite(Date.parse(d.updatedAt))
    )
      throw Error("Data inválida.");
    if (
      d.thumbnail != null &&
      (!(d.thumbnail instanceof Uint8Array) || d.thumbnail.length > 2000000)
    )
      throw Error("Miniatura inválida ou muito grande.");
    return {
      ...d,
      document: validateDocument(d.document),
      createdAt: new Date(d.createdAt).toISOString(),
      updatedAt: new Date(d.updatedAt).toISOString(),
    };
  }
  private writeDrawing(d: Drawing) {
    const current = this.db.exec("SELECT thumbnail FROM drawings WHERE id=?", [
      d.id,
    ])[0];
    this.db.exec(
      `INSERT INTO drawings VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,stage_id=excluded.stage_id,kind=excluded.kind,subject_id=excluded.subject_id,asset=excluded.asset,width=excluded.width,height=excluded.height,created_at=excluded.created_at,updated_at=excluded.updated_at,completed=excluded.completed,thumbnail=excluded.thumbnail`,
      [
        d.id,
        "local-player",
        d.title,
        d.stageId,
        d.kind,
        d.subjectId ?? null,
        d.asset,
        d.document.width,
        d.document.height,
        d.createdAt,
        d.updatedAt,
        d.completed ? 1 : 0,
        d.thumbnail === undefined ? (current?.thumbnail ?? null) : d.thumbnail,
      ],
    );
    const existing = new Set(
      this.db
        .exec("SELECT id FROM strokes WHERE drawing_id=?", [d.id])
        .map((r) => r.id),
    );
    const entries = [
      ...d.document.strokes.map((s) => ({ ...s, undone: 0 })),
      ...d.document.redo.map((s) => ({ ...s, undone: 1 })),
    ];
    for (const id of new Set([
      "paint",
      ...entries.map((s) => s.layerId ?? "paint"),
    ]))
      this.db.exec("INSERT OR IGNORE INTO layers VALUES(?,?,?,?)", [
        id,
        d.id,
        1,
        id === "paint" ? "Pintura" : id,
      ]);
    // Autosaves can extend an active stroke with the same ID. Update its payload too.
    entries.forEach((s, i) => {
      this.db.exec(
        `INSERT INTO strokes VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(drawing_id,id) DO UPDATE SET position=excluded.position,settings=excluded.settings,points=excluded.points,seed=excluded.seed,layer_id=excluded.layer_id,undone=excluded.undone WHERE position<>excluded.position OR settings<>excluded.settings OR points<>excluded.points OR seed<>excluded.seed OR layer_id<>excluded.layer_id OR undone<>excluded.undone`,
        [
          d.id,
          s.id,
          i,
          JSON.stringify(s.settings),
          JSON.stringify(s.points),
          s.seed,
          s.layerId ?? "paint",
          s.undone,
        ],
      );
      existing.delete(s.id);
    });
    for (const id of existing)
      this.db.exec("DELETE FROM strokes WHERE drawing_id=? AND id=?", [
        d.id,
        id,
      ]);
  }
  setThumbnail(id: string, updatedAt: string, bytes: Uint8Array) {
    if (
      !(bytes instanceof Uint8Array) ||
      !bytes.length ||
      bytes.length > 2000000
    )
      throw Error("Miniatura inválida ou muito grande.");
    // A preview rendered asynchronously must never replace newer editable strokes.
    this.transaction(() =>
      this.db.exec(
        "UPDATE drawings SET thumbnail=? WHERE id=? AND updated_at=?",
        [bytes, id, updatedAt],
      ),
    );
  }
  remove(id: string) {
    this.transaction(() =>
      this.db.exec("DELETE FROM drawings WHERE id=?", [id]),
    );
  }
  legacy(records?: Record<string, string>) {
    if (records)
      this.transaction(() => {
        for (const [key, value] of Object.entries(records))
          if (
            key.startsWith("colore-") &&
            typeof value === "string" &&
            value.length < 10000000
          )
            this.db.exec("INSERT OR IGNORE INTO legacy_backups VALUES(?,?,?)", [
              key,
              value,
              new Date().toISOString(),
            ]);
      });
    return Object.fromEntries(
      this.db
        .exec("SELECT key,data FROM legacy_backups")
        .map((r) => [r.key, r.data]),
    );
  }
  backup(): Backup {
    const player = this.player();
    if (!player) throw Error("Crie um perfil antes de exportar o backup.");
    return {
      format: "colore-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      player,
      drawings: this.list().map((d) => ({
        ...this.get(d.id)!,
        thumbnail: null,
      })),
      legacy: this.legacy(),
    };
  }
  restore(raw: Backup) {
    if (
      raw?.format !== "colore-backup" ||
      raw.version !== 1 ||
      !Array.isArray(raw.drawings) ||
      raw.drawings.length > 2000 ||
      !raw.player ||
      typeof raw.player !== "object" ||
      typeof raw.player.name !== "string" ||
      !Number.isFinite(raw.player.xp) ||
      raw.player.xp < 0 ||
      !Array.isArray(raw.player.completed) ||
      !Array.isArray(raw.player.rewards) ||
      !Array.isArray(raw.player.favorites)
    )
      throw Error("Backup incompatível.");
    const player = sanitizePlayer(raw.player),
      drawings = raw.drawings.map((d) => this.validateDrawing(d));
    if (new Set(drawings.map((d) => d.id)).size !== drawings.length)
      throw Error("Backup contém obras duplicadas.");
    const legacy = raw.legacy ?? {};
    if (
      typeof legacy !== "object" ||
      Array.isArray(legacy) ||
      Object.entries(legacy).some(
        ([key, value]) =>
          !key.startsWith("colore-") ||
          typeof value !== "string" ||
          value.length >= 10000000,
      )
    )
      throw Error("Backup antigo inválido.");
    this.transaction(() => {
      this.writePlayer(player);
      for (const d of drawings) {
        this.db.exec("DELETE FROM drawings WHERE id=?", [d.id]);
        this.writeDrawing(d);
      }
      for (const [key, value] of Object.entries(legacy))
        this.db.exec("INSERT OR IGNORE INTO legacy_backups VALUES(?,?,?)", [
          key,
          value,
          new Date().toISOString(),
        ]);
    });
  }
}
