import { ActionFeedbackSnapshot } from '../senses/action_feedback/types';
import { AttentionSnapshot } from '../senses/attention/types';
import { AwarenessSnapshot } from '../senses/awareness/types';
import { EnergySnapshot, NearbyEnergySource } from '../senses/energy/types';
import { SocialAvatar, SocialSnapshot } from '../senses/social/types';
import { SpatialAwarenessSnapshot, SpatialDirection } from '../senses/space/types';
import { TouchSnapshot } from '../senses/touch/types';
import { VisibleBlock, VisionSnapshot } from '../senses/vision/types';
import { MemoryCandidate, MemoryImpact } from './types';

export type MemoryCandidateInput = {
  awareness?: AwarenessSnapshot;
  vision?: VisionSnapshot;
  space?: SpatialAwarenessSnapshot;
  energy?: EnergySnapshot;
  social?: SocialSnapshot;
  touch?: TouchSnapshot;
  actionFeedback?: ActionFeedbackSnapshot;
  attention?: AttentionSnapshot;
};

export function buildMemoryCandidates(input: MemoryCandidateInput): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];

  addEnergyCandidates(candidates, input.energy);
  addSocialCandidates(candidates, input.social);
  addActionFeedbackCandidates(candidates, input.actionFeedback);
  addSpaceCandidates(candidates, input.space, input.awareness);
  addTouchCandidates(candidates, input.touch, input.awareness);
  addVisionCandidates(candidates, input.vision);

  return dedupeCandidates(candidates)
    .sort(compareCandidates)
    .slice(0, 5);
}

function addEnergyCandidates(candidates: MemoryCandidate[], energy?: EnergySnapshot): void {
  if (!energy) {
    return;
  }

  const source = energy.bestReachableEnergySource;
  if (source) {
    addEnergySourceCandidate(candidates, source, energy);
  }

  if (energy.insideInterferenceField) {
    candidates.push({
      file: 'energy.md',
      category: 'energy',
      summary: `A Tesla interference field at ${positionText(source?.position)} drains Energy and should be avoided or handled carefully.`,
      source: 'energy',
      mergeKey: `energy:interference:${source?.id ?? 'current_field'}`,
      operation: 'merge_update',
      impact: 'high',
      importance: 0.92,
      novelty: 0.5,
      confidence: 0.9,
      familiarity: 0.18,
      repeatCount: 1,
      tags: ['energy', 'interference', source?.id ?? 'field'].filter(Boolean),
      reason: energy.summary,
    });
  }
}

function addEnergySourceCandidate(candidates: MemoryCandidate[], source: NearbyEnergySource, energy: EnergySnapshot): void {
  if (source.fieldState === 'recharge') {
    const urgent = energy.safetyState === 'urgent_recharge' || energy.safetyState === 'interference_danger';
    candidates.push({
      file: 'places.md',
      category: 'familiarity',
      summary: `${source.label} at ${positionText(source.position)} is a ${source.insideField ? 'experienced' : 'known'} recharge place with radius ${source.radius.toFixed(1)}.`,
      source: 'energy',
      mergeKey: `place:tesla_node:${source.id}`,
      operation: 'reinforce',
      impact: urgent ? 'high' : 'medium',
      importance: urgent ? 0.9 : 0.72,
      novelty: source.starting ? 0.2 : 0.55,
      confidence: 0.85,
      familiarity: source.insideField ? 0.35 : 0.18,
      repeatCount: 1,
      tags: ['place', 'familiarity', 'energy', 'tesla_node', source.id, source.fieldState],
      reason: energy.summary,
    });
    return;
  }

  if (source.fieldState === 'unfinished') {
    candidates.push({
      file: 'energy.md',
      category: 'energy',
      summary: `${source.label} at ${positionText(source.position)} is unfinished: ${source.progressDescription}.`,
      source: 'energy',
      mergeKey: `energy:unfinished_tesla_node:${source.id}`,
      operation: 'merge_update',
      impact: 'medium',
      importance: 0.68,
      novelty: source.contribution > 0 ? 0.62 : 0.45,
      confidence: 0.82,
      familiarity: 0.12,
      repeatCount: 1,
      tags: ['energy', 'tesla_node', 'unfinished', source.id],
      reason: energy.summary,
    });
  }
}

function addSocialCandidates(candidates: MemoryCandidate[], social?: SocialSnapshot): void {
  if (!social) {
    return;
  }

  for (const avatar of social.avatarsNeedingEnergy.slice(0, 2)) {
    candidates.push(socialCandidate(avatar, 'high'));
  }

  for (const avatar of social.reachableAvatars.filter((entry) => !entry.needsEnergy).slice(0, 1)) {
    candidates.push(socialCandidate(avatar, 'medium'));
  }
}

function socialCandidate(avatar: SocialAvatar, impact: MemoryImpact): MemoryCandidate {
  const needsEnergy = avatar.needsEnergy ? ' needs Energy' : ' is reachable';
  return {
    file: 'avatars.md',
    category: avatar.needsEnergy ? 'avatar' : 'familiarity',
    summary: `${avatar.name}${needsEnergy} ${avatar.direction} at ${avatar.distance.toFixed(1)} grid units. Recent state: ${avatar.recentState}`,
    source: 'social',
    mergeKey: `avatar:${avatar.id}:${avatar.needsEnergy ? 'needs_energy' : 'familiarity'}`,
    operation: avatar.needsEnergy ? 'merge_update' : 'reinforce',
    impact,
    importance: avatar.needsEnergy ? 0.86 : 0.48,
    novelty: avatar.needsEnergy ? 0.58 : 0.25,
    confidence: 0.82,
    familiarity: avatar.needsEnergy ? 0.12 : 0.28,
    repeatCount: 1,
    tags: ['avatar', avatar.id, avatar.name.toLowerCase(), avatar.state, avatar.relation],
    reason: `${avatar.name} ${avatar.relation}.`,
  };
}

function addActionFeedbackCandidates(candidates: MemoryCandidate[], feedback?: ActionFeedbackSnapshot): void {
  if (!feedback || feedback.outcome === 'none') {
    return;
  }

  const message = feedback.resultMessage ?? feedback.recentFailure ?? feedback.recentDecision;
  const action = feedback.attemptedAction ?? actionFromRecentState(feedback.recentDecision);

  if (feedback.outcome === 'rejected' || feedback.outcome === 'failed') {
    candidates.push({
      file: 'failures.md',
      category: 'failure',
      summary: `${action} had a problem: ${message}`,
      source: 'action_feedback',
      mergeKey: `failure:${slug(action)}:${slug(message)}`,
      operation: 'reinforce',
      impact: 'high',
      importance: 0.78,
      novelty: 0.42,
      confidence: 0.86,
      familiarity: 0.16,
      repeatCount: 1,
      tags: ['failure', 'action', slug(action)],
      reason: feedback.summary,
    });
    return;
  }

  const importantEvent = importantEventFromFeedback(feedback, message);
  if (importantEvent) {
    candidates.push(importantEvent);
  }
}

function importantEventFromFeedback(feedback: ActionFeedbackSnapshot, message: string): MemoryCandidate | undefined {
  const normalized = `${feedback.recentDecision} ${message}`.toLowerCase();
  if (!/tesla node|energy transferred|handshake|block placed|scan complete|revived/.test(normalized)) {
    return undefined;
  }

  const impact: MemoryImpact = /revived|tesla node completed|energy transferred/.test(normalized) ? 'high' : 'medium';
  return {
    file: 'events.md',
    category: 'important_event',
    summary: `Important event: ${message}`,
    source: 'action_feedback',
    mergeKey: `event:${slug(message)}`,
    operation: 'merge_update',
    impact,
    importance: impact === 'high' ? 0.86 : 0.62,
    novelty: 0.65,
    confidence: 0.84,
    familiarity: 0.05,
    repeatCount: 1,
    tags: ['event', 'action', impact],
    reason: feedback.summary,
  };
}

function addSpaceCandidates(candidates: MemoryCandidate[], space?: SpatialAwarenessSnapshot, awareness?: AwarenessSnapshot): void {
  if (!space) {
    return;
  }

  const nearest = space.nearbyObstacles[0];
  if (nearest && (space.localAreaType === 'blocked_pocket' || space.localAreaType === 'near_wall' || nearest.edgeDistance <= 1.4)) {
    candidates.push({
      file: 'places.md',
      category: 'familiarity',
      summary: `Near ${positionText(awareness?.bodyState.position)}, movement feels ${space.localAreaType}; nearest obstacle is ${nearest.label} ${nearest.direction}.`,
      source: 'space',
      mergeKey: `place:obstacle:${nearest.kind}:${nearest.id}`,
      operation: 'reinforce',
      impact: space.localAreaType === 'blocked_pocket' ? 'high' : 'medium',
      importance: space.localAreaType === 'blocked_pocket' ? 0.78 : 0.54,
      novelty: 0.35,
      confidence: 0.82,
      familiarity: 0.25,
      repeatCount: 1,
      tags: ['place', 'obstacle', nearest.kind, nearest.id, space.localAreaType],
      reason: space.summary,
    });
  }

  const jumpable = firstJumpableDirection(space);
  if (jumpable) {
    candidates.push({
      file: 'skills.md',
      category: 'skill',
      summary: `A one-jump clearance can work ${jumpable} when the nearby obstacle is low and landing space is open.`,
      source: 'space',
      mergeKey: `skill:jump_clearance:${jumpable}`,
      operation: 'reinforce',
      impact: 'medium',
      importance: 0.58,
      novelty: 0.45,
      confidence: 0.75,
      familiarity: 0.2,
      repeatCount: 1,
      tags: ['skill', 'jump', 'movement', jumpable],
      reason: space.summary,
    });
  }
}

function addTouchCandidates(candidates: MemoryCandidate[], touch?: TouchSnapshot, awareness?: AwarenessSnapshot): void {
  if (!touch) {
    return;
  }

  const contact = touch.blockedContacts[0];
  if (!contact) {
    return;
  }

  candidates.push({
    file: 'places.md',
    category: 'familiarity',
    summary: `At ${positionText(awareness?.bodyState.position)}, body contact found ${contact.label} ${contact.direction}.`,
    source: 'touch',
    mergeKey: `place:body_contact:${contact.kind}:${contact.id}`,
    operation: 'reinforce',
    impact: contact.kind === 'tesla_node' ? 'medium' : 'low',
    importance: contact.kind === 'tesla_node' ? 0.56 : 0.38,
    novelty: 0.22,
    confidence: 0.82,
    familiarity: 0.3,
    repeatCount: 1,
    tags: ['touch', 'body', contact.kind, contact.id],
    reason: touch.summary,
  });
}

function addVisionCandidates(candidates: MemoryCandidate[], vision?: VisionSnapshot): void {
  if (!vision) {
    return;
  }

  const closeBlock = vision.blocks.find((block) => block.frontality === 'directly_in_front' && block.distance <= 2.2);
  if (closeBlock) {
    candidates.push(blockCandidate(closeBlock));
  }

  if (vision.environment.distantStructures.visible) {
    const directions = [...vision.environment.distantStructures.directions].sort();
    candidates.push({
      file: 'places.md',
      category: 'place',
      summary: `Distant structures are visible on the grid horizon toward ${vision.environment.distantStructures.directions.join(', ')}.`,
      source: 'vision',
      mergeKey: `place:distant_structures:${directions.join('_')}`,
      operation: 'merge_update',
      impact: 'medium',
      importance: 0.52,
      novelty: 0.7,
      confidence: 0.72,
      familiarity: 0.05,
      repeatCount: 1,
      tags: ['place', 'horizon', 'structure', 'vision'],
      reason: vision.environment.distantStructures.description,
    });
  }
}

function blockCandidate(block: VisibleBlock): MemoryCandidate {
  return {
    file: 'places.md',
    category: 'familiarity',
    summary: `${block.label} is directly in front at ${block.distance.toFixed(1)} grid units; its center is ${positionText(block.centerPosition)}.`,
    source: 'vision',
    mergeKey: `place:block:${block.id}`,
    operation: 'reinforce',
    impact: 'low',
    importance: 0.36,
    novelty: 0.28,
    confidence: 0.78,
    familiarity: 0.24,
    repeatCount: 1,
    tags: ['place', 'block', block.id, block.shape, block.color],
    reason: `${block.label} is close and directly in front.`,
  };
}

function firstJumpableDirection(space: SpatialAwarenessSnapshot): SpatialDirection | undefined {
  return (Object.keys(space.jumpClearance) as SpatialDirection[])
    .find((direction) => space.jumpClearance[direction].state === 'can_clear_one_cube');
}

function dedupeCandidates(candidates: MemoryCandidate[]): MemoryCandidate[] {
  const byKey = new Map<string, MemoryCandidate>();
  for (const candidate of candidates) {
    const existing = byKey.get(candidate.mergeKey);
    if (!existing || compareCandidates(candidate, existing) < 0) {
      byKey.set(candidate.mergeKey, candidate);
    }
  }
  return [...byKey.values()];
}

function compareCandidates(a: MemoryCandidate, b: MemoryCandidate): number {
  return candidateScore(b) - candidateScore(a);
}

function candidateScore(candidate: MemoryCandidate): number {
  const impactScore = candidate.impact === 'high' ? 3 : candidate.impact === 'medium' ? 2 : 1;
  return (
    impactScore * 2 +
    candidate.importance * 3 +
    candidate.novelty +
    candidate.familiarity +
    candidate.confidence
  );
}

function positionText(position: { x: number; y?: number; z: number } | undefined): string {
  if (!position) {
    return 'the current area';
  }
  return `x:${position.x.toFixed(1)} z:${position.z.toFixed(1)}`;
}

function actionFromRecentState(recentDecision: string): string {
  const normalized = recentDecision.toLowerCase();
  if (normalized.includes('placed')) {
    return 'place_block';
  }
  if (normalized.includes('tesla')) {
    return 'build_tesla_node';
  }
  if (normalized.includes('handshake')) {
    return 'handshake';
  }
  if (normalized.includes('transferred')) {
    return 'transfer_energy';
  }
  if (normalized.includes('scan')) {
    return 'scan';
  }
  return 'action';
}

function slug(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized.slice(0, 64) || 'unknown';
}
