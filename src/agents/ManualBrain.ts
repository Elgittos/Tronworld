import { AgentBrain } from './AgentBrain';
import { AgentBrainInput, AgentBrainOutput } from './AgentTypes';

export class ManualBrain implements AgentBrain {
  async decide(_input: AgentBrainInput): Promise<AgentBrainOutput> {
    return {
      proposedAction: { action: 'wait' },
      shortReason: 'Manual brain does not choose autonomous actions.',
    };
  }
}
