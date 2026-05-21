import { distance2D, WORLD_RULES } from '../../../world/types';
import { WorldState } from '../../../world/worldState';
import { assessJumpClearance } from './assessJumpClearance';
import { assessMovementCapability } from './assessMovementCapability';
import { classifyLocalArea } from './classifyLocalArea';
import { collectNearbyObstacles } from './collectNearbyObstacles';
import { collectWalkableDirections } from './collectWalkableDirections';
import {
  DEFAULT_SPATIAL_AWARENESS_OPTIONS,
  SpatialAwarenessOptions,
  SpatialAwarenessSnapshot,
  SpatialDirection,
} from './types';

export function buildSpatialAwarenessSnapshot(
  world: WorldState,
  avatarId: string,
  options: Partial<SpatialAwarenessOptions> = {},
): SpatialAwarenessSnapshot | undefined {
  const avatar = world.avatars.get(avatarId);
  if (!avatar) {
    return undefined;
  }

  const resolvedOptions = { ...DEFAULT_SPATIAL_AWARENESS_OPTIONS, ...options };
  const nearbyObstacles = collectNearbyObstacles(world, avatar.id, resolvedOptions);
  const movementCapability = assessMovementCapability(avatar);
  const walkableDirections = collectWalkableDirections(nearbyObstacles, resolvedOptions);
  const jumpClearance = assessJumpClearance(movementCapability, walkableDirections, nearbyObstacles, resolvedOptions);
  const localAreaType = classifyLocalArea(walkableDirections);
  const nearestOpenDirections = (Object.keys(walkableDirections) as SpatialDirection[])
    .filter((direction) => walkableDirections[direction].state === 'clear');

  return {
    avatarId: avatar.id,
    localAreaType,
    movementCapability,
    walkableDirections,
    jumpClearance,
    nearbyObstacles,
    openFloor: {
      nearestOpenDirections,
      openDirectionCount: nearestOpenDirections.length,
    },
    reach: {
      blocksInBuildReach: [...world.blocks.values()].filter((block) => distance2D(avatar.position, block.position) <= WORLD_RULES.buildReach).length,
      avatarsInInteractionReach: [...world.avatars.values()].filter((other) => other.id !== avatar.id && distance2D(avatar.position, other.position) <= WORLD_RULES.interactReach).length,
      teslaNodesInReach: [...world.teslaNodes.values()].filter((node) => distance2D(avatar.position, node.position) <= WORLD_RULES.interactReach).length,
    },
    summary: summarizeSpatialAwareness(localAreaType, movementCapability.canJumpNow, nearestOpenDirections, nearbyObstacles[0]?.label),
  };
}

function summarizeSpatialAwareness(
  localAreaType: SpatialAwarenessSnapshot['localAreaType'],
  canJumpNow: boolean,
  openDirections: SpatialDirection[],
  nearestObstacleLabel?: string,
): string {
  const open = openDirections.length ? `open directions: ${openDirections.join(', ')}` : 'no clear walking direction';
  const jump = canJumpNow ? 'jump is available' : 'jump is not available';
  const obstacle = nearestObstacleLabel ? ` nearest obstacle: ${nearestObstacleLabel}.` : '';
  return `Spatial area is ${localAreaType}; ${open}; ${jump}.${obstacle}`;
}
