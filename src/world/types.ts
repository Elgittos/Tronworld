export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type BlockShape = 'cube' | 'half_cube' | 'ramp' | 'tile' | 'pillar' | 'tesla_node';
export type CameraMode = 'third_person' | 'avatar_pov' | 'free_camera';
export type AgentControl = 'manual' | 'ai';
export type BlockRotation = 0 | 90 | 180 | 270;
export type EyeStyle = 'normal';

export type ChunkKey = `${number}:${number}`;

export type AttentionTarget = {
  type: 'agent' | 'avatar' | 'block' | 'structure' | 'tesla_node' | 'position' | 'area';
  id?: string;
  position?: Vec3;
};

export type AvatarInteractionEffect = {
  id: string;
  type: 'handshake';
  sourceAvatarId: string;
  targetAvatarId: string;
  startedAt: number;
  duration: number;
};

export type Chunk = {
  key: ChunkKey;
  cx: number;
  cz: number;
  seed: number;
  loaded: boolean;
  visible: boolean;
  modified: boolean;
};

export type AvatarState = {
  id: string;
  memoryId?: string;
  name: string;
  control: AgentControl;
  inhabitedByAi: boolean;
  brainId?: string;
  color: string;
  eyeStyle: EyeStyle;
  position: Vec3;
  yaw: number;
  pitch: number;
  energy: number;
  shutdown: boolean;
  isMoving: boolean;
  grounded: boolean;
  firstCreatedAt?: string;
  createdAtWorldTime: number;
  createdAtTick: number;
  currentGoal: string;
  recentDecision: string;
  intendedNextStep: string;
  recentFailure?: string;
  attentionTarget?: AttentionTarget;
};

export type BrainState = {
  id: string;
  avatarId: string;
  provider: string;
  model: string;
};

export type BlockDefinition = {
  shape: BlockShape;
  label: string;
  energyCost: number;
  size: Vec3;
  canAttachToSide: boolean;
  requiresHorizontalSurface: boolean;
};

export type BlockInstance = {
  id: string;
  shape: Exclude<BlockShape, 'tesla_node'>;
  position: Vec3;
  rotation: BlockRotation;
  color: string;
  ownerId: string;
};

export type TeslaNodeState = {
  id: string;
  position: Vec3;
  ownerId: string;
  starting: boolean;
  active: boolean;
  contribution: number;
  targetEnergy: number;
  radius: number;
  height: number;
  interference: boolean;
};

export type PlacementTargetKind = 'floor' | 'block' | 'tesla_node';

export type PlacementCandidate = {
  shape: BlockShape;
  position: Vec3;
  rotation: BlockRotation;
  color: string;
  surfaceNormal: Vec3;
  targetKind: PlacementTargetKind;
  targetId?: string;
};

export type PlacementValidation = {
  valid: boolean;
  reason?: string;
};

export const BLOCK_DEFINITIONS: Record<BlockShape, BlockDefinition> = {
  cube: {
    shape: 'cube',
    label: 'Square',
    energyCost: 3,
    size: { x: 1, y: 1, z: 1 },
    canAttachToSide: true,
    requiresHorizontalSurface: false,
  },
  half_cube: {
    shape: 'half_cube',
    label: 'Half Cube',
    energyCost: 3,
    size: { x: 1, y: 0.5, z: 1 },
    canAttachToSide: true,
    requiresHorizontalSurface: false,
  },
  ramp: {
    shape: 'ramp',
    label: 'Ramp',
    energyCost: 3,
    size: { x: 1, y: 1, z: 1 },
    canAttachToSide: true,
    requiresHorizontalSurface: false,
  },
  tile: {
    shape: 'tile',
    label: 'Tile',
    energyCost: 3,
    size: { x: 1, y: 0.02, z: 1 },
    canAttachToSide: false,
    requiresHorizontalSurface: true,
  },
  pillar: {
    shape: 'pillar',
    label: 'Pillar',
    energyCost: 3,
    size: { x: 0.7, y: 1, z: 0.7 },
    canAttachToSide: false,
    requiresHorizontalSurface: true,
  },
  tesla_node: {
    shape: 'tesla_node',
    label: 'Tesla Node',
    energyCost: 0,
    size: { x: 1.25, y: 2, z: 1.25 },
    canAttachToSide: false,
    requiresHorizontalSurface: true,
  },
};

export const WORLD_RULES = {
  chunkSize: 16,
  visibleRadius: 2,
  loadedRadius: 3,
  preloadRadius: 4,
  maxEnergy: 100,
  idleDrainPerSecond: 0.05,
  movementDrainPerSecond: 0.3,
  normalBlockCost: 3,
  scanCost: 1,
  handshakeCost: 2,
  rechargePerSecond: 3,
  interferenceDrainPerSecond: 3,
  teslaNodeTargetEnergy: 180,
  minimumRevivalTransfer: 10,
  donorReserveEnergy: 10,
  avatarWalkSpeed: 3.2,
  avatarJumpVelocity: 5.8,
  buildReach: 8,
  maxBuildHeight: 10,
  interactReach: 4.5,
  teslaRadius: 5,
} as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function distance2D(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

export function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}
