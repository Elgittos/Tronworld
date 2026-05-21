import { BlockShape, Vec3 } from '../../../world/types';

export type SpatialDirection = 'forward' | 'backward' | 'left' | 'right';
export type DirectionClearanceState = 'clear' | 'close_obstacle' | 'blocked';
export type JumpClearanceState = 'not_needed' | 'can_clear_one_cube' | 'blocked' | 'cannot_jump_now';
export type GroundState = 'grounded' | 'airborne' | 'shutdown';
export type LocalAreaType = 'open_area' | 'corridor' | 'corner' | 'blocked_pocket' | 'near_wall';
export type ObstacleKind = 'block' | 'tesla_node' | 'avatar';

export type DirectionVectors = Record<SpatialDirection, Vec3>;

export type SpatialObstacle = {
  kind: ObstacleKind;
  id: string;
  label: string;
  direction: SpatialDirection;
  visibleEdgePosition: Vec3;
  edgeDistance: number;
  forwardDistance: number;
  sideOffset: number;
  height: number;
  blocksWalking: boolean;
  shape?: Exclude<BlockShape, 'tesla_node'>;
  color?: string;
};

export type DirectionClearance = {
  direction: SpatialDirection;
  state: DirectionClearanceState;
  nearestObstacle?: SpatialObstacle;
  clearDistance: number;
};

export type JumpClearance = {
  direction: SpatialDirection;
  state: JumpClearanceState;
  obstacle?: SpatialObstacle;
  reason: string;
};

export type MovementCapability = {
  canWalk: boolean;
  canJumpNow: boolean;
  groundState: GroundState;
  jumpBlockedReason?: string;
};

export type SpatialAwarenessOptions = {
  obstacleRange: number;
  movementProbeDistance: number;
  bodyRadius: number;
  closeObstacleDistance: number;
  blockedDistance: number;
  jumpClearanceDistance: number;
  oneJumpClearHeight: number;
  landingDistanceBeyondObstacle: number;
};

export const DEFAULT_SPATIAL_AWARENESS_OPTIONS: SpatialAwarenessOptions = {
  obstacleRange: 8,
  movementProbeDistance: 2.5,
  bodyRadius: 0.38,
  closeObstacleDistance: 1.4,
  blockedDistance: 0.55,
  jumpClearanceDistance: 1.6,
  oneJumpClearHeight: 1.05,
  landingDistanceBeyondObstacle: 0.85,
};

export type SpatialAwarenessSnapshot = {
  avatarId: string;
  localAreaType: LocalAreaType;
  movementCapability: MovementCapability;
  walkableDirections: Record<SpatialDirection, DirectionClearance>;
  jumpClearance: Record<SpatialDirection, JumpClearance>;
  nearbyObstacles: SpatialObstacle[];
  openFloor: {
    nearestOpenDirections: SpatialDirection[];
    openDirectionCount: number;
  };
  reach: {
    blocksInBuildReach: number;
    avatarsInInteractionReach: number;
    teslaNodesInReach: number;
  };
  summary: string;
};
