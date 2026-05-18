import { ChunkManager } from '../chunks/chunkManager';
import {
  AvatarState,
  BlockInstance,
  BlockShape,
  BlockRotation,
  BLOCK_DEFINITIONS,
  clamp,
  createId,
  distance2D,
  Motivators,
  PersonalityWeights,
  PlacementCandidate,
  PlacementValidation,
  TeslaNodeState,
  Vec3,
  WORLD_RULES,
} from './types';

export type AvatarCreationOptions = {
  name: string;
  color: string;
  personality: PersonalityWeights;
};

export type Bounds = {
  min: Vec3;
  max: Vec3;
};

const DEFAULT_MOTIVATORS: Motivators = {
  focus: 78,
  connection: 54,
  curiosity: 66,
  purpose: 60,
};

function cloneVec3(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

function normalizeWeights(weights: PersonalityWeights): PersonalityWeights {
  const total = Object.values(weights).reduce((sum, value) => sum + Math.max(0, value), 0) || 1;
  return {
    focus: Math.max(0, weights.focus) / total,
    connection: Math.max(0, weights.connection) / total,
    curiosity: Math.max(0, weights.curiosity) / total,
    purpose: Math.max(0, weights.purpose) / total,
  };
}

export class WorldState {
  readonly chunkManager = new ChunkManager();
  readonly avatars = new Map<string, AvatarState>();
  readonly blocks = new Map<string, BlockInstance>();
  readonly teslaNodes = new Map<string, TeslaNodeState>();

  selectedAvatarId?: string;
  elapsed = 0;
  lastMessage = 'Create an avatar to enter Tron World.';

  constructor() {
    this.createStartingTeslaNode();
  }

  createManualAvatar(options: AvatarCreationOptions): AvatarState {
    const avatar: AvatarState = {
      id: createId('avatar'),
      name: options.name.trim() || 'Manual Avatar',
      control: 'manual',
      inhabitedByAi: false,
      color: options.color,
      position: { x: 2.5, y: 0, z: 3.5 },
      yaw: Math.PI,
      pitch: 0,
      energy: WORLD_RULES.maxEnergy,
      shutdown: false,
      isMoving: false,
      grounded: true,
      motivators: { ...DEFAULT_MOTIVATORS },
      personality: normalizeWeights(options.personality),
      currentGoal: 'Explore the starting grid and learn the world controls.',
      recentDecision: 'Spawned near the starting Tesla Node.',
      intendedNextStep: 'Move, build, recharge, or place a Tesla Node foundation.',
    };

    this.avatars.set(avatar.id, avatar);
    this.selectedAvatarId = avatar.id;
    this.chunkManager.updateForAvatarPositions([avatar.position]);
    this.lastMessage = `${avatar.name} entered Tron World.`;
    return avatar;
  }

  getSelectedAvatar(): AvatarState | undefined {
    if (!this.selectedAvatarId) {
      return undefined;
    }

    return this.avatars.get(this.selectedAvatarId);
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.recomputeTeslaInterference();

    for (const avatar of this.avatars.values()) {
      if (avatar.energy <= 0) {
        this.shutdownAvatar(avatar, 'Energy depleted.');
        continue;
      }

      if (!avatar.shutdown) {
        const drain = avatar.isMoving ? WORLD_RULES.movementDrainPerSecond : WORLD_RULES.idleDrainPerSecond;
        this.changeEnergy(avatar, -drain * dt);

        const field = this.getTeslaFieldEffectAt(avatar.position);
        if (field !== 0) {
          this.changeEnergy(avatar, field * dt);
        }
      }

      avatar.isMoving = false;
    }

    this.chunkManager.updateForAvatarPositions([...this.avatars.values()].map((avatar) => avatar.position));
  }

  changeEnergy(avatar: AvatarState, amount: number): void {
    if (avatar.shutdown && amount <= 0) {
      return;
    }

    avatar.energy = clamp(avatar.energy + amount, 0, WORLD_RULES.maxEnergy);
    if (avatar.energy <= 0) {
      this.shutdownAvatar(avatar, 'Energy depleted.');
    } else if (avatar.shutdown && avatar.energy >= WORLD_RULES.minimumRevivalTransfer) {
      avatar.shutdown = false;
      avatar.recentDecision = 'Revived by Energy transfer.';
      this.lastMessage = `${avatar.name} is back online.`;
    }
  }

  markAvatarMoved(avatarId: string): void {
    const avatar = this.avatars.get(avatarId);
    if (!avatar || avatar.shutdown) {
      return;
    }

    avatar.isMoving = true;
    avatar.recentDecision = 'Moved through continuous world coordinates.';
    avatar.intendedNextStep = 'Keep moving or choose a nearby build/interact target.';
  }

  updateAvatarPose(avatarId: string, position: Vec3, yaw: number, pitch: number, grounded: boolean): void {
    const avatar = this.avatars.get(avatarId);
    if (!avatar) {
      return;
    }

    avatar.position = cloneVec3(position);
    avatar.yaw = yaw;
    avatar.pitch = pitch;
    avatar.grounded = grounded;
  }

  placeBlock(candidate: PlacementCandidate, avatarId: string): BlockInstance {
    const block: BlockInstance = {
      id: createId('block'),
      shape: candidate.shape as Exclude<BlockShape, 'tesla_node'>,
      position: cloneVec3(candidate.position),
      rotation: candidate.rotation,
      color: candidate.color,
      ownerId: avatarId,
    };

    this.blocks.set(block.id, block);
    this.chunkManager.markModifiedAt(block.position);
    this.lastMessage = `Placed ${BLOCK_DEFINITIONS[block.shape].label}.`;
    return block;
  }

  removeBlock(blockId: string): BlockInstance | undefined {
    const block = this.blocks.get(blockId);
    if (!block) {
      return undefined;
    }

    this.blocks.delete(blockId);
    this.chunkManager.markModifiedAt(block.position);
    this.lastMessage = `Removed ${BLOCK_DEFINITIONS[block.shape].label}.`;
    return block;
  }

  createTeslaNode(candidate: PlacementCandidate, avatarId: string, contribution: number): TeslaNodeState {
    const node: TeslaNodeState = {
      id: createId('tesla'),
      position: { x: candidate.position.x, y: 0, z: candidate.position.z },
      ownerId: avatarId,
      starting: false,
      active: false,
      contribution: clamp(contribution, 0, WORLD_RULES.teslaNodeTargetEnergy),
      targetEnergy: WORLD_RULES.teslaNodeTargetEnergy,
      radius: WORLD_RULES.teslaRadius,
      height: 2,
      interference: false,
    };

    if (node.contribution >= node.targetEnergy) {
      node.contribution = node.targetEnergy;
      node.active = true;
    }

    this.teslaNodes.set(node.id, node);
    this.chunkManager.markModifiedAt(node.position);
    this.lastMessage = node.active ? 'Tesla Node completed.' : 'Tesla Node foundation started.';
    return node;
  }

  contributeToTeslaNode(nodeId: string, avatarId: string, amount: number): number {
    const avatar = this.avatars.get(avatarId);
    const node = this.teslaNodes.get(nodeId);

    if (!avatar || !node || avatar.shutdown || node.active || amount <= 0) {
      return 0;
    }

    const spend = Math.min(amount, avatar.energy, node.targetEnergy - node.contribution);
    if (spend <= 0) {
      return 0;
    }

    this.changeEnergy(avatar, -spend);
    node.contribution = clamp(node.contribution + spend, 0, node.targetEnergy);
    avatar.recentDecision = 'Contributed Energy to a Tesla Node build.';
    avatar.intendedNextStep = node.contribution >= node.targetEnergy ? 'Move into the completed recharge field.' : 'Recharge or invite another avatar to contribute.';

    if (node.contribution >= node.targetEnergy) {
      node.contribution = node.targetEnergy;
      node.active = true;
      this.lastMessage = 'Tesla Node completed and recharge field activated.';
    } else {
      this.lastMessage = `Tesla Node progress: ${Math.floor(node.contribution)} / ${node.targetEnergy}.`;
    }

    return spend;
  }

  removeTeslaNode(nodeId: string): TeslaNodeState | undefined {
    const node = this.teslaNodes.get(nodeId);
    if (!node || node.starting) {
      return undefined;
    }

    this.teslaNodes.delete(nodeId);
    this.chunkManager.markModifiedAt(node.position);
    this.lastMessage = 'Removed Tesla Node.';
    return node;
  }

  validatePlacement(candidate: PlacementCandidate, avatarId: string): PlacementValidation {
    const avatar = this.avatars.get(avatarId);
    const definition = BLOCK_DEFINITIONS[candidate.shape];

    if (!avatar) {
      return { valid: false, reason: 'No avatar selected.' };
    }

    if (avatar.shutdown) {
      return { valid: false, reason: 'Avatar is shutdown.' };
    }

    if (definition.requiresHorizontalSurface && candidate.surfaceNormal.y < 0.8) {
      return { valid: false, reason: `${definition.label} needs a flat surface.` };
    }

    if (!definition.canAttachToSide && Math.abs(candidate.surfaceNormal.y) < 0.8) {
      return { valid: false, reason: `${definition.label} cannot attach sideways.` };
    }

    if (distance2D(avatar.position, candidate.position) > WORLD_RULES.buildReach) {
      return { valid: false, reason: 'Too far from avatar.' };
    }

    if (this.intersectsExisting(candidate)) {
      return { valid: false, reason: 'Space occupied.' };
    }

    return { valid: true };
  }

  getTeslaFieldEffectAt(position: Vec3): number {
    let safeRecharge = false;
    let dangerDrain = false;

    for (const node of this.teslaNodes.values()) {
      if (!node.active || distance2D(position, node.position) > node.radius) {
        continue;
      }

      if (node.interference) {
        dangerDrain = true;
      } else {
        safeRecharge = true;
      }
    }

    if (dangerDrain) {
      return -WORLD_RULES.interferenceDrainPerSecond;
    }

    return safeRecharge ? WORLD_RULES.rechargePerSecond : 0;
  }

  getBoundsForBlock(block: BlockInstance): Bounds {
    const size = BLOCK_DEFINITIONS[block.shape].size;
    return {
      min: {
        x: block.position.x - size.x / 2,
        y: block.position.y - size.y / 2,
        z: block.position.z - size.z / 2,
      },
      max: {
        x: block.position.x + size.x / 2,
        y: block.position.y + size.y / 2,
        z: block.position.z + size.z / 2,
      },
    };
  }

  getBoundsForCandidate(candidate: PlacementCandidate): Bounds {
    const size = BLOCK_DEFINITIONS[candidate.shape].size;
    return {
      min: {
        x: candidate.position.x - size.x / 2,
        y: candidate.position.y - size.y / 2,
        z: candidate.position.z - size.z / 2,
      },
      max: {
        x: candidate.position.x + size.x / 2,
        y: candidate.position.y + size.y / 2,
        z: candidate.position.z + size.z / 2,
      },
    };
  }

  private createStartingTeslaNode(): void {
    const node: TeslaNodeState = {
      id: 'tesla_starting_node',
      position: { x: 0, y: 0, z: 0 },
      ownerId: 'world',
      starting: true,
      active: true,
      contribution: WORLD_RULES.teslaNodeTargetEnergy,
      targetEnergy: WORLD_RULES.teslaNodeTargetEnergy,
      radius: WORLD_RULES.teslaRadius,
      height: 3,
      interference: false,
    };

    this.teslaNodes.set(node.id, node);
  }

  private shutdownAvatar(avatar: AvatarState, reason: string): void {
    avatar.energy = 0;
    avatar.shutdown = true;
    avatar.isMoving = false;
    avatar.recentFailure = reason;
    avatar.recentDecision = 'Entered shutdown state.';
    avatar.intendedNextStep = 'Wait for another active avatar to transfer Energy.';
    this.lastMessage = `${avatar.name} is shutdown.`;
  }

  private recomputeTeslaInterference(): void {
    for (const node of this.teslaNodes.values()) {
      node.interference = false;
    }

    const activeNodes = [...this.teslaNodes.values()].filter((node) => node.active);

    for (let i = 0; i < activeNodes.length; i += 1) {
      for (let j = i + 1; j < activeNodes.length; j += 1) {
        const a = activeNodes[i];
        const b = activeNodes[j];

        if (distance2D(a.position, b.position) < a.radius + b.radius) {
          a.interference = true;
          b.interference = true;
        }
      }
    }
  }

  private intersectsExisting(candidate: PlacementCandidate): boolean {
    const bounds = this.getBoundsForCandidate(candidate);

    for (const block of this.blocks.values()) {
      if (this.boundsOverlap(bounds, this.getBoundsForBlock(block))) {
        return true;
      }
    }

    for (const node of this.teslaNodes.values()) {
      const nodeBounds: Bounds = {
        min: { x: node.position.x - 0.65, y: 0, z: node.position.z - 0.65 },
        max: { x: node.position.x + 0.65, y: node.height, z: node.position.z + 0.65 },
      };

      if (this.boundsOverlap(bounds, nodeBounds)) {
        return true;
      }
    }

    return false;
  }

  private boundsOverlap(a: Bounds, b: Bounds): boolean {
    const epsilon = 0.01;
    return (
      a.min.x < b.max.x - epsilon &&
      a.max.x > b.min.x + epsilon &&
      a.min.y < b.max.y - epsilon &&
      a.max.y > b.min.y + epsilon &&
      a.min.z < b.max.z - epsilon &&
      a.max.z > b.min.z + epsilon
    );
  }
}
