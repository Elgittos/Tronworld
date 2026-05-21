import { Vec3 } from '../../../world/types';
import { DirectionVectors, SpatialDirection } from './types';

export function buildDirectionVectors(facingRadians: number): DirectionVectors {
  const forward = normalize({ x: Math.sin(facingRadians), y: 0, z: Math.cos(facingRadians) });
  const left = normalize({ x: Math.cos(facingRadians), y: 0, z: -Math.sin(facingRadians) });

  return {
    forward,
    backward: scale(forward, -1),
    left,
    right: scale(left, -1),
  };
}

export function projectIntoDirection(origin: Vec3, point: Vec3, direction: Vec3): number {
  return (point.x - origin.x) * direction.x + (point.z - origin.z) * direction.z;
}

export function sideOffsetForDirection(origin: Vec3, point: Vec3, direction: SpatialDirection, vectors: DirectionVectors): number {
  const side = direction === 'left' || direction === 'right' ? vectors.forward : vectors.left;
  return (point.x - origin.x) * side.x + (point.z - origin.z) * side.z;
}

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector.x, vector.z) || 1;
  return { x: vector.x / length, y: 0, z: vector.z / length };
}

function scale(vector: Vec3, amount: number): Vec3 {
  return { x: vector.x * amount, y: 0, z: vector.z * amount };
}
