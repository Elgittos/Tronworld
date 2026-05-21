import { ActionSystem } from '../actions/actions';
import { LLMProviderConfig } from '../llm/LLMProviderConfig';
import { WorldEventLog } from '../world/WorldEvents';
import { Vec3 } from '../world/types';
import { WorldState } from '../world/worldState';

export type AgentMoveFrame = {
  velocity: Vec3;
  jump: boolean;
  moving: boolean;
};

export class AgentBrainGateway {
  constructor(
    private readonly world: WorldState,
    _actionSystem: ActionSystem,
    _eventLog: WorldEventLog,
    private _config: LLMProviderConfig,
  ) {}

  setConfig(config: LLMProviderConfig): void {
    this._config = config;
  }

  update(_now: number): void {
    void this.world;
    void this._config;
  }

  getMoveFrame(_agentId: string, _now: number, _speed: number): AgentMoveFrame {
    return { velocity: { x: 0, y: 0, z: 0 }, jump: false, moving: false };
  }
}
