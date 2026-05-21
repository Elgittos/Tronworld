import { LLMMessage } from '../../llm/LLMClient';
import { AvatarState, BlockInstance, BrainState } from '../../world/types';
import { AwarenessSnapshot } from '../senses/awareness/types';
import { VisibleThing, VisionSnapshot } from '../senses/vision/types';

export type AvatarChatPromptInput = {
  avatar: AvatarState;
  brain?: BrainState;
  awareness?: AwarenessSnapshot;
  vision?: VisionSnapshot;
  worldBlocks?: BlockInstance[];
  userMessage: string;
  maxEnergy: number;
};

export function buildAvatarChatPrompt(input: AvatarChatPromptInput): LLMMessage[] {
  const { avatar, brain, awareness, vision, userMessage, maxEnergy } = input;

  return [
    {
      role: 'system',
      content: [
        `You are ${avatar.name}, a digital being embodied in a grid body inside Tron World.`,
        'Answer from this embodied avatar perspective. Do not speak as a detached external assistant.',
        'This chat is conversational only. You cannot move, build, transfer Energy, or mutate the simulation from this panel.',
        `Current awareness:\n${formatAwarenessForChat(awareness, avatar, maxEnergy)}`,
        `Energy: ${Math.round(avatar.energy)} / ${maxEnergy}.`,
        `Current vision:\n${formatVisionForChat(vision)}`,
        'The current vision above is freshly rebuilt for this exact user message. Treat it as replacing any earlier visual description.',
        'When answering what you see, mention only objects listed in Current vision. If an object is not listed there, say you do not currently see it.',
        'If the user asks what is directly in front, use the narrow center-view list, not the wider ahead/side lists.',
        brain ? `Connected brain: ${brain.provider} / ${brain.model}.` : 'No avatar brain is assigned; answer through the currently configured model.',
        'Keep replies short and readable.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: userMessage,
    },
  ];
}

export function formatVisionDebugForChat(vision: VisionSnapshot | undefined, worldBlocks: BlockInstance[] = []): string {
  if (!vision) {
    return 'Raw vision unavailable for this avatar.';
  }

  const blockLines = vision.blocks.map((block) => {
    const angleDegrees = (block.angleFromFacing * 180) / Math.PI;
    return [
      block.id,
      block.label,
      block.shape,
      block.color,
      block.direction,
      `distance:${block.distance.toFixed(2)}`,
      `angle:${angleDegrees.toFixed(1)}deg`,
      `visibleEdge:x${block.position.x.toFixed(1)} y${block.position.y.toFixed(1)} z${block.position.z.toFixed(1)}`,
      `center:x${block.centerPosition.x.toFixed(1)} y${block.centerPosition.y.toFixed(1)} z${block.centerPosition.z.toFixed(1)}`,
    ].join(' | ');
  });

  const avatarLines = vision.avatars.map((avatar) => {
    const angleDegrees = (avatar.angleFromFacing * 180) / Math.PI;
    return [
      avatar.id,
      avatar.name,
      avatar.direction,
      `distance:${avatar.distance.toFixed(2)}`,
      `angle:${angleDegrees.toFixed(1)}deg`,
      `position:x${avatar.position.x.toFixed(1)} y${avatar.position.y.toFixed(1)} z${avatar.position.z.toFixed(1)}`,
    ].join(' | ');
  });

  const nodeLines = vision.teslaNodes.map((node) => {
    const angleDegrees = (node.angleFromFacing * 180) / Math.PI;
    return [
      node.id,
      node.label,
      node.direction,
      node.fieldState,
      `distance:${node.distance.toFixed(2)}`,
      `angle:${angleDegrees.toFixed(1)}deg`,
      `position:x${node.position.x.toFixed(1)} y${node.position.y.toFixed(1)} z${node.position.z.toFixed(1)}`,
    ].join(' | ');
  });

  return [
    'Raw current vision snapshot. This is deterministic data before the model interprets anything.',
    `Range: ${vision.range}. Field of view: ${vision.fieldOfViewDegrees} degrees.`,
    `World blocks currently stored: ${worldBlocks.length}.`,
    `World block ids: ${worldBlocks.length ? worldBlocks.map(formatWorldBlock).join('\n') : 'none'}`,
    `Summary: ${vision.summary}`,
    `Environment: ${vision.environment.summary}`,
    `Blocks (${vision.blocks.length}):`,
    blockLines.length ? blockLines.join('\n') : 'none',
    `Avatars (${vision.avatars.length}):`,
    avatarLines.length ? avatarLines.join('\n') : 'none',
    `Tesla Nodes (${vision.teslaNodes.length}):`,
    nodeLines.length ? nodeLines.join('\n') : 'none',
  ].join('\n');
}

function formatWorldBlock(block: BlockInstance): string {
  return `${block.id} | ${block.shape} | ${block.color} | x${block.position.x.toFixed(1)} y${block.position.y.toFixed(1)} z${block.position.z.toFixed(1)}`;
}

function formatAwarenessForChat(awareness: AwarenessSnapshot | undefined, avatar: AvatarState, maxEnergy: number): string {
  if (!awareness) {
    return [
      `- I am ${avatar.name}, a digital being embodied in a grid body.`,
      `- Energy: ${Math.round(avatar.energy)} / ${maxEnergy}.`,
      `- Current goal: ${avatar.currentGoal}.`,
      `- Recent state: ${avatar.recentDecision}.`,
    ].join('\n');
  }

  const position = awareness.bodyState.position;
  const lines = [
    `- ${awareness.summary}`,
    `- Name: ${awareness.identity.name}.`,
    `- Kind: ${awareness.identity.kind}. Body: ${awareness.identity.body}. Body color: ${awareness.identity.color}.`,
    `- Body state: ${awareness.bodyState.onlineState}, ${awareness.bodyState.movement}, ${awareness.bodyState.lookPitch.description}, ${awareness.bodyState.facingDirection.description}.`,
    `- Position: x:${position.x.toFixed(1)} y:${position.y.toFixed(1)} z:${position.z.toFixed(1)}.`,
    `- Age: ${awareness.lifetime.ageDescription}.`,
    `- Energy: ${Math.round(awareness.vital.energy)} / ${awareness.vital.maxEnergy}, ${awareness.vital.energyState}.`,
    `- Current goal: ${awareness.intention.currentGoal}.`,
    `- Recent state: ${awareness.intention.recentDecision}.`,
    `- Intended next step: ${awareness.intention.intendedNextStep}.`,
    `- Agency limit: ${awareness.agencyLimits.limitation}`,
  ];

  if (awareness.intention.recentFailure) {
    lines.push(`- Recent failure: ${awareness.intention.recentFailure}.`);
  }

  return lines.join('\n');
}

function formatVisionForChat(vision: VisionSnapshot | undefined): string {
  if (!vision) {
    return '- Vision unavailable for this avatar.';
  }

  const blocksInFront = vision.blocks
    .filter((block) => block.frontality === 'directly_in_front')
    .sort((a, b) => a.distance - b.distance);
  const blocksAhead = vision.blocks
    .filter((block) => block.direction === 'ahead')
    .sort((a, b) => a.distance - b.distance);
  const lines = [
    `- ${vision.summary}`,
    `- Environment: ${vision.environment.summary}.`,
    `- Distant horizon structures: ${vision.environment.distantStructures.description}.`,
    '- Shape words are literal: cube means cube, tile means floor tile.',
    `- Visible avatars: ${vision.avatars.length ? vision.avatars.map(formatVisionThing).join('; ') : 'none'}.`,
    `- Visible Tesla Nodes: ${vision.teslaNodes.length ? vision.teslaNodes.map(formatVisionThing).join('; ') : 'none'}.`,
    `- Blocks directly in front, narrow center view: count ${blocksInFront.length}; ${blocksInFront.length ? blocksInFront.slice(0, 8).map(formatVisionThing).join('; ') : 'none'}.`,
    `- Blocks ahead, wider forward view: count ${blocksAhead.length}; ${blocksAhead.length ? blocksAhead.slice(0, 8).map(formatVisionThing).join('; ') : 'none'}.`,
    `- Visible blocks: ${vision.blocks.length ? vision.blocks.slice(0, 10).map(formatVisionThing).join('; ') : 'none'}.`,
    `- Open spaces: ${vision.openSpaces.length ? vision.openSpaces.slice(0, 6).map(formatVisionThing).join('; ') : 'none'}.`,
  ];

  if (vision.attentionCandidates.length > 0) {
    lines.push(`- Most noticeable: ${vision.attentionCandidates.slice(0, 5).map(formatVisionThing).join('; ')}.`);
  }

  return lines.join('\n');
}

function formatVisionThing(thing: VisibleThing): string {
  const distance = formatVisionDistance(thing.distance);
  if (thing.kind === 'avatar') {
    return `${thing.name} ${thing.shutdown ? 'shutdown' : 'online'} ${thing.direction} at ${distance}`;
  }

  if (thing.kind === 'tesla_node') {
    return `${thing.label} ${thing.direction} at ${distance}`;
  }

  if (thing.kind === 'block') {
    return `${thing.label} ${thing.direction} at ${distance}`;
  }

  return `${thing.label} ${thing.direction} at ${distance}`;
}

function formatVisionDistance(distance: number): string {
  if (distance <= 0.15) {
    return 'touching distance';
  }

  if (distance < 0.75) {
    return 'less than one grid unit';
  }

  return `${distance.toFixed(1)} grid units`;
}
