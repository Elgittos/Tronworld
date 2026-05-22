import { WORLD_RULES, distance2D } from '../../world/types';
import { RetrievedMemoryContext, RetrievedMemoryEntry } from '../../runtime/runtimeApi';
import { AffordanceCandidate, AffordancePredictedEffects } from '../affordances/types';
import { ActionFeedbackSnapshot } from '../senses/action_feedback/types';
import { AttentionPriority, AttentionSnapshot } from '../senses/attention/types';
import { AwarenessSnapshot } from '../senses/awareness/types';
import { EnergySnapshot } from '../senses/energy/types';
import { SocialSnapshot } from '../senses/social/types';
import { SpatialAwarenessSnapshot } from '../senses/space/types';
import { SystemSnapshot } from '../senses/system/types';
import { TouchSnapshot } from '../senses/touch/types';
import { VisionSnapshot } from '../senses/vision/types';
import {
  MotivationAppraisal,
  MotivationLatentState,
  MotivationNeedSignal,
  MotivationNeedState,
  MotivationPressureName,
  MotivationPressures,
  MotivationScoreParts,
  MotivationSnapshot,
  MotivationVeto,
} from './types';

export type MotivationInput = {
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
  affordances: AffordanceCandidate[];
  currentPlan?: {
    candidateId?: string;
    objective?: string;
    targetLabel?: string;
    mode?: string;
  };
};

export type MotivationOptions = {
  maxAppraisals: number;
};

const DEFAULT_MOTIVATION_OPTIONS: MotivationOptions = {
  maxAppraisals: 24,
};

const PRESSURES: MotivationPressureName[] = [
  'viability',
  'agency',
  'competence',
  'curiosity',
  'familiarity',
  'social',
  'construction',
  'continuity',
];

const SECONDARY_PERSONALITY = {
  focus: 0.92,
  connection: 0.74,
  curiosity: 0.68,
  purpose: 0.76,
  generosity: 0.58,
  persistence: 0.7,
  riskTolerance: 0.32,
};

export function buildMotivationSnapshot(input: MotivationInput, options: Partial<MotivationOptions> = {}): MotivationSnapshot {
  const resolvedOptions = { ...DEFAULT_MOTIVATION_OPTIONS, ...options };
  const needs = buildNeedState(input);
  const latent = buildLatentState(input, needs);
  const globalPressures = buildGlobalPressures(input, needs, latent);
  const context = buildMotivationContext(input);
  const appraisals = input.affordances
    .map((candidate) => appraiseCandidate(candidate, input, needs, latent, globalPressures))
    .sort((a, b) => b.total - a.total)
    .slice(0, resolvedOptions.maxAppraisals);

  return {
    avatarId: input.awareness?.avatarId ?? input.energy?.avatarId,
    tick: input.system?.tick ?? input.vision?.tick,
    summary: summarizeMotivation(needs, latent, globalPressures, appraisals),
    latent,
    needs,
    globalPressures,
    appraisals,
    constraints: context.constraints,
    assumptions: context.assumptions,
    budget: {
      inputCandidates: input.affordances.length,
      appraisedCandidates: appraisals.length,
      maxAppraisals: resolvedOptions.maxAppraisals,
    },
  };
}

export function formatMotivationDebug(snapshot: MotivationSnapshot): string {
  return [
    'Current motivation snapshot. This is non-executing: it ranks grounded affordances but does not move or mutate the world.',
    `Summary: ${snapshot.summary}`,
    `Latent state: ${formatLatent(snapshot.latent)}`,
    `Needs: ${formatNeeds(snapshot.needs)}`,
    `Global pressures: ${formatPressures(snapshot.globalPressures)}`,
    `Constraints: ${snapshot.constraints.join(' | ') || 'none'}`,
    `Assumptions: ${snapshot.assumptions.join(' | ')}`,
    `Appraisals (${snapshot.appraisals.length}/${snapshot.budget.inputCandidates}):`,
    snapshot.appraisals.map(formatAppraisal).join('\n') || 'none',
  ].join('\n');
}

export function formatMotivationForChat(snapshot: MotivationSnapshot | undefined): string {
  if (!snapshot) {
    return '- Motivation context unavailable.';
  }

  const topPressures = PRESSURES
    .map((pressure) => ({ pressure, value: snapshot.globalPressures[pressure] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((entry) => `${entry.pressure} ${entry.value.toFixed(2)}`)
    .join('; ');
  const topAppraisals = snapshot.appraisals
    .slice(0, 3)
    .map((appraisal) => `${appraisal.candidateId} score ${appraisal.total.toFixed(2)}`)
    .join('; ');

  return [
    `- ${snapshot.summary}`,
    `- Strongest pressures: ${topPressures || 'none'}.`,
    `- Top appraisals: ${topAppraisals || 'none'}.`,
    '- These are utility appraisals over grounded affordances, not commands.',
  ].join('\n');
}

function buildNeedState(input: MotivationInput): MotivationNeedState {
  const energy = buildEnergyNeed(input);
  const focus = buildFocusNeed(input);
  const connection = buildConnectionNeed(input);
  const curiosity = buildCuriosityNeed(input);
  const purpose = buildPurposeNeed(input);
  return { energy, focus, connection, curiosity, purpose };
}

function buildEnergyNeed(input: MotivationInput): MotivationNeedState['energy'] {
  const maxEnergy = input.energy?.maxEnergy ?? input.awareness?.vital.maxEnergy ?? WORLD_RULES.maxEnergy;
  const currentEnergy = input.energy?.currentEnergy ?? input.awareness?.vital.energy ?? maxEnergy;
  const reserve = Math.max(WORLD_RULES.donorReserveEnergy, maxEnergy * 0.14);
  const returnCost = estimateReturnCost(input);
  const usableRange = Math.max(1, maxEnergy - reserve);
  const runway = clamp((currentEnergy - reserve - returnCost) / usableRange, 0, 1);
  const pressure = clamp(Math.pow(1 - runway, 3), 0, 1);
  const evidence = [
    `Energy ${currentEnergy.toFixed(1)} / ${maxEnergy.toFixed(1)}`,
    `Runway ${runway.toFixed(2)} after reserve ${reserve.toFixed(1)} and estimated return cost ${returnCost.toFixed(1)}`,
  ];

  if (input.energy?.insideInterferenceField) {
    evidence.push('Inside interference field.');
  }
  if (input.energy?.insideRechargeField) {
    evidence.push('Inside recharge field.');
  }
  if (input.energy?.timeEstimate.description) {
    evidence.push(input.energy.timeEstimate.description);
  }

  return {
    satisfaction: runway,
    pressure,
    confidence: input.energy ? 0.92 : 0.55,
    evidence,
    runway,
    reserve,
    estimatedReturnCost: returnCost,
  };
}

function buildFocusNeed(input: MotivationInput): MotivationNeedSignal {
  let satisfaction = 0.74;
  const evidence: string[] = [];

  if (input.awareness?.intention.currentGoal) {
    satisfaction += 0.08;
    evidence.push(`Current goal: ${input.awareness.intention.currentGoal}`);
  }
  if (input.awareness?.intention.intendedNextStep) {
    satisfaction += 0.08;
    evidence.push(`Intended next step: ${input.awareness.intention.intendedNextStep}`);
  }
  if (input.currentPlan?.candidateId) {
    satisfaction += 0.08;
    evidence.push(`Current plan candidate: ${input.currentPlan.candidateId}`);
  }
  if (input.actionFeedback?.outcome === 'rejected' || input.actionFeedback?.outcome === 'failed') {
    satisfaction -= 0.32;
    evidence.push(input.actionFeedback.summary);
  }
  if (input.touch?.bodyContactState === 'airborne') {
    satisfaction -= 0.18;
    evidence.push(input.touch.summary);
  }
  if (input.space?.localAreaType === 'blocked_pocket') {
    satisfaction -= 0.18;
    evidence.push(input.space.summary);
  }
  if (input.attention?.primaryFocus?.priority === 'critical') {
    satisfaction -= 0.14;
    evidence.push(`Critical attention: ${input.attention.primaryFocus.label}`);
  }

  satisfaction = clamp(satisfaction, 0, 1);
  return {
    satisfaction,
    pressure: needPressure(satisfaction, 2),
    confidence: confidenceFromSources([!!input.awareness, !!input.actionFeedback, !!input.space, !!input.touch]),
    evidence: evidence.length ? evidence : ['No strong focus disruption sensed.'],
  };
}

function buildConnectionNeed(input: MotivationInput): MotivationNeedSignal {
  let satisfaction = 0.5;
  const evidence: string[] = [];
  const social = input.social;
  const socialMemories = input.memory?.retrievedMemories.filter((entry) => entry.category === 'avatar' || entry.tags.includes('avatar')) ?? [];

  if (social) {
    if (social.nearbyAvatars.length > 0) {
      satisfaction += Math.min(0.22, social.nearbyAvatars.length * 0.07);
      evidence.push(social.summary);
    } else {
      satisfaction -= 0.12;
      evidence.push('No nearby avatars sensed.');
    }
    if (social.reachableAvatars.length > 0) {
      satisfaction += 0.1;
    }
    if (social.avatarsNeedingEnergy.length > 0 || social.shutdownAvatars.length > 0) {
      satisfaction -= 0.22;
      evidence.push('Nearby avatar need creates social pressure.');
    }
  }

  if (socialMemories.length > 0) {
    satisfaction += Math.min(0.12, socialMemories.length * 0.04);
    evidence.push(`Retrieved ${socialMemories.length} avatar memory entries.`);
  }

  satisfaction = clamp(satisfaction, 0, 1);
  return {
    satisfaction,
    pressure: clamp(needPressure(satisfaction, 1.7) + (social?.avatarsNeedingEnergy.length ? 0.35 : 0), 0, 1),
    confidence: confidenceFromSources([!!social, socialMemories.length > 0]),
    evidence: evidence.length ? evidence : ['Connection is inferred from absence of nearby social cues.'],
  };
}

function buildCuriosityNeed(input: MotivationInput): MotivationNeedSignal {
  let novelty = 0;
  const evidence: string[] = [];
  const vision = input.vision;

  if (vision?.environment.distantStructures.visible) {
    novelty += 0.28;
    evidence.push(vision.environment.distantStructures.description);
  }
  if (vision?.openSpaces.length) {
    novelty += Math.min(0.18, vision.openSpaces.length * 0.035);
    evidence.push(`${vision.openSpaces.length} visible open-space options.`);
  }
  if (vision?.teslaNodes.some((node) => !node.starting)) {
    novelty += 0.18;
    evidence.push('Non-starting Tesla Node visible.');
  }
  if (vision?.blocks.length) {
    novelty += Math.min(0.16, vision.blocks.length * 0.02);
  }

  const memoryNovelty = average(
    input.memory?.retrievedMemories
      .map((entry) => entry.novelty ?? 0)
      .filter((value) => value > 0) ?? [],
  );
  if (memoryNovelty > 0) {
    novelty += memoryNovelty * 0.16;
    evidence.push(`Retrieved novelty prior ${memoryNovelty.toFixed(2)}.`);
  }

  const familiarity = average(
    input.memory?.retrievedMemories
      .map((entry) => entry.familiarity ?? 0)
      .filter((value) => value > 0) ?? [],
  );
  const satisfaction = clamp(0.46 + familiarity * 0.28 - novelty * 0.2, 0, 1);
  const pressure = clamp(novelty + needPressure(satisfaction, 2.2) * 0.35, 0, 1);

  return {
    satisfaction,
    pressure,
    confidence: confidenceFromSources([!!vision, !!input.memory]),
    evidence: evidence.length ? evidence : ['No strong novelty cue was sensed.'],
  };
}

function buildPurposeNeed(input: MotivationInput): MotivationNeedSignal {
  let satisfaction = 0.55;
  let opportunity = 0;
  const evidence: string[] = [];

  if (input.awareness?.intention.currentGoal) {
    satisfaction += 0.08;
    evidence.push(`Goal: ${input.awareness.intention.currentGoal}`);
  }
  if (input.affordances.some((candidate) => candidate.predictedEffects.construction > 0.25)) {
    opportunity += 0.28;
    evidence.push('Construction affordances are available.');
  }
  if (input.energy?.nearbyEnergySources.some((source) => !source.active || source.fieldState === 'unfinished')) {
    opportunity += 0.22;
    evidence.push('Unfinished or inactive Energy infrastructure is sensed.');
  }
  if (input.vision?.environment.distantStructures.visible) {
    opportunity += 0.12;
  }
  if (input.actionFeedback?.outcome === 'accepted') {
    satisfaction += 0.08;
  }
  if (input.actionFeedback?.outcome === 'rejected' || input.actionFeedback?.outcome === 'failed') {
    satisfaction -= 0.12;
  }

  satisfaction = clamp(satisfaction, 0, 1);
  return {
    satisfaction,
    pressure: clamp(needPressure(satisfaction, 1.8) * 0.55 + opportunity, 0, 1),
    confidence: confidenceFromSources([!!input.awareness, !!input.energy, !!input.vision, input.affordances.length > 0]),
    evidence: evidence.length ? evidence : ['Purpose pressure is low because no clear project affordance is present.'],
  };
}

function buildLatentState(input: MotivationInput, needs: MotivationNeedState): MotivationLatentState {
  const focus = needs.focus.satisfaction;
  const connection = needs.connection.satisfaction;
  const curiosity = needs.curiosity.satisfaction;
  const purpose = needs.purpose.satisfaction;
  const frustration = frustrationFrom(input);
  const commitment = commitmentFrom(input, needs, frustration);
  const trust = trustFromMemory(input.memory);
  const energyRunway = needs.energy.runway;
  const safetyMargin = clamp(energyRunway - Math.max(0, input.energy?.insideInterferenceField ? 0.28 : 0), 0, 1);

  return {
    energyRunway: round(energyRunway),
    focus: round(focus),
    connection: round(connection),
    curiosity: round(curiosity),
    purpose: round(purpose),
    commitment: round(commitment),
    frustration: round(frustration),
    safetyMargin: round(safetyMargin),
    trust: round(trust),
  };
}

function buildGlobalPressures(input: MotivationInput, needs: MotivationNeedState, latent: MotivationLatentState): MotivationPressures {
  const viability = clamp(needs.energy.pressure + (input.energy?.insideInterferenceField ? 0.3 : 0), 0, 1);
  const agency = clamp(
    0.18 +
      (input.space ? (4 - input.space.openFloor.openDirectionCount) / 4 : 0.2) * 0.36 +
      (input.affordances.length === 0 ? 0.24 : 0) +
      (viability > 0.65 ? 0.14 : 0),
    0,
    1,
  );
  const competence = clamp(needs.focus.pressure * 0.55 + latent.frustration * 0.45 + (input.touch?.bodyContactState === 'airborne' ? 0.2 : 0), 0, 1);
  const curiosity = clamp(needs.curiosity.pressure * (viability > 0.72 ? 0.55 : 1), 0, 1);
  const familiarity = clamp((1 - latent.safetyMargin) * 0.35 + memoryFamiliarity(input.memory) * 0.45, 0, 1);
  const social = clamp(needs.connection.pressure * 0.75 + (input.social?.avatarsNeedingEnergy.length ? 0.35 : 0), 0, 1);
  const construction = clamp(needs.purpose.pressure * (viability > 0.72 ? 0.45 : 1), 0, 1);
  const continuity = clamp(latent.commitment * (1 - latent.frustration * 0.45), 0, 1);
  const pressures = { viability, agency, competence, curiosity, familiarity, social, construction, continuity };

  const focus = input.attention?.primaryFocus;
  if (focus) {
    const pressure = pressureFromAttentionSource(focus.source);
    pressures[pressure] = clamp(pressures[pressure] + attentionBoost(focus.priority), 0, 1);
  }

  return roundPressures(pressures);
}

function appraiseCandidate(
  candidate: AffordanceCandidate,
  input: MotivationInput,
  needs: MotivationNeedState,
  latent: MotivationLatentState,
  globalPressures: MotivationPressures,
): MotivationAppraisal {
  const candidatePressures = pressuresFromEffects(candidate.predictedEffects);
  const feasibility = feasibilityFor(candidate);
  const safety = safetyFor(candidate, latent, needs);
  const needUtility = weightedNeedUtility(candidatePressures, globalPressures);
  const energyTerm = energyTermFor(candidate, needs);
  const memory = memoryInfluenceFor(candidate, input.memory);
  const commitment = commitmentForCandidate(candidate, input, latent);
  const novelty = noveltyForCandidate(candidate, input.memory);
  const trust = trustForCandidate(candidate, input, latent);
  const repeatPenalty = repeatPenaltyFor(candidate, input, needs);
  const proximityPenalty = proximityPenaltyFor(candidate, input, needs) + energySaturationPenaltyFor(candidate, input, needs);
  const riskPenalty = riskPenaltyFor(candidate, latent);
  const vetoes = vetoesFor(candidate, input, needs, latent);
  const vetoPenalty = vetoes.reduce((total, veto) => total + (veto.severity === 'hard' ? 1.4 : 0.45), 0);
  const scoreParts: MotivationScoreParts = {
    needUtility: round(needUtility),
    energyTerm: round(energyTerm),
    feasibility: round(feasibility),
    safety: round(safety),
    memory: round(memory),
    commitment: round(commitment),
    novelty: round(novelty),
    trust: round(trust),
    repeatPenalty: round(repeatPenalty),
    proximityPenalty: round(proximityPenalty),
    riskPenalty: round(riskPenalty),
    vetoPenalty: round(vetoPenalty),
  };
  const positive =
    needUtility +
    energyTerm +
    memory +
    commitment * SECONDARY_PERSONALITY.persistence +
    novelty * SECONDARY_PERSONALITY.curiosity +
    trust;
  const total = feasibility * safety * positive - repeatPenalty - proximityPenalty - riskPenalty - vetoPenalty;

  return {
    candidateId: candidate.id,
    total: round(total),
    pressures: roundPressures(candidatePressures),
    scoreParts,
    risks: collectRisks(candidate, input, vetoes),
    reasons: collectReasons(candidate, globalPressures, scoreParts),
    tensions: collectTensions(candidate, input, globalPressures, scoreParts),
    vetoes,
  };
}

function estimateReturnCost(input: MotivationInput): number {
  const nearestDistance =
    input.energy?.nearbyEnergySources
      .filter((source) => source.fieldState === 'recharge' || source.active)
      .sort((a, b) => a.distance - b.distance)[0]?.distance ??
    input.energy?.bestReachableEnergySource?.distance ??
    0;
  const movementCostEstimate = nearestDistance * 0.16;
  const drainCostEstimate = Math.max(0, -(input.energy?.drain.netEnergyRate ?? 0)) * 8;
  return clamp(movementCostEstimate + drainCostEstimate, 0, WORLD_RULES.maxEnergy * 0.6);
}

function needPressure(satisfaction: number, gamma: number): number {
  return clamp(Math.pow(1 - clamp(satisfaction, 0, 1), gamma), 0, 1);
}

function pressuresFromEffects(effects: AffordancePredictedEffects): MotivationPressures {
  return roundPressures({
    viability: effects.viability,
    agency: effects.agency,
    competence: effects.competence,
    curiosity: effects.curiosity,
    familiarity: effects.familiarity,
    social: effects.social,
    construction: effects.construction,
    continuity: effects.continuity,
  });
}

function weightedNeedUtility(candidatePressures: MotivationPressures, globalPressures: MotivationPressures): number {
  return PRESSURES.reduce((total, pressure) => total + positive(candidatePressures[pressure]) * globalPressures[pressure], 0);
}

function energyTermFor(candidate: AffordanceCandidate, needs: MotivationNeedState): number {
  const delta = candidate.predictedEffects.energyDelta;
  const distanceToEnergy = candidate.predictedEffects.distanceToEnergy;
  let term = 0;

  if (delta !== undefined) {
    const normalizedDelta = clamp(delta / Math.max(1, needs.energy.reserve * 2), -1, 1);
    term += normalizedDelta >= 0 ? needs.energy.pressure * normalizedDelta : normalizedDelta * (0.35 + needs.energy.pressure);
  }

  if (distanceToEnergy === 'closer') {
    term += needs.energy.pressure * 0.22;
  } else if (distanceToEnergy === 'farther') {
    term -= needs.energy.pressure * 0.18;
  }

  return term;
}

function feasibilityFor(candidate: AffordanceCandidate): number {
  const grounding =
    candidate.grounding === 'sensed_and_remembered' ? 1 :
    candidate.grounding === 'sensed' ? 0.92 :
    0.68;
  const validation = candidate.validation === 'locally_grounded' ? 1 : 0.86;
  return clamp(candidate.confidence * grounding * validation, 0, 1);
}

function safetyFor(candidate: AffordanceCandidate, latent: MotivationLatentState, needs: MotivationNeedState): number {
  const risk = Math.max(0, candidate.predictedEffects.risk);
  const energyCost = Math.max(0, -(candidate.predictedEffects.energyDelta ?? 0));
  const energyCostPressure = clamp(energyCost / Math.max(1, needs.energy.reserve), 0, 1) * needs.energy.pressure;
  return clamp(1 - risk * (1 - SECONDARY_PERSONALITY.riskTolerance) - energyCostPressure * 0.45 + latent.safetyMargin * 0.08, 0, 1);
}

function memoryInfluenceFor(candidate: AffordanceCandidate, memory?: RetrievedMemoryContext): number {
  if (!memory?.retrievedMemories.length) {
    return 0;
  }
  const matches = matchingMemories(candidate, memory.retrievedMemories);
  if (matches.length === 0) {
    return 0;
  }
  const support = matches.reduce((total, entry) => {
    const confidence = entry.confidence ?? 0.5;
    const importance = entry.importance ?? 0;
    const familiarity = entry.familiarity ?? 0;
    const impact = entry.impact === 'high' ? 0.18 : entry.impact === 'medium' ? 0.08 : 0;
    const risk = entry.tags.includes('failure') || entry.category === 'failure' || entry.tags.includes('interference') ? -0.18 : 0;
    return total + confidence * 0.08 + importance * 0.08 + familiarity * 0.1 + impact + risk;
  }, 0);
  return clamp(support, -0.35, 0.5);
}

function commitmentForCandidate(candidate: AffordanceCandidate, input: MotivationInput, latent: MotivationLatentState): number {
  const continuityText = [
    input.awareness?.intention.currentGoal,
    input.awareness?.intention.intendedNextStep,
    input.awareness?.intention.recentDecision,
    input.currentPlan?.objective,
    input.currentPlan?.targetLabel,
  ].filter(Boolean).join(' ');
  const candidateText = `${candidate.label} ${candidate.description} ${candidate.target?.label ?? ''}`;
  const overlap = sharedMeaningfulWord(continuityText, candidateText) ? 0.28 : 0;
  const directPlan = input.currentPlan?.candidateId === candidate.id ? 0.4 : 0;
  return clamp(latent.commitment * positive(candidate.predictedEffects.continuity) + overlap + directPlan, 0, 1);
}

function noveltyForCandidate(candidate: AffordanceCandidate, memory?: RetrievedMemoryContext): number {
  const memoryNovelty = average(matchingMemories(candidate, memory?.retrievedMemories ?? []).map((entry) => entry.novelty ?? 0));
  return clamp(positive(candidate.predictedEffects.curiosity) * 0.5 + memoryNovelty * 0.25, 0, 1);
}

function trustForCandidate(candidate: AffordanceCandidate, input: MotivationInput, latent: MotivationLatentState): number {
  if (candidate.target?.kind !== 'avatar' && !candidate.sources.includes('social')) {
    return 0;
  }
  const donorPressure = candidate.action.action === 'transfer_energy' ? SECONDARY_PERSONALITY.generosity * 0.18 : 0;
  const needPressureBoost = input.social?.avatarsNeedingEnergy.some((avatar) => avatar.id === candidate.target?.id) ? 0.22 : 0;
  return clamp(latent.trust * 0.16 + donorPressure + needPressureBoost, -0.25, 0.45);
}

function repeatPenaltyFor(candidate: AffordanceCandidate, input: MotivationInput, needs: MotivationNeedState): number {
  let penalty = 0;
  if (
    input.actionFeedback &&
    (input.actionFeedback.outcome === 'rejected' || input.actionFeedback.outcome === 'failed') &&
    input.actionFeedback.attemptedAction === candidate.action.action
  ) {
    penalty += 0.32;
  }
  const failureMemory = matchingMemories(candidate, input.memory?.retrievedMemories ?? [])
    .some((entry) => entry.category === 'failure' || entry.tags.includes('failure'));
  if (failureMemory) {
    penalty += 0.18;
  }

  if (
    input.actionFeedback?.outcome === 'accepted' &&
    input.actionFeedback.attemptedAction === candidate.action.action &&
    isSatiableAction(candidate.action.action) &&
    needs.energy.pressure < 0.35
  ) {
    penalty += 0.22;
  }

  return penalty;
}

function isSatiableAction(action: string): boolean {
  return action === 'wait' || action === 'recalibrate' || action === 'recharge' || action === 'scan' || action === 'handshake';
}

function proximityPenaltyFor(
  candidate: AffordanceCandidate,
  input: MotivationInput,
  needs: MotivationNeedState,
): number {
  if (candidate.action.action !== 'move_toward' || !candidate.target?.position || !input.awareness) {
    return 0;
  }

  const distance = distance2D(input.awareness.bodyState.position, candidate.target.position);
  const nearTargetDistance = Math.max(1.25, WORLD_RULES.interactReach * 0.35);
  const proximity = clamp((nearTargetDistance - distance) / nearTargetDistance, 0, 1);
  if (proximity <= 0) {
    return 0;
  }

  const usefulPressure = Math.max(
    positive(candidate.predictedEffects.viability) * needs.energy.pressure,
    positive(candidate.predictedEffects.social) * 0.45,
    positive(candidate.predictedEffects.construction) * 0.45,
  );
  const marginalDiscount = clamp(0.38 - usefulPressure * 0.24, 0.1, 0.38);
  return proximity * marginalDiscount;
}

function energySaturationPenaltyFor(
  candidate: AffordanceCandidate,
  input: MotivationInput,
  needs: MotivationNeedState,
): number {
  const energy = input.energy;
  if (!energy) {
    return 0;
  }

  const alreadySafeInRecharge =
    energy.insideRechargeField &&
    !energy.insideInterferenceField &&
    (energy.energyState === 'full' || needs.energy.pressure < 0.04);

  if (!alreadySafeInRecharge) {
    return 0;
  }

  if (candidate.action.action === 'recharge') {
    return 1.1;
  }

  if (candidate.target?.kind !== 'tesla_node' || candidate.predictedEffects.distanceToEnergy !== 'closer') {
    return 0;
  }

  const targetSource = energy.nearbyEnergySources.find((source) => source.id === candidate.target?.id);
  if (targetSource?.insideField && targetSource.fieldState === 'recharge') {
    return 0.72;
  }

  return 0;
}

function riskPenaltyFor(candidate: AffordanceCandidate, latent: MotivationLatentState): number {
  const risk = Math.max(0, candidate.predictedEffects.risk);
  return risk * (0.55 + (1 - latent.safetyMargin) * 0.35);
}

function vetoesFor(
  candidate: AffordanceCandidate,
  input: MotivationInput,
  needs: MotivationNeedState,
  latent: MotivationLatentState,
): MotivationVeto[] {
  const vetoes: MotivationVeto[] = [];
  const energyCost = Math.max(0, -(candidate.predictedEffects.energyDelta ?? 0));

  if (input.awareness?.bodyState.onlineState === 'shutdown') {
    vetoes.push({
      id: 'body_shutdown',
      severity: 'hard',
      reason: 'The body is shutdown; only external Energy transfer can restore action.',
    });
  }

  if (energyCost > 0 && needs.energy.runway < 0.12 && candidate.predictedEffects.distanceToEnergy !== 'closer') {
    vetoes.push({
      id: 'unsafe_energy_spend',
      severity: 'soft',
      reason: 'Energy runway is very low and this candidate does not move closer to Energy.',
    });
  }

  if (candidate.grounding === 'remembered' && latent.safetyMargin < 0.25) {
    vetoes.push({
      id: 'memory_only_in_crisis',
      severity: 'soft',
      reason: 'Remembered target is weak evidence while safety margin is low.',
    });
  }

  return vetoes;
}

function collectRisks(candidate: AffordanceCandidate, input: MotivationInput, vetoes: MotivationVeto[]): string[] {
  const risks: string[] = [];
  if (candidate.predictedEffects.risk > 0.15) {
    risks.push(`Predicted risk ${candidate.predictedEffects.risk.toFixed(2)}.`);
  }
  if (candidate.validation === 'needs_engine_validation') {
    risks.push('Needs engine validation.');
  }
  if (candidate.grounding === 'remembered') {
    risks.push('Memory-only target needs present confirmation.');
  }
  if (input.energy?.insideInterferenceField && candidate.predictedEffects.viability <= 0) {
    risks.push('Interference is active and this candidate does not improve viability.');
  }
  return compact([...risks, ...vetoes.map((veto) => veto.reason)], 5);
}

function collectReasons(
  candidate: AffordanceCandidate,
  globalPressures: MotivationPressures,
  scoreParts: MotivationScoreParts,
): string[] {
  const dominant = PRESSURES
    .map((pressure) => ({ pressure, value: positive(candidate.predictedEffects[pressure]) * globalPressures[pressure] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .filter((entry) => entry.value > 0.03)
    .map((entry) => `${entry.pressure} fit ${entry.value.toFixed(2)}`);
  return compact([
    ...dominant,
    `feasibility ${scoreParts.feasibility.toFixed(2)}`,
    `safety ${scoreParts.safety.toFixed(2)}`,
    scoreParts.memory !== 0 ? `memory influence ${scoreParts.memory.toFixed(2)}` : '',
    scoreParts.commitment > 0.05 ? `commitment ${scoreParts.commitment.toFixed(2)}` : '',
  ], 5);
}

function collectTensions(
  candidate: AffordanceCandidate,
  input: MotivationInput,
  globalPressures: MotivationPressures,
  scoreParts: MotivationScoreParts,
): string[] {
  const tensions: string[] = [];
  if (globalPressures.viability > 0.65 && candidate.predictedEffects.curiosity > 0.35) {
    tensions.push('Curiosity competes with viability pressure.');
  }
  if (globalPressures.social > 0.55 && candidate.predictedEffects.energyDelta !== undefined && candidate.predictedEffects.energyDelta < 0) {
    tensions.push('Social value costs Energy.');
  }
  if (scoreParts.repeatPenalty > 0) {
    tensions.push('Recent or remembered failure creates repeat penalty.');
  }
  if (scoreParts.proximityPenalty > 0) {
    tensions.push('Target or passive action has low marginal value in the current state.');
  }
  if (input.currentPlan?.candidateId && input.currentPlan.candidateId !== candidate.id && scoreParts.commitment < 0.05) {
    tensions.push('Candidate may break current commitment.');
  }
  return compact(tensions, 4);
}

function buildMotivationContext(input: MotivationInput): { constraints: string[]; assumptions: string[] } {
  const constraints = [
    'Motivation appraises affordances only; it does not invent or execute actions.',
    'World/action validators remain authoritative.',
  ];
  const assumptions = [
    'Focus, connection, curiosity, purpose, commitment, trust, and frustration are latent pressure estimates, not persisted vital stats.',
    'Energy is the only vital stat and uses the sharpest pressure curve.',
    'Current senses override memory.',
  ];

  if (!input.memory) {
    assumptions.push('No retrieved memory context was available.');
  }
  if (input.affordances.length === 0) {
    constraints.push('No affordance candidates were available to appraise.');
  }
  if (input.energy?.insideInterferenceField) {
    constraints.push('Interference field creates strong viability pressure.');
  }
  if (input.awareness?.bodyState.onlineState === 'shutdown') {
    constraints.push('Shutdown body cannot execute ordinary actions.');
  }

  return { constraints, assumptions };
}

function summarizeMotivation(
  needs: MotivationNeedState,
  latent: MotivationLatentState,
  pressures: MotivationPressures,
  appraisals: MotivationAppraisal[],
): string {
  const strongest = PRESSURES
    .map((pressure) => ({ pressure, value: pressures[pressure] }))
    .sort((a, b) => b.value - a.value)[0];
  const top = appraisals[0];
  const topText = top ? ` Top affordance appraisal is ${top.candidateId} at ${top.total.toFixed(2)}.` : ' No affordance was appraised.';
  return `Motivation is led by ${strongest.pressure} pressure ${strongest.value.toFixed(2)} with Energy runway ${needs.energy.runway.toFixed(2)} and commitment ${latent.commitment.toFixed(2)}.${topText}`;
}

function matchingMemories(candidate: AffordanceCandidate, entries: RetrievedMemoryEntry[]): RetrievedMemoryEntry[] {
  const text = `${candidate.label} ${candidate.description} ${candidate.target?.id ?? ''} ${candidate.target?.label ?? ''}`.toLowerCase();
  return entries.filter((entry) =>
    entry.tags.some((tag) => text.includes(tag.toLowerCase())) ||
    (candidate.target?.id && entry.text.toLowerCase().includes(candidate.target.id.toLowerCase())) ||
    words(entry.text).some((word) => word.length > 5 && text.includes(word)),
  );
}

function memoryFamiliarity(memory?: RetrievedMemoryContext): number {
  return average(memory?.retrievedMemories.map((entry) => entry.familiarity ?? 0).filter((value) => value > 0) ?? []);
}

function trustFromMemory(memory?: RetrievedMemoryContext): number {
  if (!memory?.retrievedMemories.length) {
    return 0;
  }

  const avatarEntries = memory.retrievedMemories.filter((entry) => entry.category === 'avatar' || entry.tags.includes('avatar'));
  if (avatarEntries.length === 0) {
    return 0;
  }

  const trust = avatarEntries.reduce((total, entry) => {
    const text = entry.text.toLowerCase();
    const positiveValue = text.includes('help') || text.includes('revive') || text.includes('handshake') ? 0.16 : 0;
    const negativeValue = text.includes('failed') || text.includes('shutdown') ? -0.08 : 0;
    return total + positiveValue + negativeValue + (entry.confidence - 0.5) * 0.08;
  }, 0);
  return clamp(trust, -1, 1);
}

function frustrationFrom(input: MotivationInput): number {
  let frustration = 0;
  if (input.actionFeedback?.outcome === 'rejected') {
    frustration += 0.44;
  } else if (input.actionFeedback?.outcome === 'failed') {
    frustration += 0.5;
  } else if (input.actionFeedback?.outcome === 'unknown') {
    frustration += 0.16;
  }

  if (input.awareness?.intention.recentFailure) {
    frustration += 0.22;
  }

  const failureMemories = input.memory?.retrievedMemories.filter((entry) => entry.category === 'failure' || entry.tags.includes('failure')).length ?? 0;
  frustration += Math.min(0.24, failureMemories * 0.08);

  return clamp(frustration, 0, 1);
}

function commitmentFrom(input: MotivationInput, needs: MotivationNeedState, frustration: number): number {
  let commitment = 0.28;
  if (input.awareness?.intention.currentGoal) {
    commitment += 0.18;
  }
  if (input.awareness?.intention.intendedNextStep) {
    commitment += 0.18;
  }
  if (input.actionFeedback?.outcome === 'accepted') {
    commitment += 0.14;
  }
  if (input.currentPlan?.candidateId) {
    commitment += 0.18;
  }
  commitment += positive(1 - needs.focus.pressure) * 0.1;
  commitment -= frustration * 0.34;
  commitment -= needs.energy.pressure > 0.75 ? 0.16 : 0;
  return clamp(commitment, 0, 1);
}

function positive(value: number): number {
  return Math.max(0, value);
}

function confidenceFromSources(sources: boolean[]): number {
  const present = sources.filter(Boolean).length;
  return clamp(0.45 + present * 0.14, 0.45, 0.96);
}

function attentionBoost(priority: AttentionPriority): number {
  switch (priority) {
    case 'critical':
      return 0.32;
    case 'high':
      return 0.22;
    case 'normal':
      return 0.1;
    case 'background':
      return 0.04;
  }
}

function pressureFromAttentionSource(source: string): MotivationPressureName {
  switch (source) {
    case 'energy':
      return 'viability';
    case 'space':
      return 'agency';
    case 'touch':
    case 'action_feedback':
      return 'competence';
    case 'vision':
      return 'curiosity';
    case 'social':
      return 'social';
    case 'system':
      return 'continuity';
    default:
      return 'agency';
  }
}

function formatAppraisal(appraisal: MotivationAppraisal): string {
  return [
    `- ${appraisal.candidateId}: total ${appraisal.total.toFixed(2)}`,
    `  pressures ${formatPressures(appraisal.pressures)}`,
    `  parts ${formatScoreParts(appraisal.scoreParts)}`,
    `  reasons ${appraisal.reasons.join(' | ') || 'none'}`,
    `  tensions ${appraisal.tensions.join(' | ') || 'none'}`,
    `  risks ${appraisal.risks.join(' | ') || 'none'}`,
    `  vetoes ${appraisal.vetoes.map((veto) => `${veto.severity}:${veto.id}`).join(' | ') || 'none'}`,
  ].join('\n');
}

function formatLatent(latent: MotivationLatentState): string {
  return [
    `energyRunway ${latent.energyRunway.toFixed(2)}`,
    `focus ${latent.focus.toFixed(2)}`,
    `connection ${latent.connection.toFixed(2)}`,
    `curiosity ${latent.curiosity.toFixed(2)}`,
    `purpose ${latent.purpose.toFixed(2)}`,
    `commitment ${latent.commitment.toFixed(2)}`,
    `frustration ${latent.frustration.toFixed(2)}`,
    `safetyMargin ${latent.safetyMargin.toFixed(2)}`,
    `trust ${latent.trust.toFixed(2)}`,
  ].join('; ');
}

function formatNeeds(needs: MotivationNeedState): string {
  return [
    `energy satisfaction ${needs.energy.satisfaction.toFixed(2)} pressure ${needs.energy.pressure.toFixed(2)}`,
    `focus satisfaction ${needs.focus.satisfaction.toFixed(2)} pressure ${needs.focus.pressure.toFixed(2)}`,
    `connection satisfaction ${needs.connection.satisfaction.toFixed(2)} pressure ${needs.connection.pressure.toFixed(2)}`,
    `curiosity satisfaction ${needs.curiosity.satisfaction.toFixed(2)} pressure ${needs.curiosity.pressure.toFixed(2)}`,
    `purpose satisfaction ${needs.purpose.satisfaction.toFixed(2)} pressure ${needs.purpose.pressure.toFixed(2)}`,
  ].join('; ');
}

function formatPressures(pressures: MotivationPressures): string {
  return PRESSURES.map((pressure) => `${pressure} ${pressures[pressure].toFixed(2)}`).join('; ');
}

function formatScoreParts(parts: MotivationScoreParts): string {
  return [
    `need ${parts.needUtility.toFixed(2)}`,
    `energy ${parts.energyTerm.toFixed(2)}`,
    `feas ${parts.feasibility.toFixed(2)}`,
    `safety ${parts.safety.toFixed(2)}`,
    `memory ${parts.memory.toFixed(2)}`,
    `commit ${parts.commitment.toFixed(2)}`,
    `novelty ${parts.novelty.toFixed(2)}`,
    `trust ${parts.trust.toFixed(2)}`,
    `repeatPenalty ${parts.repeatPenalty.toFixed(2)}`,
    `proximityPenalty ${parts.proximityPenalty.toFixed(2)}`,
    `riskPenalty ${parts.riskPenalty.toFixed(2)}`,
    `vetoPenalty ${parts.vetoPenalty.toFixed(2)}`,
  ].join('; ');
}

function roundPressures(pressures: MotivationPressures): MotivationPressures {
  return {
    viability: round(clamp(pressures.viability, -1, 1)),
    agency: round(clamp(pressures.agency, -1, 1)),
    competence: round(clamp(pressures.competence, -1, 1)),
    curiosity: round(clamp(pressures.curiosity, -1, 1)),
    familiarity: round(clamp(pressures.familiarity, -1, 1)),
    social: round(clamp(pressures.social, -1, 1)),
    construction: round(clamp(pressures.construction, -1, 1)),
    continuity: round(clamp(pressures.continuity, -1, 1)),
  };
}

function compact(lines: string[], max: number): string[] {
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))].slice(0, max);
}

function sharedMeaningfulWord(a: string, b: string): boolean {
  if (!a || !b) {
    return false;
  }
  const bWords = new Set(words(b));
  return words(a).some((word) => bWords.has(word));
}

function words(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9_]+/).filter((word) => word.length > 4);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
