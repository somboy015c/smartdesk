const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqliteStore = require('../electron/sqlite-store');

async function run() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartdesk-sqlite-test-'));
  const dbPath = await sqliteStore.initStore(tmpDir);

  assert.strictEqual(path.basename(dbPath), 'smartdesk.sqlite');
  assert.ok(fs.existsSync(dbPath), 'SQLite database file should be created');

  sqliteStore.setItem('smart_desk_data_v11', JSON.stringify({ ok: true }));
  assert.deepStrictEqual(JSON.parse(sqliteStore.getItem('smart_desk_data_v11')), { ok: true });

  sqliteStore.removeItem('smart_desk_data_v11');
  assert.strictEqual(sqliteStore.getItem('smart_desk_data_v11'), null);

  sqliteStore.setItem('smart_desk_users_v1', JSON.stringify({ lgi: { username: 'lgi' } }));
  sqliteStore.clear();
  assert.strictEqual(sqliteStore.getItem('smart_desk_users_v1'), null);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('SQLite store test passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
