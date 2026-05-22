import { AvatarState, WORLD_RULES } from '../../../world/types';
import { EnergyDrainAssessment, EnergySafetyState, EnergyTimeEstimate } from './types';

export function assessEnergySafety(
  avatar: AvatarState,
  drain: EnergyDrainAssessment,
  timeEstimate: EnergyTimeEstimate,
): { safetyState: EnergySafetyState; safetyDescription: string } {
  if (avatar.shutdown || avatar.energy <= 0) {
    return {
      safetyState: 'shutdown',
      safetyDescription: 'Energy is empty and the body is shutdown.',
    };
  }

  if (drain.fieldDrainRate > 0) {
    return {
      safetyState: 'interference_danger',
      safetyDescription: 'A Tesla interference field is actively draining Energy.',
    };
  }

  if (avatar.energy >= WORLD_RULES.maxEnergy - 1) {
    return {
      safetyState: 'stable',
      safetyDescription: 'Energy is full; the body is safe for now.',
    };
  }

  if (drain.netEnergyRate > 0) {
    return {
      safetyState: 'recharging',
      safetyDescription: 'Energy is rising inside a recharge field.',
    };
  }

  if (avatar.energy <= 15 || (timeEstimate.secondsUntilEmpty !== undefined && timeEstimate.secondsUntilEmpty <= 30)) {
    return {
      safetyState: 'urgent_recharge',
      safetyDescription: 'Energy is near shutdown level. Recharge is urgent.',
    };
  }

  if (avatar.energy <= 35 || (timeEstimate.secondsUntilEmpty !== undefined && timeEstimate.secondsUntilEmpty <= 90)) {
    return {
      safetyState: 'needs_recharge',
      safetyDescription: 'Energy is low enough that recharge should be found soon.',
    };
  }

  if (drain.netEnergyRate < 0) {
    return {
      safetyState: 'slowly_draining',
      safetyDescription: 'Energy is draining, but not urgently.',
    };
  }

  return {
    safetyState: 'stable',
    safetyDescription: 'Energy is stable.',
  };
}
