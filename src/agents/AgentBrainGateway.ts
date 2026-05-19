import { ActionSystem } from '../actions/actions';
import { AGENT_ACTION_SCHEMAS, AgentAction } from '../actions/AgentActions';
import { AgentActionResult } from '../actions/ActionResult';
import { ActionValidator } from '../actions/ActionValidator';
import { DEFAULT_LM_STUDIO_CONFIG, LLMProviderConfig } from '../llm/LLMProviderConfig';
import { WorldEventLog } from '../world/WorldEvents';
import { distance2D, Vec3 } from '../world/types';
import { WorldState } from '../world/worldState';
import { AgentBrain } from './AgentBrain';
import { AgentActionParser } from './AgentActionParser';
import { AgentMemory } from './AgentMemory';
import { AgentMovementIntent } from './AgentTypes';
import { AgentObservationBuilder } from './AgentObservationBuilder';
import { OpenAICompatibleBrain } from './OpenAICompatibleBrain';
import { ScriptedBrain } from './ScriptedBrain';

export const AI_DECISION_INTERVAL_MS = 8000;

export type AgentMoveFrame = {
  velocity: Vec3;
  jump: boolean;
  moving: boolean;
};

export class AgentBrainGateway {
  private readonly parser = new AgentActionParser();
  private readonly memory = new AgentMemory();
  private readonly observationBuilder: AgentObservationBuilder;
  private readonly validator: ActionValidator;
  private brain: AgentBrain;
  private readonly pending = new Set<string>();
  private readonly nextDecisionAt = new Map<string, number>();
  private readonly movementIntents = new Map<string, AgentMovementIntent>();
  private readonly lastResults = new Map<string, AgentActionResult>();

  constructor(
    private readonly world: WorldState,
    actionSystem: ActionSystem,
    private readonly eventLog: WorldEventLog,
    config: LLMProviderConfig = DEFAULT_LM_STUDIO_CONFIG,
  ) {
    this.observationBuilder = new AgentObservationBuilder(eventLog);
    this.validator = new ActionValidator(world, actionSystem);
    this.brain = config.provider === 'scripted' ? new ScriptedBrain() : new OpenAICompatibleBrain(config);
  }

  setConfig(config: LLMProviderConfig): void {
    this.brain = config.provider === 'scripted' ? new ScriptedBrain() : new OpenAICompatibleBrain(config);
    this.pending.clear();
    this.nextDecisionAt.clear();
  }

  update(now: number): void {
    for (const agent of this.world.avatars.values()) {
      if (agent.control !== 'ai' || agent.shutdown || this.pending.has(agent.id)) {
        continue;
      }

      const nextAt = this.nextDecisionAt.get(agent.id) ?? 0;
      if (now < nextAt) {
        continue;
      }

      this.pending.add(agent.id);
      this.nextDecisionAt.set(agent.id, now + AI_DECISION_INTERVAL_MS);
      void this.stepAgent(agent.id, now).finally(() => this.pending.delete(agent.id));
    }
  }

  getMoveFrame(agentId: string, now: number, speed: number): AgentMoveFrame {
    const agent = this.world.avatars.get(agentId);
    const intent = this.movementIntents.get(agentId);

    if (!agent || !intent || agent.shutdown || now > intent.expiresAt) {
      this.movementIntents.delete(agentId);
      return this.emptyMoveFrame();
    }

    if (intent.action === 'jump') {
      if (intent.consumed) {
        this.movementIntents.delete(agentId);
        return this.emptyMoveFrame();
      }
      intent.consumed = true;
      return { velocity: { x: 0, y: 0, z: 0 }, jump: true, moving: true };
    }

    let yaw = agent.yaw;
    if (intent.action === 'move_toward') {
      const dx = intent.target.x - agent.position.x;
      const dz = intent.target.z - agent.position.z;
      if (Math.hypot(dx, dz) < 0.45 || agent.energy <= 10) {
        this.movementIntents.delete(agentId);
        return this.emptyMoveFrame();
      }
      yaw = Math.atan2(dx, dz);
      agent.yaw = yaw;
      agent.attentionTarget = { type: 'position', position: intent.target };
    } else if (intent.action === 'move_backward') {
      yaw += Math.PI;
    } else if (intent.action === 'move_left') {
      yaw += Math.PI / 2;
    } else if (intent.action === 'move_right') {
      yaw -= Math.PI / 2;
    }

    return {
      velocity: {
        x: Math.sin(yaw) * speed,
        y: 0,
        z: Math.cos(yaw) * speed,
      },
      jump: false,
      moving: true,
    };
  }

  private async stepAgent(agentId: string, now: number): Promise<void> {
    const agent = this.world.avatars.get(agentId);
    if (!agent || agent.energy <= 0 || agent.shutdown) {
      return;
    }

    const observation = this.observationBuilder.build(agentId, this.world);
    if (!observation) {
      return;
    }

    const brainOutput = await this.brain.decide({
      agentId,
      tick: this.world.tick,
      agentState: agent,
      observation,
      availableActions: AGENT_ACTION_SCHEMAS,
      memorySummary: this.memory.getSummary(agentId),
      lastActionResult: this.lastResults.get(agentId),
    });

    const parsed = this.parser.parse(brainOutput.rawModelOutput ?? brainOutput.proposedAction);
    const proposedAction = parsed.parseError ? this.safeFallbackAction(observation.energyState, observation.nearbyTeslaNodes) : parsed.action;
    const validation = this.validator.validate(proposedAction, agent);
    const result = validation.accepted ? this.validator.apply(validation) : validation;

    if (result.accepted && validation.movement) {
      this.movementIntents.set(agentId, this.toMovementIntent(validation.movement, now));
    }

    const attentionTarget = parsed.attentionTarget ?? brainOutput.attentionTarget ?? this.inferAttention(proposedAction);
    agent.attentionTarget = attentionTarget;
    agent.recentDecision = `${proposedAction.action}: ${parsed.shortReason ?? brainOutput.shortReason ?? result.reason ?? 'no reason'}`;
    if (!result.accepted) {
      agent.recentFailure = result.reason;
    }

    const event = this.eventLog.record({
      tick: this.world.tick,
      type: result.accepted ? 'agent_decision' : 'agent_failure',
      agentId,
      action: proposedAction,
      result,
      shortReason: parsed.shortReason ?? brainOutput.shortReason,
      message: `${agent.name}: ${proposedAction.action} ${result.accepted ? 'accepted' : 'rejected'}${result.reason ? ` - ${result.reason}` : ''}`,
    });

    this.world.lastMessage = event.message;
    const savedResult = { ...result, eventIds: [event.id] };
    this.lastResults.set(agentId, savedResult);
    this.memory.rememberDecision(agentId, proposedAction, savedResult, parsed.shortReason ?? brainOutput.shortReason);
  }

  private safeFallbackAction(
    energyState: string,
    teslaNodes: Array<{ id: string; active: boolean; interference: boolean; distance: number; position: Vec3 }>,
  ): AgentAction {
    const safeTesla = teslaNodes
      .filter((node) => node.active && !node.interference)
      .sort((a, b) => a.distance - b.distance)[0];

    if (energyState === 'critical' && safeTesla) {
      return { action: 'move_toward', target: safeTesla.position };
    }

    return { action: 'wait' };
  }

  private toMovementIntent(command: NonNullable<ReturnType<ActionValidator['validate']>['movement']>, now: number): AgentMovementIntent {
    const expiresAt = now + AI_DECISION_INTERVAL_MS;
    if (command.action === 'move_toward') {
      return { action: 'move_toward', target: command.target, expiresAt };
    }
    if (command.action === 'jump') {
      return { action: 'jump', expiresAt: now + 1000, consumed: false };
    }
    return { action: command.action, expiresAt };
  }

  private inferAttention(action: AgentAction) {
    if ('target' in action) {
      return { type: 'position' as const, position: action.target };
    }
    if ('position' in action && action.position) {
      return { type: 'position' as const, position: action.position };
    }
    if ('targetAgentId' in action) {
      return { type: 'agent' as const, id: action.targetAgentId };
    }
    if ('targetBlockId' in action && action.targetBlockId) {
      return { type: 'block' as const, id: action.targetBlockId };
    }
    return undefined;
  }

  private emptyMoveFrame(): AgentMoveFrame {
    return { velocity: { x: 0, y: 0, z: 0 }, jump: false, moving: false };
  }
}
