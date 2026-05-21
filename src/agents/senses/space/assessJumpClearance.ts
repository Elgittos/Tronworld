import { DirectionClearance, JumpClearance, MovementCapability, SpatialAwarenessOptions, SpatialDirection, SpatialObstacle } from './types';

const DIRECTIONS: SpatialDirection[] = ['forward', 'backward', 'left', 'right'];

export function assessJumpClearance(
  movement: MovementCapability,
  walkableDirections: Record<SpatialDirection, DirectionClearance>,
  obstacles: SpatialObstacle[],
  options: SpatialAwarenessOptions,
): Record<SpatialDirection, JumpClearance> {
  return Object.fromEntries(
    DIRECTIONS.map((direction) => [direction, assessDirectionJump(direction, movement, walkableDirections[direction], obstacles, options)]),
  ) as Record<SpatialDirection, JumpClearance>;
}

function assessDirectionJump(
  direction: SpatialDirection,
  movement: MovementCapability,
  clearance: DirectionClearance,
  obstacles: SpatialObstacle[],
  options: SpatialAwarenessOptions,
): JumpClearance {
  if (!movement.canJumpNow) {
    return {
      direction,
      state: 'cannot_jump_now',
      reason: movement.jumpBlockedReason ?? 'jump unavailable',
    };
  }

  const obstacle = clearance.nearestObstacle;
  if (!obstacle || clearance.state === 'clear') {
    return {
      direction,
      state: 'not_needed',
      reason: 'path is clear enough that a jump is not needed',
    };
  }

  if (obstacle.edgeDistance > options.jumpClearanceDistance) {
    return {
      direction,
      state: 'not_needed',
      obstacle,
      reason: 'nearest obstacle is not close enough to require a jump',
    };
  }

  if (obstacle.kind !== 'block' || obstacle.height > options.oneJumpClearHeight) {
    return {
      direction,
      state: 'blocked',
      obstacle,
      reason: `${obstacle.label} blocks the jump path`,
    };
  }

  const landingBlocked = obstacles.some((candidate) =>
    candidate.id !== obstacle.id &&
    candidate.direction === direction &&
    candidate.blocksWalking &&
    candidate.forwardDistance > obstacle.forwardDistance &&
    candidate.forwardDistance < obstacle.forwardDistance + options.landingDistanceBeyondObstacle,
  );

  if (landingBlocked) {
    return {
      direction,
      state: 'blocked',
      obstacle,
      reason: 'landing space beyond the obstacle is blocked',
    };
  }

  return {
    direction,
    state: 'can_clear_one_cube',
    obstacle,
    reason: `one jump can clear the nearby ${obstacle.label}`,
  };
}
