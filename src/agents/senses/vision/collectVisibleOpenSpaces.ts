import { distance2D, Vec3 } from '../../../world/types';
import { WorldState } from '../../../world/worldState';
import { angleFromFacing, classifyDirection, isInsideFieldOfView } from './classifyDirection';
import { hasLineOfSight } from './lineOfSight';
import { compareImportanceThenDistance, visualImportance } from './visualImportance';
import { VisibleOpenSpace, VisionOptions } from './types';

export function collectVisibleOpenSpaces(world: WorldState, avatarId: string, options: VisionOptions): VisibleOpenSpace[] {
  const self = world.avatars.get(avatarId);
  if (!self) {
    return [];
  }

  const spaces: VisibleOpenSpace[] = [];
  const maxDistance = Math.min(options.range, options.openSpaceDistance);

  for (let z = -maxDistance; z <= maxDistance; z += options.openSpaceStep) {
    for (let x = -maxDistance; x <= maxDistance; x += options.openSpaceStep) {
      if (x === 0 && z === 0) {
        continue;
      }

      const position = {
        x: Math.floor(self.position.x + x) + 0.5,
        y: 0,
        z: Math.floor(self.position.z + z) + 0.5,
      };
      const distance = distance2D(self.position, position);
      if (distance > maxDistance || isOccupied(world, position)) {
        continue;
      }

      const angle = angleFromFacing(self.position, self.yaw, position);
      if (!isInsideFieldOfView(angle, options.fieldOfViewDegrees)) {
        continue;
      }

      if (options.occlusionEnabled && !hasLineOfSight(world, self.position, position, { depthGrace: options.occlusionDepthGrace })) {
        continue;
      }

      const direction = classifyDirection(angle);
      spaces.push({
        kind: 'open_space',
        label: 'Open floor',
        position,
        distance,
        direction,
        angleFromFacing: angle,
        importance: visualImportance('open_space', distance, options.range, direction),
        reason: 'nearby_floor',
      });
    }
  }

  return spaces.sort(compareImportanceThenDistance).slice(0, options.maxItemsPerCategory);
}

function isOccupied(world: WorldState, position: Vec3): boolean {
  for (const block of world.blocks.values()) {
    if (distance2D(block.position, position) <= 0.9) {
      return true;
    }
  }

  for (const node of world.teslaNodes.values()) {
    if (distance2D(node.position, position) <= 1.1) {
      return true;
    }
  }

  return false;
}
