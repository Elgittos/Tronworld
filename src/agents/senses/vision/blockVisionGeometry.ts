import { Vec3 } from '../../../world/types';
import { Bounds } from '../../../world/worldState';

export type BlockFacingFootprint = {
  forwardMin: number;
  forwardMax: number;
  sideMin: number;
  sideMax: number;
  sideCenter: number;
};

export type BlockVisionGeometry = {
  visiblePoint: Vec3;
  edgeDistance: number;
  footprint: BlockFacingFootprint;
  frontality: 'directly_in_front' | 'not_directly_in_front';
  forwardDistance: number;
  sideOffset: number;
};

export function blockVisionGeometry(origin: Vec3, facingRadians: number, bounds: Bounds): BlockVisionGeometry {
  const footprint = blockFootprintInFacingSpace(origin, facingRadians, bounds);
  const frontality = isDirectlyInFront(footprint) ? 'directly_in_front' : 'not_directly_in_front';
  const visiblePoint = nearestPointOnBounds2D(origin, bounds);
  const edgeDistance = distance2D(origin, visiblePoint);

  return {
    visiblePoint,
    edgeDistance: frontality === 'directly_in_front' ? Math.max(0, footprint.forwardMin) : edgeDistance,
    footprint,
    frontality,
    forwardDistance: Math.max(0, footprint.forwardMin),
    sideOffset: footprint.sideCenter,
  };
}

function blockFootprintInFacingSpace(origin: Vec3, facingRadians: number, bounds: Bounds): BlockFacingFootprint {
  const forward = { x: Math.sin(facingRadians), z: Math.cos(facingRadians) };
  const left = { x: Math.cos(facingRadians), z: -Math.sin(facingRadians) };
  const corners = [
    { x: bounds.min.x, z: bounds.min.z },
    { x: bounds.min.x, z: bounds.max.z },
    { x: bounds.max.x, z: bounds.min.z },
    { x: bounds.max.x, z: bounds.max.z },
  ];
  const projected = corners.map((corner) => {
    const dx = corner.x - origin.x;
    const dz = corner.z - origin.z;
    return {
      forward: dx * forward.x + dz * forward.z,
      side: dx * left.x + dz * left.z,
    };
  });
  const forwardValues = projected.map((point) => point.forward);
  const sideValues = projected.map((point) => point.side);
  const sideMin = Math.min(...sideValues);
  const sideMax = Math.max(...sideValues);

  return {
    forwardMin: Math.min(...forwardValues),
    forwardMax: Math.max(...forwardValues),
    sideMin,
    sideMax,
    sideCenter: (sideMin + sideMax) / 2,
  };
}

function isDirectlyInFront(footprint: BlockFacingFootprint): boolean {
  const centerCorridorHalfWidth = 0.42;
  const reachesForward = footprint.forwardMax > 0.05;
  const overlapsCenterLine = footprint.sideMin <= centerCorridorHalfWidth && footprint.sideMax >= -centerCorridorHalfWidth;
  return reachesForward && overlapsCenterLine;
}

function nearestPointOnBounds2D(point: Vec3, bounds: Bounds): Vec3 {
  return {
    x: clamp(point.x, bounds.min.x, bounds.max.x),
    y: (bounds.min.y + bounds.max.y) / 2,
    z: clamp(point.z, bounds.min.z, bounds.max.z),
  };
}

function distance2D(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
