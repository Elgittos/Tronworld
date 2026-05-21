import { BlockShape, Vec3 } from '../../../world/types';

export type BodyContactState = 'grounded' | 'airborne' | 'shutdown';
export type ContactKind = 'floor' | 'block' | 'tesla_node' | 'avatar';
export type ContactDirection = 'below' | 'ahead' | 'left' | 'right' | 'behind' | 'overlapping';

export type BodyContact = {
  kind: ContactKind;
  id: string;
  label: string;
  direction: ContactDirection;
  position: Vec3;
  distance: number;
  shape?: Exclude<BlockShape, 'tesla_node'>;
};

export type TouchOptions = {
  bodyRadius: number;
  contactRange: number;
};

export const DEFAULT_TOUCH_OPTIONS: TouchOptions = {
  bodyRadius: 0.42,
  contactRange: 0.28,
};

export type TouchSnapshot = {
  avatarId: string;
  bodyContactState: BodyContactState;
  standingOn?: BodyContact;
  contacts: BodyContact[];
  blockedContacts: BodyContact[];
  recentlyLanded: boolean;
  summary: string;
};
