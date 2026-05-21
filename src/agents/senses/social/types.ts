import { Vec3 } from '../../../world/types';

export type SocialDirection = 'ahead' | 'left' | 'right' | 'behind';
export type SocialAvatarState = 'online' | 'shutdown';
export type SocialRelation = 'self' | 'nearby_avatar' | 'needs_energy' | 'reachable_for_interaction' | 'distant_avatar';

export type SocialAvatar = {
  id: string;
  name: string;
  state: SocialAvatarState;
  control: 'manual' | 'ai';
  inhabitedByAi: boolean;
  position: Vec3;
  distance: number;
  direction: SocialDirection;
  reachableForHandshake: boolean;
  reachableForEnergyTransfer: boolean;
  needsEnergy: boolean;
  recentState: string;
  relation: SocialRelation;
};

export type SocialOptions = {
  range: number;
  maxAvatars: number;
};

export const DEFAULT_SOCIAL_OPTIONS: SocialOptions = {
  range: 18,
  maxAvatars: 10,
};

export type SocialSnapshot = {
  avatarId: string;
  nearbyAvatars: SocialAvatar[];
  reachableAvatars: SocialAvatar[];
  shutdownAvatars: SocialAvatar[];
  avatarsNeedingEnergy: SocialAvatar[];
  recentInteractionTarget?: SocialAvatar;
  summary: string;
};
