import { AgentAction } from '../../actions/AgentActions';
import { AgentMovementCommand } from '../../actions/ActionValidator';
import { LLMProviderConfig } from '../../llm/LLMProviderConfig';
import { Vec3 } from '../../world/types';

export type AvatarRuntimeMoveFrame = {
  velocity: Vec3;
  jump: boolean;
  moving: boolean;
};

export type AvatarRuntimeMovementIntent = {
  command: AgentMovementCommand;
  candidateId: string;
  planId?: string;
  startedAt: number;
  expiresAt: number;
  jumpConsumed: boolean;
};

export type AvatarRuntimeActionFeedback = {
  ok: boolean;
  message: string;
};

export type AvatarRuntimeCurrentPlan = {
  candidateId?: string;
  objective?: string;
  targetLabel?: string;
  mode?: string;
};

export type AvatarRuntimeAgentState = {
  nextDecisionAt: number;
  cycleInFlight: boolean;
  movementIntent?: AvatarRuntimeMovementIntent;
  lastAttemptedAction?: AgentAction['action'];
  lastActionResult?: AvatarRuntimeActionFeedback;
  currentPlan?: AvatarRuntimeCurrentPlan;
  lastDecisionSummary?: string;
  lastLoggedThoughtKey?: string;
  lastDecisionAt?: number;
  consecutiveRejectedActions: number;
};

export type AvatarRuntimeOptions = {
  decisionIntervalMs: number;
  rejectionBackoffMs: number;
  movementIntentMs: number;
  moveTowardIntentMs: number;
  jumpIntentMs: number;
  maxMemoryWritesPerCycle: number;
};

export type AvatarRuntimeDependencies = {
  config: LLMProviderConfig;
};

export type AvatarRuntimeDecisionTrace = {
  avatarId: string;
  avatarName: string;
  action?: AgentAction;
  affordanceId?: string;
  planId?: string;
  accepted: boolean;
  applied: boolean;
  movement: boolean;
  reason: string;
};

export const DEFAULT_AVATAR_RUNTIME_OPTIONS: AvatarRuntimeOptions = {
  decisionIntervalMs: 1800,
  rejectionBackoffMs: 2600,
  movementIntentMs: 850,
  moveTowardIntentMs: 1700,
  jumpIntentMs: 280,
  maxMemoryWritesPerCycle: 2,
};

export const ZERO_MOVE_FRAME: AvatarRuntimeMoveFrame = {
  velocity: { x: 0, y: 0, z: 0 },
  jump: false,
  moving: false,
};
