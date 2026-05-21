import { WORLD_RULES } from '../../../world/types';
import { WorldState } from '../../../world/worldState';
import { assessEnergyDrain } from './assessEnergyDrain';
import { assessEnergySafety } from './assessEnergySafety';
import { collectNearbyEnergySources, chooseBestReachableEnergySource } from './collectNearbyEnergySources';
import { describeEnergyLevel, describeEnergyState } from './describeEnergyState';
import { estimateEnergyTime } from './estimateEnergyTime';
import { DEFAULT_ENERGY_SENSE_OPTIONS, EnergySenseOptions, EnergySnapshot } from './types';

export function buildEnergySnapshot(
  world: WorldState,
  avatarId: string,
  options: Partial<EnergySenseOptions> = {},
): EnergySnapshot | undefined {
  const avatar = world.avatars.get(avatarId);
  if (!avatar) {
    return undefined;
  }

  const resolvedOptions = { ...DEFAULT_ENERGY_SENSE_OPTIONS, ...options };
  const nearbyEnergySources = collectNearbyEnergySources(world, avatar.id, resolvedOptions);
  const bestReachableEnergySource = chooseBestReachableEnergySource(nearbyEnergySources);
  const drain = assessEnergyDrain(world, avatar);
  const timeEstimate = estimateEnergyTime(avatar.energy, WORLD_RULES.maxEnergy, drain);
  const safety = assessEnergySafety(avatar, drain, timeEstimate);
  const energyState = describeEnergyState(avatar.energy, WORLD_RULES.maxEnergy);
  const insideRechargeField = nearbyEnergySources.some((source) => source.insideField && source.fieldState === 'recharge');
  const insideInterferenceField = nearbyEnergySources.some((source) => source.insideField && source.fieldState === 'interference');

  return {
    avatarId: avatar.id,
    currentEnergy: avatar.energy,
    maxEnergy: WORLD_RULES.maxEnergy,
    energyState,
    energyDescription: describeEnergyLevel(avatar.energy, WORLD_RULES.maxEnergy),
    drain,
    nearbyEnergySources,
    bestReachableEnergySource,
    insideRechargeField,
    insideInterferenceField,
    timeEstimate,
    safetyState: safety.safetyState,
    safetyDescription: safety.safetyDescription,
    summary: summarizeEnergy(avatar.energy, energyState, drain.netEnergyRate, safety.safetyDescription, bestReachableEnergySource?.label),
  };
}

function summarizeEnergy(
  energy: number,
  state: EnergySnapshot['energyState'],
  netEnergyRate: number,
  safetyDescription: string,
  bestSourceLabel?: string,
): string {
  const rate =
    netEnergyRate > 0
      ? `gaining ${netEnergyRate.toFixed(2)} Energy per second`
      : netEnergyRate < 0
        ? `losing ${Math.abs(netEnergyRate).toFixed(2)} Energy per second`
        : 'not changing';
  const source = bestSourceLabel ? ` Best nearby power source: ${bestSourceLabel}.` : ' No nearby Tesla Node detected.';

  return `Energy is ${state} at ${Math.round(energy)}; ${rate}. ${safetyDescription}.${source}`;
}
