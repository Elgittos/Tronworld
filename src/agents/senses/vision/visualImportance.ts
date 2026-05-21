import { VisibleBase, VisibleThingKind } from './types';

const KIND_IMPORTANCE: Record<VisibleThingKind, number> = {
  avatar: 0.62,
  block: 0.22,
  tesla_node: 0.84,
  open_space: 0.12,
};

export function visualImportance(
  kind: VisibleThingKind,
  distance: number,
  range: number,
  direction: VisibleBase['direction'],
  modifiers: number[] = [],
): number {
  const distanceScore = 1 - Math.min(1, distance / Math.max(1, range));
  const directionScore = direction === 'ahead' ? 0.12 : direction === 'behind' ? -0.08 : 0;
  const raw = KIND_IMPORTANCE[kind] + distanceScore * 0.32 + directionScore + modifiers.reduce((sum, value) => sum + value, 0);
  return clamp01(raw);
}

export function compareImportanceThenDistance(a: VisibleBase, b: VisibleBase): number {
  return b.importance - a.importance || a.distance - b.distance;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
