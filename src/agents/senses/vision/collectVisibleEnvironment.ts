import { WorldState } from '../../../world/worldState';
import { distance2D } from '../../../world/types';
import { angleFromFacing, classifyDirection, isInsideFieldOfView } from './classifyDirection';
import { blockVisionGeometry } from './blockVisionGeometry';
import { hasLineOfSight } from './lineOfSight';
import { VisibleBlock, VisibleEnvironment, VisibleOpenSpace, VisionDirection, VisionOptions } from './types';

export function collectVisibleEnvironment(
  world: WorldState,
  avatarId: string,
  blocks: VisibleBlock[],
  openSpaces: VisibleOpenSpace[],
  options: VisionOptions,
): VisibleEnvironment {
  const avatar = world.avatars.get(avatarId);
  const aheadBlocks = blocks.filter((block) => block.direction === 'ahead');
  const closeAheadBlocks = aheadBlocks.filter((block) => block.distance < 2.5);
  const aheadOpenSpaces = openSpaces.filter((space) => space.direction === 'ahead');
  const forwardView = closeAheadBlocks.length >= 3 ? 'blocked' : closeAheadBlocks.length > 0 ? 'partly_blocked' : 'open';
  const horizonVisible = forwardView !== 'blocked' || aheadOpenSpaces.some((space) => space.distance > options.openSpaceDistance * 0.55);
  const gridExtent = openSpaces.length > options.maxItemsPerCategory * 0.6 ? 'wide_open_grid' : 'nearby_open_grid';
  const distantStructures = avatar
    ? collectDistantStructures(world, avatar.id, options)
    : {
        visible: false,
        blockCount: 0,
        teslaNodeCount: 0,
        directions: [],
        hasTeslaGlow: false,
        description: 'no distant structures visible',
      };

  return {
    sky: 'black_open_sky',
    overhead: 'open',
    horizon: 'digital_grid_horizon',
    horizonVisible,
    forwardView,
    gridExtent,
    distantStructures,
    summary: environmentSummary(horizonVisible, forwardView, gridExtent, distantStructures.description),
  };
}

function collectDistantStructures(
  world: WorldState,
  avatarId: string,
  options: VisionOptions,
): VisibleEnvironment['distantStructures'] {
  const avatar = world.avatars.get(avatarId);
  if (!avatar) {
    return {
      visible: false,
      blockCount: 0,
      teslaNodeCount: 0,
      directions: [],
      hasTeslaGlow: false,
      description: 'no distant structures visible',
    };
  }

  const directions = new Set<VisionDirection>();
  let blockCount = 0;
  let teslaNodeCount = 0;
  let hasTeslaGlow = false;

  for (const block of world.blocks.values()) {
    const geometry = blockVisionGeometry(avatar.position, avatar.yaw, world.getBoundsForBlock(block));
    const distance = geometry.edgeDistance;
    if (distance < options.distantStructureDistance || distance > options.horizonStructureRange) {
      continue;
    }

    const angle = angleFromFacing(avatar.position, avatar.yaw, geometry.visiblePoint);
    if (!isInsideFieldOfView(angle, options.fieldOfViewDegrees)) {
      continue;
    }

    if (
      options.occlusionEnabled &&
      !hasLineOfSight(world, avatar.position, geometry.visiblePoint, {
        ignoreBlockId: block.id,
        depthGrace: options.occlusionDepthGrace + 1,
      })
    ) {
      continue;
    }

    blockCount += 1;
    directions.add(classifyDirection(angle));
  }

  for (const node of world.teslaNodes.values()) {
    const distance = distance2D(avatar.position, node.position);
    if (distance < options.distantStructureDistance || distance > options.horizonStructureRange) {
      continue;
    }

    const angle = angleFromFacing(avatar.position, avatar.yaw, node.position);
    if (!isInsideFieldOfView(angle, options.fieldOfViewDegrees)) {
      continue;
    }

    if (
      options.occlusionEnabled &&
      !hasLineOfSight(world, avatar.position, node.position, {
        ignoreTeslaNodeId: node.id,
        depthGrace: options.occlusionDepthGrace + 1,
      })
    ) {
      continue;
    }

    teslaNodeCount += 1;
    hasTeslaGlow = hasTeslaGlow || node.active;
    directions.add(classifyDirection(angle));
  }

  const directionList = [...directions];
  const visible = blockCount > 0 || teslaNodeCount > 0;

  return {
    visible,
    blockCount,
    teslaNodeCount,
    directions: directionList,
    hasTeslaGlow,
    description: distantStructureDescription(blockCount, teslaNodeCount, directionList, hasTeslaGlow),
  };
}

function distantStructureDescription(
  blockCount: number,
  teslaNodeCount: number,
  directions: VisionDirection[],
  hasTeslaGlow: boolean,
): string {
  if (blockCount === 0 && teslaNodeCount === 0) {
    return 'no distant structures visible';
  }

  const parts = [];
  if (blockCount > 0) {
    parts.push(`${blockCount} far block${blockCount === 1 ? '' : 's'}`);
  }
  if (teslaNodeCount > 0) {
    parts.push(`${teslaNodeCount} distant Tesla Node${teslaNodeCount === 1 ? '' : 's'}`);
  }

  const directionText = directions.length ? ` ${directions.join(', ')}` : '';
  const glowText = hasTeslaGlow ? ' with Tesla glow' : '';
  return `${parts.join(' and ')} visible on the horizon${directionText}${glowText}`;
}

function environmentSummary(
  horizonVisible: boolean,
  forwardView: VisibleEnvironment['forwardView'],
  gridExtent: VisibleEnvironment['gridExtent'],
  distantStructureDescription: string,
): string {
  const sky = 'black open sky above';
  const horizon = horizonVisible ? 'a distant glowing grid horizon' : 'the horizon mostly hidden by nearby structures';
  const grid = gridExtent === 'wide_open_grid' ? 'wide open grid space' : 'nearby open grid floor';
  const distant = distantStructureDescription === 'no distant structures visible' ? '' : `, ${distantStructureDescription}`;

  if (forwardView === 'blocked') {
    return `${sky}, ${horizon}${distant}, with the forward view blocked by nearby structures and ${grid} around the avatar`;
  }

  if (forwardView === 'partly_blocked') {
    return `${sky}, ${horizon}${distant}, with some nearby structures interrupting the forward view and ${grid} visible`;
  }

  return `${sky}, ${horizon}${distant}, and ${grid} visible ahead`;
}
