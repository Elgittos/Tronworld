import { Vec3 } from '../../../world/types';

export type EnergyLevelState = 'full' | 'stable' | 'low' | 'critical' | 'empty';
export type EnergyFieldState = 'recharge' | 'interference' | 'inactive' | 'unfinished';
export type EnergySafetyState = 'shutdown' | 'recharging' | 'stable' | 'slowly_draining' | 'needs_recharge' | 'urgent_recharge' | 'interference_danger';
export type EnergySourceDirection = 'ahead' | 'left' | 'right' | 'behind';

export type NearbyEnergySource = {
  id: string;
  label: string;
  position: Vec3;
  distance: number;
  direction: EnergySourceDirection;
  active: boolean;
  starting: boolean;
  interference: boolean;
  fieldState: EnergyFieldState;
  radius: number;
  insideField: boolean;
  fieldRateAtAvatar: number;
  contribution: number;
  targetEnergy: number;
  progressDescription: string;
};

export type EnergyDrainAssessment = {
  bodyDrainRate: number;
  fieldDrainRate: number;
  currentDrainRate: number;
  currentRechargeRate: number;
  netEnergyRate: number;
  description: string;
};

export type EnergyTimeEstimate = {
  secondsUntilEmpty?: number;
  secondsUntilFull?: number;
  description: string;
};

export type EnergySnapshot = {
  avatarId: string;
  currentEnergy: number;
  maxEnergy: number;
  energyState: EnergyLevelState;
  energyDescription: string;
  drain: EnergyDrainAssessment;
  nearbyEnergySources: NearbyEnergySource[];
  bestReachableEnergySource?: NearbyEnergySource;
  insideRechargeField: boolean;
  insideInterferenceField: boolean;
  timeEstimate: EnergyTimeEstimate;
  safetyState: EnergySafetyState;
  safetyDescription: string;
  summary: string;
};

export type EnergySenseOptions = {
  sourceRange: number;
  maxSources: number;
};

export const DEFAULT_ENERGY_SENSE_OPTIONS: EnergySenseOptions = {
  sourceRange: 18,
  maxSources: 8,
};
