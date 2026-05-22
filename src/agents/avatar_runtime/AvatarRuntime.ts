import { ActionSystem } from '../../actions/actions';
import { AgentAction } from '../../actions/AgentActions';
import { ActionValidator, ValidatedAgentAction } from '../../actions/ActionValidator';
import { LLMProviderConfig } from '../../llm/LLMProviderConfig';
import { appendMemoryEntry, MemoryProfile, retrieveMemoryContext } from '../../runtime/runtimeApi';
import { WorldEventLog } from '../../world/WorldEvents';
import { AvatarState, Vec3 } from '../../world/types';
import { WorldState } from '../../world/worldState';
import { buildAffordanceCandidates } from '../affordances/buildAffordanceCandidates';
import { AffordanceCandidate } from '../affordances/types';
import { buildMemoryCandidates } from '../memory/buildMemoryCandidates';
import { MemoryCandidate } from '../memory/types';
import { buildMotivationSnapshot } from '../motivation/buildMotivationAppraisals';
import { MotivationSnapshot } from '../motivation/types';
import { buildPlanningSnapshot } from '../planning/buildPlanningSnapshot';
import { PlanCandidate, PlanningSnapshot } from '../planning/types';
import { buildActionFeedbackSnapshot } from '../senses/action_feedback/buildActionFeedbackSnapshot';
import { ActionFeedbackSnapshot } from '../senses/action_feedback/types';
import { buildAttentionSnapshot } from '../senses/attention/buildAttentionSnapshot';
import { AttentionSnapshot } from '../senses/attention/types';
import { buildAwarenessSnapshot } from '../senses/awareness/buildAwarenessSnapshot';
import { AwarenessSnapshot } from '../senses/awareness/types';
import { buildEnergySnapshot } from '../senses/energy/buildEnergySnapshot';
import { EnergySnapshot } from '../senses/energy/types';
import { buildMemoryCues } from '../senses/memory_cues/buildMemoryCues';
import { buildSocialSnapshot } from '../senses/social/buildSocialSnapshot';
import { SocialSnapshot } from '../senses/social/types';
import { buildSpatialAwarenessSnapshot } from '../senses/space/buildSpatialAwarenessSnapshot';
import { SpatialAwarenessSnapshot } from '../senses/space/types';
import { buildSystemSnapshot } from '../senses/system/buildSystemSnapshot';
import { SystemSnapshot } from '../senses/system/types';
import { buildTouchSnapshot } from '../senses/touch/buildTouchSnapshot';
import { TouchSnapshot } from '../senses/touch/types';
import { buildVisionSnapshot } from '../senses/vision/buildVisionSnapshot';
import { VisionSnapshot } from '../senses/vision/types';
import {
  AvatarRuntimeActionFeedback,
  AvatarRuntimeAgentState,
  AvatarRuntimeCurrentPlan,
  AvatarRuntimeDecisionTrace,
  AvatarRuntimeMoveFrame,
  AvatarRuntimeOptions,
  DEFAULT_AVATAR_RUNTIME_OPTIONS,
  ZERO_MOVE_FRAME,
} from './types';

type RuntimeCognition = {
  awareness?: AwarenessSnapshot;
  vision?: VisionSnapshot;
  space?: SpatialAwarenessSnapshot;
  energy?: EnergySnapshot;
  social?: SocialSnapshot;
  touch?: TouchSnapshot;
  actionFeedback?: ActionFeedbackSnapshot;
  attention?: AttentionSnapshot;
  system?: SystemSnapshot;
  memoryProfile: MemoryProfile;
  affordances: AffordanceCandidate[];
  motivation: MotivationSnapshot;
  planning: PlanningSnapshot;
};

type CandidateChoice = {
  plan?: PlanCandidate;
  action: AgentAction;
  validated: ValidatedAgentAction;
  rejected: Array<{
    plan?: PlanCandidate;
    action: AgentAction;
    reason: string;
  }>;
  fallback: boolean;
};

export class AvatarRuntime {
  private readonly validator: ActionValidator;
  private readonly states = new Map<string, AvatarRuntimeAgentState>();
  private readonly memoryWriteCooldowns = new Map<string, number>();
  private config: LLMProviderConfig;

  constructor(
    private readonly world: WorldState,
    actionSystem: ActionSystem,
    private readonly eventLog: WorldEventLog,
    config: LLMProviderConfig,
    private readonly options: AvatarRuntimeOptions = DEFAULT_AVATAR_RUNTIME_OPTIONS,
  ) {
    this.validator = new ActionValidator(world, actionSystem);
    this.config = config;
  }

  setConfig(config: LLMProviderConfig): void {
    this.config = config;
  }

  update(now: number): void {
    this.pruneMissingAgents();

    for (const avatar of this.world.avatars.values()) {
      if (!this.isRuntimeAvatar(avatar)) {
        continue;
      }

      const state = this.stateFor(avatar.id);
      if (avatar.shutdown) {
        state.movementIntent = undefined;
        state.nextDecisionAt = now + this.options.decisionIntervalMs;
        continue;
      }

      if (state.cycleInFlight || now < state.nextDecisionAt) {
        continue;
      }

      state.cycleInFlight = true;
      state.nextDecisionAt = now + this.options.decisionIntervalMs;
      void this.runDecisionCycle(avatar.id, now)
        .catch((error: unknown) => {
          const latest = this.world.avatars.get(avatar.id);
          const message = error instanceof Error ? error.message : String(error);
          if (latest) {
            latest.recentFailure = `Runtime error: ${message}`;
            latest.intendedNextStep = 'Recalibrate after runtime error.';
          }
          this.eventLog.record({
            tick: this.world.tick,
            type: 'world',
            message: `${avatar.name} runtime error: ${message}`,
          });
        })
        .finally(() => {
          const latestState = this.states.get(avatar.id);
          if (latestState) {
            latestState.cycleInFlight = false;
          }
        });
    }
  }

  getMoveFrame(agentId: string, now: number, speed: number): AvatarRuntimeMoveFrame {
    const avatar = this.world.avatars.get(agentId);
    const state = this.states.get(agentId);
    const intent = state?.movementIntent;

    if (!avatar || avatar.shutdown || !intent) {
      return ZERO_MOVE_FRAME;
    }

    if (now > intent.expiresAt) {
      state.movementIntent = undefined;
      return ZERO_MOVE_FRAME;
    }

    switch (intent.command.action) {
      case 'move_forward':
        return velocityFrame(directionFromYaw(avatar.yaw, 'forward'), speed);
      case 'move_backward':
        return velocityFrame(directionFromYaw(avatar.yaw, 'backward'), speed);
      case 'move_left':
        return velocityFrame(directionFromYaw(avatar.yaw, 'left'), speed);
      case 'move_right':
        return velocityFrame(directionFromYaw(avatar.yaw, 'right'), speed);
      case 'move_toward':
        return this.moveTowardFrame(avatar, intent.command.target, speed, state);
      case 'jump': {
        if (intent.jumpConsumed) {
          return ZERO_MOVE_FRAME;
        }
        intent.jumpConsumed = true;
        return { velocity: { x: 0, y: 0, z: 0 }, jump: true, moving: true };
      }
    }
  }

  private async runDecisionCycle(avatarId: string, now: number): Promise<void> {
    const avatar = this.world.avatars.get(avatarId);
    if (!avatar || !this.isRuntimeAvatar(avatar) || avatar.shutdown) {
      return;
    }

    const state = this.stateFor(avatar.id);
    const cognition = await this.buildCognition(avatar, state);
    const choice = this.chooseValidatedCandidate(avatar, cognition);
    const result = this.applyChoice(avatar, choice, now);

    state.lastAttemptedAction = choice.action.action;
    state.lastActionResult = result;
    state.lastDecisionAt = now;
    state.currentPlan = planStateFrom(choice.plan, cognition.planning);
    state.lastDecisionSummary = cognition.planning.summary;
    state.consecutiveRejectedActions = result.ok ? 0 : state.consecutiveRejectedActions + 1;
    state.nextDecisionAt = now + (result.ok ? this.options.decisionIntervalMs : this.options.rejectionBackoffMs);

    this.logDecision({
      avatarId: avatar.id,
      avatarName: avatar.name,
      action: choice.action,
      affordanceId: choice.plan?.affordanceId,
      planId: choice.plan?.id,
      accepted: choice.validated.accepted,
      applied: result.ok,
      movement: !!choice.validated.movement && result.ok,
      reason: result.message,
    }, choice);

    await this.recordRuntimeMemories(avatar, cognition, result, choice.action.action);
  }

  private async buildCognition(avatar: AvatarState, state: AvatarRuntimeAgentState): Promise<RuntimeCognition> {
    const awareness = buildAwarenessSnapshot(this.world, avatar.id);
    const vision = buildVisionSnapshot(this.world, avatar.id, {
      range: 18,
      fieldOfViewDegrees: 360,
      maxItemsPerCategory: 12,
    });
    const space = buildSpatialAwarenessSnapshot(this.world, avatar.id);
    const energy = buildEnergySnapshot(this.world, avatar.id);
    const social = buildSocialSnapshot(this.world, avatar.id);
    const touch = buildTouchSnapshot(this.world, avatar.id);
    const actionFeedback = buildActionFeedbackSnapshot(this.world, avatar.id, {
      attemptedAction: state.lastAttemptedAction,
      result: state.lastActionResult,
      recentEvents: this.eventLog.recent(8, avatar.id),
    });
    const system = buildSystemSnapshot(this.world, avatar.id, {
      llmConfig: this.config,
      llmConnected: true,
      simulationControlActive: true,
      debugCommands: ['debug vision', 'debug affordances', 'debug motivation', 'debug planning'],
      lastEngineMessage: this.world.lastMessage,
    });
    const attention = buildAttentionSnapshot(avatar.id, {
      energy,
      vision,
      space,
      social,
      touch,
      actionFeedback,
      system,
    });
    const memoryProfile = chooseMemoryProfile(this.brainModelFor(avatar));
    const memoryCues = buildMemoryCues({
      awareness,
      vision,
      space,
      energy,
      social,
      touch,
      actionFeedback,
      attention,
      system,
      userMessage: 'autonomous runtime decision',
    });
    const memory = await retrieveMemoryContext({
      memoryId: avatar.memoryId,
      memoryProfile,
      cues: memoryCues,
    });
    const affordances = buildAffordanceCandidates({
      awareness,
      vision,
      space,
      energy,
      social,
      touch,
      actionFeedback,
      attention,
      system,
      memory,
    });
    const motivation = buildMotivationSnapshot({
      awareness,
      vision,
      space,
      energy,
      social,
      touch,
      actionFeedback,
      attention,
      system,
      memory,
      affordances,
      currentPlan: state.currentPlan,
    });
    const planning = buildPlanningSnapshot({
      awareness,
      vision,
      space,
      energy,
      social,
      touch,
      actionFeedback,
      attention,
      system,
      memory,
      affordances,
      motivation: motivation.appraisals,
    });

    return {
      awareness,
      vision,
      space,
      energy,
      social,
      touch,
      actionFeedback,
      attention,
      system,
      memoryProfile,
      affordances,
      motivation,
      planning,
    };
  }

  private chooseValidatedCandidate(avatar: AvatarState, cognition: RuntimeCognition): CandidateChoice {
    const rejected: CandidateChoice['rejected'] = [];

    for (const plan of cognition.planning.candidates) {
      const validated = this.validator.validate(plan.action, avatar);
      if (validated.accepted) {
        return {
          plan,
          action: plan.action,
          validated,
          rejected,
          fallback: false,
        };
      }

      rejected.push({
        plan,
        action: plan.action,
        reason: validated.reason ?? 'Rejected by validator.',
      });
    }

    const fallbackAction: AgentAction = rejected.length > 0 ? { action: 'recalibrate' } : { action: 'wait' };
    const fallbackValidated = this.validator.validate(fallbackAction, avatar);
    if (fallbackValidated.accepted) {
      return {
        action: fallbackAction,
        validated: fallbackValidated,
        rejected,
        fallback: true,
      };
    }

    const waitAction: AgentAction = { action: 'wait' };
    return {
      action: waitAction,
      validated: this.validator.validate(waitAction, avatar),
      rejected: [
        ...rejected,
        {
          action: fallbackAction,
          reason: fallbackValidated.reason ?? 'Fallback rejected by validator.',
        },
      ],
      fallback: true,
    };
  }

  private applyChoice(avatar: AvatarState, choice: CandidateChoice, now: number): AvatarRuntimeActionFeedback {
    if (!choice.validated.accepted) {
      const reason = choice.validated.reason ?? 'Action rejected by validator.';
      avatar.recentFailure = reason;
      avatar.recentDecision = `Runtime rejected ${choice.action.action}.`;
      avatar.intendedNextStep = 'Recalibrate and choose another validated action.';
      return { ok: false, message: reason };
    }

    const result = this.validator.apply(choice.validated);
    const ok = result.accepted;
    const message = result.reason ?? (ok ? 'Action accepted.' : 'Action rejected.');

    if (!ok) {
      avatar.recentFailure = message;
      avatar.intendedNextStep = 'Use action feedback to revise the next runtime decision.';
      return { ok: false, message };
    }

    avatar.recentFailure = undefined;

    if (choice.validated.movement) {
      this.stateFor(avatar.id).movementIntent = {
        command: choice.validated.movement,
        candidateId: choice.plan?.affordanceId ?? choice.action.action,
        planId: choice.plan?.id,
        startedAt: now,
        expiresAt: now + movementDuration(choice.validated.movement.action, this.options),
        jumpConsumed: false,
      };
    }

    if (choice.fallback && choice.action.action === 'recalibrate') {
      avatar.intendedNextStep = 'Rebuild a plan from current senses and feedback.';
    }

    return { ok: true, message };
  }

  private async recordRuntimeMemories(
    avatar: AvatarState,
    cognition: RuntimeCognition,
    result: AvatarRuntimeActionFeedback,
    attemptedAction?: string,
  ): Promise<void> {
    if (!avatar.memoryId) {
      return;
    }

    const actionFeedback = buildActionFeedbackSnapshot(this.world, avatar.id, {
      attemptedAction,
      result,
      recentEvents: this.eventLog.recent(8, avatar.id),
    });
    const candidates = buildMemoryCandidates({
      awareness: cognition.awareness,
      vision: cognition.vision,
      space: cognition.space,
      energy: cognition.energy,
      social: cognition.social,
      touch: cognition.touch,
      actionFeedback,
      attention: cognition.attention,
    })
      .filter((candidate) => this.shouldWriteMemoryCandidate(avatar.memoryId as string, candidate))
      .slice(0, this.options.maxMemoryWritesPerCycle);

    for (const candidate of candidates) {
      const ok = await appendMemoryEntry({
        memoryId: avatar.memoryId,
        memoryProfile: cognition.memoryProfile,
        file: candidate.file,
        text: candidate.summary,
        source: candidate.source,
        confidence: candidate.confidence,
        importance: candidate.importance,
        category: candidate.category,
        mergeKey: candidate.mergeKey,
        novelty: candidate.novelty,
        repeatCount: candidate.repeatCount,
        familiarity: candidate.familiarity,
        impact: candidate.impact,
        operation: candidate.operation,
        tags: candidate.tags,
      });

      if (ok) {
        this.markMemoryCandidateWritten(avatar.memoryId, candidate);
      }
    }
  }

  private moveTowardFrame(
    avatar: AvatarState,
    target: Vec3,
    speed: number,
    state: AvatarRuntimeAgentState,
  ): AvatarRuntimeMoveFrame {
    const dx = target.x - avatar.position.x;
    const dz = target.z - avatar.position.z;
    const distance = Math.hypot(dx, dz);

    if (distance < 0.45) {
      state.movementIntent = undefined;
      return ZERO_MOVE_FRAME;
    }

    const direction = { x: dx / distance, y: 0, z: dz / distance };
    avatar.yaw = Math.atan2(direction.x, direction.z);
    return velocityFrame(direction, speed);
  }

  private logDecision(trace: AvatarRuntimeDecisionTrace, choice: CandidateChoice): void {
    const rejectedText = choice.rejected.length
      ? `; skipped ${choice.rejected.length} rejected candidate${choice.rejected.length === 1 ? '' : 's'}`
      : '';
    const fallbackText = choice.fallback ? '; explicit fallback' : '';
    const planText = trace.planId ? ` via ${trace.planId}` : '';
    const actionName = trace.action?.action ?? 'none';
    const status = trace.applied ? 'applied' : trace.accepted ? 'accepted' : 'rejected';
    const actionMessage = `${choice.plan?.label ?? actionName}${planText}: ${trace.reason}${rejectedText}${fallbackText}.`;

    this.world.lastMessage = `${trace.avatarName} ${status} ${actionName}.`;
    this.eventLog.record({
      tick: this.world.tick,
      type: 'action',
      avatarId: trace.avatarId,
      avatarName: trace.avatarName,
      action: actionName,
      status,
      message: actionMessage,
    });

    if (choice.plan) {
      const state = this.states.get(trace.avatarId);
      const thoughtKey = `${choice.plan.affordanceId}:${choice.plan.mode}:${choice.plan.objective}:${choice.plan.selectionReason}`;
      if (state?.lastLoggedThoughtKey === thoughtKey) {
        return;
      }
      if (state) {
        state.lastLoggedThoughtKey = thoughtKey;
      }

      this.eventLog.record({
        tick: this.world.tick,
        type: 'thought',
        avatarId: trace.avatarId,
        avatarName: trace.avatarName,
        message: `${choice.plan.mode}: ${choice.plan.objective} ${choice.plan.selectionReason}`,
      });
    }
  }

  private shouldWriteMemoryCandidate(memoryId: string, candidate: MemoryCandidate, now = performance.now()): boolean {
    const key = `${memoryId}:${candidate.mergeKey}`;
    const previous = this.memoryWriteCooldowns.get(key) ?? 0;
    return now - previous >= memoryWriteCooldownMs(candidate);
  }

  private markMemoryCandidateWritten(memoryId: string, candidate: MemoryCandidate, now = performance.now()): void {
    this.memoryWriteCooldowns.set(`${memoryId}:${candidate.mergeKey}`, now);
  }

  private stateFor(avatarId: string): AvatarRuntimeAgentState {
    let state = this.states.get(avatarId);
    if (!state) {
      state = {
        nextDecisionAt: 0,
        cycleInFlight: false,
        consecutiveRejectedActions: 0,
      };
      this.states.set(avatarId, state);
    }
    return state;
  }

  private pruneMissingAgents(): void {
    for (const avatarId of this.states.keys()) {
      if (!this.world.avatars.has(avatarId)) {
        this.states.delete(avatarId);
      }
    }
  }

  private isRuntimeAvatar(avatar: AvatarState): boolean {
    return avatar.control === 'ai' || avatar.inhabitedByAi;
  }

  private brainModelFor(avatar: AvatarState): string | undefined {
    return (avatar.brainId ? this.world.brains.get(avatar.brainId)?.model : undefined) ?? this.config.model;
  }
}

function planStateFrom(plan: PlanCandidate | undefined, planning: PlanningSnapshot): AvatarRuntimeCurrentPlan {
  if (!plan) {
    return {
      mode: planning.mode,
    };
  }

  return {
    candidateId: plan.affordanceId,
    objective: plan.objective,
    targetLabel: plan.target?.label,
    mode: plan.mode,
  };
}

function movementDuration(action: string, options: AvatarRuntimeOptions): number {
  if (action === 'move_toward') {
    return options.moveTowardIntentMs;
  }
  if (action === 'jump') {
    return options.jumpIntentMs;
  }
  return options.movementIntentMs;
}

function directionFromYaw(yaw: number, direction: 'forward' | 'backward' | 'left' | 'right'): Vec3 {
  const forward = { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
  const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };

  switch (direction) {
    case 'forward':
      return forward;
    case 'backward':
      return { x: -forward.x, y: 0, z: -forward.z };
    case 'left':
      return { x: -right.x, y: 0, z: -right.z };
    case 'right':
      return right;
  }
}

function velocityFrame(direction: Vec3, speed: number): AvatarRuntimeMoveFrame {
  return {
    velocity: {
      x: direction.x * speed,
      y: 0,
      z: direction.z * speed,
    },
    jump: false,
    moving: true,
  };
}

function chooseMemoryProfile(modelName?: string): MemoryProfile {
  const normalized = (modelName ?? '').toLowerCase();
  if (normalized.includes('gpt-5') || normalized.includes('claude') || normalized.includes('frontier')) {
    return 'frontier';
  }
  return 'balanced';
}

function memoryWriteCooldownMs(candidate: MemoryCandidate): number {
  if (candidate.impact === 'high') {
    return 10_000;
  }
  if (candidate.impact === 'medium') {
    return 45_000;
  }
  return 90_000;
}
