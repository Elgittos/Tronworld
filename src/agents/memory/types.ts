export type MemoryImpact = 'high' | 'medium' | 'low';
export type MemoryTier = 'core' | 'active' | 'archive';
export type MemoryCategory = 'place' | 'avatar' | 'action' | 'failure' | 'energy' | 'skill' | 'important_event' | 'familiarity';
export type MemoryActiveFile = 'events.md' | 'places.md' | 'avatars.md' | 'energy.md' | 'failures.md' | 'skills.md';
export type MemoryWriteOperation = 'write_new' | 'merge_update' | 'reinforce';

export type MemoryCandidate = {
  file: MemoryActiveFile;
  category: MemoryCategory;
  summary: string;
  source: string;
  mergeKey: string;
  operation: MemoryWriteOperation;
  impact: MemoryImpact;
  importance: number;
  novelty: number;
  confidence: number;
  familiarity: number;
  repeatCount: number;
  tags: string[];
  reason: string;
};

export type MemoryLifecyclePolicy = {
  tier: MemoryTier;
  files: string[];
  loadedByDefault: boolean;
  cueRetrievable: boolean;
  protectedFromArchival: boolean;
  notes: string;
};

export const MEMORY_LIFECYCLE: MemoryLifecyclePolicy[] = [
  {
    tier: 'core',
    files: ['identity.json', 'core.md'],
    loadedByDefault: true,
    cueRetrievable: false,
    protectedFromArchival: true,
    notes: 'Identity metadata and the single protected core truth file. These are loaded when an agent enters and must not be automatically archived or rewritten.',
  },
  {
    tier: 'active',
    files: ['events.md', 'places.md', 'avatars.md', 'energy.md', 'failures.md', 'skills.md', 'self.md'],
    loadedByDefault: false,
    cueRetrievable: true,
    protectedFromArchival: false,
    notes: 'Cue-addressable long-term memories. Entries carry impact and importance so low-impact material leaves active recall first.',
  },
  {
    tier: 'archive',
    files: ['archive.md'],
    loadedByDefault: false,
    cueRetrievable: true,
    protectedFromArchival: false,
    notes: 'Cold storage for deeper search. The archive is not part of normal recall unless a cue asks for a deeper search.',
  },
];
