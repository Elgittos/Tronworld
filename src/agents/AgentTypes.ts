import { ActionSchema, AgentAction } from '../actions/AgentActions';
import { AgentActionResult } from '../actions/ActionResult';
import { AttentionTarget, AvatarState, BlockRotation, BlockShape, Vec3 } from '../world/types';

export type AgentState = AvatarState;
export type { AttentionTarget };

export type AgentObservation = {
  position: Vec3;
  energy: number;
  energyState: 'full' | 'medium' | 'critical' | 'shutdown';
  motivators: AvatarState['motivators'];
  nearbyAgents: Array<{
    id: string;
    name: string;
    distance: number;
    energyState: AgentObservation['energyState'];
    shutdown: boolean;
  }>;
  nearbyTeslaNodes: Array<{
    id: string;
    distance: number;
    active: boolean;
    starting: boolean;
    interference: boolean;
    contribution: number;
    targetEnergy: number;
    position: Vec3;
  }>;
  visibleBlocks: Array<{
    id: string;
    shape: Exclude<BlockShape, 'tesla_node'>;
    distance: number;
    position: Vec3;
    rotation: BlockRotation;
  }>;
  visibleStructures: string[];
  openDirections: string[];
  currentGoal: string;
  recentEvents: string[];
};

export type AgentBrainInput = {
  agentId: string;
  tick: number;
  agentState: AgentState;
  observation: AgentObservation;
  availableActions: ActionSchema[];
  memorySummary?: string;
  lastActionResult?: AgentActionResult;
};

export type AgentBrainOutput = {
  proposedAction: AgentAction;
  shortReason?: string;
  attentionTarget?: AttentionTarget;
  rawModelOutput?: string;
};

export type AgentMovementIntent =
  | { action: 'move_forward' | 'move_backward' | 'move_left' | 'move_right'; expiresAt: number }
  | { action: 'move_toward'; target: Vec3; expiresAt: number }
  | { action: 'jump'; expiresAt: number; consumed: boolean };
