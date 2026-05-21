import { BlockShape } from '../../../world/types';
import { WorldState } from '../../../world/worldState';
import { angleFromFacing, classifyDirection, isInsideFieldOfView } from './classifyDirection';
import { blockVisionGeometry } from './blockVisionGeometry';
import { hasLineOfSight } from './lineOfSight';
import { compareImportanceThenDistance, visualImportance } from './visualImportance';
import { VisibleBlock, VisionOptions } from './types';

export function collectVisibleBlocks(world: WorldState, avatarId: string, options: VisionOptions): VisibleBlock[] {
  const self = world.avatars.get(avatarId);
  if (!self) {
    return [];
  }

  return [...world.blocks.values()]
    .map((block): VisibleBlock | undefined => {
      const bounds = world.getBoundsForBlock(block);
      const geometry = blockVisionGeometry(self.position, self.yaw, bounds);
      const visibleDistance = geometry.edgeDistance;
      if (visibleDistance > options.range) {
        return undefined;
      }

      const angle = angleFromFacing(self.position, self.yaw, geometry.visiblePoint);
      if (!isInsideFieldOfView(angle, options.fieldOfViewDegrees)) {
        return undefined;
      }

      if (
        options.occlusionEnabled &&
        !hasLineOfSight(world, self.position, geometry.visiblePoint, {
          ignoreBlockId: block.id,
          depthGrace: options.occlusionDepthGrace,
        })
      ) {
        return undefined;
      }

      const direction = geometry.frontality === 'directly_in_front' ? 'ahead' : classifyDirection(angle);

      return {
        kind: 'block',
        id: block.id,
        label: `${colorName(block.color)} ${blockShapeName(block.shape)}`,
        shape: block.shape,
        color: block.color,
        ownerId: block.ownerId,
        centerPosition: block.position,
        frontality: geometry.frontality,
        forwardDistance: geometry.forwardDistance,
        sideOffset: geometry.sideOffset,
        position: geometry.visiblePoint,
        distance: visibleDistance,
        direction,
        angleFromFacing: angle,
        importance: visualImportance('block', visibleDistance, options.range, direction),
      };
    })
    .filter((block): block is VisibleBlock => Boolean(block))
    .sort(compareImportanceThenDistance)
    .slice(0, options.maxItemsPerCategory);
}

function blockShapeName(shape: Exclude<BlockShape, 'tesla_node'>): string {
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
      return color;
  }
}
