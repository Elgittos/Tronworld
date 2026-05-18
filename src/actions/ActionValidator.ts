import { ActionRequest, ActionSystem } from './actions';
import { AgentAction } from './AgentActions';
import { AgentActionResult } from './ActionResult';
import {
  AvatarState,
  BLOCK_DEFINITIONS,
  BlockRotation,
  BlockShape,
  distance2D,
  PlacementCandidate,
  Vec3,
  WORLD_RULES,
} from '../world/types';
import { WorldState } from '../world/worldState';

export type AgentMovementCommand =
  | { action: 'move_forward' | 'move_backward' | 'move_left' | 'move_right' }
  | { action: 'move_toward'; target: Vec3 }
  | { action: 'jump' };

export type ValidatedAgentAction = AgentActionResult & {
  actionRequest?: ActionRequest;
  movement?: AgentMovementCommand;
};

export class ActionValidator {
  constructor(
    private readonly world: WorldState,
    private readonly actionSystem: ActionSystem,
  ) {}

  validate(action: AgentAction, agent: AvatarState): ValidatedAgentAction {
    if (!agent) {
      return this.reject(action, 'No agent found.');
    }

    if (agent.shutdown || agent.energy <= 0) {
      return this.reject(action, 'Agent is shutdown.');
    }

    switch (action.action) {
      case 'move_forward':
      case 'move_backward':
      case 'move_left':
      case 'move_right':
      case 'jump':
        return { accepted: true, appliedAction: action, movement: { action: action.action } };
      case 'move_toward':
        return this.validateMoveToward(action, agent);
      case 'place_block':
        return this.validatePlaceBlock(action, agent);
      case 'remove_block':
        return this.validateRemoveBlock(action, agent);
      case 'scan':
        return agent.energy >= WORLD_RULES.scanCost
          ? { accepted: true, appliedAction: action, actionRequest: { type: 'scan', avatarId: agent.id } }
          : this.reject(action, 'Not enough Energy to scan.');
      case 'handshake':
        return this.validateHandshake(action, agent);
      case 'recalibrate':
        return { accepted: true, appliedAction: action, actionRequest: { type: 'recalibrate', avatarId: agent.id } };
      case 'recharge':
        return { accepted: true, appliedAction: action, actionRequest: { type: 'recharge', avatarId: agent.id } };
      case 'transfer_energy':
        return this.validateTransfer(action, agent);
      case 'build_tesla_node':
        return this.validateBuildTeslaNode(action, agent);
      case 'wait':
        return { accepted: true, reason: 'Waiting.', appliedAction: action };
      default:
        return this.reject(action, 'Unknown action.');
    }
  }

  apply(validated: ValidatedAgentAction): AgentActionResult {
    if (!validated.accepted || !validated.appliedAction) {
      return validated;
    }

    if (!validated.actionRequest) {
      return validated.reason ? validated : { ...validated, reason: 'Action accepted.' };
    }

    const before = this.world.avatars.get(validated.actionRequest.avatarId)?.energy;
    const result = this.actionSystem.apply(validated.actionRequest);
    const after = this.world.avatars.get(validated.actionRequest.avatarId)?.energy;

    return {
      accepted: result.ok,
      reason: result.message,
      appliedAction: validated.appliedAction,
      energyDelta: before !== undefined && after !== undefined ? after - before : undefined,
    };
  }

  private validateMoveToward(action: Extract<AgentAction, { action: 'move_toward' }>, agent: AvatarState): ValidatedAgentAction {
    if (!this.isVec3(action.target)) {
      return this.reject(action, 'move_toward requires a valid target.');
    }

    if (distance2D(agent.position, action.target) > 80) {
      return this.reject(action, 'Target is too far beyond local navigation range.');
    }

    return { accepted: true, appliedAction: action, movement: { action: 'move_toward', target: action.target } };
  }

  private validatePlaceBlock(action: Extract<AgentAction, { action: 'place_block' }>, agent: AvatarState): ValidatedAgentAction {
    if (!(action.shape in BLOCK_DEFINITIONS)) {
      return this.reject(action, 'Invalid block shape.');
    }

    if (!this.isRotation(action.rotation) || !this.isVec3(action.position)) {
      return this.reject(action, 'Block placement is missing position or rotation.');
    }

    const candidate = this.floorCandidate(action.shape, action.position, action.rotation, action.color ?? agent.color);
    const validation = this.actionSystem.validatePlacement(candidate, agent.id);

    if (!validation.ok) {
      return this.reject(action, validation.message);
    }

    return {
      accepted: true,
      appliedAction: action,
      actionRequest: {
        type: 'place_block',
        avatarId: agent.id,
        shape: action.shape,
        position: candidate.position,
        rotation: candidate.rotation,
        color: candidate.color,
        surfaceNormal: candidate.surfaceNormal,
        targetKind: candidate.targetKind,
      },
    };
  }

  private validateRemoveBlock(action: Extract<AgentAction, { action: 'remove_block' }>, agent: AvatarState): ValidatedAgentAction {
    if (agent.energy < WORLD_RULES.normalBlockCost) {
      return this.reject(action, 'Not enough Energy.');
    }

    const target = this.findRemovableTarget(action);
    if (!target) {
      return this.reject(action, 'No removable nearby target found.');
    }

    if (distance2D(agent.position, target.position) > WORLD_RULES.buildReach) {
      return this.reject(action, 'Target too far away.');
    }

    return {
      accepted: true,
      appliedAction: action,
      actionRequest: {
        type: 'remove_block',
        avatarId: agent.id,
        targetId: target.id,
        targetKind: target.kind,
      },
    };
  }

  private validateHandshake(action: Extract<AgentAction, { action: 'handshake' }>, agent: AvatarState): ValidatedAgentAction {
    const target = this.world.avatars.get(action.targetAgentId);
    if (!target || target.id === agent.id) {
      return this.reject(action, 'No active avatar targeted.');
    }
    if (distance2D(agent.position, target.position) > WORLD_RULES.interactReach) {
      return this.reject(action, 'Target too far away.');
    }
    if (agent.energy < WORLD_RULES.handshakeCost) {
      return this.reject(action, 'Not enough Energy to handshake.');
    }
    return { accepted: true, appliedAction: action, actionRequest: { type: 'handshake', avatarId: agent.id, targetAvatarId: target.id } };
  }

  private validateTransfer(action: Extract<AgentAction, { action: 'transfer_energy' }>, agent: AvatarState): ValidatedAgentAction {
    const target = this.world.avatars.get(action.targetAgentId);
    if (!target || target.id === agent.id) {
      return this.reject(action, 'No avatar targeted for transfer.');
    }
    if (!Number.isFinite(action.amount) || action.amount <= 0) {
      return this.reject(action, 'Transfer amount must be positive.');
    }
    if (distance2D(agent.position, target.position) > WORLD_RULES.interactReach) {
      return this.reject(action, 'Target too far away.');
    }
    if (target.shutdown && action.amount < WORLD_RULES.minimumRevivalTransfer) {
      return this.reject(action, 'Shutdown revival requires at least 10 Energy.');
    }
    if (agent.energy - action.amount < WORLD_RULES.donorReserveEnergy) {
      return this.reject(action, 'Donor must keep at least 10 Energy.');
    }
    return {
      accepted: true,
      appliedAction: action,
      actionRequest: { type: 'transfer_energy', avatarId: agent.id, targetAvatarId: target.id, amount: action.amount },
    };
  }

  private validateBuildTeslaNode(action: Extract<AgentAction, { action: 'build_tesla_node' }>, agent: AvatarState): ValidatedAgentAction {
    if (!this.isVec3(action.position)) {
      return this.reject(action, 'Tesla Node build needs a position.');
    }
    if (!Number.isFinite(action.contribution) || action.contribution <= 0) {
      return this.reject(action, 'Invalid Tesla Node contribution.');
    }
    if (action.contribution > agent.energy) {
      return this.reject(action, 'Not enough Energy for that contribution.');
    }

    const candidate = this.floorCandidate('tesla_node', action.position, 0, agent.color);
    const validation = this.actionSystem.validatePlacement(candidate, agent.id);
    if (!validation.ok) {
      return this.reject(action, validation.message);
    }

    return {
      accepted: true,
      appliedAction: action,
      actionRequest: {
        type: 'build_tesla_node',
        avatarId: agent.id,
        position: candidate.position,
        rotation: candidate.rotation,
        color: candidate.color,
        surfaceNormal: candidate.surfaceNormal,
        targetKind: candidate.targetKind,
        contribution: action.contribution,
      },
    };
  }

  private floorCandidate(shape: BlockShape, position: Vec3, rotation: BlockRotation, color: string): PlacementCandidate {
    const size = BLOCK_DEFINITIONS[shape].size;
    return {
      shape,
      position: {
        x: Math.floor(position.x) + 0.5,
        y: shape === 'tesla_node' ? 0 : size.y / 2,
        z: Math.floor(position.z) + 0.5,
      },
      rotation,
      color,
      surfaceNormal: { x: 0, y: 1, z: 0 },
      targetKind: 'floor',
    };
  }

  private findRemovableTarget(action: Extract<AgentAction, { action: 'remove_block' }>): { id: string; kind: 'block' | 'tesla_node'; position: Vec3 } | undefined {
    if (action.targetBlockId) {
      const block = this.world.blocks.get(action.targetBlockId);
      if (block) {
        return { id: block.id, kind: 'block', position: block.position };
      }

      const node = this.world.teslaNodes.get(action.targetBlockId);
      if (node && !node.starting) {
        return { id: node.id, kind: 'tesla_node', position: node.position };
      }
    }

    if (!action.position) {
      return undefined;
    }

    const candidates = [
      ...[...this.world.blocks.values()].map((block) => ({ id: block.id, kind: 'block' as const, position: block.position })),
      ...[...this.world.teslaNodes.values()]
        .filter((node) => !node.starting)
        .map((node) => ({ id: node.id, kind: 'tesla_node' as const, position: node.position })),
    ];

    return candidates
      .map((candidate) => ({ ...candidate, distance: distance2D(action.position as Vec3, candidate.position) }))
      .filter((candidate) => candidate.distance <= 1.2)
      .sort((a, b) => a.distance - b.distance)[0];
  }

  private reject(action: AgentAction, reason: string): ValidatedAgentAction {
    return {
      accepted: false,
      reason,
      appliedAction: action,
    };
  }

  private isVec3(value: Vec3): boolean {
    return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
  }

  private isRotation(value: number): value is BlockRotation {
    return value === 0 || value === 90 || value === 180 || value === 270;
  }
}
