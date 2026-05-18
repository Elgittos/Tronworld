import { AgentAction } from './AgentActions';

export type AgentActionResult = {
  accepted: boolean;
  reason?: string;
  appliedAction?: AgentAction;
  energyDelta?: number;
  eventIds?: string[];
};

export const WAIT_ACTION_RESULT: AgentActionResult = {
  accepted: true,
  reason: 'Waiting.',
  appliedAction: { action: 'wait' },
};
