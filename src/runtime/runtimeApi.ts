import { WorldSnapshot } from '../world/worldState';

export type MemoryProfile = 'small' | 'balanced' | 'frontier';
export type MemoryImpact = 'high' | 'medium' | 'low';
export type MemoryCategory = 'place' | 'avatar' | 'action' | 'failure' | 'energy' | 'skill' | 'important_event' | 'familiarity';
export type MemoryWriteOperation = 'write_new' | 'merge_update' | 'reinforce';

export type EnsureMemoryRequest = {
  avatarId: string;
  memoryId?: string;
  name: string;
  memoryProfile?: MemoryProfile;
  firstCreatedInWorld?: string;
  sessionCount?: number;
};

export type EnsuredMemoryAgent = {
  memoryId: string;
  folderName: string;
  identity: {
    memoryId: string;
    currentName: string;
    kind: string;
    body: string;
    firstCreatedAt?: string;
    firstCreatedInWorld?: string;
    sessionCount?: number;
    memoryProfile: MemoryProfile;
  };
};

export type MemoryCueRequest = {
  targetMemoryFiles: string[];
  reason: string;
  maxEntries: number;
  priority: 'critical' | 'high' | 'normal' | 'background';
  source?: string;
  tags?: string[];
};

export type RetrievedMemoryEntry = {
  id: string;
  file: string;
  sourceFile?: string;
  source: string;
  confidence: number;
  importance: number;
  category?: MemoryCategory;
  mergeKey?: string;
  novelty?: number;
  repeatCount?: number;
  familiarity?: number;
  impact?: MemoryImpact;
  protected: boolean;
  tags: string[];
  text: string;
};

export type RetrievedMemoryContext = {
  memoryId?: string;
  identity?: EnsuredMemoryAgent['identity'];
  continuity: string;
  coreMemory: string;
  retrievedMemories: RetrievedMemoryEntry[];
  filesRead: string[];
};

export type AppendMemoryEntryRequest = {
  memoryId: string;
  memoryProfile?: MemoryProfile;
  file: 'events.md' | 'places.md' | 'avatars.md' | 'energy.md' | 'failures.md' | 'skills.md';
  text: string;
  id?: string;
  source?: string;
  confidence?: number;
  importance?: number;
  category?: MemoryCategory;
  mergeKey?: string;
  novelty?: number;
  repeatCount?: number;
  familiarity?: number;
  impact?: MemoryImpact;
  operation?: MemoryWriteOperation;
  protected?: boolean;
  tags?: string[];
};

export async function loadWorldSnapshot(): Promise<WorldSnapshot | undefined> {
  try {
    const response = await fetch('/api/world/snapshot');
    if (!response.ok) {
      return undefined;
    }
    const payload = await response.json() as { ok: boolean; exists: boolean; snapshot?: WorldSnapshot };
    return payload.ok && payload.exists ? payload.snapshot : undefined;
  } catch {
    return undefined;
  }
}

export async function saveWorldSnapshot(snapshot: WorldSnapshot): Promise<boolean> {
  try {
    const response = await fetch('/api/world/snapshot', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function ensureMemoryAgent(request: EnsureMemoryRequest): Promise<EnsuredMemoryAgent | undefined> {
  try {
    const response = await fetch('/api/memory/agents/ensure', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      return undefined;
    }

    const payload = await response.json() as { ok: boolean } & EnsuredMemoryAgent;
    return payload.ok ? payload : undefined;
  } catch {
    return undefined;
  }
}

export async function retrieveMemoryContext(request: {
  memoryId?: string;
  memoryProfile?: MemoryProfile;
  cues: MemoryCueRequest[];
  deepSearchArchive?: boolean;
}): Promise<RetrievedMemoryContext | undefined> {
  if (!request.memoryId) {
    return undefined;
  }

  try {
    const response = await fetch('/api/memory/retrieve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      return undefined;
    }

    const payload = await response.json() as { ok: boolean } & RetrievedMemoryContext;
    return payload.ok ? payload : undefined;
  } catch {
    return undefined;
  }
}

export async function appendMemoryEntry(request: AppendMemoryEntryRequest): Promise<boolean> {
  try {
    const response = await fetch('/api/memory/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      return false;
    }

    const payload = await response.json() as { ok: boolean };
    return payload.ok;
  } catch {
    return false;
  }
}
