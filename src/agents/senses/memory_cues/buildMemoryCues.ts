import { MemoryCue, MemoryCueInput } from './types';

export function buildMemoryCues(input: MemoryCueInput): MemoryCue[] {
  const cues: MemoryCue[] = [];
  const message = input.userMessage?.toLowerCase() ?? '';

  if (input.awareness) {
    cues.push({
      targetMemoryFiles: ['identity.json', 'self.md'],
      reason: input.awareness.summary,
      maxEntries: identityQuestion(message) ? 3 : 1,
      priority: identityQuestion(message) ? 'high' : 'background',
      source: 'awareness',
      tags: ['identity', 'self', 'lifetime'],
    });
  }

  if (input.energy) {
    const urgent = input.energy.safetyState === 'urgent_recharge' ||
      input.energy.safetyState === 'interference_danger' ||
      input.energy.safetyState === 'shutdown';
    if (urgent || input.energy.energyState === 'low' || input.energy.energyState === 'critical' || input.energy.nearbyEnergySources.length > 0) {
      cues.push({
        targetMemoryFiles: ['energy.md', 'places.md'],
        reason: input.energy.summary,
        maxEntries: urgent ? 4 : 2,
        priority: urgent ? 'critical' : 'normal',
        source: 'energy',
        tags: ['energy', input.energy.safetyState],
      });
    }
  }

  if (input.social && input.social.nearbyAvatars.length > 0) {
    cues.push({
      targetMemoryFiles: ['avatars.md', 'events.md'],
      reason: input.social.summary,
      maxEntries: input.social.reachableAvatars.length > 0 ? 3 : 2,
      priority: input.social.avatarsNeedingEnergy.length > 0 ? 'high' : 'normal',
      source: 'social',
      tags: ['avatar', 'social', ...input.social.nearbyAvatars.slice(0, 3).map((avatar) => avatar.name.toLowerCase())],
    });
  }

  if (input.actionFeedback && input.actionFeedback.outcome !== 'none') {
    cues.push({
      targetMemoryFiles: input.actionFeedback.outcome === 'accepted' ? ['events.md', 'skills.md'] : ['failures.md', 'skills.md'],
      reason: input.actionFeedback.summary,
      maxEntries: input.actionFeedback.outcome === 'accepted' ? 2 : 4,
      priority: input.actionFeedback.outcome === 'accepted' ? 'normal' : 'high',
      source: 'action_feedback',
      tags: ['action', input.actionFeedback.outcome],
    });
  }

  if (input.touch && (input.touch.blockedContacts.length > 0 || input.touch.bodyContactState === 'airborne')) {
    cues.push({
      targetMemoryFiles: ['events.md', 'skills.md', 'places.md'],
      reason: input.touch.summary,
      maxEntries: 2,
      priority: input.touch.bodyContactState === 'airborne' ? 'normal' : 'high',
      source: 'touch',
      tags: ['touch', input.touch.bodyContactState],
    });
  }

  if (input.space) {
    const blocked = input.space.localAreaType === 'blocked_pocket';
    const jumpCanClear = Object.values(input.space.jumpClearance).some((clearance) => clearance.state === 'can_clear_one_cube');
    if (blocked || input.space.nearbyObstacles.length > 0 || jumpCanClear) {
      cues.push({
        targetMemoryFiles: ['places.md', 'skills.md', 'failures.md'],
        reason: input.space.summary,
        maxEntries: blocked ? 4 : 2,
        priority: blocked ? 'high' : 'normal',
        source: 'space',
        tags: ['space', input.space.localAreaType],
      });
    }
  }

  if (input.vision) {
    const distantCount = input.vision.environment.distantStructures.blockCount + input.vision.environment.distantStructures.teslaNodeCount;
    if (input.vision.teslaNodes.length > 0 || distantCount > 0) {
      cues.push({
        targetMemoryFiles: ['places.md', 'events.md'],
        reason: input.vision.summary,
        maxEntries: 3,
        priority: 'normal',
        source: 'vision',
        tags: ['vision', 'place'],
      });
    }
  }

  if (input.system) {
    cues.push({
      targetMemoryFiles: ['self.md'],
      reason: input.system.summary,
      maxEntries: 1,
      priority: 'background',
      source: 'system',
      tags: ['system', 'limits'],
    });
  }

  if (input.attention?.primaryFocus) {
    cues.unshift({
      targetMemoryFiles: filesForAttentionSource(input.attention.primaryFocus.source),
      reason: input.attention.summary,
      maxEntries: input.attention.primaryFocus.priority === 'critical' ? 5 : 3,
      priority: input.attention.primaryFocus.priority,
      source: 'attention',
      tags: ['attention', input.attention.primaryFocus.source],
    });
  }

  return mergeCues(cues).slice(0, 8);
}

function identityQuestion(message: string): boolean {
  return /\b(who|what kind|name|age|old|created|born|memory|remember)\b/.test(message);
}

function filesForAttentionSource(source: string): string[] {
  switch (source) {
    case 'energy':
      return ['energy.md', 'places.md'];
    case 'social':
      return ['avatars.md', 'events.md'];
    case 'space':
    case 'touch':
      return ['places.md', 'skills.md', 'failures.md'];
    case 'action_feedback':
      return ['failures.md', 'skills.md', 'events.md'];
    case 'vision':
      return ['places.md', 'events.md'];
    case 'system':
      return ['self.md'];
    default:
      return ['events.md'];
  }
}

function mergeCues(cues: MemoryCue[]): MemoryCue[] {
  const byKey = new Map<string, MemoryCue>();
  for (const cue of cues) {
    const key = cue.targetMemoryFiles.join('|');
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, cue);
      continue;
    }

    existing.maxEntries = Math.max(existing.maxEntries, cue.maxEntries);
    existing.reason = `${existing.reason} ${cue.reason}`;
    existing.priority = higherPriority(existing.priority, cue.priority);
    existing.tags = [...new Set([...existing.tags, ...cue.tags])];
  }

  return [...byKey.values()].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
}

function higherPriority(a: MemoryCue['priority'], b: MemoryCue['priority']): MemoryCue['priority'] {
  return priorityRank(a) <= priorityRank(b) ? a : b;
}

function priorityRank(priority: MemoryCue['priority']): number {
  switch (priority) {
    case 'critical':
      return 0;
    case 'high':
      return 1;
    case 'normal':
      return 2;
    case 'background':
      return 3;
  }
}
