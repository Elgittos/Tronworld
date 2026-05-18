import { AgentBrain } from './AgentBrain';
import { AgentBrainInput, AgentBrainOutput } from './AgentTypes';

export class ScriptedBrain implements AgentBrain {
  async decide(input: AgentBrainInput): Promise<AgentBrainOutput> {
    const nearestTesla = [...input.observation.nearbyTeslaNodes]
      .filter((node) => node.active && !node.interference)
      .sort((a, b) => a.distance - b.distance)[0];

    if ((input.observation.energyState === 'critical' || input.observation.energy < 45) && nearestTesla) {
      return {
        proposedAction: { action: 'move_toward', target: nearestTesla.position },
        shortReason: 'Energy is low, so I am moving toward the nearest safe Tesla Node.',
        attentionTarget: { type: 'tesla_node', id: nearestTesla.id },
      };
    }

    if (input.agentState.motivators.focus < 35) {
      return {
        proposedAction: { action: 'recalibrate' },
        shortReason: 'Focus is low, so I am restoring my current context.',
      };
    }

    const direction = input.observation.openDirections[0];
    if (direction === 'east') {
      return { proposedAction: { action: 'move_right' }, shortReason: 'I am exploring open space to the east.' };
    }
    if (direction === 'west') {
      return { proposedAction: { action: 'move_left' }, shortReason: 'I am exploring open space to the west.' };
    }

    return {
      proposedAction: { action: 'move_forward' },
      shortReason: 'I am continuing to explore the open grid.',
    };
  }
}
