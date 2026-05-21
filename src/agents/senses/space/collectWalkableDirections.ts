import { DirectionClearance, SpatialAwarenessOptions, SpatialDirection, SpatialObstacle } from './types';

const DIRECTIONS: SpatialDirection[] = ['forward', 'backward', 'left', 'right'];

export function collectWalkableDirections(
  obstacles: SpatialObstacle[],
  options: SpatialAwarenessOptions,
): Record<SpatialDirection, DirectionClearance> {
  return Object.fromEntries(
    DIRECTIONS.map((direction) => {
      const nearest = nearestObstacleInDirection(obstacles, direction, options.bodyRadius);
      const clearDistance = nearest?.edgeDistance ?? options.movementProbeDistance;
      const state = !nearest || clearDistance > options.closeObstacleDistance
        ? 'clear'
        : clearDistance <= options.blockedDistance
          ? 'blocked'
          : 'close_obstacle';

      return [direction, {
        direction,
        state,
        nearestObstacle: nearest,
        clearDistance,
      }];
    }),
  ) as Record<SpatialDirection, DirectionClearance>;
}

function nearestObstacleInDirection(
  obstacles: SpatialObstacle[],
  direction: SpatialDirection,
  bodyRadius: number,
): SpatialObstacle | undefined {
  return obstacles
    .filter((obstacle) => obstacle.blocksWalking)
    .filter((obstacle) => obstacle.direction === direction)
    .filter((obstacle) => Math.abs(obstacle.sideOffset) <= bodyRadius + 0.45)
    .filter((obstacle) => obstacle.forwardDistance >= -0.05)
    .sort((a, b) => a.edgeDistance - b.edgeDistance)[0];
}
