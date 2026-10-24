/** Native SQLite migrations; pure SQL, tested without requiring the Android runtime. */
export const NATIVE_SCHEMA_VERSION = 3;
export const initialNativeSchema = `
  CREATE TABLE profiles (id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL);
  CREATE TABLE paintings (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, stage_id TEXT, base TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, updated TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL);
  CREATE TABLE layers (id TEXT PRIMARY KEY NOT NULL, painting_id TEXT NOT NULL REFERENCES paintings(id) ON DELETE CASCADE, name TEXT NOT NULL, position INTEGER NOT NULL);
  CREATE TABLE strokes (id TEXT PRIMARY KEY NOT NULL, painting_id TEXT NOT NULL REFERENCES paintings(id) ON DELETE CASCADE, position INTEGER NOT NULL, undone INTEGER NOT NULL, json TEXT NOT NULL);
  CREATE INDEX strokes_painting ON strokes(painting_id,undone,position);
  CREATE TABLE stage_progress (stage_id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL REFERENCES profiles(id), completed_at TEXT NOT NULL);
  CREATE TABLE inventory (id TEXT NOT NULL, profile_id TEXT NOT NULL REFERENCES profiles(id), PRIMARY KEY(id,profile_id));
  CREATE TABLE palettes (id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL REFERENCES profiles(id), colors TEXT NOT NULL);
  CREATE TABLE migration_log (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
  INSERT INTO migration_log VALUES (1,datetime('now'));
  PRAGMA user_version=1;
`;
export const nativeMigration2 = `
  CREATE TABLE IF NOT EXISTS legacy_snapshots (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL);
  INSERT OR IGNORE INTO migration_log VALUES (2,datetime('now'));
  PRAGMA user_version=2;
`;
export const nativeMigration3 = `
  DROP INDEX IF EXISTS strokes_painting;
  ALTER TABLE strokes RENAME TO strokes_previous;
  CREATE TABLE strokes (id TEXT NOT NULL, painting_id TEXT NOT NULL REFERENCES paintings(id) ON DELETE CASCADE, position INTEGER NOT NULL, undone INTEGER NOT NULL, json TEXT NOT NULL, PRIMARY KEY(painting_id,id));
  INSERT INTO strokes SELECT id,painting_id,position,undone,json FROM strokes_previous;
  DROP TABLE strokes_previous;
  CREATE INDEX strokes_painting ON strokes(painting_id,undone,position);
  INSERT OR IGNORE INTO migration_log VALUES (3,datetime('now'));
  PRAGMA user_version=3;
`;
