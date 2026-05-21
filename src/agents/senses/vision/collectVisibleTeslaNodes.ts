import { distance2D } from '../../../world/types';
import { WorldState } from '../../../world/worldState';
import { angleFromFacing, classifyDirection, isInsideFieldOfView } from './classifyDirection';
import { hasLineOfSight } from './lineOfSight';
import { compareImportanceThenDistance, visualImportance } from './visualImportance';
import { TeslaNodeFieldState, VisibleTeslaNode, VisionOptions } from './types';

export function collectVisibleTeslaNodes(world: WorldState, avatarId: string, options: VisionOptions): VisibleTeslaNode[] {
  const self = world.avatars.get(avatarId);
  if (!self) {
    return [];
  }

  return [...world.teslaNodes.values()]
    .map((node): VisibleTeslaNode | undefined => {
      const distance = distance2D(self.position, node.position);
      if (distance > options.range) {
        return undefined;
      }

      const angle = angleFromFacing(self.position, self.yaw, node.position);
      if (!isInsideFieldOfView(angle, options.fieldOfViewDegrees)) {
        return undefined;
      }

      if (
        options.occlusionEnabled &&
        !hasLineOfSight(world, self.position, node.position, {
          ignoreTeslaNodeId: node.id,
          depthGrace: options.occlusionDepthGrace,
        })
      ) {
        return undefined;
      }

      const direction = classifyDirection(angle);
      const fieldState = teslaFieldState(node.active, node.interference);
      const importance = visualImportance('tesla_node', distance, options.range, direction, [
        node.active ? 0.1 : 0,
        node.interference ? 0.18 : 0,
        !node.active && node.contribution > 0 ? 0.08 : 0,
      ]);

      return {
        kind: 'tesla_node',
        id: node.id,
        label: nodeLabel(fieldState, node.starting),
        position: node.position,
        distance,
        direction,
        angleFromFacing: angle,
        importance,
        active: node.active,
        interference: node.interference,
        starting: node.starting,
        contribution: node.contribution,
        targetEnergy: node.targetEnergy,
        radius: node.radius,
        fieldState,
      };
    })
    .filter((node): node is VisibleTeslaNode => Boolean(node))
    .sort(compareImportanceThenDistance)
    .slice(0, options.maxItemsPerCategory);
}

function teslaFieldState(active: boolean, interference: boolean): TeslaNodeFieldState {
  if (!active) {
    return 'inactive';
  }

  return interference ? 'interference' : 'recharge';
}

function nodeLabel(fieldState: TeslaNodeFieldState, starting: boolean): string {
  const prefix = starting ? 'Starting' : 'Tesla';

  if (fieldState === 'recharge') {
    return `${prefix} Node recharge field`;
  }

  if (fieldState === 'interference') {
    return `${prefix} Node interference field`;
  }

  return `${prefix} Node unfinished`;
}
