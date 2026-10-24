export const SCHEMA_VERSION = 2;
export const schema = `
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS characters(profile_id TEXT PRIMARY KEY REFERENCES profiles(id),appearance TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS historical_paths(id TEXT PRIMARY KEY,title TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stages(id TEXT PRIMARY KEY,path_id TEXT NOT NULL REFERENCES historical_paths(id),title TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stage_progress(profile_id TEXT REFERENCES profiles(id),stage_id TEXT REFERENCES stages(id),completed_at TEXT,PRIMARY KEY(profile_id,stage_id));
CREATE TABLE IF NOT EXISTS inventory(profile_id TEXT REFERENCES profiles(id),item_id TEXT,kind TEXT,PRIMARY KEY(profile_id,item_id));
CREATE TABLE IF NOT EXISTS unlocked_tools(profile_id TEXT REFERENCES profiles(id),tool_id TEXT,PRIMARY KEY(profile_id,tool_id));
CREATE TABLE IF NOT EXISTS materials(profile_id TEXT REFERENCES profiles(id),material_id TEXT,PRIMARY KEY(profile_id,material_id));
CREATE TABLE IF NOT EXISTS achievements(profile_id TEXT REFERENCES profiles(id),achievement_id TEXT,PRIMARY KEY(profile_id,achievement_id));
CREATE TABLE IF NOT EXISTS experience(profile_id TEXT REFERENCES profiles(id),event_id TEXT,amount INTEGER,PRIMARY KEY(profile_id,event_id));
CREATE TABLE IF NOT EXISTS palettes(profile_id TEXT REFERENCES profiles(id),position INTEGER,colors TEXT,PRIMARY KEY(profile_id,position));
CREATE TABLE IF NOT EXISTS preferences(profile_id TEXT PRIMARY KEY REFERENCES profiles(id),data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS clothing(id TEXT PRIMARY KEY,asset TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS equipment(profile_id TEXT REFERENCES profiles(id),slot TEXT,drawing_id TEXT,PRIMARY KEY(profile_id,slot));
CREATE TABLE IF NOT EXISTS drawings(id TEXT PRIMARY KEY,profile_id TEXT NOT NULL REFERENCES profiles(id),title TEXT NOT NULL,stage_id TEXT REFERENCES stages(id),kind TEXT NOT NULL,subject_id TEXT,asset TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0,thumbnail BLOB);
CREATE TABLE IF NOT EXISTS layers(id TEXT, drawing_id TEXT REFERENCES drawings(id) ON DELETE CASCADE,position INTEGER,name TEXT,PRIMARY KEY(drawing_id,id));
CREATE TABLE IF NOT EXISTS strokes(drawing_id TEXT NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,id TEXT NOT NULL,position INTEGER NOT NULL CHECK(position>=0),settings TEXT NOT NULL,points TEXT NOT NULL,seed INTEGER NOT NULL,layer_id TEXT NOT NULL DEFAULT 'paint',undone INTEGER NOT NULL DEFAULT 0 CHECK(undone IN(0,1)),PRIMARY KEY(drawing_id,id),FOREIGN KEY(drawing_id,layer_id) REFERENCES layers(drawing_id,id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS strokes_order ON strokes(drawing_id,position);
CREATE INDEX IF NOT EXISTS drawings_updated ON drawings(updated_at DESC);
CREATE TABLE IF NOT EXISTS legacy_backups(key TEXT PRIMARY KEY,data TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
`;

/** V1 could save a layer ID without a parent; preserve it before adding its FK. */
export const migrations: Record<number, string> = {
  2: `
    INSERT OR IGNORE INTO layers(id,drawing_id,position,name)
      SELECT DISTINCT layer_id,drawing_id,1,'Pintura restaurada' FROM strokes;
    CREATE TABLE strokes_v2(
      drawing_id TEXT NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,
      id TEXT NOT NULL,position INTEGER NOT NULL CHECK(position>=0),
      settings TEXT NOT NULL,points TEXT NOT NULL,seed INTEGER NOT NULL,
      layer_id TEXT NOT NULL DEFAULT 'paint',undone INTEGER NOT NULL DEFAULT 0 CHECK(undone IN(0,1)),
      PRIMARY KEY(drawing_id,id),
      FOREIGN KEY(drawing_id,layer_id) REFERENCES layers(drawing_id,id) ON DELETE CASCADE
    );
    INSERT INTO strokes_v2 SELECT drawing_id,id,position,settings,points,seed,layer_id,undone FROM strokes;
    DROP TABLE strokes;
    ALTER TABLE strokes_v2 RENAME TO strokes;
    CREATE INDEX strokes_order ON strokes(drawing_id,position);
  `,
};
