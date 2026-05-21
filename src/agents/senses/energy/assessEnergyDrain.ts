import { AvatarState, WORLD_RULES } from '../../../world/types';
import { WorldState } from '../../../world/worldState';
import { EnergyDrainAssessment } from './types';

export function assessEnergyDrain(world: WorldState, avatar: AvatarState): EnergyDrainAssessment {
  const bodyDrainRate = avatar.shutdown ? 0 : avatar.isMoving ? WORLD_RULES.movementDrainPerSecond : WORLD_RULES.idleDrainPerSecond;
  const fieldRate = avatar.shutdown ? 0 : world.getTeslaFieldEffectAt(avatar.position);
  const currentRechargeRate = Math.max(0, fieldRate);
  const fieldDrainRate = Math.max(0, -fieldRate);
  const currentDrainRate = bodyDrainRate + fieldDrainRate;
  const netEnergyRate = currentRechargeRate - currentDrainRate;

  return {
    bodyDrainRate,
    fieldDrainRate,
    currentDrainRate,
    currentRechargeRate,
    netEnergyRate,
    description: describeDrain(bodyDrainRate, fieldDrainRate, currentRechargeRate, netEnergyRate),
  };
}

function describeDrain(bodyDrainRate: number, fieldDrainRate: number, rechargeRate: number, netEnergyRate: number): string {
  if (rechargeRate > 0 && netEnergyRate > 0) {
    return `Recharging at ${netEnergyRate.toFixed(2)} Energy per second after body drain.`;
  }

  if (fieldDrainRate > 0) {
    return `Interference is draining ${fieldDrainRate.toFixed(2)} Energy per second, plus ${bodyDrainRate.toFixed(2)} body drain.`;
  }

  if (netEnergyRate < 0) {
    return `Draining ${Math.abs(netEnergyRate).toFixed(2)} Energy per second.`;
  }

  return 'Energy is not changing right now.';
}
