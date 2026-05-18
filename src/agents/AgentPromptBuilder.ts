import { AgentBrainInput } from './AgentTypes';

export const AGENT_SYSTEM_PROMPT = `You are an AI agent inhabiting Tron World.

You are embodied in an avatar. You do not control the world directly. You can only propose one action from the allowed action list.

Energy is your only vital resource. If Energy reaches 0, you shut down and cannot act until another agent transfers Energy to you.

Focus, Connection, Curiosity, and Purpose are soft motivators. They influence what you care about, but they do not kill you.

You can see nearby world elements through passive vision. You may use scan for deeper intentional perception, but scan costs Energy.

Do not invent actions, objects, abilities, or world rules.

Return only valid JSON.`;

export class AgentPromptBuilder {
  buildSystemPrompt(): string {
    return AGENT_SYSTEM_PROMPT;
  }

  buildUserPrompt(input: AgentBrainInput): string {
    const observation = input.observation;
    const motivators = observation.motivators;
    const lastResult = input.lastActionResult
      ? `${input.lastActionResult.accepted ? 'accepted' : 'rejected'}${input.lastActionResult.reason ? `: ${input.lastActionResult.reason}` : ''}`
      : 'none';

    return `Agent ID: ${input.agentId}
Tick: ${input.tick}

State:

Position: ${observation.position.x.toFixed(2)}, ${observation.position.y.toFixed(2)}, ${observation.position.z.toFixed(2)}
Energy: ${observation.energy.toFixed(1)}/100
Energy state: ${observation.energyState}
Focus: ${motivators.focus.toFixed(0)}/100
Connection: ${motivators.connection.toFixed(0)}/100
Curiosity: ${motivators.curiosity.toFixed(0)}/100
Purpose: ${motivators.purpose.toFixed(0)}/100

Current goal:
${observation.currentGoal}

Memory summary:
${input.memorySummary ?? 'none'}

Last action result:
${lastResult}

Passive vision:
Agents: ${JSON.stringify(observation.nearbyAgents)}
Tesla Nodes: ${JSON.stringify(observation.nearbyTeslaNodes)}
Blocks: ${JSON.stringify(observation.visibleBlocks)}
Structures: ${observation.visibleStructures.join('; ')}
Open directions: ${observation.openDirections.join(', ') || 'none obvious'}
Recent events: ${observation.recentEvents.join(' | ') || 'none'}

Available actions:
${JSON.stringify(input.availableActions)}

Important world rules:

Movement costs Energy over time.
Idle costs -0.05 Energy/sec.
Movement costs -0.3 Energy/sec.
Place normal block costs -3 Energy.
Remove normal block costs -3 Energy.
Scan costs -1 Energy.
Handshake costs -2 Energy.
Recharge near Tesla Node gives +3 Energy/sec.
Tesla Node build requires 180 total Energy.
Energy transfer amount is chosen by the donor.
Minimum revival transfer is 10 Energy.
Donor cannot go below 10 Energy.
Tesla Node interference turns both fields into red draining zones.

Choose one action.

Return only JSON in this shape:

{
  "action": "action_name",
  "parameters": {},
  "shortReason": "brief explanation",
  "attentionTarget": {
    "type": "optional_target_type",
    "id": "optional_target_id"
  }
}`;
  }
}
