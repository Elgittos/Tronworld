export type WorldEvent = {
  id: string;
  tick: number;
  time: number;
  type: 'action' | 'thought' | 'system' | 'world';
  avatarId?: string;
  avatarName?: string;
  action?: string;
  status?: 'accepted' | 'applied' | 'rejected' | 'failed' | 'info';
  message: string;
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
    void agentId;
    return this.events.slice(Math.max(0, this.events.length - limit));
  }
}
