import { distance2D } from '../../../world/types';
import { WorldState } from '../../../world/worldState';
import { angleFromFacing, classifyDirection, isInsideFieldOfView } from './classifyDirection';
import { hasLineOfSight } from './lineOfSight';
import { compareImportanceThenDistance, visualImportance } from './visualImportance';
import { VisibleAvatar, VisionOptions } from './types';

export function collectVisibleAvatars(world: WorldState, avatarId: string, options: VisionOptions): VisibleAvatar[] {
  const self = world.avatars.get(avatarId);
  if (!self) {
    return [];
  }

  return [...world.avatars.values()]
    .filter((avatar) => avatar.id !== self.id)
    .map((avatar): VisibleAvatar | undefined => {
      const distance = distance2D(self.position, avatar.position);
      if (distance > options.range) {
        return undefined;
      }

      const angle = angleFromFacing(self.position, self.yaw, avatar.position);
      if (!isInsideFieldOfView(angle, options.fieldOfViewDegrees)) {
        return undefined;
      }

      if (options.occlusionEnabled && !hasLineOfSight(world, self.position, avatar.position, { depthGrace: options.occlusionDepthGrace })) {
        return undefined;
      }

      const direction = classifyDirection(angle);
      const importance = visualImportance('avatar', distance, options.range, direction, [
        avatar.shutdown ? 0.24 : 0,
        avatar.control === 'ai' ? 0.04 : 0,
      ]);

      return {
        kind: 'avatar',
        id: avatar.id,
        label: avatar.shutdown ? `${avatar.name} shutdown` : avatar.name,
        name: avatar.name,
        position: avatar.position,
        distance,
        direction,
        angleFromFacing: angle,
        importance,
        energy: avatar.energy,
        shutdown: avatar.shutdown,
        control: avatar.control,
      };
    })
    .filter((avatar): avatar is VisibleAvatar => Boolean(avatar))
    .sort(compareImportanceThenDistance)
    .slice(0, options.maxItemsPerCategory);
}
