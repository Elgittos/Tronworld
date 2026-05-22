import { ChunkManager } from '../chunks/chunkManager';
import {
  AgentControl,
  AvatarState,
  AvatarInteractionEffect,
  BrainState,
  BlockInstance,
  BlockShape,
  BlockRotation,
  BLOCK_DEFINITIONS,
  clamp,
  createId,
  distance2D,
  EyeStyle,
  PlacementCandidate,
  PlacementValidation,
  TeslaNodeState,
  Vec3,
  WORLD_RULES,
} from './types';

export type AvatarCreationOptions = {
  name: string;
  color: string;
  eyeStyle?: EyeStyle;
  select?: boolean;
};

export type AiAvatarCreationOptions = Partial<AvatarCreationOptions> & {
  position?: Vec3;
  provider?: string;
  model?: string;
};

export type Bounds = {
  min: Vec3;
  max: Vec3;
};

const WORLD_EDITS_STORAGE_KEY = 'tron-world:world-edits:v1';
const PERSISTENCE_VERSION = 2;

type PersistedWorldEdits = {
  version: typeof PERSISTENCE_VERSION;
  blocks: BlockInstance[];
  teslaNodes: TeslaNodeState[];
};

export type WorldSnapshot = {
  version: 1;
  savedAt: string;
  elapsed: number;
  tick: number;
  selectedAvatarId?: string;
  avatars: AvatarState[];
  brains: BrainState[];
  blocks: BlockInstance[];
  teslaNodes: TeslaNodeState[];
  lastMessage: string;
};

function cloneVec3(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

function isVec3(value: unknown): value is Vec3 {
  const vec = value as Vec3 | undefined;
  return !!vec && Number.isFinite(vec.x) && Number.isFinite(vec.y) && Number.isFinite(vec.z);
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export class WorldState {
  readonly chunkManager = new ChunkManager();
  readonly avatars = new Map<string, AvatarState>();
  readonly brains = new Map<string, BrainState>();
  readonly blocks = new Map<string, BlockInstance>();
  readonly teslaNodes = new Map<string, TeslaNodeState>();
  readonly avatarInteractionEffects = new Map<string, AvatarInteractionEffect>();

  selectedAvatarId?: string;
  elapsed = 0;
  tick = 0;
  lastMessage = 'Create an avatar to enter Tron World.';

  constructor(snapshot?: WorldSnapshot) {
    this.createStartingTeslaNode();
    if (snapshot) {
      this.restoreSnapshot(snapshot);
    } else {
      this.loadPersistedWorldEdits();
    }
  }

  createManualAvatar(options: AvatarCreationOptions): AvatarState {
    const avatar: AvatarState = {
      id: createId('avatar'),
      memoryId: undefined,
      name: options.name.trim() || 'Manual Avatar',
      control: 'manual',
      inhabitedByAi: false,
      color: options.color,
      eyeStyle: options.eyeStyle ?? 'normal',
      position: this.findOpenAvatarSpawn({ x: 2.5, y: 0, z: 3.5 }),
      yaw: Math.PI,
      pitch: 0,
      energy: WORLD_RULES.maxEnergy,
      shutdown: false,
      isMoving: false,
      grounded: true,
      firstCreatedAt: new Date().toISOString(),
      createdAtWorldTime: this.elapsed,
      createdAtTick: this.tick,
      currentGoal: 'Explore the starting grid and learn the world controls.',
      recentDecision: 'Spawned near the starting Tesla Node.',
      intendedNextStep: 'Move, build, recharge, or place a Tesla Node foundation.',
    };

    this.avatars.set(avatar.id, avatar);
    if (options.select ?? true) {
      this.selectedAvatarId = avatar.id;
    }
    this.chunkManager.updateForAvatarPositions([...this.avatars.values()].map((entry) => entry.position));
    this.lastMessage = `${avatar.name} entered Tron World.`;
    return avatar;
  }

  createAiAvatar(options: AiAvatarCreationOptions = {}): AvatarState {
    const spawnPosition = this.findOpenAvatarSpawn(options.position ? cloneVec3(options.position) : { x: -2.5, y: 0, z: 3.5 });
    const avatar: AvatarState = {
      id: createId('agent'),
      memoryId: undefined,
      name: options.name?.trim() || 'Tron Agent',
      control: 'ai',
      inhabitedByAi: true,
      color: options.color ?? '#44f2ff',
      eyeStyle: options.eyeStyle ?? 'normal',
      position: spawnPosition,
      yaw: Math.PI,
      pitch: 0,
      energy: WORLD_RULES.maxEnergy,
      shutdown: false,
      isMoving: false,
      grounded: true,
      firstCreatedAt: new Date().toISOString(),
      createdAtWorldTime: this.elapsed,
      createdAtTick: this.tick,
      currentGoal: 'Stay powered, observe the nearby grid, and cooperate with other avatars.',
      recentDecision: 'AI agent spawned near the starting Tesla Node.',
      intendedNextStep: 'Observe the world, maintain Energy, and choose a validated action.',
    };

    const brain = this.createBrain(avatar.id, {
      provider: options.provider ?? 'openai-compatible',
      model: options.model ?? 'local-model',
    });
    avatar.brainId = brain.id;

    this.avatars.set(avatar.id, avatar);
    this.chunkManager.updateForAvatarPositions([...this.avatars.values()].map((entry) => entry.position));
    this.lastMessage = `${avatar.name} entered Tron World as an AI agent.`;
    return avatar;
  }

  getSelectedAvatar(): AvatarState | undefined {
    if (!this.selectedAvatarId) {
      return undefined;
    }

    return this.avatars.get(this.selectedAvatarId);
  }

  toSnapshot(): WorldSnapshot {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      elapsed: this.elapsed,
      tick: this.tick,
      selectedAvatarId: this.selectedAvatarId,
      avatars: [...this.avatars.values()].map((avatar) => ({
        ...avatar,
        position: cloneVec3(avatar.position),
        attentionTarget: avatar.attentionTarget
          ? {
              ...avatar.attentionTarget,
              position: avatar.attentionTarget.position ? cloneVec3(avatar.attentionTarget.position) : undefined,
            }
          : undefined,
      })),
      brains: [...this.brains.values()].map((brain) => ({ ...brain })),
      blocks: [...this.blocks.values()].map((block) => ({ ...block, position: cloneVec3(block.position) })),
      teslaNodes: [...this.teslaNodes.values()].map((node) => ({ ...node, position: cloneVec3(node.position) })),
      lastMessage: this.lastMessage,
    };
  }

  applyMemoryId(avatarId: string, memoryId: string, firstCreatedAt?: string): void {
    const avatar = this.avatars.get(avatarId);
    if (!avatar) {
      return;
    }

    avatar.memoryId = memoryId;
    avatar.firstCreatedAt = firstCreatedAt ?? avatar.firstCreatedAt;
  }

  selectAvatar(avatarId: string): AvatarState | undefined {
    const avatar = this.avatars.get(avatarId);
    if (!avatar) {
      return undefined;
    }

    this.selectedAvatarId = avatar.id;
    return avatar;
  }

  isAvatarControllable(avatarId: string | undefined): boolean {
    if (!avatarId) {
      return false;
    }

    const avatar = this.avatars.get(avatarId);
    return !!avatar && avatar.control === 'manual' && !avatar.inhabitedByAi && !avatar.shutdown;
  }

  findOpenAvatarSpawn(preferred: Vec3): Vec3 {
    const offsets = [
      { x: 0, z: 0 },
      { x: 2.2, z: 0 },
      { x: -2.2, z: 0 },
      { x: 0, z: 2.2 },
      { x: 0, z: -2.2 },
      { x: 2.2, z: 2.2 },
      { x: -2.2, z: 2.2 },
      { x: 2.2, z: -2.2 },
      { x: -2.2, z: -2.2 },
      { x: 4.4, z: 0 },
      { x: -4.4, z: 0 },
      { x: 0, z: 4.4 },
      { x: 0, z: -4.4 },
    ];

    for (const offset of offsets) {
      const candidate = { x: preferred.x + offset.x, y: preferred.y, z: preferred.z + offset.z };
      if ([...this.avatars.values()].every((avatar) => distance2D(candidate, avatar.position) >= 1.8)) {
        return candidate;
      }
    }

    const count = this.avatars.size;
    return {
      x: preferred.x + Math.cos(count * 1.7) * 2.2,
      y: preferred.y,
      z: preferred.z + Math.sin(count * 1.7) * 2.2,
    };
  }

  assignAiBrain(avatarId: string, options: { provider?: string; model?: string } = {}): BrainState | undefined {
    const avatar = this.avatars.get(avatarId);
    if (!avatar || avatar.shutdown) {
      return undefined;
    }

    if (avatar.brainId) {
      this.brains.delete(avatar.brainId);
    }

    const brain = this.createBrain(avatar.id, {
      provider: options.provider ?? 'openai-compatible',
      model: options.model ?? 'local-model',
    });

    avatar.control = 'ai';
    avatar.inhabitedByAi = true;
    avatar.brainId = brain.id;
    avatar.currentGoal = 'Operate as an AI-occupied avatar, stay powered, and choose validated actions.';
    avatar.recentDecision = 'AI brain assigned.';
    avatar.intendedNextStep = 'Observe the world and choose a validated action.';
    this.lastMessage = `${avatar.name} is now AI occupied.`;
    return brain;
  }

  disconnectAiBrain(avatarId: string): AvatarState | undefined {
    const avatar = this.avatars.get(avatarId);
    if (!avatar || avatar.control !== 'ai') {
      return undefined;
    }

    if (avatar.brainId) {
      this.brains.delete(avatar.brainId);
    }

    avatar.control = 'manual';
    avatar.inhabitedByAi = false;
    avatar.brainId = undefined;
    avatar.currentGoal = 'Await manual control or a future AI brain assignment.';
    avatar.recentDecision = 'AI brain disconnected.';
    avatar.intendedNextStep = 'Select Control from the Avatar Manager or quick switcher.';
    this.lastMessage = `${avatar.name} is now an empty manual avatar.`;
    return avatar;
  }

  deleteAvatar(avatarId: string): AvatarState | undefined {
    const avatar = this.avatars.get(avatarId);
    if (!avatar) {
      return undefined;
    }

    if (avatar.brainId) {
      this.brains.delete(avatar.brainId);
    }

    this.avatars.delete(avatarId);

    if (this.selectedAvatarId === avatarId) {
      this.selectedAvatarId = [...this.avatars.values()].find((entry) => entry.control === 'manual' && !entry.shutdown)?.id ?? this.avatars.keys().next().value;
    }

    this.chunkManager.updateForAvatarPositions([...this.avatars.values()].map((entry) => entry.position));
    this.lastMessage = `Deleted avatar: ${avatar.name}.`;
    return avatar;
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.tick += 1;
    this.recomputeTeslaInterference();
    this.expireAvatarInteractionEffects();

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

  recordHandshake(sourceAvatarId: string, targetAvatarId: string): void {
    const id = createId('handshake');
    this.avatarInteractionEffects.set(id, {
      id,
      type: 'handshake',
      sourceAvatarId,
      targetAvatarId,
      startedAt: this.elapsed,
      duration: 1.25,
    });
  }

  activeAvatarInteractionEffects(): AvatarInteractionEffect[] {
    this.expireAvatarInteractionEffects();
    return [...this.avatarInteractionEffects.values()];
  }

  private expireAvatarInteractionEffects(): void {
    for (const [id, effect] of this.avatarInteractionEffects) {
      if (this.elapsed - effect.startedAt > effect.duration) {
        this.avatarInteractionEffects.delete(id);
      }
    }
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
    this.persistWorldEdits();
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
    this.persistWorldEdits();
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
    this.persistWorldEdits();
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

    this.persistWorldEdits();
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
    this.persistWorldEdits();
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

    if (candidate.shape === 'tile' && candidate.targetKind !== 'floor') {
      return { valid: false, reason: 'Tile places only on the grid floor.' };
    }

    if (!definition.canAttachToSide && Math.abs(candidate.surfaceNormal.y) < 0.8) {
      return { valid: false, reason: `${definition.label} cannot attach sideways.` };
    }

    if (distance2D(avatar.position, candidate.position) > WORLD_RULES.buildReach) {
      return { valid: false, reason: 'Too far from avatar.' };
    }

    if (this.getBoundsForCandidate(candidate).max.y > WORLD_RULES.maxBuildHeight) {
      return { valid: false, reason: `Build height limit is ${WORLD_RULES.maxBuildHeight} grid units.` };
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

  private restoreSnapshot(snapshot: WorldSnapshot): void {
    if (!snapshot || snapshot.version !== 1) {
      return;
    }

    this.avatars.clear();
    this.brains.clear();
    this.blocks.clear();
    this.teslaNodes.clear();
    this.createStartingTeslaNode();

    this.elapsed = Number.isFinite(snapshot.elapsed) ? Math.max(0, snapshot.elapsed) : 0;
    this.tick = Number.isFinite(snapshot.tick) ? Math.max(0, Math.floor(snapshot.tick)) : 0;
    this.lastMessage = typeof snapshot.lastMessage === 'string' ? snapshot.lastMessage : this.lastMessage;

    for (const block of snapshot.blocks ?? []) {
      const restored = this.restoreBlock(block);
      if (restored) {
        this.blocks.set(restored.id, restored);
        this.chunkManager.markModifiedAt(restored.position);
      }
    }

    for (const node of snapshot.teslaNodes ?? []) {
      const restored = node.starting ? this.restoreStartingTeslaNode(node) : this.restoreTeslaNode(node);
      if (restored) {
        this.teslaNodes.set(restored.id, restored);
        this.chunkManager.markModifiedAt(restored.position);
      }
    }

    if (!this.teslaNodes.has('tesla_starting_node')) {
      this.createStartingTeslaNode();
    }

    for (const brain of snapshot.brains ?? []) {
      const restored = this.restoreBrain(brain);
      if (restored) {
        this.brains.set(restored.id, restored);
      }
    }

    for (const avatar of snapshot.avatars ?? []) {
      const restored = this.restoreAvatar(avatar);
      if (restored) {
        this.avatars.set(restored.id, restored);
      }
    }

    this.selectedAvatarId = snapshot.selectedAvatarId && this.avatars.has(snapshot.selectedAvatarId)
      ? snapshot.selectedAvatarId
      : [...this.avatars.keys()][0];
    this.chunkManager.updateForAvatarPositions([...this.avatars.values()].map((entry) => entry.position));
  }

  private loadPersistedWorldEdits(): void {
    const storage = browserStorage();
    if (!storage) {
      return;
    }

    const raw = storage.getItem(WORLD_EDITS_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const saved = JSON.parse(raw) as Partial<PersistedWorldEdits>;
      if (saved.version !== PERSISTENCE_VERSION) {
        storage.removeItem(WORLD_EDITS_STORAGE_KEY);
        return;
      }

      for (const block of saved.blocks ?? []) {
        const restored = this.restoreBlock(block);
        if (restored) {
          this.blocks.set(restored.id, restored);
          this.chunkManager.markModifiedAt(restored.position);
        }
      }

      for (const node of saved.teslaNodes ?? []) {
        const restored = this.restoreTeslaNode(node);
        if (restored) {
          this.teslaNodes.set(restored.id, restored);
          this.chunkManager.markModifiedAt(restored.position);
        }
      }
    } catch {
      storage.removeItem(WORLD_EDITS_STORAGE_KEY);
    }
  }

  private persistWorldEdits(): void {
    const storage = browserStorage();
    if (!storage) {
      return;
    }

    const payload: PersistedWorldEdits = {
      version: PERSISTENCE_VERSION,
      blocks: [...this.blocks.values()],
      teslaNodes: [...this.teslaNodes.values()].filter((node) => !node.starting),
    };

    try {
      storage.setItem(WORLD_EDITS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      this.lastMessage = 'World edit save failed in browser storage.';
    }
  }

  private restoreBlock(value: unknown): BlockInstance | undefined {
    const block = value as Partial<BlockInstance>;
    const shape = block.shape as BlockShape | undefined;
    const rotation = block.rotation;
    const validRotation = rotation === 0 || rotation === 90 || rotation === 180 || rotation === 270;

    if (
      !block ||
      typeof block.id !== 'string' ||
      !shape ||
      shape === 'tesla_node' ||
      !(shape in BLOCK_DEFINITIONS) ||
      !isVec3(block.position) ||
      !validRotation ||
      typeof block.color !== 'string' ||
      typeof block.ownerId !== 'string'
    ) {
      return undefined;
    }

    return {
      id: block.id,
      shape: shape as Exclude<BlockShape, 'tesla_node'>,
      position: cloneVec3(block.position),
      rotation,
      color: block.color,
      ownerId: block.ownerId,
    };
  }

  private restoreTeslaNode(value: unknown): TeslaNodeState | undefined {
    const node = value as Partial<TeslaNodeState>;
    if (!node || typeof node.id !== 'string' || !isVec3(node.position) || typeof node.ownerId !== 'string') {
      return undefined;
    }

    const targetEnergy = Number.isFinite(node.targetEnergy) ? Number(node.targetEnergy) : WORLD_RULES.teslaNodeTargetEnergy;
    const contribution = clamp(Number(node.contribution) || 0, 0, targetEnergy);

    return {
      id: node.id,
      position: cloneVec3(node.position),
      ownerId: node.ownerId,
      starting: false,
      active: Boolean(node.active),
      contribution,
      targetEnergy,
      radius: Number.isFinite(node.radius) ? Number(node.radius) : WORLD_RULES.teslaRadius,
      height: Number.isFinite(node.height) ? Number(node.height) : 2,
      interference: Boolean(node.interference),
    };
  }

  private restoreStartingTeslaNode(value: unknown): TeslaNodeState | undefined {
    const restored = this.restoreTeslaNode({ ...(value as object), starting: false });
    if (!restored) {
      return undefined;
    }

    return {
      ...restored,
      id: restored.id || 'tesla_starting_node',
      ownerId: 'world',
      starting: true,
      active: true,
      contribution: WORLD_RULES.teslaNodeTargetEnergy,
      targetEnergy: WORLD_RULES.teslaNodeTargetEnergy,
      radius: WORLD_RULES.teslaRadius,
      height: Number.isFinite((value as Partial<TeslaNodeState>).height)
        ? Number((value as Partial<TeslaNodeState>).height)
        : 3,
    };
  }

  private restoreBrain(value: unknown): BrainState | undefined {
    const brain = value as Partial<BrainState>;
    if (!brain || typeof brain.id !== 'string' || typeof brain.avatarId !== 'string') {
      return undefined;
    }

    return {
      id: brain.id,
      avatarId: brain.avatarId,
      provider: typeof brain.provider === 'string' ? brain.provider : 'openai-compatible',
      model: typeof brain.model === 'string' ? brain.model : 'local-model',
    };
  }

  private restoreAvatar(value: unknown): AvatarState | undefined {
    const avatar = value as Partial<AvatarState>;
    if (!avatar || typeof avatar.id !== 'string' || typeof avatar.name !== 'string' || !isVec3(avatar.position)) {
      return undefined;
    }

    const control: AgentControl = avatar.control === 'ai' ? 'ai' : 'manual';
    const attentionTarget = avatar.attentionTarget
      ? {
          type: avatar.attentionTarget.type,
          id: avatar.attentionTarget.id,
          position: avatar.attentionTarget.position && isVec3(avatar.attentionTarget.position)
            ? cloneVec3(avatar.attentionTarget.position)
            : undefined,
        }
      : undefined;

    return {
      id: avatar.id,
      memoryId: typeof avatar.memoryId === 'string' ? avatar.memoryId : undefined,
      name: avatar.name,
      control,
      inhabitedByAi: Boolean(avatar.inhabitedByAi),
      brainId: typeof avatar.brainId === 'string' ? avatar.brainId : undefined,
      color: typeof avatar.color === 'string' ? avatar.color : '#44f2ff',
      eyeStyle: 'normal',
      position: cloneVec3(avatar.position),
      yaw: Number.isFinite(avatar.yaw) ? Number(avatar.yaw) : Math.PI,
      pitch: Number.isFinite(avatar.pitch) ? Number(avatar.pitch) : 0,
      energy: Number.isFinite(avatar.energy) ? clamp(Number(avatar.energy), 0, WORLD_RULES.maxEnergy) : WORLD_RULES.maxEnergy,
      shutdown: Boolean(avatar.shutdown),
      isMoving: false,
      grounded: avatar.grounded !== false,
      firstCreatedAt: typeof avatar.firstCreatedAt === 'string' ? avatar.firstCreatedAt : new Date().toISOString(),
      createdAtWorldTime: Number.isFinite(avatar.createdAtWorldTime) ? Number(avatar.createdAtWorldTime) : this.elapsed,
      createdAtTick: Number.isFinite(avatar.createdAtTick) ? Number(avatar.createdAtTick) : this.tick,
      currentGoal: typeof avatar.currentGoal === 'string' ? avatar.currentGoal : 'Observe the grid and stay powered.',
      recentDecision: typeof avatar.recentDecision === 'string' ? avatar.recentDecision : 'Restored from persistent world memory.',
      intendedNextStep: typeof avatar.intendedNextStep === 'string' ? avatar.intendedNextStep : 'Observe the current world state.',
      recentFailure: typeof avatar.recentFailure === 'string' ? avatar.recentFailure : undefined,
      attentionTarget,
    };
  }

  private createBrain(
    avatarId: string,
    options: { provider: string; model: string },
  ): BrainState {
    const brain: BrainState = {
      id: createId('brain'),
      avatarId,
      provider: options.provider,
      model: options.model,
    };

    this.brains.set(brain.id, brain);
    return brain;
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
