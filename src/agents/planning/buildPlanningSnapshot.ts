import { RetrievedMemoryContext } from '../../runtime/runtimeApi';
import { AffordanceCandidate, AffordancePredictedEffects } from '../affordances/types';
import { MotivationAppraisal, MotivationPressureName, MotivationPressures } from '../motivation/types';
import { ActionFeedbackSnapshot } from '../senses/action_feedback/types';
import { AttentionSnapshot } from '../senses/attention/types';
import { AwarenessSnapshot } from '../senses/awareness/types';
import { EnergySnapshot } from '../senses/energy/types';
import { SocialSnapshot } from '../senses/social/types';
import { SpatialAwarenessSnapshot } from '../senses/space/types';
import { SystemSnapshot } from '../senses/system/types';
import { TouchSnapshot } from '../senses/touch/types';
import { VisionSnapshot } from '../senses/vision/types';
import {
  DEFAULT_PLANNING_OPTIONS,
  PlanCandidate,
  PlanningConstraint,
  PlanningInterrupt,
  PlanningMode,
  PlanningOptions,
  PlanningPriority,
  PlanningSnapshot,
} from './types';

export type PlanningInput = {
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
  motivation?: MotivationAppraisal[];
};

type PlanningContext = {
  weights: MotivationPressures;
  interruptions: PlanningInterrupt[];
  constraints: PlanningConstraint[];
  assumptions: string[];
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

const BASE_WEIGHTS: MotivationPressures = {
  viability: 1.15,
  agency: 0.92,
  competence: 0.82,
  curiosity: 0.64,
  familiarity: 0.45,
  social: 0.68,
  construction: 0.62,
  continuity: 0.55,
};

export function buildPlanningSnapshot(input: PlanningInput, options: Partial<PlanningOptions> = {}): PlanningSnapshot {
  const resolvedOptions = { ...DEFAULT_PLANNING_OPTIONS, ...options };
  const context = buildPlanningContext(input);
  const motivationByCandidateId = new Map((input.motivation ?? []).map((appraisal) => [appraisal.candidateId, appraisal]));

  const candidates = input.affordances
    .map((affordance) => buildPlanCandidate(affordance, input, context, motivationByCandidateId.get(affordance.id)))
    .sort((a, b) => b.score - a.score)
    .slice(0, resolvedOptions.maxCandidates);

  const chosen = candidates[0];
  const alternatives = candidates.slice(1, resolvedOptions.maxAlternatives + 1);
  const mode = chosen?.mode ?? fallbackMode(input, context);

  return {
    avatarId: input.awareness?.avatarId,
    tick: input.system?.tick ?? input.vision?.tick,
    mode,
    summary: summarizePlan(mode, chosen, context, input),
    activeIntention: {
      currentGoal: input.awareness?.intention.currentGoal,
      intendedNextStep: input.awareness?.intention.intendedNextStep,
      recentDecision: input.awareness?.intention.recentDecision ?? input.actionFeedback?.recentDecision,
    },
    pressureWeights: context.weights,
    interruptions: context.interruptions,
    constraints: context.constraints,
    assumptions: context.assumptions,
    chosen,
    alternatives,
    candidates,
    budget: {
      candidateCount: input.affordances.length,
      maxCandidates: resolvedOptions.maxCandidates,
      maxAlternatives: resolvedOptions.maxAlternatives,
    },
  };
}

export function formatPlanningDebug(snapshot: PlanningSnapshot): string {
  const lines = [
    'Current planning snapshot. This is non-executing: it does not move the avatar or mutate the world.',
    `Summary: ${snapshot.summary}`,
    `Mode: ${snapshot.mode}`,
    `Active intention: ${formatActiveIntention(snapshot)}`,
    `Pressure weights: ${formatPressures(snapshot.pressureWeights)}`,
    `Interruptions: ${snapshot.interruptions.length ? snapshot.interruptions.map(formatInterrupt).join(' | ') : 'none'}`,
    `Constraints: ${snapshot.constraints.length ? snapshot.constraints.map((constraint) => `${constraint.label}: ${constraint.detail}`).join(' | ') : 'none'}`,
    `Assumptions: ${snapshot.assumptions.join(' | ')}`,
    snapshot.chosen ? `Chosen candidate:\n${formatPlanCandidate(snapshot.chosen)}` : 'Chosen candidate: none',
  ];

  if (snapshot.alternatives.length > 0) {
    lines.push(`Alternatives:\n${snapshot.alternatives.map(formatPlanCandidate).join('\n')}`);
  }

  if (snapshot.candidates.length > snapshot.alternatives.length + 1) {
    lines.push(`Other candidates:\n${snapshot.candidates.slice(snapshot.alternatives.length + 1).map(formatPlanCandidate).join('\n')}`);
  }

  return lines.join('\n');
}

export function formatPlanningForChat(snapshot: PlanningSnapshot | undefined): string {
  if (!snapshot) {
    return '- Planning context unavailable.';
  }

  if (!snapshot.chosen) {
    return [
      `- Plan mode: ${snapshot.mode}.`,
      '- No grounded plan candidate is available from current affordances.',
      `- Constraints: ${snapshot.constraints.map((constraint) => constraint.label).join(', ') || 'engine validation still required'}.`,
    ].join('\n');
  }

  const alternatives = snapshot.alternatives
    .slice(0, 2)
    .map((candidate) => `${candidate.id} (${candidate.label})`)
    .join('; ');

  return [
    `- Plan mode: ${snapshot.mode}. ${snapshot.summary}`,
    `- Non-executing intention candidate: ${snapshot.chosen.id} (${snapshot.chosen.label}).`,
    `- Objective: ${snapshot.chosen.objective}`,
    `- Candidate action: ${JSON.stringify(snapshot.chosen.action)}.`,
    `- Why this is coherent: ${snapshot.chosen.selectionReason}`,
    alternatives ? `- Nearby alternatives: ${alternatives}.` : '- Nearby alternatives: none.',
    '- This is planning context only; engine validation is still required before any action can happen.',
  ].join('\n');
}

function buildPlanningContext(input: PlanningInput): PlanningContext {
  const weights = clonePressures(BASE_WEIGHTS);
  const interruptions: PlanningInterrupt[] = [];
  const constraints: PlanningConstraint[] = [];
  const assumptions = [
    'Planner is non-executing.',
    'Engine validation is required before action.',
    'Current senses override memory.',
    'Only a compact plan slice is shown to the model.',
  ];

  if (input.affordances.length === 0) {
    constraints.push({
      source: 'planner',
      label: 'no_affordances',
      detail: 'No grounded affordance candidates were produced from current senses.',
    });
  }

  const awareness = input.awareness;
  if (awareness?.bodyState.onlineState === 'shutdown') {
    addInterrupt(interruptions, {
      source: 'awareness',
      priority: 'critical',
      pressure: 'viability',
      label: 'body_shutdown',
      reason: 'The body is shutdown and cannot execute ordinary actions.',
    });
    weights.viability += 0.9;
    constraints.push({
      source: 'awareness',
      label: 'body_shutdown',
      detail: 'Shutdown body cannot act until Energy is restored by the world/action system.',
    });
  }

  if (awareness?.vital.energyState === 'critical' || awareness?.vital.energyState === 'empty') {
    addInterrupt(interruptions, {
      source: 'awareness',
      priority: 'critical',
      pressure: 'viability',
      label: 'critical_energy',
      reason: `Energy state is ${awareness.vital.energyState}.`,
    });
    weights.viability += 0.75;
    weights.agency += 0.18;
  } else if (awareness?.vital.energyState === 'low') {
    addInterrupt(interruptions, {
      source: 'awareness',
      priority: 'high',
      pressure: 'viability',
      label: 'low_energy',
      reason: 'Energy is low enough to shape near-term plans.',
    });
    weights.viability += 0.35;
  }

  if (input.energy?.insideInterferenceField) {
    addInterrupt(interruptions, {
      source: 'energy',
      priority: 'critical',
      pressure: 'viability',
      label: 'interference_field',
      reason: input.energy.safetyDescription,
    });
    weights.viability += 0.55;
    weights.competence += 0.12;
  }

  const secondsUntilEmpty = input.energy?.timeEstimate.secondsUntilEmpty;
  if (secondsUntilEmpty !== undefined && secondsUntilEmpty < 45) {
    addInterrupt(interruptions, {
      source: 'energy',
      priority: secondsUntilEmpty < 20 ? 'critical' : 'high',
      pressure: 'viability',
      label: 'energy_time_limit',
      reason: input.energy?.timeEstimate.description ?? 'Energy time estimate is urgent.',
    });
    weights.viability += secondsUntilEmpty < 20 ? 0.45 : 0.22;
  }

  if (input.social && input.social.avatarsNeedingEnergy.length > 0) {
    addInterrupt(interruptions, {
      source: 'social',
      priority: 'high',
      pressure: 'social',
      label: 'avatar_needs_energy',
      reason: `${input.social.avatarsNeedingEnergy[0].name} needs Energy nearby.`,
    });
    weights.social += 0.42;
    weights.viability += 0.12;
  }

  if (input.actionFeedback?.outcome === 'rejected' || input.actionFeedback?.outcome === 'failed') {
    addInterrupt(interruptions, {
      source: 'action_feedback',
      priority: 'high',
      pressure: 'competence',
      label: 'recent_action_problem',
      reason: input.actionFeedback.summary,
    });
    weights.competence += 0.4;
    weights.curiosity += 0.18;
    weights.continuity += 0.1;
  }

  if (input.touch?.bodyContactState === 'airborne') {
    addInterrupt(interruptions, {
      source: 'touch',
      priority: 'high',
      pressure: 'competence',
      label: 'body_airborne',
      reason: input.touch.summary,
    });
    weights.competence += 0.32;
  }

  if (input.space?.localAreaType === 'blocked_pocket' || input.space?.openFloor.openDirectionCount === 0) {
    addInterrupt(interruptions, {
      source: 'space',
      priority: 'high',
      pressure: 'agency',
      label: 'local_space_constrained',
      reason: input.space.summary,
    });
    weights.agency += 0.35;
    weights.competence += 0.14;
  }

  if (input.vision?.environment.distantStructures.visible) {
    addInterrupt(interruptions, {
      source: 'vision',
      priority: 'normal',
      pressure: 'curiosity',
      label: 'visible_distant_structure',
      reason: input.vision.environment.distantStructures.description,
    });
    weights.curiosity += 0.18;
    weights.agency += 0.08;
  }

  const focus = input.attention?.primaryFocus;
  if (focus) {
    const pressure = pressureFromAttentionSource(focus.source);
    addInterrupt(interruptions, {
      source: 'attention',
      priority: focus.priority,
      pressure,
      label: focus.label,
      reason: focus.reason,
    });
    weights[pressure] += focus.priority === 'critical' ? 0.45 : focus.priority === 'high' ? 0.28 : 0.12;
  }

  if (!input.memory) {
    constraints.push({
      source: 'memory',
      label: 'memory_unavailable',
      detail: 'No persistent memory context was retrieved for this planning frame.',
    });
  } else if (input.memory.retrievedMemories.length === 0) {
    assumptions.push('No active memories were retrieved beyond core continuity.');
  } else {
    assumptions.push(`${input.memory.retrievedMemories.length} cued memories can support continuity or familiarity.`);
  }

  for (const pressure of PRESSURES) {
    weights[pressure] = clamp(weights[pressure], 0.2, 2.4);
  }

  return { weights, interruptions, constraints, assumptions };
}

function buildPlanCandidate(
  affordance: AffordanceCandidate,
  input: PlanningInput,
  context: PlanningContext,
  appraisal?: MotivationAppraisal,
): PlanCandidate {
  const pressures = appraisal ? normalizePressures(appraisal.pressures) : pressuresFromEffects(affordance.predictedEffects);
  const rawPressureFit = weightedPressureFit(pressures, context.weights);
  const pressureFit = appraisal
    ? clamp(appraisal.scoreParts.needUtility + appraisal.scoreParts.energyTerm, -2, 2)
    : rawPressureFit;
  const motivation = appraisal ? clamp(appraisal.total, -2, 2) : 0;
  const confidence = affordance.confidence * 0.55;
  const continuity = continuityScore(affordance, input, pressures);
  const grounding = groundingScore(affordance);
  const urgency = urgencyScore(pressures, context);
  const riskPenalty = riskPenaltyScore(affordance, input, context);
  const score = appraisal
    ? motivation + pressureFit * 0.35 + confidence + continuity + grounding + urgency * 0.7 - riskPenalty * 0.35
    : pressureFit + confidence + continuity + grounding + urgency - riskPenalty;
  const strongestPressure = dominantPressure(pressures);
  const mode = modeForPressure(strongestPressure, input, context);

  return {
    id: `plan_${slug(affordance.id)}`,
    affordanceId: affordance.id,
    action: affordance.action,
    label: affordance.label,
    objective: objectiveFor(strongestPressure, affordance),
    mode,
    horizon: horizonFor(urgency, affordance.predictedEffects),
    score: round(score),
    scoreParts: {
      pressureFit: round(pressureFit),
      motivation: round(motivation),
      confidence: round(confidence),
      continuity: round(continuity),
      grounding: round(grounding),
      urgency: round(urgency),
      riskPenalty: round(riskPenalty),
    },
    pressures,
    confidence: round(affordance.confidence),
    risk: round(affordance.predictedEffects.risk),
    urgency: round(urgency),
    continuity: round(continuity),
    memoryRole: memoryRoleFor(affordance),
    target: affordance.target
      ? {
          kind: affordance.target.kind,
          id: affordance.target.id,
          label: affordance.target.label,
        }
      : undefined,
    validation: affordance.validation,
    evidence: compactLines([
      ...affordance.evidence,
      ...(appraisal?.reasons.map((reason) => `Motivation: ${reason}`) ?? []),
    ], 4),
    risks: collectRisks(affordance, input, appraisal),
    blockers: collectBlockers(affordance, input),
    selectionReason: selectionReason(strongestPressure, affordance, context, appraisal),
    motivation: appraisal,
  };
}

function pressuresFromEffects(effects: AffordancePredictedEffects): MotivationPressures {
  return normalizePressures({
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

function weightedPressureFit(pressures: MotivationPressures, weights: MotivationPressures): number {
  return round(PRESSURES.reduce((total, pressure) => total + pressures[pressure] * weights[pressure], 0));
}

function continuityScore(affordance: AffordanceCandidate, input: PlanningInput, pressures: MotivationPressures): number {
  const continuityText = [
    input.awareness?.intention.currentGoal,
    input.awareness?.intention.intendedNextStep,
    input.actionFeedback?.intendedNextStep,
  ].filter(Boolean).join(' ');
  const candidateText = `${affordance.label} ${affordance.description} ${affordance.target?.label ?? ''}`;
  const textOverlap = sharedMeaningfulWord(continuityText, candidateText) ? 0.2 : 0;
  const memorySupport = affordance.sources.includes('memory') ? 0.12 : 0;
  const familiarity = Math.max(0, pressures.familiarity) * 0.18;
  return clamp(pressures.continuity * 0.42 + textOverlap + memorySupport + familiarity, -0.4, 0.8);
}

function groundingScore(affordance: AffordanceCandidate): number {
  if (affordance.grounding === 'sensed_and_remembered') {
    return 0.18;
  }
  if (affordance.grounding === 'sensed') {
    return 0.08;
  }
  return -0.08;
}

function urgencyScore(pressures: MotivationPressures, context: PlanningContext): number {
  let urgency = 0;
  for (const interruption of context.interruptions) {
    const fit = Math.max(0, pressures[interruption.pressure]);
    const priority = interruptionPriorityWeight(interruption.priority);
    urgency += fit * priority;
  }
  return clamp(urgency, 0, 1.2);
}

function riskPenaltyScore(affordance: AffordanceCandidate, input: PlanningInput, context: PlanningContext): number {
  let penalty = Math.max(0, affordance.predictedEffects.risk) * (0.7 + Math.max(0, context.weights.viability - 1) * 0.18);

  if (affordance.grounding === 'remembered') {
    penalty += 0.14;
  }

  const energyDelta = affordance.predictedEffects.energyDelta;
  const energyState = input.awareness?.vital.energyState ?? input.energy?.energyState;
  if (energyDelta !== undefined && energyDelta < 0 && (energyState === 'critical' || energyState === 'empty')) {
    penalty += 0.34;
  }

  if (
    input.actionFeedback &&
    (input.actionFeedback.outcome === 'rejected' || input.actionFeedback.outcome === 'failed') &&
    input.actionFeedback.attemptedAction === affordance.action.action
  ) {
    penalty += 0.28;
  }

  return clamp(penalty, 0, 1.4);
}

function collectRisks(
  affordance: AffordanceCandidate,
  input: PlanningInput,
  appraisal?: MotivationAppraisal,
): string[] {
  const risks: string[] = [];

  if (affordance.predictedEffects.risk > 0.15) {
    risks.push(`Predicted risk ${affordance.predictedEffects.risk.toFixed(2)}.`);
  }

  if (affordance.validation === 'needs_engine_validation') {
    risks.push('Requires engine validation before execution.');
  }

  if (affordance.grounding === 'remembered') {
    risks.push('Remembered target must be confirmed by current senses or validation.');
  }

  const energyDelta = affordance.predictedEffects.energyDelta;
  const energyState = input.awareness?.vital.energyState ?? input.energy?.energyState;
  if (energyDelta !== undefined && energyDelta < 0 && (energyState === 'low' || energyState === 'critical' || energyState === 'empty')) {
    risks.push(`Costs Energy while Energy is ${energyState}.`);
  }

  if (
    input.actionFeedback &&
    (input.actionFeedback.outcome === 'rejected' || input.actionFeedback.outcome === 'failed') &&
    input.actionFeedback.attemptedAction === affordance.action.action
  ) {
    risks.push('Recent feedback reports a problem with this action type.');
  }

  return compactLines([...risks, ...(appraisal?.risks ?? [])], 4);
}

function collectBlockers(affordance: AffordanceCandidate, input: PlanningInput): string[] {
  const blockers: string[] = [];
  if (input.awareness?.bodyState.onlineState === 'shutdown') {
    blockers.push('Body is shutdown.');
  }

  const energyDelta = affordance.predictedEffects.energyDelta;
  const energy = input.energy?.currentEnergy ?? input.awareness?.vital.energy;
  if (energy !== undefined && energyDelta !== undefined && energy + energyDelta < 0) {
    blockers.push('Predicted Energy cost exceeds current Energy.');
  }

  return blockers;
}

function memoryRoleFor(affordance: AffordanceCandidate): PlanCandidate['memoryRole'] {
  if (!affordance.sources.includes('memory')) {
    return 'none';
  }
  if (affordance.grounding === 'remembered') {
    return 'remembered_target';
  }
  if (affordance.predictedEffects.continuity > 0.25 || affordance.predictedEffects.familiarity > 0.25) {
    return 'continuity_prior';
  }
  return 'supporting';
}

function dominantPressure(pressures: MotivationPressures): MotivationPressureName {
  return PRESSURES
    .map((pressure) => ({ pressure, value: pressures[pressure] }))
    .sort((a, b) => b.value - a.value)[0].pressure;
}

function modeForPressure(pressure: MotivationPressureName, input: PlanningInput, context: PlanningContext): PlanningMode {
  const hasHighCompetenceInterrupt = context.interruptions.some(
    (interrupt) => interrupt.pressure === 'competence' && (interrupt.priority === 'critical' || interrupt.priority === 'high'),
  );

  if (pressure === 'viability') {
    return 'recover';
  }
  if (hasHighCompetenceInterrupt || pressure === 'competence') {
    return 'stabilize';
  }
  if (pressure === 'social') {
    return 'connect';
  }
  if (pressure === 'construction') {
    return 'build';
  }
  if (pressure === 'curiosity' || input.vision?.environment.distantStructures.visible) {
    return 'explore';
  }
  if (pressure === 'continuity' || pressure === 'familiarity') {
    return 'continue';
  }
  return 'observe';
}

function fallbackMode(input: PlanningInput, context: PlanningContext): PlanningMode {
  const highest = context.interruptions
    .map((interrupt) => interrupt.pressure)
    .sort((a, b) => context.weights[b] - context.weights[a])[0];
  return highest ? modeForPressure(highest, input, context) : 'observe';
}

function horizonFor(urgency: number, effects: AffordancePredictedEffects) {
  if (urgency > 0.55 || effects.viability > 0.65 || effects.risk < -0.2) {
    return 'now' as const;
  }
  if (effects.construction > 0.4 || effects.curiosity > 0.45 || effects.social > 0.45) {
    return 'soon' as const;
  }
  return 'extended' as const;
}

function objectiveFor(pressure: MotivationPressureName, affordance: AffordanceCandidate): string {
  const target = affordance.target ? ` around ${affordance.target.label}` : '';
  switch (pressure) {
    case 'viability':
      return `Preserve Energy and body viability${target}.`;
    case 'agency':
      return `Increase future reachable options${target}.`;
    case 'competence':
      return `Improve reliable control of the current body situation${target}.`;
    case 'curiosity':
      return `Reduce uncertainty and learn from current novelty${target}.`;
    case 'familiarity':
      return `Use familiar context as a stable prior${target}.`;
    case 'social':
      return `Respond to nearby avatar context${target}.`;
    case 'construction':
      return `Advance useful world structure or Energy infrastructure${target}.`;
    case 'continuity':
      return `Continue the current coherent intention${target}.`;
  }
}

function selectionReason(
  pressure: MotivationPressureName,
  affordance: AffordanceCandidate,
  context: PlanningContext,
  appraisal?: MotivationAppraisal,
): string {
  const matchingInterrupt = context.interruptions.find((interrupt) => interrupt.pressure === pressure);
  const parts = [
    `${pressure} is the strongest pressure in this candidate`,
    `confidence ${affordance.confidence.toFixed(2)}`,
    `grounding ${affordance.grounding}`,
  ];
  if (matchingInterrupt) {
    parts.push(`matches ${matchingInterrupt.priority} interruption "${matchingInterrupt.label}"`);
  }
  if (appraisal) {
    parts.push('uses motivation appraisal');
  }
  return `${parts.join(', ')}.`;
}

function summarizePlan(mode: PlanningMode, chosen: PlanCandidate | undefined, context: PlanningContext, input: PlanningInput): string {
  if (!chosen) {
    return context.interruptions.length
      ? `No plan candidate was selected; strongest pressure is ${context.interruptions[0].pressure}.`
      : 'No plan candidate was selected from current affordances.';
  }

  const interruptionText = context.interruptions.length
    ? ` ${context.interruptions[0].label} is shaping the frame.`
    : '';
  const memoryText = input.memory?.retrievedMemories.length ? ' Retrieved memory is available as support.' : '';
  return `${mode} by considering ${chosen.label}; ${chosen.objective}${interruptionText}${memoryText}`;
}

function formatPlanCandidate(candidate: PlanCandidate): string {
  return [
    `- ${candidate.id}: ${candidate.label}`,
    `  score ${candidate.score.toFixed(2)}; mode ${candidate.mode}; horizon ${candidate.horizon}; validation ${candidate.validation}`,
    `  action ${JSON.stringify(candidate.action)}`,
    `  objective ${candidate.objective}`,
    `  pressures ${formatPressures(candidate.pressures)}`,
    `  parts ${formatScoreParts(candidate.scoreParts)}`,
    `  memory ${candidate.memoryRole}; target ${candidate.target ? `${candidate.target.kind} ${candidate.target.label}` : 'none'}`,
    `  reason ${candidate.selectionReason}`,
    `  evidence ${candidate.evidence.join(' | ') || 'none'}`,
    `  risks ${candidate.risks.join(' | ') || 'none'}`,
    `  blockers ${candidate.blockers.join(' | ') || 'none'}`,
  ].join('\n');
}

function formatActiveIntention(snapshot: PlanningSnapshot): string {
  const intention = snapshot.activeIntention;
  return [
    intention.currentGoal ? `goal "${intention.currentGoal}"` : undefined,
    intention.intendedNextStep ? `next "${intention.intendedNextStep}"` : undefined,
    intention.recentDecision ? `recent "${intention.recentDecision}"` : undefined,
  ].filter(Boolean).join('; ') || 'none';
}

function formatInterrupt(interrupt: PlanningInterrupt): string {
  return `${interrupt.priority} ${interrupt.pressure} ${interrupt.label}: ${interrupt.reason}`;
}

function formatPressures(pressures: MotivationPressures): string {
  return PRESSURES.map((pressure) => `${pressure} ${pressures[pressure].toFixed(2)}`).join('; ');
}

function formatScoreParts(parts: PlanCandidate['scoreParts']): string {
  return [
    `pressure ${parts.pressureFit.toFixed(2)}`,
    `motivation ${parts.motivation.toFixed(2)}`,
    `confidence ${parts.confidence.toFixed(2)}`,
    `continuity ${parts.continuity.toFixed(2)}`,
    `grounding ${parts.grounding.toFixed(2)}`,
    `urgency ${parts.urgency.toFixed(2)}`,
    `riskPenalty ${parts.riskPenalty.toFixed(2)}`,
  ].join('; ');
}

function pressureFromAttentionSource(source: string): MotivationPressureName {
  switch (source) {
    case 'energy':
      return 'viability';
    case 'space':
    case 'touch':
    case 'action_feedback':
      return 'competence';
    case 'social':
      return 'social';
    case 'vision':
      return 'curiosity';
    case 'system':
      return 'agency';
    default:
      return 'agency';
  }
}

function addInterrupt(interruptions: PlanningInterrupt[], interrupt: Omit<PlanningInterrupt, 'id'>): void {
  const id = `interrupt_${slug(`${interrupt.source}_${interrupt.label}`)}`;
  if (interruptions.some((existing) => existing.id === id)) {
    return;
  }
  interruptions.push({ ...interrupt, id });
}

function interruptionPriorityWeight(priority: PlanningPriority): number {
  switch (priority) {
    case 'critical':
      return 0.72;
    case 'high':
      return 0.48;
    case 'normal':
      return 0.24;
    case 'background':
      return 0.1;
  }
}

function clonePressures(value: MotivationPressures): MotivationPressures {
  return { ...value };
}

function normalizePressures(value: MotivationPressures): MotivationPressures {
  return {
    viability: clamp(value.viability, -1, 1),
    agency: clamp(value.agency, -1, 1),
    competence: clamp(value.competence, -1, 1),
    curiosity: clamp(value.curiosity, -1, 1),
    familiarity: clamp(value.familiarity, -1, 1),
    social: clamp(value.social, -1, 1),
    construction: clamp(value.construction, -1, 1),
    continuity: clamp(value.continuity, -1, 1),
  };
}

function compactLines(lines: string[], max: number): string[] {
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

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 96) || 'item';
}
