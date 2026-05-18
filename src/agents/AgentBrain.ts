import { AgentBrainInput, AgentBrainOutput } from './AgentTypes';

export interface AgentBrain {
  decide(input: AgentBrainInput): Promise<AgentBrainOutput>;
}
