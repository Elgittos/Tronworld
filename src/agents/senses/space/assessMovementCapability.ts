import { AvatarState } from '../../../world/types';
import { MovementCapability } from './types';

export function assessMovementCapability(avatar: AvatarState): MovementCapability {
  if (avatar.shutdown) {
    return {
      canWalk: false,
      canJumpNow: false,
      groundState: 'shutdown',
      jumpBlockedReason: 'grid body is shutdown',
    };
  }

  if (!avatar.grounded) {
    return {
      canWalk: true,
      canJumpNow: false,
      groundState: 'airborne',
      jumpBlockedReason: 'grid body is airborne',
    };
  }

  return {
    canWalk: true,
    canJumpNow: true,
    groundState: 'grounded',
  };
}
