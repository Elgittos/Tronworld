import { AvatarState, WORLD_RULES } from '../../../world/types';
import { WorldState } from '../../../world/worldState';
import { AwarenessSnapshot, CompassDirection, EnergyState, LookPitchDescription } from './types';

export function buildAwarenessSnapshot(world: WorldState, avatarId: string): AwarenessSnapshot | undefined {
  const avatar = world.avatars.get(avatarId);
  if (!avatar) {
    return undefined;
  }

  const ageSeconds = Math.max(0, world.elapsed - avatar.createdAtWorldTime);
  const persistentAgeSeconds = avatar.firstCreatedAt ? Math.max(0, (Date.now() - Date.parse(avatar.firstCreatedAt)) / 1000) : undefined;
  const energyState = describeEnergy(avatar.energy);
  const facingDirection = describeFacingDirection(avatar.yaw);
  const lookPitch = describeLookPitch(avatar.pitch);

  return {
    avatarId: avatar.id,
    identity: {
      name: avatar.name,
      kind: 'digital being',
      body: 'grid body',
      color: colorName(avatar.color),
    },
    bodyState: {
      onlineState: avatar.shutdown ? 'shutdown' : 'online',
      position: avatar.position,
      facingDirection: {
        engineFacingRadians: avatar.yaw,
        compass: facingDirection,
        description: `facing ${facingDirection} across the grid`,
      },
      lookPitch: {
        enginePitch: avatar.pitch,
        description: lookPitch,
      },
      grounded: avatar.grounded,
      movement: avatar.isMoving ? 'moving' : 'still',
    },
    lifetime: {
      createdAtTick: avatar.createdAtTick,
      createdAtWorldTime: avatar.createdAtWorldTime,
      firstCreatedAt: avatar.firstCreatedAt,
      ageSeconds,
      ageDescription: formatAge(ageSeconds),
      sessionAgeDescription: formatAge(ageSeconds),
      persistentAgeDescription: persistentAgeSeconds === undefined ? undefined : formatAge(persistentAgeSeconds),
    },
    agencyLimits: {
      chatCanSpeak: true,
      chatCanAct: false,
      simulationControlActive: false,
      limitation: 'I can speak through chat, but this chat cannot move, build, transfer Energy, or control the world.',
    },
    vital: {
      energy: avatar.energy,
      maxEnergy: WORLD_RULES.maxEnergy,
      energyState,
    },
    intention: {
      currentGoal: avatar.currentGoal,
      recentDecision: avatar.recentDecision,
      intendedNextStep: avatar.intendedNextStep,
      recentFailure: avatar.recentFailure,
    },
    summary: buildSummary(avatar, ageSeconds, persistentAgeSeconds, energyState, facingDirection, lookPitch),
  };
}

function buildSummary(
  avatar: AvatarState,
  ageSeconds: number,
  persistentAgeSeconds: number | undefined,
  energyState: EnergyState,
  facingDirection: CompassDirection,
  lookPitch: LookPitchDescription,
): string {
  const online = avatar.shutdown ? 'shutdown' : 'online';
  const movement = avatar.isMoving ? 'moving' : 'standing still';
  const persistent = persistentAgeSeconds === undefined ? '' : ` My persistent memory record is ${formatAge(persistentAgeSeconds)} old.`;
  return `I am ${avatar.name}, a digital being embodied in a ${colorName(avatar.color)} grid body. I am ${online}, ${movement}, ${lookPitch}, facing ${facingDirection}, and this body session has been awake for ${formatAge(ageSeconds)}.${persistent} My Energy is ${energyState}.`;
}

function describeEnergy(energy: number): EnergyState {
  if (energy <= 0) {
    return 'empty';
  }
  if (energy <= 15) {
    return 'critical';
  }
  if (energy <= 35) {
    return 'low';
  }
  if (energy >= WORLD_RULES.maxEnergy - 1) {
    return 'full';
  }
  return 'stable';
}

function describeFacingDirection(facingRadians: number): CompassDirection {
  const normalized = normalizeAngle(facingRadians);
  const index = Math.round(normalized / (Math.PI / 4)) & 7;
  const directions: CompassDirection[] = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  return directions[index];
}

function describeLookPitch(pitch: number): LookPitchDescription {
  if (pitch >= 0.55) {
    return 'looking up';
  }
  if (pitch >= 0.18) {
    return 'looking slightly up';
  }
  if (pitch <= -0.55) {
    return 'looking down';
  }
  if (pitch <= -0.18) {
    return 'looking slightly down';
  }
  return 'looking level';
}

function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let normalized = angle % twoPi;
  if (normalized < 0) {
    normalized += twoPi;
  }
  return normalized;
}

function formatAge(totalSeconds: number): string {
  const seconds = Math.floor(totalSeconds);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  const parts = [
    days > 0 ? plural(days, 'day') : undefined,
    hours > 0 ? plural(hours, 'hour') : undefined,
    minutes > 0 ? plural(minutes, 'minute') : undefined,
    remainingSeconds > 0 || seconds === 0 ? plural(remainingSeconds, 'second') : undefined,
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 1) {
    return parts[0];
  }

  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function plural(value: number, label: string): string {
  return `${value} ${label}${value === 1 ? '' : 's'}`;
}

function colorName(color: string): string {
  switch (color.toLowerCase()) {
    case '#00ff88':
      return 'green';
    case '#44f2ff':
      return 'cyan';
    case '#2f7dff':
      return 'blue';
    case '#00d4c8':
      return 'teal';
    case '#9b7cff':
      return 'purple';
    case '#d34dff':
      return 'magenta';
    default:
      return 'custom colored';
  }
}
