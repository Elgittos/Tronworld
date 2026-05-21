import { WORLD_RULES } from '../../../world/types';
import { EnergyLevelState } from './types';

export function describeEnergyState(energy: number, maxEnergy = WORLD_RULES.maxEnergy): EnergyLevelState {
  if (energy <= 0) {
    return 'empty';
  }

  if (energy <= 15) {
    return 'critical';
  }

  if (energy <= 35) {
    return 'low';
  }

  if (energy >= maxEnergy - 1) {
    return 'full';
  }

  return 'stable';
}

export function describeEnergyLevel(energy: number, maxEnergy = WORLD_RULES.maxEnergy): string {
  const rounded = Math.round(energy);
  const state = describeEnergyState(energy, maxEnergy);

  if (state === 'empty') {
    return `Energy is empty at ${rounded} out of ${maxEnergy}.`;
  }

  if (state === 'critical') {
    return `Energy is critical at ${rounded} out of ${maxEnergy}.`;
  }

  if (state === 'low') {
    return `Energy is low at ${rounded} out of ${maxEnergy}.`;
  }

  if (state === 'full') {
    return `Energy is full at ${rounded} out of ${maxEnergy}.`;
  }

  return `Energy is stable at ${rounded} out of ${maxEnergy}.`;
}
