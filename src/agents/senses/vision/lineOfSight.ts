import { distance2D, Vec3 } from '../../../world/types';
import { Bounds, WorldState } from '../../../world/worldState';

type LineOfSightOptions = {
  ignoreBlockId?: string;
  ignoreTeslaNodeId?: string;
  depthGrace?: number;
};

type Rect2D = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export function hasLineOfSight(world: WorldState, origin: Vec3, target: Vec3, options: LineOfSightOptions = {}): boolean {
  const targetDistance = distance2D(origin, target);
  const depthGrace = options.depthGrace ?? 1.15;

  for (const block of world.blocks.values()) {
    if (block.id === options.ignoreBlockId) {
      continue;
    }

    const bounds = world.getBoundsForBlock(block);
    if (!boundsCanBlockVision(bounds)) {
      continue;
    }

    const hitDistance = segmentRectHitDistance(origin, target, boundsToRect(bounds));
    if (hitDistance !== undefined && hitDistance < targetDistance - depthGrace) {
      return false;
    }
  }

  for (const node of world.teslaNodes.values()) {
    if (node.id === options.ignoreTeslaNodeId || node.height < 0.5) {
      continue;
    }

    const radius = 0.6;
    const hitDistance = segmentRectHitDistance(origin, target, {
      minX: node.position.x - radius,
      maxX: node.position.x + radius,
      minZ: node.position.z - radius,
      maxZ: node.position.z + radius,
    });
    if (hitDistance !== undefined && hitDistance < targetDistance - depthGrace) {
      return false;
    }
  }

  return true;
}

function boundsCanBlockVision(bounds: Bounds): boolean {
  return bounds.max.y - bounds.min.y > 0.25;
}

function boundsToRect(bounds: Bounds): Rect2D {
  return {
    minX: bounds.min.x,
    maxX: bounds.max.x,
    minZ: bounds.min.z,
    maxZ: bounds.max.z,
  };
}

function segmentRectHitDistance(origin: Vec3, target: Vec3, rect: Rect2D): number | undefined {
  if (pointInsideRect(origin, rect)) {
    return undefined;
  }

  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const targetDistance = Math.hypot(dx, dz);
  let tMin = 0;
  let tMax = 1;

  const xClip = clipAxis(origin.x, dx, rect.minX, rect.maxX, tMin, tMax);
  if (!xClip) {
    return undefined;
  }
  tMin = xClip.tMin;
  tMax = xClip.tMax;

  const zClip = clipAxis(origin.z, dz, rect.minZ, rect.maxZ, tMin, tMax);
  if (!zClip) {
    return undefined;
  }
  tMin = zClip.tMin;
  tMax = zClip.tMax;

  if (tMax <= 0.04 || tMin >= 0.98) {
    return undefined;
  }

  return Math.max(0, tMin) * targetDistance;
}

function clipAxis(
  origin: number,
  delta: number,
  min: number,
  max: number,
  tMin: number,
  tMax: number,
): { tMin: number; tMax: number } | undefined {
  if (Math.abs(delta) < 0.00001) {
    return origin >= min && origin <= max ? { tMin, tMax } : undefined;
  }

  const inverse = 1 / delta;
  let near = (min - origin) * inverse;
  let far = (max - origin) * inverse;

  if (near > far) {
    const swap = near;
    near = far;
    far = swap;
  }

  const nextMin = Math.max(tMin, near);
  const nextMax = Math.min(tMax, far);

  return nextMin <= nextMax ? { tMin: nextMin, tMax: nextMax } : undefined;
}

function pointInsideRect(point: Vec3, rect: Rect2D): boolean {
  return point.x >= rect.minX && point.x <= rect.maxX && point.z >= rect.minZ && point.z <= rect.maxZ;
}
