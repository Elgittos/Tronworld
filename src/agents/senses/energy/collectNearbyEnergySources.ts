import { distance2D, WORLD_RULES } from '../../../world/types';
import { WorldState } from '../../../world/worldState';
import { angleFromFacing, classifyDirection } from '../vision/classifyDirection';
import { EnergySenseOptions, EnergyFieldState, NearbyEnergySource } from './types';

export function collectNearbyEnergySources(
  world: WorldState,
  avatarId: string,
  options: EnergySenseOptions,
): NearbyEnergySource[] {
  const avatar = world.avatars.get(avatarId);
  if (!avatar) {
    return [];
  }

  return [...world.teslaNodes.values()]
    .map((node): NearbyEnergySource | undefined => {
      const distance = distance2D(avatar.position, node.position);
      if (distance > options.sourceRange) {
        return undefined;
      }

      const fieldState = energyFieldState(node.active, node.interference);
      const insideField = node.active && distance <= node.radius;
      const fieldRateAtAvatar = insideField
        ? node.interference
          ? -WORLD_RULES.interferenceDrainPerSecond
          : WORLD_RULES.rechargePerSecond
        : 0;
      const angle = angleFromFacing(avatar.position, avatar.yaw, node.position);

      return {
        id: node.id,
        label: nodeLabel(fieldState, node.starting),
        position: node.position,
        distance,
        direction: classifyDirection(angle),
        active: node.active,
        starting: node.starting,
        interference: node.interference,
        fieldState,
        radius: node.radius,
        insideField,
        fieldRateAtAvatar,
        contribution: node.contribution,
        targetEnergy: node.targetEnergy,
        progressDescription: progressDescription(node.contribution, node.targetEnergy, node.active),
      };
    })
    .filter((source): source is NearbyEnergySource => Boolean(source))
    .sort(compareEnergySources)
    .slice(0, options.maxSources);
}

export function chooseBestReachableEnergySource(sources: NearbyEnergySource[]): NearbyEnergySource | undefined {
  return (
    sources.find((source) => source.insideField && source.fieldState === 'recharge') ??
    sources.find((source) => source.active && source.fieldState === 'recharge') ??
    sources.find((source) => source.fieldState === 'unfinished') ??
    sources[0]
  );
}

function energyFieldState(active: boolean, interference: boolean): EnergyFieldState {
  if (!active) {
    return 'unfinished';
  }

  return interference ? 'interference' : 'recharge';
}

function nodeLabel(fieldState: EnergyFieldState, starting: boolean): string {
  const prefix = starting ? 'Starting Node' : 'Tesla Node';

  if (fieldState === 'recharge') {
    return `${prefix} recharge field`;
  }

  if (fieldState === 'interference') {
    return `${prefix} interference field`;
  }

  return `${prefix} unfinished`;
}

function progressDescription(contribution: number, targetEnergy: number, active: boolean): string {
  if (active) {
    return 'complete';
  }

  const remaining = Math.max(0, targetEnergy - contribution);
  return `${Math.floor(contribution)} out of ${targetEnergy} Energy contributed; needs ${Math.ceil(remaining)} more`;
}

function compareEnergySources(a: NearbyEnergySource, b: NearbyEnergySource): number {
  const rankA = sourceRank(a);
  const rankB = sourceRank(b);

  if (rankA !== rankB) {
    return rankA - rankB;
  }

  return a.distance - b.distance;
}

function sourceRank(source: NearbyEnergySource): number {
  if (source.insideField && source.fieldState === 'recharge') {
    return 0;
  }

  if (source.fieldState === 'recharge') {
    return 1;
  }

  if (source.fieldState === 'unfinished') {
    return 2;
  }

  return 3;
}
