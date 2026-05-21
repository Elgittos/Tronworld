import { DirectionClearance, LocalAreaType, SpatialDirection } from './types';

export function classifyLocalArea(walkableDirections: Record<SpatialDirection, DirectionClearance>): LocalAreaType {
  const directions = Object.values(walkableDirections);
  const blocked = directions.filter((direction) => direction.state === 'blocked').length;
  const close = directions.filter((direction) => direction.state === 'close_obstacle').length;
  const clear = directions.filter((direction) => direction.state === 'clear').length;

  if (blocked >= 3) {
    return 'blocked_pocket';
  }

  if (blocked >= 2 && clear <= 2) {
    return 'corner';
  }

  if (clear === 2 && walkableDirections.forward.state !== walkableDirections.backward.state) {
    return 'corridor';
  }

  if (blocked > 0 || close > 0) {
    return 'near_wall';
  }

  return 'open_area';
}
