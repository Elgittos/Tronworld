import { BLOCK_DEFINITIONS, distance2D } from '../../../world/types';
import { WorldState } from '../../../world/worldState';
import { angleFromFacing, classifyDirection } from '../vision/classifyDirection';
import { BodyContact, DEFAULT_TOUCH_OPTIONS, TouchOptions, TouchSnapshot } from './types';

export function buildTouchSnapshot(
  world: WorldState,
  avatarId: string,
  options: Partial<TouchOptions> = {},
): TouchSnapshot | undefined {
  const avatar = world.avatars.get(avatarId);
  if (!avatar) {
    return undefined;
  }

  const resolvedOptions = { ...DEFAULT_TOUCH_OPTIONS, ...options };
  const bodyContactState = avatar.shutdown ? 'shutdown' : avatar.grounded ? 'grounded' : 'airborne';
  const standingOn = avatar.grounded ? findStandingSurface(world, avatar.id, resolvedOptions) : undefined;
  const contacts = collectBodyContacts(world, avatar.id, resolvedOptions, standingOn);
  const blockedContacts = contacts.filter((contact) => contact.kind !== 'floor');

  return {
    avatarId: avatar.id,
    bodyContactState,
    standingOn,
    contacts,
    blockedContacts,
    recentlyLanded: avatar.grounded && avatar.position.y <= 0.03,
    summary: summarizeTouch(bodyContactState, standingOn, blockedContacts),
  };
}

function findStandingSurface(world: WorldState, avatarId: string, options: TouchOptions): BodyContact | undefined {
  const avatar = world.avatars.get(avatarId);
  if (!avatar) {
    return undefined;
  }

  const block = [...world.blocks.values()]
    .map((candidate) => {
      const bounds = world.getBoundsForBlock(candidate);
      const horizontalInside =
        avatar.position.x >= bounds.min.x - options.bodyRadius &&
        avatar.position.x <= bounds.max.x + options.bodyRadius &&
        avatar.position.z >= bounds.min.z - options.bodyRadius &&
        avatar.position.z <= bounds.max.z + options.bodyRadius;
      const verticalGap = Math.abs(avatar.position.y - bounds.max.y);
      return { block: candidate, verticalGap, horizontalInside };
    })
    .filter((entry) => entry.horizontalInside && entry.verticalGap <= 0.08)
    .sort((a, b) => a.verticalGap - b.verticalGap)[0]?.block;

  if (block) {
    return {
      kind: 'block',
      id: block.id,
      label: `${blockShapeName(block.shape)} under body`,
      direction: 'below',
      position: block.position,
      distance: 0,
      shape: block.shape,
    };
  }

  return {
    kind: 'floor',
    id: 'grid_floor',
    label: 'grid floor',
    direction: 'below',
    position: { x: avatar.position.x, y: 0, z: avatar.position.z },
    distance: Math.max(0, avatar.position.y),
  };
}

function collectBodyContacts(
  world: WorldState,
  avatarId: string,
  options: TouchOptions,
  standingOn?: BodyContact,
): BodyContact[] {
  const avatar = world.avatars.get(avatarId);
  if (!avatar) {
    return [];
  }

  const contacts: BodyContact[] = standingOn ? [standingOn] : [];

  for (const block of world.blocks.values()) {
    if (standingOn?.kind === 'block' && standingOn.id === block.id) {
      continue;
    }

    const bounds = world.getBoundsForBlock(block);
    const clampedX = clamp(avatar.position.x, bounds.min.x, bounds.max.x);
    const clampedZ = clamp(avatar.position.z, bounds.min.z, bounds.max.z);
    const clampedY = clamp(avatar.position.y + 0.85, bounds.min.y, bounds.max.y);
    const distance = Math.hypot(avatar.position.x - clampedX, avatar.position.z - clampedZ, avatar.position.y + 0.85 - clampedY);

    if (distance <= options.contactRange + options.bodyRadius) {
      contacts.push({
        kind: 'block',
        id: block.id,
        label: blockShapeName(block.shape),
        direction: directionFromAngle(angleFromFacing(avatar.position, avatar.yaw, block.position)),
        position: block.position,
        distance,
        shape: block.shape,
      });
    }
  }

  for (const node of world.teslaNodes.values()) {
    const distance = Math.max(0, distance2D(avatar.position, node.position) - 0.6);
    if (distance <= options.contactRange + options.bodyRadius) {
      contacts.push({
        kind: 'tesla_node',
        id: node.id,
        label: node.active ? 'active Tesla Node' : 'unfinished Tesla Node',
        direction: directionFromAngle(angleFromFacing(avatar.position, avatar.yaw, node.position)),
        position: node.position,
        distance,
      });
    }
  }

  for (const other of world.avatars.values()) {
    if (other.id === avatar.id) {
      continue;
    }

    const distance = Math.max(0, distance2D(avatar.position, other.position) - 0.5);
    if (distance <= options.contactRange + options.bodyRadius) {
      contacts.push({
        kind: 'avatar',
        id: other.id,
        label: other.name,
        direction: directionFromAngle(angleFromFacing(avatar.position, avatar.yaw, other.position)),
        position: other.position,
        distance,
      });
    }
  }

  return contacts.sort((a, b) => a.distance - b.distance);
}

function summarizeTouch(
  bodyContactState: TouchSnapshot['bodyContactState'],
  standingOn: BodyContact | undefined,
  blockedContacts: BodyContact[],
): string {
  const ground = standingOn ? `standing on ${standingOn.label}` : bodyContactState;
  const blocked = blockedContacts.length ? `touching ${blockedContacts[0].label} ${blockedContacts[0].direction}` : 'no nearby body contact';
  return `Touch: ${ground}; ${blocked}.`;
}

function directionFromAngle(angle: number): BodyContact['direction'] {
  const direction = classifyDirection(angle);
  if (direction === 'ahead' || direction === 'left' || direction === 'right' || direction === 'behind') {
    return direction;
  }
  return 'overlapping';
}

function blockShapeName(shape: Exclude<keyof typeof BLOCK_DEFINITIONS, 'tesla_node'>): string {
  switch (shape) {
    case 'cube':
      return 'cube';
    case 'half_cube':
      return 'half cube';
    case 'ramp':
      return 'ramp';
    case 'tile':
      return 'tile';
    case 'pillar':
      return 'pillar';
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
