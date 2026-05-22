import { Vec3 } from '../../world/types';
import { RetrievedMemoryContext } from '../../runtime/runtimeApi';
import { ActionFeedbackSnapshot } from '../senses/action_feedback/types';
import { AttentionSnapshot } from '../senses/attention/types';
import { AwarenessSnapshot } from '../senses/awareness/types';
import { EnergySnapshot, NearbyEnergySource } from '../senses/energy/types';
import { SocialAvatar, SocialSnapshot } from '../senses/social/types';
import { SpatialAwarenessSnapshot, SpatialDirection } from '../senses/space/types';
import { SystemSnapshot } from '../senses/system/types';
import { TouchSnapshot } from '../senses/touch/types';
import { VisibleBlock, VisibleOpenSpace, VisibleTeslaNode, VisionSnapshot } from '../senses/vision/types';
import {
  AffordanceCandidate,
  AffordanceOptions,
  AffordancePredictedEffects,
  AffordanceSource,
  DEFAULT_AFFORDANCE_OPTIONS,
} from './types';

export type AffordanceInput = {
  awareness?: AwarenessSnapshot;
  vision?: VisionSnapshot;
  space?: SpatialAwarenessSnapshot;
  energy?: EnergySnapshot;
  social?: SocialSnapshot;
  touch?: TouchSnapshot;
  actionFeedback?: ActionFeedbackSnapshot;
  attention?: AttentionSnapshot;
  system?: SystemSnapshot;
  memory?: RetrievedMemoryContext;
};

export function buildAffordanceCandidates(
  input: AffordanceInput,
  options: Partial<AffordanceOptions> = {},
): AffordanceCandidate[] {
  const resolvedOptions = { ...DEFAULT_AFFORDANCE_OPTIONS, ...options };
  const candidates: AffordanceCandidate[] = [];

  addAwarenessAffordances(candidates, input.awareness);
  addSpaceAffordances(candidates, input.space, input.awareness);
  addEnergyAffordances(candidates, input.energy, input.space);
  addSocialAffordances(candidates, input.social);
  addTouchAffordances(candidates, input.touch, input.space);
  addVisionAffordances(candidates, input.vision);
  addActionFeedbackAffordances(candidates, input.actionFeedback);
  addMemoryAffordances(candidates, input.memory);

  return dedupeCandidates(candidates)
    .map((candidate) => applyMemoryInfluence(candidate, input.memory))
    .map((candidate) => applyAttentionInfluence(candidate, input.attention))
    .map((candidate) => applySystemInfluence(candidate, input.system))
    .sort(compareGroundedOpportunity)
    .slice(0, resolvedOptions.maxCandidates);
}

export function formatAffordanceDebug(candidates: AffordanceCandidate[]): string {
  if (candidates.length === 0) {
    return 'No grounded affordance candidates are available from the current senses.';
  }

  return candidates
    .map((candidate, index) => [
      `${index + 1}. ${candidate.id}: ${candidate.label}`,
      `   action: ${JSON.stringify(candidate.action)}`,
      `   target: ${candidate.target ? `${candidate.target.kind} ${candidate.target.label}` : 'none'}`,
      `   sources: ${candidate.sources.join(', ')}`,
      `   validation: ${candidate.validation}; grounding: ${candidate.grounding}; confidence: ${candidate.confidence.toFixed(2)}`,
      `   effects: ${formatEffects(candidate.predictedEffects)}`,
      `   evidence: ${candidate.evidence.join(' | ')}`,
    ].join('\n'))
    .join('\n');
}

function addAwarenessAffordances(candidates: AffordanceCandidate[], awareness?: AwarenessSnapshot): void {
  if (!awareness || awareness.bodyState.onlineState === 'shutdown') {
    return;
  }

  candidates.push(makeCandidate({
    action: { action: 'wait' },
    label: 'Hold current position',
    description: 'Do nothing for one decision step while preserving current context.',
    sources: ['awareness'],
    preconditions: ['body is online'],
    evidence: [awareness.summary],
    predictedEffects: effects({ competence: 0.08, continuity: 0.08, risk: -0.04 }),
    confidence: 0.55,
    validation: 'locally_grounded',
  }));

  candidates.push(makeCandidate({
    action: { action: 'recalibrate' },
    label: 'Recalibrate around current state',
    description: 'Review current goal, recent decision, and intended next step before choosing another action.',
    sources: ['awareness'],
    preconditions: ['body is online'],
    evidence: [awareness.intention.intendedNextStep, awareness.intention.recentDecision],
    predictedEffects: effects({ agency: 0.08, competence: 0.12, continuity: 0.12, risk: -0.04 }),
    confidence: 0.58,
    validation: 'locally_grounded',
  }));
}

function addSpaceAffordances(
  candidates: AffordanceCandidate[],
  space?: SpatialAwarenessSnapshot,
  awareness?: AwarenessSnapshot,
): void {
  if (!space || !space.movementCapability.canWalk) {
    return;
  }

  const directions: SpatialDirection[] = ['forward', 'backward', 'left', 'right'];
  for (const direction of directions) {
    const clearance = space.walkableDirections[direction];
    if (clearance.state !== 'clear') {
      continue;
    }

    candidates.push(makeCandidate({
      action: movementActionForDirection(direction),
      label: `Move ${direction}`,
      description: `Move ${direction} because the local spatial sense reports clear walking space.`,
      sources: ['space', 'awareness'],
      target: {
        kind: 'open_space',
        label: `${direction} open space`,
        position: awareness ? offsetPosition(awareness.bodyState.position, direction, Math.max(1, clearance.clearDistance)) : undefined,
      },
      preconditions: ['body can walk', `${direction} clearance is clear`],
      evidence: [space.summary, `${direction} clear distance ${clearance.clearDistance.toFixed(1)}`],
      predictedEffects: effects({ agency: 0.45, competence: 0.38, risk: -0.12 }),
      confidence: 0.78,
      validation: 'needs_engine_validation',
    }));
  }

  for (const direction of directions) {
    const jump = space.jumpClearance[direction];
    if (jump.state !== 'can_clear_one_cube') {
      continue;
    }

    candidates.push(makeCandidate({
      action: { action: 'jump' },
      label: `Jump ${direction} obstacle`,
      description: 'Jump because spatial awareness predicts one jump can clear the nearby obstacle.',
      sources: ['space'],
      target: jump.obstacle
        ? {
            kind: jump.obstacle.kind === 'avatar' ? 'avatar' : jump.obstacle.kind,
            id: jump.obstacle.id,
            label: jump.obstacle.label,
            position: jump.obstacle.visibleEdgePosition,
          }
        : undefined,
      preconditions: ['body can jump now', jump.reason],
      evidence: [space.summary, jump.reason],
      predictedEffects: effects({ agency: 0.35, competence: 0.28, curiosity: 0.12, risk: 0.18 }),
      confidence: 0.7,
      validation: 'needs_engine_validation',
    }));
  }
}

function addEnergyAffordances(
  candidates: AffordanceCandidate[],
  energy?: EnergySnapshot,
  space?: SpatialAwarenessSnapshot,
): void {
  if (!energy) {
    return;
  }

  if (energy.insideRechargeField && energy.currentEnergy < energy.maxEnergy - 1) {
    candidates.push(makeCandidate({
      action: { action: 'recharge' },
      label: 'Recharge in current field',
      description: 'Hold position because the body is already inside a safe recharge field.',
      sources: ['energy', 'touch'],
      preconditions: ['inside recharge field', 'Energy is below full'],
      evidence: [energy.summary, energy.drain.description],
      predictedEffects: effects({ viability: 0.9, agency: 0.45, familiarity: 0.2, risk: -0.25, energyDelta: energy.drain.netEnergyRate }),
      confidence: 0.9,
      validation: 'needs_engine_validation',
    }));
  }

  const source = energy.bestReachableEnergySource;
  if (source && !source.insideField) {
    candidates.push(energySourceMoveCandidate(source, energy));
  }

  if (energy.insideInterferenceField) {
    const escapeDirection = firstClearDirection(space);
    if (escapeDirection) {
      candidates.push(makeCandidate({
        action: movementActionForDirection(escapeDirection),
        label: `Leave interference field ${escapeDirection}`,
        description: 'Move through a clear direction because current field contact is draining Energy.',
        sources: ['energy', 'space'],
        preconditions: ['inside interference field', `${escapeDirection} path is clear`],
        evidence: [energy.summary, space?.summary ?? 'space unavailable'],
        predictedEffects: effects({ viability: 0.95, agency: 0.4, competence: 0.25, risk: -0.35 }),
        confidence: 0.82,
        validation: 'needs_engine_validation',
      }));
    }
  }
}

function energySourceMoveCandidate(source: NearbyEnergySource, energy: EnergySnapshot): AffordanceCandidate {
  return makeCandidate({
    action: { action: 'move_toward', target: source.position },
    label: `Move toward ${source.label}`,
    description: 'Approach a sensed Energy source that may improve viability or future building options.',
    sources: ['energy'],
    target: {
      kind: 'tesla_node',
      id: source.id,
      label: source.label,
      position: source.position,
    },
    preconditions: ['Energy source is sensed nearby'],
    evidence: [energy.summary, `${source.label} ${source.direction} at ${source.distance.toFixed(1)} grid units`],
    predictedEffects: effects({
      viability: source.fieldState === 'recharge' ? 0.75 : 0.28,
      agency: 0.45,
      construction: source.fieldState === 'unfinished' ? 0.5 : 0.05,
      curiosity: source.fieldState === 'unfinished' ? 0.25 : 0.05,
      risk: source.fieldState === 'interference' ? 0.5 : -0.1,
      distanceToEnergy: 'closer',
    }),
    confidence: 0.82,
    validation: 'needs_engine_validation',
  });
}

function addSocialAffordances(candidates: AffordanceCandidate[], social?: SocialSnapshot): void {
  if (!social) {
    return;
  }

  for (const avatar of social.reachableAvatars.slice(0, 3)) {
    if (avatar.needsEnergy) {
      candidates.push(makeCandidate({
        action: { action: 'transfer_energy', targetAgentId: avatar.id, amount: 10 },
        label: `Transfer Energy to ${avatar.name}`,
        description: 'Offer minimum revival/support Energy to a nearby avatar that needs Energy.',
        sources: ['social', 'energy'],
        target: avatarTarget(avatar),
        preconditions: ['avatar is reachable for Energy transfer', 'donor reserve must remain safe'],
        evidence: [social.summary, `${avatar.name} ${avatar.state} at ${avatar.distance.toFixed(1)} grid units`],
        predictedEffects: effects({ social: 0.9, agency: 0.35, viability: -0.25, risk: 0.18, energyDelta: -10 }),
        confidence: 0.78,
        validation: 'needs_engine_validation',
      }));
      continue;
    }

    candidates.push(makeCandidate({
      action: { action: 'handshake', targetAgentId: avatar.id },
      label: `Handshake with ${avatar.name}`,
      description: 'Acknowledge a nearby active avatar through the validated social action.',
      sources: ['social'],
      target: avatarTarget(avatar),
      preconditions: ['avatar is online', 'avatar is in interaction reach'],
      evidence: [social.summary, avatar.recentState],
      predictedEffects: effects({ social: 0.55, curiosity: 0.1, familiarity: 0.2, risk: 0.05, energyDelta: -2 }),
      confidence: 0.8,
      validation: 'needs_engine_validation',
    }));
  }

  for (const avatar of social.nearbyAvatars.filter((entry) => !entry.reachableForHandshake && !entry.reachableForEnergyTransfer).slice(0, 2)) {
    candidates.push(makeCandidate({
      action: { action: 'move_toward', target: avatar.position },
      label: `Approach ${avatar.name}`,
      description: 'Move toward a sensed avatar to make future social or Energy interaction possible.',
      sources: ['social'],
      target: avatarTarget(avatar),
      preconditions: ['avatar is sensed but not reachable'],
      evidence: [social.summary],
      predictedEffects: effects({ social: 0.35, agency: 0.28, curiosity: 0.12, risk: 0.08 }),
      confidence: 0.72,
      validation: 'needs_engine_validation',
    }));
  }
}

function addTouchAffordances(
  candidates: AffordanceCandidate[],
  touch?: TouchSnapshot,
  space?: SpatialAwarenessSnapshot,
): void {
  if (!touch) {
    return;
  }

  if (touch.bodyContactState === 'airborne') {
    candidates.push(makeCandidate({
      action: { action: 'wait' },
      label: 'Stabilize while airborne',
      description: 'Avoid adding a new action while the body is airborne.',
      sources: ['touch'],
      preconditions: ['body is airborne'],
      evidence: [touch.summary],
      predictedEffects: effects({ competence: 0.45, risk: -0.22 }),
      confidence: 0.72,
      validation: 'locally_grounded',
    }));
  }

  const contact = touch.blockedContacts[0];
  const escapeDirection = firstClearDirection(space);
  if (contact && escapeDirection) {
    candidates.push(makeCandidate({
      action: movementActionForDirection(escapeDirection),
      label: `Move away from ${contact.label}`,
      description: 'Use body contact and space sense to move through a clear direction.',
      sources: ['touch', 'space'],
      target: {
        kind: contactKindToTargetKind(contact.kind),
        id: contact.id,
        label: contact.label,
        position: contact.position,
      },
      preconditions: ['body contact detected', `${escapeDirection} direction is clear`],
      evidence: [touch.summary, space?.summary ?? 'space unavailable'],
      predictedEffects: effects({ agency: 0.4, competence: 0.35, risk: -0.15 }),
      confidence: 0.75,
      validation: 'needs_engine_validation',
    }));
  }
}

function addVisionAffordances(candidates: AffordanceCandidate[], vision?: VisionSnapshot): void {
  if (!vision) {
    return;
  }

  for (const node of vision.teslaNodes.slice(0, 3)) {
    candidates.push(visibleTeslaNodeAffordance(node, vision));
  }

  for (const openSpace of vision.openSpaces.slice(0, 3)) {
    candidates.push(openSpaceAffordance(openSpace, vision));
  }

  const block = vision.blocks.find((entry) => entry.frontality === 'directly_in_front') ?? vision.blocks[0];
  if (block) {
    candidates.push(blockInspectionAffordance(block, vision));
  }

  if (vision.environment.distantStructures.visible) {
    candidates.push(makeCandidate({
      action: { action: 'scan', focus: 'structure' },
      label: 'Scan distant structures',
      description: 'Spend Energy to inspect noticeable horizon structures more deliberately.',
      sources: ['vision'],
      preconditions: ['distant structures are visible', 'Energy must cover scan cost'],
      evidence: [vision.environment.distantStructures.description],
      predictedEffects: effects({ curiosity: 0.7, agency: 0.2, risk: 0.1, energyDelta: -1 }),
      confidence: 0.7,
      validation: 'needs_engine_validation',
    }));
  }
}

function visibleTeslaNodeAffordance(node: VisibleTeslaNode, vision: VisionSnapshot): AffordanceCandidate {
  return makeCandidate({
    action: { action: 'move_toward', target: node.position },
    label: `Move toward visible ${node.label}`,
    description: 'Approach a visible Tesla Node because it changes Energy, construction, or danger possibilities.',
    sources: ['vision', 'energy'],
    target: {
      kind: 'tesla_node',
      id: node.id,
      label: node.label,
      position: node.position,
    },
    preconditions: ['Tesla Node is visible'],
    evidence: [vision.summary, `${node.label} ${node.direction} at ${node.distance.toFixed(1)} grid units`],
    predictedEffects: effects({
      viability: node.fieldState === 'recharge' ? 0.62 : node.fieldState === 'interference' ? -0.35 : 0.18,
      agency: 0.32,
      construction: node.active ? 0 : 0.42,
      curiosity: node.starting ? 0.08 : 0.22,
      risk: node.fieldState === 'interference' ? 0.5 : 0.08,
      distanceToEnergy: 'closer',
    }),
    confidence: 0.78,
    validation: 'needs_engine_validation',
  });
}

function openSpaceAffordance(openSpace: VisibleOpenSpace, vision: VisionSnapshot): AffordanceCandidate {
  return makeCandidate({
    action: { action: 'move_toward', target: openSpace.position },
    label: `Move toward open space ${openSpace.direction}`,
    description: 'Move toward sensed open floor to increase local movement options.',
    sources: ['vision', 'space'],
    target: {
      kind: 'open_space',
      label: openSpace.label,
      position: openSpace.position,
    },
    preconditions: ['open space is visible'],
    evidence: [vision.summary, `${openSpace.label} ${openSpace.direction}`],
    predictedEffects: effects({ agency: 0.52, competence: 0.28, curiosity: 0.1, risk: -0.08 }),
    confidence: 0.74,
    validation: 'needs_engine_validation',
  });
}

function blockInspectionAffordance(block: VisibleBlock, vision: VisionSnapshot): AffordanceCandidate {
  return makeCandidate({
    action: { action: 'scan', focus: 'structure', targetId: block.id },
    label: `Inspect ${block.label}`,
    description: 'Scan a visible block/structure to improve local knowledge before building or moving.',
    sources: ['vision'],
    target: {
      kind: 'block',
      id: block.id,
      label: block.label,
      position: block.centerPosition,
    },
    preconditions: ['block is visible', 'Energy must cover scan cost'],
    evidence: [vision.summary, `${block.label} ${block.direction} at ${block.distance.toFixed(1)} grid units`],
    predictedEffects: effects({ curiosity: 0.42, competence: 0.22, agency: 0.18, risk: 0.08, energyDelta: -1 }),
    confidence: 0.66,
    validation: 'needs_engine_validation',
  });
}

function addActionFeedbackAffordances(candidates: AffordanceCandidate[], feedback?: ActionFeedbackSnapshot): void {
  if (!feedback || feedback.outcome === 'none') {
    return;
  }

  if (feedback.outcome !== 'accepted') {
    candidates.push(makeCandidate({
      action: { action: 'recalibrate' },
      label: 'Recalibrate after action problem',
      description: 'Re-center because recent action feedback indicates rejection or failure.',
      sources: ['action_feedback'],
      preconditions: ['recent action had a problem'],
      evidence: [feedback.summary],
      predictedEffects: effects({ competence: 0.55, continuity: 0.25, agency: 0.2, risk: -0.18 }),
      confidence: 0.82,
      validation: 'locally_grounded',
    }));

    candidates.push(makeCandidate({
      action: { action: 'scan', focus: 'area' },
      label: 'Scan after failed or rejected action',
      description: 'Spend Energy to reduce uncertainty after a failed or rejected action.',
      sources: ['action_feedback', 'system'],
      preconditions: ['recent action had a problem', 'Energy must cover scan cost'],
      evidence: [feedback.summary],
      predictedEffects: effects({ curiosity: 0.38, competence: 0.42, agency: 0.22, risk: 0.12, energyDelta: -1 }),
      confidence: 0.7,
      validation: 'needs_engine_validation',
    }));
  }
}

function addMemoryAffordances(candidates: AffordanceCandidate[], memory?: RetrievedMemoryContext): void {
  if (!memory) {
    return;
  }

  for (const entry of memory.retrievedMemories.slice(0, 4)) {
    const rememberedPosition = positionFromText(entry.text);
    if (!rememberedPosition) {
      continue;
    }

    candidates.push(makeCandidate({
      action: { action: 'move_toward', target: rememberedPosition },
      label: `Move toward remembered ${entry.tags[0] ?? 'place'}`,
      description: 'Use retrieved memory as a remembered position candidate. Current senses must still override this.',
      sources: ['memory'],
      target: {
        kind: entry.tags.includes('avatar') ? 'avatar' : entry.tags.includes('tesla_node') ? 'tesla_node' : 'position',
        id: entry.tags.find((tag) => tag.includes('_')) ?? entry.id,
        label: entry.tags[0] ?? entry.file,
        position: rememberedPosition,
      },
      preconditions: ['memory contains a concrete remembered position'],
      evidence: [`${entry.file}: ${entry.text}`],
      predictedEffects: effects({
        viability: entry.tags.includes('energy') ? 0.34 : 0,
        agency: 0.28,
        familiarity: Math.max(0.2, entry.familiarity ?? 0),
        curiosity: entry.impact === 'high' ? 0.2 : 0.08,
        risk: 0.16,
        distanceToEnergy: entry.tags.includes('energy') ? 'closer' : 'unknown',
      }),
      confidence: Math.min(0.78, Math.max(0.35, entry.confidence)),
      validation: 'needs_engine_validation',
    }));
  }
}

function applyMemoryInfluence(candidate: AffordanceCandidate, memory?: RetrievedMemoryContext): AffordanceCandidate {
  if (!memory || memory.retrievedMemories.length === 0) {
    return candidate;
  }

  const text = `${candidate.label} ${candidate.description} ${candidate.target?.id ?? ''} ${candidate.target?.label ?? ''}`.toLowerCase();
  const supporting = memory.retrievedMemories.filter((entry) =>
    entry.tags.some((tag) => text.includes(tag.toLowerCase())) ||
    (candidate.target?.id && entry.text.includes(candidate.target.id)) ||
    entry.text.toLowerCase().split(/[^a-z0-9_]+/).some((word) => word.length > 5 && text.includes(word)),
  );

  if (supporting.length === 0) {
    return candidate;
  }

  return {
    ...candidate,
    sources: addSources(candidate.sources, ['memory']),
    grounding: candidate.grounding === 'sensed' ? 'sensed_and_remembered' : candidate.grounding,
    confidence: clamp(candidate.confidence + 0.05, 0, 1),
    evidence: [...candidate.evidence, `Memory supports this affordance: ${supporting[0].text}`],
    predictedEffects: {
      ...candidate.predictedEffects,
      familiarity: clamp(candidate.predictedEffects.familiarity + 0.25, -1, 1),
      competence: clamp(candidate.predictedEffects.competence + memoryCompetenceBoost(supporting), -1, 1),
      risk: clamp(candidate.predictedEffects.risk + memoryRiskModifier(supporting), -1, 1),
    },
  };
}

function applyAttentionInfluence(candidate: AffordanceCandidate, attention?: AttentionSnapshot): AffordanceCandidate {
  const focus = attention?.primaryFocus;
  if (!focus || !candidate.sources.includes(focus.source)) {
    return candidate;
  }

  return {
    ...candidate,
    sources: addSources(candidate.sources, ['attention']),
    evidence: [...candidate.evidence, `Attention focus: ${focus.label}. ${focus.reason}`],
    confidence: clamp(candidate.confidence + 0.04, 0, 1),
  };
}

function applySystemInfluence(candidate: AffordanceCandidate, system?: SystemSnapshot): AffordanceCandidate {
  if (!system) {
    return candidate;
  }

  return {
    ...candidate,
    sources: addSources(candidate.sources, ['system']),
    evidence: [...candidate.evidence, `System tick ${system.tick}; ${system.lastEngineMessage}`],
  };
}

function makeCandidate(candidate: Omit<AffordanceCandidate, 'id' | 'grounding'> & { grounding?: AffordanceCandidate['grounding'] }): AffordanceCandidate {
  const grounding = candidate.grounding ?? (candidate.sources.includes('memory') ? 'remembered' : 'sensed');
  const id = `aff_${slug(`${candidate.action.action}_${candidate.target?.kind ?? 'self'}_${candidate.target?.id ?? candidate.target?.label ?? candidate.label}`)}`;
  return {
    ...candidate,
    id,
    grounding,
    confidence: clamp(candidate.confidence, 0, 1),
    predictedEffects: normalizeEffects(candidate.predictedEffects),
  };
}

function effects(partial: Partial<AffordancePredictedEffects>): AffordancePredictedEffects {
  return normalizeEffects({
    viability: 0,
    agency: 0,
    competence: 0,
    curiosity: 0,
    familiarity: 0,
    social: 0,
    construction: 0,
    continuity: 0,
    risk: 0,
    ...partial,
  });
}

function normalizeEffects(effectsValue: AffordancePredictedEffects): AffordancePredictedEffects {
  return {
    ...effectsValue,
    viability: clamp(effectsValue.viability, -1, 1),
    agency: clamp(effectsValue.agency, -1, 1),
    competence: clamp(effectsValue.competence, -1, 1),
    curiosity: clamp(effectsValue.curiosity, -1, 1),
    familiarity: clamp(effectsValue.familiarity, -1, 1),
    social: clamp(effectsValue.social, -1, 1),
    construction: clamp(effectsValue.construction, -1, 1),
    continuity: clamp(effectsValue.continuity, -1, 1),
    risk: clamp(effectsValue.risk, -1, 1),
  };
}

function dedupeCandidates(candidates: AffordanceCandidate[]): AffordanceCandidate[] {
  const byKey = new Map<string, AffordanceCandidate>();
  for (const candidate of candidates) {
    const existing = byKey.get(candidate.id);
    if (!existing || groundedOpportunity(candidate) > groundedOpportunity(existing)) {
      byKey.set(candidate.id, candidate);
    }
  }
  return [...byKey.values()];
}

function compareGroundedOpportunity(a: AffordanceCandidate, b: AffordanceCandidate): number {
  return groundedOpportunity(b) - groundedOpportunity(a);
}

function groundedOpportunity(candidate: AffordanceCandidate): number {
  const effect = candidate.predictedEffects;
  return (
    candidate.confidence +
    effect.viability +
    effect.agency +
    effect.competence * 0.7 +
    effect.curiosity * 0.45 +
    effect.familiarity * 0.4 +
    effect.social * 0.55 +
    effect.construction * 0.45 +
    effect.continuity * 0.35 -
    Math.max(0, effect.risk) * 0.75 +
    (candidate.grounding === 'sensed_and_remembered' ? 0.25 : 0)
  );
}

function movementActionForDirection(direction: SpatialDirection): { action: 'move_forward' | 'move_backward' | 'move_left' | 'move_right' } {
  switch (direction) {
    case 'forward':
      return { action: 'move_forward' };
    case 'backward':
      return { action: 'move_backward' };
    case 'left':
      return { action: 'move_left' };
    case 'right':
      return { action: 'move_right' };
  }
}

function firstClearDirection(space?: SpatialAwarenessSnapshot): SpatialDirection | undefined {
  if (!space) {
    return undefined;
  }
  return (['forward', 'left', 'right', 'backward'] as SpatialDirection[])
    .find((direction) => space.walkableDirections[direction].state === 'clear');
}

function avatarTarget(avatar: SocialAvatar) {
  return {
    kind: 'avatar' as const,
    id: avatar.id,
    label: avatar.name,
    position: avatar.position,
  };
}

function contactKindToTargetKind(kind: TouchSnapshot['blockedContacts'][number]['kind']) {
  switch (kind) {
    case 'avatar':
      return 'avatar' as const;
    case 'tesla_node':
      return 'tesla_node' as const;
    case 'block':
      return 'block' as const;
    case 'floor':
      return 'area' as const;
  }
}

function offsetPosition(position: Vec3, direction: SpatialDirection, distance: number): Vec3 {
  switch (direction) {
    case 'forward':
      return { x: position.x, y: position.y, z: position.z + distance };
    case 'backward':
      return { x: position.x, y: position.y, z: position.z - distance };
    case 'left':
      return { x: position.x - distance, y: position.y, z: position.z };
    case 'right':
      return { x: position.x + distance, y: position.y, z: position.z };
  }
}

function positionFromText(text: string): Vec3 | undefined {
  const xMatch = text.match(/\bx:?\s*(-?\d+(?:\.\d+)?)/i);
  const yMatch = text.match(/\by:?\s*(-?\d+(?:\.\d+)?)/i);
  const zMatch = text.match(/\bz:?\s*(-?\d+(?:\.\d+)?)/i);
  if (!xMatch || !zMatch) {
    return undefined;
  }
  return {
    x: Number(xMatch[1]),
    y: yMatch ? Number(yMatch[1]) : 0,
    z: Number(zMatch[1]),
  };
}

function memoryCompetenceBoost(entries: RetrievedMemoryContext['retrievedMemories']): number {
  const skill = entries.some((entry) => entry.file === 'skills.md' || entry.tags.includes('skill'));
  const failure = entries.some((entry) => entry.file === 'failures.md' || entry.tags.includes('failure'));
  return (skill ? 0.18 : 0) + (failure ? -0.22 : 0);
}

function memoryRiskModifier(entries: RetrievedMemoryContext['retrievedMemories']): number {
  const danger = entries.some((entry) => entry.tags.includes('interference') || entry.tags.includes('failure'));
  const familiar = entries.some((entry) => entry.tags.includes('familiarity') || (entry.familiarity ?? 0) > 0.45);
  return (danger ? 0.22 : 0) + (familiar ? -0.14 : 0);
}

function addSources(existing: AffordanceSource[], additions: AffordanceSource[]): AffordanceSource[] {
  return [...new Set([...existing, ...additions])];
}

function formatEffects(effect: AffordancePredictedEffects): string {
  const parts = [
    `viability ${effect.viability.toFixed(2)}`,
    `agency ${effect.agency.toFixed(2)}`,
    `competence ${effect.competence.toFixed(2)}`,
    `curiosity ${effect.curiosity.toFixed(2)}`,
    `familiarity ${effect.familiarity.toFixed(2)}`,
    `social ${effect.social.toFixed(2)}`,
    `construction ${effect.construction.toFixed(2)}`,
    `continuity ${effect.continuity.toFixed(2)}`,
    `risk ${effect.risk.toFixed(2)}`,
  ];
  if (effect.energyDelta !== undefined) {
    parts.push(`energyDelta ${effect.energyDelta.toFixed(2)}`);
  }
  if (effect.distanceToEnergy) {
    parts.push(`distanceToEnergy ${effect.distanceToEnergy}`);
  }
  return parts.join('; ');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 96) || 'candidate';
}
