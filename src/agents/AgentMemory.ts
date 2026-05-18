import { AgentAction } from '../actions/AgentActions';
import { AgentActionResult } from '../actions/ActionResult';

type AgentMemoryState = {
  recentEvents: string[];
  currentGoal: string;
  lastDecision?: string;
  lastTarget?: string;
  summary: string;
};

export class AgentMemory {
  private readonly memories = new Map<string, AgentMemoryState>();

  getSummary(agentId: string): string {
    return this.get(agentId).summary;
  }

  getCurrentGoal(agentId: string): string {
    return this.get(agentId).currentGoal;
  }

  rememberDecision(agentId: string, action: AgentAction, result: AgentActionResult, reason?: string): void {
    const memory = this.get(agentId);
    const actionText = this.describeAction(action);
    const outcome = result.accepted ? 'accepted' : `rejected: ${result.reason ?? 'unknown reason'}`;
    const line = `${actionText} was ${outcome}${reason ? ` (${reason})` : ''}.`;

    memory.lastDecision = actionText;
    memory.lastTarget = this.describeTarget(action);
    memory.recentEvents.push(line);
    memory.recentEvents = memory.recentEvents.slice(-8);
    memory.summary = this.buildSummary(memory);
  }

  getRecentEvents(agentId: string): string[] {
    return [...this.get(agentId).recentEvents];
  }

  recalibrationContext(agentId: string): string {
    const memory = this.get(agentId);
    return [
      `Goal: ${memory.currentGoal}`,
      `Recent decision: ${memory.lastDecision ?? 'none'}`,
      `Target/direction: ${memory.lastTarget ?? 'none'}`,
      `Recent events: ${memory.recentEvents.slice(-3).join(' ') || 'none'}`,
    ].join('\n');
  }

  private get(agentId: string): AgentMemoryState {
    let memory = this.memories.get(agentId);

    if (!memory) {
      memory = {
        recentEvents: [],
        currentGoal: 'Stay powered, understand the nearby grid, and help expand Tron World.',
        summary: 'Newly online. No decisions yet.',
      };
      this.memories.set(agentId, memory);
    }

    return memory;
  }

  private buildSummary(memory: AgentMemoryState): string {
    return [
      memory.currentGoal,
      memory.lastDecision ? `Last decision: ${memory.lastDecision}.` : 'No previous decision.',
      memory.lastTarget ? `Last target: ${memory.lastTarget}.` : '',
      memory.recentEvents.slice(-2).join(' '),
    ]
      .filter(Boolean)
      .join(' ');
  }

  private describeAction(action: AgentAction): string {
    return action.action;
  }

  private describeTarget(action: AgentAction): string | undefined {
    if ('target' in action) {
      return `position ${action.target.x.toFixed(1)}, ${action.target.y.toFixed(1)}, ${action.target.z.toFixed(1)}`;
    }
    if ('position' in action && action.position) {
      return `position ${action.position.x.toFixed(1)}, ${action.position.y.toFixed(1)}, ${action.position.z.toFixed(1)}`;
    }
    if ('targetAgentId' in action) {
      return action.targetAgentId;
    }
    if ('targetBlockId' in action && action.targetBlockId) {
      return action.targetBlockId;
    }
    return undefined;
  }
}
