const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

let db = null;
let dbPath = null;

function ensureReady() {
  if (!db || !dbPath) {
    throw new Error('SQLite store has not been initialized.');
  }
}

function persist() {
  ensureReady();
  const data = db.export();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(data));
}

async function initStore(userDataPath) {
  const wasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'));
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(wasmDir, file),
  });

  dbPath = path.join(userDataPath, 'smartdesk.sqlite');
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS app_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS storage_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  db.run(`
    INSERT OR REPLACE INTO storage_meta (key, value)
    VALUES ('schema_version', '1');
  `);

  persist();
  return dbPath;
}

function getItem(key) {
  ensureReady();
  const statement = db.prepare('SELECT value FROM app_kv WHERE key = ?');
  statement.bind([key]);
  const row = statement.step() ? statement.getAsObject() : null;
  statement.free();
  return row ? row.value : null;
}

function setItem(key, value) {
  ensureReady();
  db.run(
    `INSERT INTO app_kv (key, value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = CURRENT_TIMESTAMP`,
    [key, String(value)]
  );
  persist();
}

function removeItem(key) {
  ensureReady();
  db.run('DELETE FROM app_kv WHERE key = ?', [key]);
  persist();
}

function clear() {
  ensureReady();
  db.run('DELETE FROM app_kv');
  persist();
}

function getDatabasePath() {
  ensureReady();
  return dbPath;
}

module.exports = {
  initStore,
  getItem,
  setItem,
  removeItem,
  clear,
  getDatabasePath,
};
