import { Vec3 } from '../../../world/types';
import { VisionDirection } from './types';

const TWO_PI = Math.PI * 2;

export function angleFromFacing(origin: Vec3, yaw: number, target: Vec3): number {
  const targetYaw = Math.atan2(target.x - origin.x, target.z - origin.z);
  return normalizeAngle(targetYaw - yaw);
}

export function classifyDirection(angle: number): VisionDirection {
  const abs = Math.abs(angle);

  if (abs <= Math.PI / 4) {
    return 'ahead';
  }

  if (abs >= (Math.PI * 3) / 4) {
    return 'behind';
  }

  // Tron World's avatar yaw convention treats positive yaw as turning left.
  return angle > 0 ? 'left' : 'right';
}

export function isInsideFieldOfView(angle: number, fieldOfViewDegrees: number): boolean {
  if (fieldOfViewDegrees >= 360) {
    return true;
  }

  return Math.abs(angle) <= (fieldOfViewDegrees * Math.PI) / 360;
}

function normalizeAngle(angle: number): number {
  let normalized = angle;

  while (normalized <= -Math.PI) {
    normalized += TWO_PI;
  }

  while (normalized > Math.PI) {
    normalized -= TWO_PI;
  }

  return normalized;
}
