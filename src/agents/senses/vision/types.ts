import { AgentControl, BlockShape, Vec3 } from '../../../world/types';

export type VisionDirection = 'ahead' | 'left' | 'right' | 'behind';
export type TeslaNodeFieldState = 'recharge' | 'interference' | 'inactive';
export type VisibleThingKind = 'avatar' | 'block' | 'tesla_node' | 'open_space';

export type VisionOptions = {
  range: number;
  fieldOfViewDegrees: number;
  maxItemsPerCategory: number;
  openSpaceStep: number;
  openSpaceDistance: number;
  occlusionEnabled: boolean;
  occlusionDepthGrace: number;
  distantStructureDistance: number;
  horizonStructureRange: number;
};

export const DEFAULT_VISION_OPTIONS: VisionOptions = {
  range: 16,
  fieldOfViewDegrees: 360,
  maxItemsPerCategory: 24,
  openSpaceStep: 2,
  openSpaceDistance: 8,
  occlusionEnabled: true,
  occlusionDepthGrace: 1.15,
  distantStructureDistance: 8,
  horizonStructureRange: 72,
};

export type VisibleBase = {
  kind: VisibleThingKind;
  id?: string;
  label: string;
  position: Vec3;
  distance: number;
  direction: VisionDirection;
  angleFromFacing: number;
  importance: number;
};

export type VisibleAvatar = VisibleBase & {
  kind: 'avatar';
  id: string;
  name: string;
  energy: number;
  shutdown: boolean;
  control: AgentControl;
};

export type VisibleBlock = VisibleBase & {
  kind: 'block';
  id: string;
  shape: Exclude<BlockShape, 'tesla_node'>;
  color: string;
  ownerId: string;
  centerPosition: Vec3;
  frontality: 'directly_in_front' | 'not_directly_in_front';
  forwardDistance: number;
  sideOffset: number;
};

export type VisibleTeslaNode = VisibleBase & {
  kind: 'tesla_node';
  id: string;
  active: boolean;
  interference: boolean;
  starting: boolean;
  contribution: number;
  targetEnergy: number;
  radius: number;
  fieldState: TeslaNodeFieldState;
};

export type VisibleOpenSpace = VisibleBase & {
  kind: 'open_space';
  reason: 'nearby_floor';
};

export type VisibleThing = VisibleAvatar | VisibleBlock | VisibleTeslaNode | VisibleOpenSpace;

export type VisibleEnvironment = {
  sky: 'black_open_sky';
  overhead: 'open';
  horizon: 'digital_grid_horizon';
  horizonVisible: boolean;
  forwardView: 'open' | 'partly_blocked' | 'blocked';
  gridExtent: 'nearby_open_grid' | 'wide_open_grid';
  distantStructures: {
    visible: boolean;
    blockCount: number;
    teslaNodeCount: number;
    directions: VisionDirection[];
    hasTeslaGlow: boolean;
    description: string;
  };
  summary: string;
};

export type VisionSnapshot = {
  avatarId: string;
  tick: number;
  range: number;
  fieldOfViewDegrees: number;
  avatars: VisibleAvatar[];
  blocks: VisibleBlock[];
  teslaNodes: VisibleTeslaNode[];
  openSpaces: VisibleOpenSpace[];
  environment: VisibleEnvironment;
  attentionCandidates: VisibleThing[];
  summary: string;
};
