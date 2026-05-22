import { Vec3 } from '../../../world/types';

export type OnlineState = 'online' | 'shutdown';
export type EnergyState = 'full' | 'stable' | 'low' | 'critical' | 'empty';
export type CompassDirection = 'north' | 'northeast' | 'east' | 'southeast' | 'south' | 'southwest' | 'west' | 'northwest';
export type LookPitchDescription = 'looking level' | 'looking slightly up' | 'looking up' | 'looking slightly down' | 'looking down';
export type MovementState = 'moving' | 'still';

export type AwarenessSnapshot = {
  avatarId: string;
  identity: {
    name: string;
    kind: 'digital being';
    body: 'grid body';
    color: string;
  };
  bodyState: {
    onlineState: OnlineState;
    position: Vec3;
    facingDirection: {
      engineFacingRadians: number;
      compass: CompassDirection;
      description: string;
    };
    lookPitch: {
      enginePitch: number;
      description: LookPitchDescription;
    };
    grounded: boolean;
    movement: MovementState;
  };
  lifetime: {
    createdAtTick: number;
    createdAtWorldTime: number;
    firstCreatedAt?: string;
    ageSeconds: number;
    ageDescription: string;
    sessionAgeDescription: string;
    persistentAgeDescription?: string;
  };
  agencyLimits: {
    chatCanSpeak: true;
    chatCanAct: false;
    simulationControlActive: false;
    limitation: string;
  };
  vital: {
    energy: number;
    maxEnergy: number;
    energyState: EnergyState;
  };
  intention: {
    currentGoal: string;
    recentDecision: string;
    intendedNextStep: string;
    recentFailure?: string;
  };
  summary: string;
};
