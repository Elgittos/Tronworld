import { distance2D, WORLD_RULES } from '../../../world/types';
import { WorldState } from '../../../world/worldState';
import { angleFromFacing, classifyDirection } from '../vision/classifyDirection';
import { DEFAULT_SOCIAL_OPTIONS, SocialAvatar, SocialOptions, SocialSnapshot } from './types';

export function buildSocialSnapshot(
  world: WorldState,
  avatarId: string,
  options: Partial<SocialOptions> = {},
): SocialSnapshot | undefined {
  const self = world.avatars.get(avatarId);
  if (!self) {
    return undefined;
  }

  const resolvedOptions = { ...DEFAULT_SOCIAL_OPTIONS, ...options };
  const nearbyAvatars = [...world.avatars.values()]
    .filter((avatar) => avatar.id !== self.id)
    .map((avatar): SocialAvatar | undefined => {
      const distance = distance2D(self.position, avatar.position);
      if (distance > resolvedOptions.range) {
        return undefined;
      }

      const reachableForHandshake = !avatar.shutdown && distance <= WORLD_RULES.interactReach;
      const reachableForEnergyTransfer = distance <= WORLD_RULES.interactReach;
      const needsEnergy = avatar.shutdown || avatar.energy <= WORLD_RULES.minimumRevivalTransfer;
      const direction = classifyDirection(angleFromFacing(self.position, self.yaw, avatar.position));

      return {
        id: avatar.id,
        name: avatar.name,
        state: avatar.shutdown ? 'shutdown' : 'online',
        control: avatar.control,
        inhabitedByAi: avatar.inhabitedByAi,
        position: avatar.position,
        distance,
        direction,
        reachableForHandshake,
        reachableForEnergyTransfer,
        needsEnergy,
        recentState: avatar.recentDecision,
        relation: relationFor(distance, reachableForHandshake, reachableForEnergyTransfer, needsEnergy),
      };
    })
    .filter((avatar): avatar is SocialAvatar => Boolean(avatar))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, resolvedOptions.maxAvatars);

  const reachableAvatars = nearbyAvatars.filter((avatar) => avatar.reachableForHandshake || avatar.reachableForEnergyTransfer);
  const shutdownAvatars = nearbyAvatars.filter((avatar) => avatar.state === 'shutdown');
  const avatarsNeedingEnergy = nearbyAvatars.filter((avatar) => avatar.needsEnergy);
  const recentInteractionTarget = self.attentionTarget?.id
    ? nearbyAvatars.find((avatar) => avatar.id === self.attentionTarget?.id)
    : undefined;

  return {
    avatarId: self.id,
    nearbyAvatars,
    reachableAvatars,
    shutdownAvatars,
    avatarsNeedingEnergy,
    recentInteractionTarget,
    summary: summarizeSocial(nearbyAvatars, reachableAvatars, avatarsNeedingEnergy, recentInteractionTarget),
  };
}

function relationFor(
  distance: number,
  reachableForHandshake: boolean,
  reachableForEnergyTransfer: boolean,
  needsEnergy: boolean,
): SocialAvatar['relation'] {
  if (needsEnergy) {
    return 'needs_energy';
  }

  if (reachableForHandshake || reachableForEnergyTransfer) {
    return 'reachable_for_interaction';
  }

  return distance <= 8 ? 'nearby_avatar' : 'distant_avatar';
}

function summarizeSocial(
  nearbyAvatars: SocialAvatar[],
  reachableAvatars: SocialAvatar[],
  avatarsNeedingEnergy: SocialAvatar[],
  recentInteractionTarget?: SocialAvatar,
): string {
  if (nearbyAvatars.length === 0) {
    return 'No other avatars are nearby.';
  }

  const nearest = nearbyAvatars[0];
  const help = avatarsNeedingEnergy.length ? `${avatarsNeedingEnergy.length} avatar needs Energy. ` : '';
  const reachable = reachableAvatars.length ? `${reachableAvatars.length} avatar can be interacted with. ` : '';
  const recent = recentInteractionTarget ? `Recent social focus: ${recentInteractionTarget.name}. ` : '';

  return `${help}${reachable}${recent}Nearest avatar is ${nearest.name}, ${nearest.state}, ${nearest.direction} at ${nearest.distance.toFixed(1)} grid units.`;
}
