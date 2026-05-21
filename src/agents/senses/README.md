# Senses

Build structured perception snapshots for an avatar.

This layer answers: what can the agent perceive right now?

Examples: Energy, position, field state, nearest Tesla Node, nearby avatars, nearby blocks, visible/targeted objects, and short local world summaries.

## Categories

- `awareness`: what the agent knows about itself.
- `vision`: what the agent can see in the world.
- `space`: how the nearby physical area is shaped.
- `energy`: power, recharge fields, interference, and Tesla Node context.
- `social`: what the agent understands about nearby avatars as social beings.
- `touch`: what the agent's body is touching.
- `action_feedback`: what happened after a recent attempted action.
- `attention`: the most important current facts across senses.
- `memory_cues`: present-scene hooks that can retrieve relevant memories.
- `system`: engine-only facts that do not fit a normal human-like sense.

Senses should read current world state and produce grounded snapshots. They
should not choose actions, score motives, mutate world state, or ask the LLM.
