import { WORLD_RULES } from '../../../world/types';
import { EnergyDrainAssessment, EnergyTimeEstimate } from './types';

export function estimateEnergyTime(
  currentEnergy: number,
  maxEnergy: number,
  drain: EnergyDrainAssessment,
): EnergyTimeEstimate {
  if (currentEnergy <= 0) {
    return {
      secondsUntilEmpty: 0,
      description: 'Energy is empty.',
    };
  }

  if (drain.netEnergyRate < 0) {
    const secondsUntilEmpty = currentEnergy / Math.abs(drain.netEnergyRate);
    return {
      secondsUntilEmpty,
      description: `At this rate, Energy will last about ${formatDuration(secondsUntilEmpty)}.`,
    };
  }

  if (drain.netEnergyRate > 0 && currentEnergy < maxEnergy) {
    const secondsUntilFull = (maxEnergy - currentEnergy) / drain.netEnergyRate;
    return {
      secondsUntilFull,
      description: `At this rate, Energy will be full in about ${formatDuration(secondsUntilFull)}.`,
    };
  }

  if (currentEnergy >= maxEnergy - 1) {
    return {
      description: 'Energy is full.',
    };
  }

  return {
    description: `Energy is stable for now. Idle drain is ${WORLD_RULES.idleDrainPerSecond.toFixed(2)} Energy per second when outside recharge.`,
  };
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));

  if (seconds < 60) {
    return plural(seconds, 'second');
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return remainingSeconds > 0 ? `${plural(minutes, 'minute')} and ${plural(remainingSeconds, 'second')}` : plural(minutes, 'minute');
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${plural(hours, 'hour')} and ${plural(remainingMinutes, 'minute')}` : plural(hours, 'hour');
}

function plural(value: number, label: string): string {
  return `${value} ${label}${value === 1 ? '' : 's'}`;
}
