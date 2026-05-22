import { ActionSystem } from '../actions/actions';
import { LLMProviderConfig } from '../llm/LLMProviderConfig';
import { WorldEventLog } from '../world/WorldEvents';
import { Vec3 } from '../world/types';
import { WorldState } from '../world/worldState';
import { AvatarRuntime } from './avatar_runtime/AvatarRuntime';

export type AgentMoveFrame = {
  velocity: Vec3;
  jump: boolean;
  moving: boolean;
};

export class AgentBrainGateway {
  private readonly runtime: AvatarRuntime;

  constructor(
    world: WorldState,
    actionSystem: ActionSystem,
    eventLog: WorldEventLog,
    private config: LLMProviderConfig,
  ) {
    this.runtime = new AvatarRuntime(world, actionSystem, eventLog, config);
  }

  setConfig(config: LLMProviderConfig): void {
    this.config = config;
    this.runtime.setConfig(config);
  }

  update(now: number): void {
    void this.config;
    this.runtime.update(now);
  }

  getMoveFrame(agentId: string, now: number, speed: number): AgentMoveFrame {
    return this.runtime.getMoveFrame(agentId, now, speed);
  }
}
