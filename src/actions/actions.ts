import { WorldState } from '../world/worldState';
import {
  AvatarState,
  BlockRotation,
  BlockShape,
  BLOCK_DEFINITIONS,
  clamp,
  distance2D,
  PlacementCandidate,
  Vec3,
  WORLD_RULES,
} from '../world/types';

export const ACTION_TYPES = [
  'move_forward',
  'move_backward',
  'move_left',
  'move_right',
  'jump',
  'move_toward',
  'place_block',
  'remove_block',
  'scan',
  'handshake',
  'recalibrate',
  'recharge',
  'transfer_energy',
  'build_tesla_node',
  'wait',
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export type ActionRequest =
  | { type: 'move_forward' | 'move_backward' | 'move_left' | 'move_right' | 'jump' | 'wait'; avatarId: string }
  | { type: 'move_toward'; avatarId: string; target: Vec3 }
  | {
      type: 'place_block';
      avatarId: string;
      shape: Exclude<BlockShape, 'tesla_node'>;
      position: Vec3;
      rotation: BlockRotation;
      color: string;
      surfaceNormal: Vec3;
      targetKind: PlacementCandidate['targetKind'];
      targetId?: string;
    }
  | {
      type: 'build_tesla_node';
      avatarId: string;
      position: Vec3;
      rotation: BlockRotation;
      color: string;
      surfaceNormal: Vec3;
      targetKind: PlacementCandidate['targetKind'];
      targetId?: string;
      contribution: number;
    }
  | { type: 'build_tesla_node'; avatarId: string; nodeId: string; contribution: number }
  | { type: 'remove_block'; avatarId: string; targetId: string; targetKind: 'block' | 'tesla_node' }
  | { type: 'scan'; avatarId: string }
  | { type: 'handshake'; avatarId: string; targetAvatarId: string }
  | { type: 'recalibrate'; avatarId: string }
  | { type: 'recharge'; avatarId: string }
  | { type: 'transfer_energy'; avatarId: string; targetAvatarId: string; amount: number };

export type ActionResult = {
  ok: boolean;
  message: string;
};

export class ActionSystem {
  constructor(private readonly world: WorldState) {}

  apply(action: ActionRequest): ActionResult {
    const avatar = this.world.avatars.get(action.avatarId);
    const base = this.validateAvatarAction(avatar);

    if (!base.ok) {
      return base;
    }

    if (!avatar) {
      return base;
    }

    switch (action.type) {
      case 'place_block':
        return this.placeBlock(action);
      case 'build_tesla_node':
        return this.buildTeslaNode(action);
      case 'remove_block':
        return this.removeBlock(action);
      case 'scan':
        return this.scan(avatar);
      case 'handshake':
        return this.handshake(avatar, action.targetAvatarId);
      case 'recalibrate':
        return this.recalibrate(avatar);
      case 'transfer_energy':
        return this.transferEnergy(avatar, action.targetAvatarId, action.amount);
      case 'recharge':
        return { ok: true, message: 'Recharge is automatic inside active Tesla fields.' };
      case 'move_forward':
      case 'move_backward':
      case 'move_left':
      case 'move_right':
      case 'jump':
      case 'move_toward':
      case 'wait':
        return { ok: true, message: `${action.type} validated.` };
      default:
        return { ok: false, message: 'Unknown action.' };
    }
  }

  validatePlacement(candidate: PlacementCandidate, avatarId: string): ActionResult {
    const avatar = this.world.avatars.get(avatarId);
    const base = this.validateAvatarAction(avatar);

    if (!base.ok) {
      return base;
    }

    if (!avatar) {
      return base;
    }

    const placement = this.world.validatePlacement(candidate, avatarId);
    if (!placement.valid) {
      return { ok: false, message: placement.reason ?? 'Invalid placement.' };
    }

    if (candidate.shape !== 'tesla_node' && avatar.energy < BLOCK_DEFINITIONS[candidate.shape].energyCost) {
      return { ok: false, message: 'Not enough Energy.' };
    }

    return { ok: true, message: 'Placement valid.' };
  }

  private validateAvatarAction(avatar?: AvatarState): ActionResult {
    if (!avatar) {
      return { ok: false, message: 'No avatar selected.' };
    }

    if (avatar.shutdown) {
      return { ok: false, message: 'Avatar is shutdown.' };
    }

    if (avatar.control === 'manual' && avatar.inhabitedByAi) {
      return { ok: false, message: 'Humans cannot directly control AI-inhabited avatars.' };
    }

    return { ok: true, message: 'Avatar ready.' };
  }

  private placeBlock(action: Extract<ActionRequest, { type: 'place_block' }>): ActionResult {
    const avatar = this.world.avatars.get(action.avatarId);
    if (!avatar) {
      return { ok: false, message: 'No avatar selected.' };
    }

    const candidate: PlacementCandidate = {
      shape: action.shape,
      position: action.position,
      rotation: action.rotation,
      color: action.color,
      surfaceNormal: action.surfaceNormal,
      targetKind: action.targetKind,
      targetId: action.targetId,
    };
    const validation = this.validatePlacement(candidate, action.avatarId);

    if (!validation.ok) {
      avatar.recentFailure = validation.message;
      avatar.motivators.focus = clamp(avatar.motivators.focus - 5, 0, 100);
      return validation;
    }

    this.world.changeEnergy(avatar, -BLOCK_DEFINITIONS[action.shape].energyCost);
    this.world.placeBlock(candidate, avatar.id);
    avatar.motivators.focus = clamp(avatar.motivators.focus + 5, 0, 100);
    avatar.motivators.purpose = clamp(avatar.motivators.purpose + 8, 0, 100);
    avatar.recentDecision = `Placed a ${BLOCK_DEFINITIONS[action.shape].label}.`;
    avatar.intendedNextStep = 'Continue building or recharge near a Tesla Node.';

    return { ok: true, message: 'Block placed.' };
  }

  private buildTeslaNode(action: Extract<ActionRequest, { type: 'build_tesla_node' }>): ActionResult {
    const avatar = this.world.avatars.get(action.avatarId);
    if (!avatar) {
      return { ok: false, message: 'No avatar selected.' };
    }

    if ('nodeId' in action) {
      return this.contributeToTeslaNode(avatar, action.nodeId, action.contribution);
    }

    const candidate: PlacementCandidate = {
      shape: 'tesla_node',
      position: action.position,
      rotation: action.rotation,
      color: action.color,
      surfaceNormal: action.surfaceNormal,
      targetKind: action.targetKind,
      targetId: action.targetId,
    };
    const validation = this.validatePlacement(candidate, avatar.id);

    if (!validation.ok) {
      avatar.recentFailure = validation.message;
      avatar.motivators.focus = clamp(avatar.motivators.focus - 5, 0, 100);
      return validation;
    }

    const contribution = Math.max(0, action.contribution);
    if (contribution <= 0) {
      return { ok: false, message: 'Choose an Energy contribution.' };
    }

    if (contribution > avatar.energy) {
      return { ok: false, message: 'Not enough Energy for that contribution.' };
    }

    this.world.changeEnergy(avatar, -contribution);
    this.world.createTeslaNode(candidate, avatar.id, contribution);
    avatar.motivators.purpose = clamp(avatar.motivators.purpose + 30, 0, 100);
    avatar.recentDecision = 'Started a Tesla Node build.';
    avatar.intendedNextStep = 'Recharge, then continue contributing Energy.';

    return { ok: true, message: 'Tesla Node started.' };
  }

  private contributeToTeslaNode(avatar: AvatarState, nodeId: string, amount: number): ActionResult {
    const contribution = Math.max(0, amount);
    const spent = this.world.contributeToTeslaNode(nodeId, avatar.id, contribution);

    if (spent <= 0) {
      return { ok: false, message: 'Could not contribute Energy.' };
    }

    avatar.motivators.purpose = clamp(avatar.motivators.purpose + 2, 0, 100);
    return { ok: true, message: `Contributed ${spent.toFixed(1)} Energy.` };
  }

  private removeBlock(action: Extract<ActionRequest, { type: 'remove_block' }>): ActionResult {
    const avatar = this.world.avatars.get(action.avatarId);
    if (!avatar) {
      return { ok: false, message: 'No avatar selected.' };
    }

    if (avatar.energy < WORLD_RULES.normalBlockCost) {
      return { ok: false, message: 'Not enough Energy.' };
    }

    if (action.targetKind === 'tesla_node') {
      const removed = this.world.removeTeslaNode(action.targetId);
      if (!removed) {
        return { ok: false, message: 'Starting Tesla Node cannot be removed.' };
      }
    } else {
      const removed = this.world.removeBlock(action.targetId);
      if (!removed) {
        return { ok: false, message: 'No removable block targeted.' };
      }
    }

    this.world.changeEnergy(avatar, -WORLD_RULES.normalBlockCost);
    avatar.motivators.purpose = clamp(avatar.motivators.purpose + 6, 0, 100);
    avatar.recentDecision = 'Removed a world object.';
    return { ok: true, message: 'Removed target.' };
  }

  private scan(avatar: AvatarState): ActionResult {
    if (avatar.energy < WORLD_RULES.scanCost) {
      return { ok: false, message: 'Not enough Energy to scan.' };
    }

    this.world.changeEnergy(avatar, -WORLD_RULES.scanCost);
    avatar.motivators.curiosity = clamp(avatar.motivators.curiosity + 10, 0, 100);
    avatar.motivators.focus = clamp(avatar.motivators.focus + 5, 0, 100);
    avatar.recentDecision = 'Performed an active scan.';
    avatar.intendedNextStep = 'Use scan results to choose a nearby build or movement target.';
    this.world.lastMessage = 'Scan complete: local structures, Tesla Nodes, avatars, and open grid checked.';
    return { ok: true, message: 'Scan complete.' };
  }

  private handshake(avatar: AvatarState, targetAvatarId: string): ActionResult {
    const target = this.world.avatars.get(targetAvatarId);
    if (!target || target.id === avatar.id) {
      return { ok: false, message: 'No active avatar targeted.' };
    }

    if (distance2D(avatar.position, target.position) > WORLD_RULES.interactReach) {
      return { ok: false, message: 'Target too far away.' };
    }

    if (avatar.energy < WORLD_RULES.handshakeCost) {
      return { ok: false, message: 'Not enough Energy to handshake.' };
    }

    this.world.changeEnergy(avatar, -WORLD_RULES.handshakeCost);
    avatar.motivators.connection = clamp(avatar.motivators.connection + 25, 0, 100);
    target.motivators.connection = clamp(target.motivators.connection + 25, 0, 100);
    avatar.recentDecision = `Handshake with ${target.name}.`;
    this.world.lastMessage = 'Handshake complete.';
    return { ok: true, message: 'Handshake complete.' };
  }

  private recalibrate(avatar: AvatarState): ActionResult {
    avatar.motivators.focus = clamp(avatar.motivators.focus + WORLD_RULES.recalibrateFocusGain, 0, 100);
    avatar.recentDecision = 'Recalibrated using current goal, recent decision, movement direction, and intended next step.';
    avatar.intendedNextStep = avatar.intendedNextStep || 'Resume the current plan.';
    this.world.lastMessage = 'Recalibration restored Focus by re-centering the avatar context.';
    return { ok: true, message: 'Recalibrated.' };
  }

  private transferEnergy(avatar: AvatarState, targetAvatarId: string, amount: number): ActionResult {
    const target = this.world.avatars.get(targetAvatarId);
    const transfer = Math.max(0, amount);

    if (!target || target.id === avatar.id) {
      return { ok: false, message: 'No avatar targeted for transfer.' };
    }

    if (distance2D(avatar.position, target.position) > WORLD_RULES.interactReach) {
      return { ok: false, message: 'Target too far away.' };
    }

    if (target.shutdown && transfer < WORLD_RULES.minimumRevivalTransfer) {
      return { ok: false, message: 'Shutdown revival requires at least 10 Energy.' };
    }

    if (avatar.energy - transfer < WORLD_RULES.donorReserveEnergy) {
      return { ok: false, message: 'Donor must keep at least 10 Energy.' };
    }

    this.world.changeEnergy(avatar, -transfer);
    this.world.changeEnergy(target, transfer);
    avatar.motivators.connection = clamp(avatar.motivators.connection + 20, 0, 100);
    avatar.recentDecision = `Transferred Energy to ${target.name}.`;
    this.world.lastMessage = `Transferred ${transfer} Energy.`;
    return { ok: true, message: 'Energy transferred.' };
  }
}
