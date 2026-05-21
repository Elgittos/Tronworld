import { WorldState } from '../../../world/worldState';
import { SystemSnapshot, SystemSnapshotInput } from './types';

export function buildSystemSnapshot(
  world: WorldState,
  avatarId: string,
  input: SystemSnapshotInput = {},
): SystemSnapshot | undefined {
  const avatar = world.avatars.get(avatarId);
  if (!avatar) {
    return undefined;
  }

  const brain = avatar.brainId ? world.brains.get(avatar.brainId) : undefined;
  const simulationControlActive = input.simulationControlActive ?? false;
  const debugCommands = input.debugCommands ?? ['debug vision'];

  return {
    avatarId: avatar.id,
    tick: world.tick,
    elapsedSeconds: world.elapsed,
    selectedAvatarId: world.selectedAvatarId,
    avatarBrain: brain
      ? {
          brainId: brain.id,
          provider: brain.provider,
          model: brain.model,
        }
      : undefined,
    configuredModel: input.llmConfig
      ? {
          provider: input.llmConfig.provider,
          model: input.llmConfig.model ?? 'unknown model',
          baseUrl: input.llmConfig.baseUrl,
          connected: input.llmConnected,
        }
      : undefined,
    enginePosition: avatar.position,
    chatCanAct: simulationControlActive,
    simulationControlActive,
    debugCommands,
    lastEngineMessage: input.lastEngineMessage ?? world.lastMessage,
    summary: summarizeSystem(brain?.model, simulationControlActive, input.lastEngineMessage ?? world.lastMessage),
  };
}

function summarizeSystem(model: string | undefined, simulationControlActive: boolean, lastEngineMessage: string): string {
  const modelText = model ? `brain model ${model}` : 'no assigned brain model';
  const controlText = simulationControlActive ? 'simulation control active' : 'chat cannot control the simulation';
  return `System: ${modelText}; ${controlText}; last engine message: ${lastEngineMessage}`;
}
