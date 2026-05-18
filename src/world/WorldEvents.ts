import { AgentAction } from '../actions/AgentActions';
import { AgentActionResult } from '../actions/ActionResult';

export type WorldEvent = {
  id: string;
  tick: number;
  time: number;
  type: 'agent_decision' | 'agent_failure' | 'world';
  agentId?: string;
  action?: AgentAction;
  result?: AgentActionResult;
  message: string;
  shortReason?: string;
};

export class WorldEventLog {
  private readonly events: WorldEvent[] = [];
  private nextId = 1;

  record(event: Omit<WorldEvent, 'id' | 'time'>): WorldEvent {
    const saved: WorldEvent = {
      ...event,
      id: `event_${this.nextId++}`,
      time: Date.now(),
    };

    this.events.push(saved);

    if (this.events.length > 160) {
      this.events.shift();
    }

    return saved;
  }

  recent(limit = 8, agentId?: string): WorldEvent[] {
    const source = agentId ? this.events.filter((event) => event.agentId === agentId) : this.events;
    return source.slice(Math.max(0, source.length - limit));
  }
}
