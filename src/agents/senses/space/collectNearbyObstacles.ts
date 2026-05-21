import { BLOCK_DEFINITIONS, distance2D, Vec3 } from '../../../world/types';
import { WorldState } from '../../../world/worldState';
import { blockVisionGeometry } from '../vision/blockVisionGeometry';
import { buildDirectionVectors, projectIntoDirection, sideOffsetForDirection } from './directionVectors';
import { DirectionVectors, SpatialAwarenessOptions, SpatialDirection, SpatialObstacle } from './types';

export function collectNearbyObstacles(world: WorldState, avatarId: string, options: SpatialAwarenessOptions): SpatialObstacle[] {
  const avatar = world.avatars.get(avatarId);
  if (!avatar) {
    return [];
  }

  const vectors = buildDirectionVectors(avatar.yaw);
  const obstacles: SpatialObstacle[] = [];

  for (const block of world.blocks.values()) {
    const bounds = world.getBoundsForBlock(block);
    const geometry = blockVisionGeometry(avatar.position, avatar.yaw, bounds);
    if (geometry.edgeDistance > options.obstacleRange) {
      continue;
    }

    const direction = strongestDirection(avatar.position, geometry.visiblePoint, vectors);
    obstacles.push({
      kind: 'block',
      id: block.id,
      label: `${colorName(block.color)} ${blockShapeName(block.shape)}`,
      direction,
      visibleEdgePosition: geometry.visiblePoint,
      edgeDistance: geometry.edgeDistance,
      forwardDistance: projectIntoDirection(avatar.position, geometry.visiblePoint, vectors[direction]),
      sideOffset: sideOffsetForDirection(avatar.position, geometry.visiblePoint, direction, vectors),
      height: BLOCK_DEFINITIONS[block.shape].size.y,
      blocksWalking: BLOCK_DEFINITIONS[block.shape].size.y > 0.25,
      shape: block.shape,
      color: block.color,
    });
  }

  for (const node of world.teslaNodes.values()) {
    const edgeDistance = Math.max(0, distance2D(avatar.position, node.position) - 0.6);
    if (edgeDistance > options.obstacleRange) {
      continue;
    }

    const direction = strongestDirection(avatar.position, node.position, vectors);
    obstacles.push({
      kind: 'tesla_node',
      id: node.id,
      label: node.active ? 'active Tesla Node' : 'unfinished Tesla Node',
      direction,
      visibleEdgePosition: node.position,
      edgeDistance,
      forwardDistance: projectIntoDirection(avatar.position, node.position, vectors[direction]),
      sideOffset: sideOffsetForDirection(avatar.position, node.position, direction, vectors),
      height: node.height,
      blocksWalking: true,
    });
  }

  for (const other of world.avatars.values()) {
    if (other.id === avatar.id || other.shutdown) {
      continue;
    }

    const edgeDistance = Math.max(0, distance2D(avatar.position, other.position) - 0.5);
    if (edgeDistance > options.obstacleRange) {
      continue;
    }

    const direction = strongestDirection(avatar.position, other.position, vectors);
    obstacles.push({
      kind: 'avatar',
      id: other.id,
      label: other.name,
      direction,
      visibleEdgePosition: other.position,
      edgeDistance,
      forwardDistance: projectIntoDirection(avatar.position, other.position, vectors[direction]),
      sideOffset: sideOffsetForDirection(avatar.position, other.position, direction, vectors),
      height: 1.8,
      blocksWalking: true,
    });
  }

  return obstacles.sort((a, b) => a.edgeDistance - b.edgeDistance);
}

function strongestDirection(origin: Vec3, point: Vec3, vectors: DirectionVectors): SpatialDirection {
  const scores = (Object.keys(vectors) as SpatialDirection[]).map((direction) => ({
    direction,
    score: projectIntoDirection(origin, point, vectors[direction]),
  }));
  return scores.sort((a, b) => b.score - a.score)[0].direction;
}

function blockShapeName(shape: SpatialObstacle['shape']): string {
  switch (shape) {
    case 'cube':
      return 'cube';
    case 'half_cube':
      return 'half cube';
    case 'ramp':
      return 'ramp';
    case 'tile':
      return 'tile';
    case 'pillar':
      return 'pillar';
    default:
      return 'block';
  }
}

function colorName(color: string): string {
  switch (color.toLowerCase()) {
    case '#00ff88':
      return 'green';
    case '#44f2ff':
      return 'cyan';
    case '#2f7dff':
      return 'blue';
    case '#00d4c8':
      return 'teal';
    case '#9b7cff':
      return 'purple';
    case '#d34dff':
      return 'magenta';
    default:
      return color;
  }
}
