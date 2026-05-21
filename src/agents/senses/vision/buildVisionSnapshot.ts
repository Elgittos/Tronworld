import { WorldState } from '../../../world/worldState';
import { collectVisibleAvatars } from './collectVisibleAvatars';
import { collectVisibleBlocks } from './collectVisibleBlocks';
import { collectVisibleEnvironment } from './collectVisibleEnvironment';
import { collectVisibleOpenSpaces } from './collectVisibleOpenSpaces';
import { collectVisibleTeslaNodes } from './collectVisibleTeslaNodes';
import { compareImportanceThenDistance } from './visualImportance';
import { DEFAULT_VISION_OPTIONS, VisionOptions, VisionSnapshot, VisibleThing } from './types';

export function buildVisionSnapshot(
  world: WorldState,
  avatarId: string,
  options: Partial<VisionOptions> = {},
): VisionSnapshot | undefined {
  const avatar = world.avatars.get(avatarId);
  if (!avatar) {
    return undefined;
  }

  const resolvedOptions = { ...DEFAULT_VISION_OPTIONS, ...options };
  const avatars = collectVisibleAvatars(world, avatarId, resolvedOptions);
  const blocks = collectVisibleBlocks(world, avatarId, resolvedOptions);
  const teslaNodes = collectVisibleTeslaNodes(world, avatarId, resolvedOptions);
  const openSpaces = collectVisibleOpenSpaces(world, avatarId, resolvedOptions);
  const environment = collectVisibleEnvironment(world, avatarId, blocks, openSpaces, resolvedOptions);
  const attentionCandidates = ([...avatars, ...teslaNodes, ...blocks, ...openSpaces] as VisibleThing[])
    .sort(compareImportanceThenDistance)
    .slice(0, 12);

  return {
    avatarId: avatar.id,
    tick: world.tick,
    range: resolvedOptions.range,
    fieldOfViewDegrees: resolvedOptions.fieldOfViewDegrees,
    avatars,
    blocks,
    teslaNodes,
    openSpaces,
    environment,
    attentionCandidates,
    summary: summarizeVision(avatars.length, blocks.length, teslaNodes.length, openSpaces.length, environment.summary, attentionCandidates[0]),
  };
}

function summarizeVision(
  avatarCount: number,
  blockCount: number,
  teslaNodeCount: number,
  openSpaceCount: number,
  environmentSummary: string,
  strongest?: VisibleThing,
): string {
  const parts = [
    `${avatarCount} avatars`,
    `${blockCount} blocks`,
    `${teslaNodeCount} Tesla Nodes`,
    `${openSpaceCount} open spaces`,
  ];

  if (!strongest) {
    return `Vision sees ${parts.join(', ')}. Environment: ${environmentSummary}.`;
  }

  return `Vision sees ${parts.join(', ')}. Environment: ${environmentSummary}. Most noticeable: ${strongest.label} ${strongest.direction}.`;
}
