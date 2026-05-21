import { LLMProviderConfig } from '../../../llm/LLMProviderConfig';
import { Vec3 } from '../../../world/types';

export type SystemSnapshotInput = {
  llmConfig?: LLMProviderConfig;
  llmConnected?: boolean;
  simulationControlActive?: boolean;
  debugCommands?: string[];
  lastEngineMessage?: string;
};

export type SystemSnapshot = {
  avatarId: string;
  tick: number;
  elapsedSeconds: number;
  selectedAvatarId?: string;
  avatarBrain?: {
    brainId: string;
    provider: string;
    model: string;
  };
  configuredModel?: {
    provider: string;
    model: string;
    baseUrl?: string;
    connected?: boolean;
  };
  enginePosition: Vec3;
  chatCanAct: boolean;
  simulationControlActive: boolean;
  debugCommands: string[];
  lastEngineMessage: string;
  summary: string;
};
