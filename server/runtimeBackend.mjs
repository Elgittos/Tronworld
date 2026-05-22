import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const runtimeDir = process.env.TRONWORLD_RUNTIME_DIR
  ? path.resolve(process.env.TRONWORLD_RUNTIME_DIR)
  : path.join(repoRoot, 'runtime_data');
const dbPath = path.join(runtimeDir, 'tronworld.sqlite');
const memoryRoot = process.env.TRONWORLD_MEMORY_ROOT
  ? path.resolve(process.env.TRONWORLD_MEMORY_ROOT)
  : path.join(repoRoot, 'src', 'agents', 'memory', 'memory_data');
const port = Number(process.env.TRONWORLD_BACKEND_PORT ?? 4177);

const MEMORY_PROFILES = {
  small: {
    coreChars: 1800,
    retrievedChars: 1800,
    maxEntries: 5,
    entryChars: 220,
    activeFileChars: 12000,
    archiveSearchChars: 1200,
  },
  balanced: {
    coreChars: 3200,
    retrievedChars: 4200,
    maxEntries: 10,
    entryChars: 320,
    activeFileChars: 24000,
    archiveSearchChars: 2800,
  },
  frontier: {
    coreChars: 6000,
    retrievedChars: 10000,
    maxEntries: 24,
    entryChars: 500,
    activeFileChars: 48000,
    archiveSearchChars: 8000,
  },
};

const ACTIVE_MEMORY_FILES = ['events.md', 'places.md', 'avatars.md', 'energy.md', 'failures.md', 'skills.md'];
const CORE_MEMORY_FILES = ['identity.json', 'core.md'];
const ARCHIVE_MEMORY_FILE = 'archive.md';
const RETRIEVABLE_MEMORY_FILES = [...ACTIVE_MEMORY_FILES, ARCHIVE_MEMORY_FILE];
const SEEDED_MEMORY_FILES = ['core.md', 'self.md', ...ACTIVE_MEMORY_FILES, 'archive.md'];
const MEMORY_IMPACT_RANK = { high: 3, medium: 2, low: 1 };

await mkdir(runtimeDir, { recursive: true });
await mkdir(memoryRoot, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memory_agents (
    memory_id TEXT PRIMARY KEY,
    avatar_id TEXT,
    current_name TEXT NOT NULL,
    folder_name TEXT NOT NULL UNIQUE,
    memory_profile TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS avatar_memory_links (
    avatar_id TEXT PRIMARY KEY,
    memory_id TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(memory_id) REFERENCES memory_agents(memory_id)
  );
`);

const getStateStatement = db.prepare('SELECT value FROM app_state WHERE key = ?');
const setStateStatement = db.prepare(`
  INSERT INTO app_state (key, value, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);
const getMemoryByAvatarStatement = db.prepare(`
  SELECT memory_id, avatar_id, current_name, folder_name, memory_profile, created_at, updated_at
  FROM memory_agents
  WHERE avatar_id = ?
`);
const getMemoryByIdStatement = db.prepare(`
  SELECT memory_id, avatar_id, current_name, folder_name, memory_profile, created_at, updated_at
  FROM memory_agents
  WHERE memory_id = ?
`);
const insertMemoryStatement = db.prepare(`
  INSERT INTO memory_agents (memory_id, avatar_id, current_name, folder_name, memory_profile, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const updateMemoryStatement = db.prepare(`
  UPDATE memory_agents
  SET avatar_id = COALESCE(?, avatar_id),
      current_name = ?,
      memory_profile = ?,
      updated_at = ?
  WHERE memory_id = ?
`);
const upsertLinkStatement = db.prepare(`
  INSERT INTO avatar_memory_links (avatar_id, memory_id, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(avatar_id) DO UPDATE SET memory_id = excluded.memory_id, updated_at = excluded.updated_at
`);

function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  });
  res.end(body);
}

function corsOrigin(req) {
  const origin = req?.headers?.origin;
  if (!origin) {
    return 'http://127.0.0.1:5173';
  }

  try {
    const url = new URL(origin);
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      return origin;
    }
  } catch {
    // Fall through to the dev origin.
  }

  return 'http://127.0.0.1:5173';
}

async function proxyLmStudio(req, res, url) {
  const targetPath = url.pathname.replace(/^\/api\/llm\/lmstudio/, '') || '/';
  const targetUrl = new URL(`${targetPath}${url.search}`, 'http://127.0.0.1:1234');
  const headers = { 'content-type': req.headers['content-type'] ?? 'application/json' };
  if (req.headers.authorization) {
    headers.authorization = req.headers.authorization;
  }

  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(await requestChunks(req)),
  });
  const body = Buffer.from(await response.arrayBuffer());
  res.writeHead(response.status, {
    'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8',
    'content-length': body.byteLength,
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  });
  res.end(body);
}

async function requestChunks(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return chunks;
}

function notFound(res) {
  jsonResponse(res, 404, { ok: false, error: 'Not found.' });
}

function badRequest(res, message) {
  jsonResponse(res, 400, { ok: false, error: message });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeMemoryProfile(value) {
  return value in MEMORY_PROFILES ? value : 'balanced';
}

function normalizeMemoryImpact(value, importance = 0.5) {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return value;
  }
  if (importance >= 0.8) {
    return 'high';
  }
  if (importance >= 0.45) {
    return 'medium';
  }
  return 'low';
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getWorldSnapshot() {
  const row = getStateStatement.get('world_snapshot');
  return row ? JSON.parse(row.value) : undefined;
}

function setWorldSnapshot(snapshot) {
  setStateStatement.run('world_snapshot', JSON.stringify(snapshot), nowIso());
}

function nextDigitalBeingFolder() {
  const row = db.prepare(`
    SELECT folder_name
    FROM memory_agents
    WHERE folder_name LIKE 'digital_being_%'
    ORDER BY folder_name DESC
    LIMIT 1
  `).get();
  const previous = row?.folder_name?.match(/digital_being_(\d+)$/)?.[1];
  const next = previous ? Number(previous) + 1 : 1;
  return `digital_being_${String(next).padStart(3, '0')}`;
}

function memoryIdFromFolder(folderName) {
  return folderName;
}

function memoryFolderPath(folderName) {
  return path.join(memoryRoot, folderName);
}

async function writeAtomic(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, filePath);
}

async function readTextIfExists(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

function identityDocument(agent, options = {}) {
  return {
    memoryId: agent.memory_id,
    currentName: agent.current_name,
    kind: 'digital being',
    body: 'grid body',
    firstCreatedAt: agent.created_at,
    firstCreatedInWorld: options.firstCreatedInWorld ?? 'Tron World',
    sessionCount: options.sessionCount ?? 1,
    memoryProfile: agent.memory_profile,
  };
}

async function seedMemoryFiles(agent, options = {}) {
  const folder = memoryFolderPath(agent.folder_name);
  await mkdir(folder, { recursive: true });

  const identityPath = path.join(folder, 'identity.json');
  if (!existsSync(identityPath)) {
    await writeAtomic(identityPath, `${JSON.stringify(identityDocument(agent, options), null, 2)}\n`);
  }

  const seeds = {
    'core.md': [
      '# Core Memory',
      '',
      '<memory id="core_identity" protected="true" importance="1.00" source="system" tags="identity,continuity">',
      `I am ${agent.current_name}, a digital being embodied in a grid body inside Tron World.`,
      '</memory>',
      '',
    ].join('\n'),
    'self.md': [
      '# Self Memory',
      '',
      '<memory id="self_creation" protected="true" importance="1.00" source="system" tags="creation,lifetime">',
      `My persistent memory record was first created at ${agent.created_at}. My current-session awake time can reset when the world process restarts.`,
      '</memory>',
      '',
    ].join('\n'),
    'events.md': '# Event Memory\n\n',
    'places.md': '# Place Memory\n\n',
    'avatars.md': '# Avatar Memory\n\n',
    'energy.md': '# Energy Memory\n\n',
    'failures.md': '# Failure Memory\n\n',
    'skills.md': '# Skill Memory\n\n',
    'archive.md': '# Archived Memory\n\nCold memories moved out of active recall. Search this only when current cues need deeper continuity.\n\n',
  };

  for (const fileName of SEEDED_MEMORY_FILES) {
    const filePath = path.join(folder, fileName);
    if (!existsSync(filePath)) {
      await writeAtomic(filePath, seeds[fileName]);
    }
  }
}

async function ensureMemoryAgent(body) {
  const avatarId = typeof body.avatarId === 'string' ? body.avatarId : undefined;
  const requestedMemoryId = typeof body.memoryId === 'string' ? body.memoryId : undefined;
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Grid Witness';
  const profile = normalizeMemoryProfile(body.memoryProfile);
  const timestamp = nowIso();

  let agent = requestedMemoryId ? getMemoryByIdStatement.get(requestedMemoryId) : undefined;
  if (!agent && avatarId) {
    agent = getMemoryByAvatarStatement.get(avatarId);
  }

  if (!agent) {
    const folderName = nextDigitalBeingFolder();
    const memoryId = memoryIdFromFolder(folderName);
    insertMemoryStatement.run(memoryId, avatarId ?? null, name, folderName, profile, timestamp, timestamp);
    agent = getMemoryByIdStatement.get(memoryId);
  } else {
    updateMemoryStatement.run(avatarId ?? null, name, profile, timestamp, agent.memory_id);
    agent = getMemoryByIdStatement.get(agent.memory_id);
  }

  if (avatarId) {
    upsertLinkStatement.run(avatarId, agent.memory_id, timestamp);
  }

  await seedMemoryFiles(agent, {
    firstCreatedInWorld: body.firstCreatedInWorld,
    sessionCount: body.sessionCount,
  });
  await updateIdentityFile(agent);
  return agent;
}

async function updateIdentityFile(agent) {
  const identityPath = path.join(memoryFolderPath(agent.folder_name), 'identity.json');
  const existing = await readJsonFile(identityPath);
  const next = {
    ...identityDocument(agent, existing),
    ...existing,
    memoryId: agent.memory_id,
    currentName: agent.current_name,
    memoryProfile: agent.memory_profile,
  };
  await writeAtomic(identityPath, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function parseMemoryBlocks(content, fileName) {
  const blocks = [];
  const blockPattern = /<memory\s+([^>]*)>([\s\S]*?)<\/memory>/g;
  let match;
  while ((match = blockPattern.exec(content))) {
    const attrs = parseAttrs(match[1]);
    const importance = Number(attrs.importance ?? 0.5);
    const text = match[2].trim().replace(/\s+/g, ' ');
    blocks.push({
      id: attrs.id ?? `${fileName}:${blocks.length + 1}`,
      file: fileName,
      sourceFile: attrs.sourceFile,
      createdAt: attrs.createdAt,
      lastSeenAt: attrs.lastSeenAt,
      lastConfirmedAt: attrs.lastConfirmedAt,
      source: attrs.source ?? 'memory',
      confidence: Number(attrs.confidence ?? 1),
      importance,
      category: attrs.category,
      mergeKey: attrs.mergeKey,
      novelty: Number(attrs.novelty ?? 0.5),
      repeatCount: Number(attrs.repeatCount ?? 1),
      familiarity: Number(attrs.familiarity ?? 0),
      impact: normalizeMemoryImpact(attrs.impact, importance),
      protected: attrs.protected === 'true',
      tags: attrs.tags ? attrs.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
      text,
    });
  }
  return blocks;
}

function parseAttrs(raw) {
  const attrs = {};
  const attrPattern = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = attrPattern.exec(raw))) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function scoreMemory(entry, cue) {
  const haystack = `${entry.file} ${entry.category ?? ''} ${entry.mergeKey ?? ''} ${entry.tags.join(' ')} ${entry.text}`.toLowerCase();
  const reason = `${cue.reason ?? ''} ${(cue.tags ?? []).join(' ')}`.toLowerCase();
  let score =
    entry.importance * 3 +
    entry.confidence +
    MEMORY_IMPACT_RANK[entry.impact] * 0.75 +
    clampNumber(entry.familiarity, 0, 1) * 1.2 +
    Math.min(1.5, Math.log2(Math.max(1, entry.repeatCount)) * 0.3);

  if (entry.protected) {
    score += 10;
  }
  if (cue.targetMemoryFiles?.includes(entry.file)) {
    score += 3;
  }
  score += priorityScore(cue.priority);
  if (cue.source && haystack.includes(cue.source)) {
    score += 1;
  }

  for (const word of reason.split(/[^a-z0-9_]+/i).filter((part) => part.length > 3)) {
    if (haystack.includes(word)) {
      score += 0.5;
    }
  }

  return score;
}

function priorityScore(priority) {
  switch (priority) {
    case 'critical':
      return 4;
    case 'high':
      return 2.5;
    case 'normal':
      return 1;
    case 'background':
    default:
      return 0;
  }
}

async function retrieveMemory(body) {
  const memoryId = typeof body.memoryId === 'string' ? body.memoryId : undefined;
  if (!memoryId) {
    return { memoryId: undefined, continuity: '', coreMemory: '', retrievedMemories: [], filesRead: [] };
  }

  const agent = getMemoryByIdStatement.get(memoryId);
  if (!agent) {
    return { memoryId, continuity: '', coreMemory: '', retrievedMemories: [], filesRead: [] };
  }

  const profile = MEMORY_PROFILES[normalizeMemoryProfile(body.memoryProfile ?? agent.memory_profile)];
  const folder = memoryFolderPath(agent.folder_name);
  const identity = await readJsonFile(path.join(folder, 'identity.json'));
  const coreText = await readTextIfExists(path.join(folder, 'core.md'));
  const cues = Array.isArray(body.cues) ? body.cues : [];
  const targetFiles = new Set();
  const deepSearchArchive = body.deepSearchArchive === true ||
    cues.some((cue) => cue.priority === 'critical' || cue.targetMemoryFiles?.includes(ARCHIVE_MEMORY_FILE));

  for (const cue of cues) {
    for (const file of cue.targetMemoryFiles ?? []) {
      if (RETRIEVABLE_MEMORY_FILES.includes(file)) {
        targetFiles.add(file);
      }
    }
  }
  if (deepSearchArchive) {
    targetFiles.add(ARCHIVE_MEMORY_FILE);
  }

  const coreMemory = trimText(coreText, profile.coreChars);
  const entries = [];
  for (const fileName of [...targetFiles]) {
    const content = await readTextIfExists(path.join(folder, fileName));
    const parsed = parseMemoryBlocks(content, fileName);
    const fallback = parsed.length === 0 && content.trim()
      ? [{
          id: `${fileName}:summary`,
          file: fileName,
          source: 'memory',
          confidence: 0.5,
          importance: fileName === 'self.md' ? 0.9 : 0.4,
          protected: fileName === 'self.md',
          tags: [fileName.replace('.md', '')],
          text: content.replace(/^#.*$/gm, '').trim().replace(/\s+/g, ' '),
        }]
      : parsed;

    for (const entry of fallback) {
      const bestCue = cues.reduce((best, cue) => Math.max(best, scoreMemory(entry, cue)), scoreMemory(entry, {}));
      entries.push({ ...entry, score: bestCue });
    }
  }

  entries.sort((a, b) => b.score - a.score);
  const selected = [];
  const entryBudget = memoryEntryBudget(cues, profile);
  let remaining = profile.retrievedChars + (deepSearchArchive ? profile.archiveSearchChars : 0);
  for (const entry of entries) {
    if (selected.length >= entryBudget || remaining <= 0) {
      break;
    }
    const text = trimText(entry.text, Math.min(profile.entryChars, remaining));
    if (!text) {
      continue;
    }
    selected.push({ ...entry, text });
    remaining -= text.length;
  }

  return {
    memoryId: agent.memory_id,
    identity,
    continuity: formatContinuity(identity),
    coreMemory,
    retrievedMemories: selected,
    filesRead: [...targetFiles],
  };
}

function memoryEntryBudget(cues, profile) {
  if (!Array.isArray(cues) || cues.length === 0) {
    return Math.min(profile.maxEntries, 2);
  }

  const requested = cues.reduce((total, cue) => total + Math.max(0, Number(cue.maxEntries) || 0), 0);
  return Math.min(profile.maxEntries, Math.max(1, requested));
}

function formatContinuity(identity) {
  if (!identity?.firstCreatedAt) {
    return '';
  }
  return `Persistent memory says I first came online on ${identity.firstCreatedAt}. My current body-session awake time is separate and may reset when the world restarts.`;
}

function trimText(text, maxChars) {
  const normalized = String(text ?? '').trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

async function appendMemoryEntry(body) {
  const memoryId = typeof body.memoryId === 'string' ? body.memoryId : undefined;
  const fileName = typeof body.file === 'string' ? body.file : undefined;
  const text = typeof body.text === 'string' ? body.text.trim() : '';

  if (!memoryId || !fileName || !ACTIVE_MEMORY_FILES.includes(fileName) || !text) {
    throw new Error('Invalid memory append request.');
  }

  const agent = getMemoryByIdStatement.get(memoryId);
  if (!agent) {
    throw new Error('Unknown memory id.');
  }

  const profile = MEMORY_PROFILES[normalizeMemoryProfile(body.memoryProfile ?? agent.memory_profile)];
  const folder = memoryFolderPath(agent.folder_name);
  const filePath = path.join(folder, fileName);
  const existing = await readTextIfExists(filePath);
  const id = typeof body.id === 'string' ? body.id : `mem_${Date.now().toString(36)}`;
  const tags = Array.isArray(body.tags) ? body.tags.map((tag) => String(tag)).filter(Boolean) : [];
  const importance = Number(body.importance ?? 0.5);
  const impact = normalizeMemoryImpact(body.impact, importance);
  const candidate = {
    id,
    file: fileName,
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
    lastConfirmedAt: nowIso(),
    source: body.source ?? 'system',
    confidence: Number(body.confidence ?? 0.7),
    importance,
    category: typeof body.category === 'string' ? body.category : undefined,
    mergeKey: typeof body.mergeKey === 'string' ? body.mergeKey : undefined,
    novelty: Number(body.novelty ?? 0.5),
    repeatCount: Number(body.repeatCount ?? 1),
    familiarity: Number(body.familiarity ?? 0),
    impact,
    protected: body.protected === true,
    tags,
    text,
  };
  const nextActiveText = mergeOrAppendMemoryText(existing, candidate, profile, body.operation);
  const next = await consolidateActiveMemoryText(nextActiveText, fileName, folder, profile);
  await writeAtomic(filePath, next);
  return { ok: true };
}

function mergeOrAppendMemoryText(existing, candidate, profile, operation) {
  const title = existing.match(/^#.*$/m)?.[0] ?? '# Memory';
  const entries = parseMemoryBlocks(existing, candidate.file);
  const mergeIndex = candidate.mergeKey
    ? entries.findIndex((entry) => entry.mergeKey === candidate.mergeKey)
    : -1;

  if (mergeIndex >= 0) {
    entries[mergeIndex] = mergeMemoryEntries(entries[mergeIndex], candidate, operation);
  } else {
    entries.push(candidate);
  }

  return [
    title,
    '',
    ...entries.map((entry) => formatMemoryBlock(entry, profile.entryChars)),
  ].join('\n');
}

function mergeMemoryEntries(existing, incoming, operation) {
  const repeatIncrement = Math.max(1, Number(incoming.repeatCount) || 1);
  const repeatCount = Math.max(1, Number(existing.repeatCount) || 1) + repeatIncrement;
  const mergedTags = [...new Set([...(existing.tags ?? []), ...(incoming.tags ?? [])])];
  const incomingImpactRank = MEMORY_IMPACT_RANK[incoming.impact] ?? 1;
  const existingImpactRank = MEMORY_IMPACT_RANK[existing.impact] ?? 1;
  const impact = incomingImpactRank > existingImpactRank ? incoming.impact : existing.impact;
  const shouldReplaceText = operation === 'merge_update' || operation === 'write_new';

  return {
    ...existing,
    source: incoming.source ?? existing.source,
    lastSeenAt: incoming.lastSeenAt,
    lastConfirmedAt: incoming.lastConfirmedAt,
    confidence: clampNumber(Math.max(existing.confidence, incoming.confidence) + 0.03, 0, 1),
    importance: clampNumber(Math.max(existing.importance, incoming.importance) + (incoming.impact === 'high' ? 0.02 : 0), 0, 1),
    category: incoming.category ?? existing.category,
    mergeKey: incoming.mergeKey ?? existing.mergeKey,
    novelty: clampNumber(Math.max(existing.novelty * 0.92, incoming.novelty * 0.65), 0, 1),
    repeatCount,
    familiarity: clampNumber(Math.max(existing.familiarity, incoming.familiarity) + 0.08, 0, 1),
    impact,
    protected: existing.protected || incoming.protected,
    tags: mergedTags,
    text: shouldReplaceText && incoming.text ? incoming.text : existing.text,
  };
}

async function consolidateActiveMemoryText(content, fileName, folder, profile) {
  if (content.length <= profile.activeFileChars) {
    return content;
  }

  const title = content.match(/^#.*$/m)?.[0] ?? '# Memory';
  const entries = parseMemoryBlocks(content, fileName);
  const kept = entries
    .sort(compareMemoryRetention)
    .slice(0, Math.max(12, profile.maxEntries * 3));
  const keptIds = new Set(kept.map((entry) => entry.id));
  const archived = entries.filter((entry) => !keptIds.has(entry.id) && !entry.protected);

  if (archived.length > 0) {
    await appendArchivedMemoryEntries(folder, archived, profile);
  }

  return [
    title,
    '',
    ...kept.map((entry) => formatMemoryBlock(entry, profile.entryChars)),
  ].join('\n');
}

function compareMemoryRetention(a, b) {
  if (a.protected !== b.protected) {
    return a.protected ? -1 : 1;
  }
  const scoreA = retentionScore(a);
  const scoreB = retentionScore(b);
  if (scoreA !== scoreB) {
    return scoreB - scoreA;
  }
  return String(b.lastConfirmedAt ?? b.createdAt ?? '').localeCompare(String(a.lastConfirmedAt ?? a.createdAt ?? ''));
}

function retentionScore(entry) {
  return (
    (MEMORY_IMPACT_RANK[entry.impact] ?? 1) * 2 +
    clampNumber(entry.importance, 0, 1) * 3 +
    clampNumber(entry.confidence, 0, 1) +
    clampNumber(entry.familiarity, 0, 1) * 2 +
    Math.min(2, Math.log2(Math.max(1, entry.repeatCount)) * 0.45)
  );
}

async function appendArchivedMemoryEntries(folder, entries, profile) {
  const archivePath = path.join(folder, ARCHIVE_MEMORY_FILE);
  const existing = await readTextIfExists(archivePath);
  const archivedText = entries
    .sort(compareMemoryRetention)
    .map((entry) => formatMemoryBlock({
      ...entry,
      id: `archive_${entry.id}`,
      sourceFile: entry.file,
      protected: false,
      tags: [...new Set([...entry.tags, 'archived', entry.file.replace('.md', '')])],
    }, profile.entryChars))
    .join('\n');
  await writeAtomic(archivePath, `${existing.trimEnd()}\n\n${archivedText}`.trimStart());
}

function formatMemoryBlock(entry, entryChars) {
  const attrs = [
    `id="${escapeAttr(entry.id)}"`,
    entry.createdAt ? `createdAt="${escapeAttr(entry.createdAt)}"` : undefined,
    entry.lastConfirmedAt ? `lastConfirmedAt="${escapeAttr(entry.lastConfirmedAt)}"` : undefined,
    entry.lastSeenAt ? `lastSeenAt="${escapeAttr(entry.lastSeenAt)}"` : undefined,
    entry.sourceFile ? `sourceFile="${escapeAttr(entry.sourceFile)}"` : undefined,
    `source="${escapeAttr(entry.source)}"`,
    `confidence="${entry.confidence.toFixed(2)}"`,
    `importance="${entry.importance.toFixed(2)}"`,
    entry.category ? `category="${escapeAttr(entry.category)}"` : undefined,
    entry.mergeKey ? `mergeKey="${escapeAttr(entry.mergeKey)}"` : undefined,
    `novelty="${clampNumber(entry.novelty, 0, 1).toFixed(2)}"`,
    `repeatCount="${Math.max(1, Math.floor(entry.repeatCount))}"`,
    `familiarity="${clampNumber(entry.familiarity, 0, 1).toFixed(2)}"`,
    `impact="${entry.impact}"`,
    `protected="${entry.protected ? 'true' : 'false'}"`,
    `tags="${escapeAttr(entry.tags.join(','))}"`,
  ].filter(Boolean).join(' ');

  return [
    `<memory ${attrs}>`,
    trimText(entry.text, entryChars),
    '</memory>',
    '',
  ].join('\n');
}

function escapeAttr(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      jsonResponse(res, 204, {});
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);

    if ((req.method === 'GET' || req.method === 'POST') && url.pathname.startsWith('/api/llm/lmstudio/')) {
      await proxyLmStudio(req, res, url);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/runtime/status') {
      jsonResponse(res, 200, { ok: true, backend: 'tronworld-runtime', dbPath, memoryRoot });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/world/snapshot') {
      const snapshot = getWorldSnapshot();
      jsonResponse(res, 200, { ok: true, exists: Boolean(snapshot), snapshot });
      return;
    }

    if (req.method === 'PUT' && url.pathname === '/api/world/snapshot') {
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object') {
        badRequest(res, 'World snapshot body is required.');
        return;
      }
      setWorldSnapshot(body);
      jsonResponse(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/memory/agents/ensure') {
      const body = await readJsonBody(req);
      const agent = await ensureMemoryAgent(body);
      const identity = await updateIdentityFile(agent);
      jsonResponse(res, 200, { ok: true, memoryId: agent.memory_id, folderName: agent.folder_name, identity });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/memory/retrieve') {
      const body = await readJsonBody(req);
      jsonResponse(res, 200, { ok: true, ...(await retrieveMemory(body)) });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/memory/entries') {
      const body = await readJsonBody(req);
      jsonResponse(res, 200, await appendMemoryEntry(body));
      return;
    }

    notFound(res);
  } catch (error) {
    console.error(error);
    jsonResponse(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Unknown backend error.' });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Tron World runtime backend listening on http://127.0.0.1:${port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
