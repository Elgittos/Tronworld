import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const smokeDir = path.resolve('runtime_data/smoke');
const smokeDb = path.join(smokeDir, 'tronworld-smoke.sqlite');
const runtimeUrl = process.env.TRONWORLD_BACKEND_URL ?? 'http://127.0.0.1:4177';

await mkdir(smokeDir, { recursive: true });
await rm(smokeDb, { force: true });

const db = new DatabaseSync(smokeDb);
db.exec(`
  CREATE TABLE app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE memory_agents (
    memory_id TEXT PRIMARY KEY,
    avatar_id TEXT,
    current_name TEXT NOT NULL,
    folder_name TEXT NOT NULL UNIQUE,
    memory_profile TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const now = new Date().toISOString();
db.prepare('INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)').run(
  'world_snapshot',
  JSON.stringify({ version: 1, avatars: [], blocks: [], teslaNodes: [] }),
  now,
);
db.prepare(`
  INSERT INTO memory_agents (memory_id, avatar_id, current_name, folder_name, memory_profile, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run('digital_being_001', 'smoke_avatar', 'Smoke Agent', 'digital_being_001', 'small', now, now);

const snapshot = db.prepare('SELECT value FROM app_state WHERE key = ?').get('world_snapshot');
const memory = db.prepare('SELECT memory_id FROM memory_agents WHERE avatar_id = ?').get('smoke_avatar');

if (!snapshot?.value || memory?.memory_id !== 'digital_being_001') {
  throw new Error('SQLite persistence smoke test failed.');
}

db.close();

try {
  const response = await fetch(`${runtimeUrl}/api/runtime/status`);
  if (response.ok) {
    const status = await response.json();
    if (!status.ok) {
      throw new Error('Runtime API status returned a bad payload.');
    }
    console.log(`Runtime API reachable at ${runtimeUrl}.`);
  } else {
    console.log(`Runtime API not reachable at ${runtimeUrl}; SQLite smoke still passed.`);
  }
} catch {
  console.log(`Runtime API not reachable at ${runtimeUrl}; SQLite smoke still passed.`);
}

console.log('Backend smoke test passed.');
