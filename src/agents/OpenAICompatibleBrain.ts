import { OpenAICompatibleClient } from '../llm/OpenAICompatibleClient';
import { LLMProviderConfig } from '../llm/LLMProviderConfig';
import { AgentBrain } from './AgentBrain';
import { AgentBrainInput, AgentBrainOutput } from './AgentTypes';
import { AgentPromptBuilder } from './AgentPromptBuilder';

export class OpenAICompatibleBrain implements AgentBrain {
  private readonly client: OpenAICompatibleClient;
  private readonly promptBuilder = new AgentPromptBuilder();

  constructor(config: LLMProviderConfig) {
    this.client = new OpenAICompatibleClient(config);
  }

  async decide(input: AgentBrainInput): Promise<AgentBrainOutput> {
    const result = await this.client.completeChat([
      { role: 'system', content: this.promptBuilder.buildSystemPrompt() },
      { role: 'user', content: this.promptBuilder.buildUserPrompt(input) },
    ]);

    if (!result.ok) {
      const nearestTesla = [...input.observation.nearbyTeslaNodes]
        .filter((node) => node.active && !node.interference)
        .sort((a, b) => a.distance - b.distance)[0];
      const proposedAction =
        input.observation.energyState === 'critical' && nearestTesla
          ? { action: 'move_toward' as const, target: nearestTesla.position }
          : { action: 'wait' as const };

      return {
        proposedAction,
        shortReason: `Model unavailable: ${result.error}. Falling back safely.`,
        rawModelOutput: JSON.stringify(proposedAction),
      };
    }

    return {
      proposedAction: { action: 'wait' },
      rawModelOutput: result.content,
    };
  }
}
