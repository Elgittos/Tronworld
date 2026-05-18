# Tron World MVP Foundation Notes

## Core direction

Tron World should be built as a dynamic, chunk-generated world from the beginning. It should not start as a tiny fixed map or a bounded test grid.

The world should feel continuous, like it already exists beyond what the agent can see.

## Tech stack

- Vite
- TypeScript
- Three.js
- Rapier 3D
- LM Studio integration later

## World model

- Infinite-feeling chunk-generated world
- Chunks generated before agents reach visible edges
- Visible radius, loaded radius, and preload radius should be separate
- The agent should never stand at the edge of generated world
- Render only visible chunks
- Keep active chunks around agents loaded
- Save modified chunks later

## Movement and building

Agents should move freely, not grid-cell by grid-cell.

The grid still matters for:

- visual Tron floor
- chunk coordinates
- block snapping
- construction alignment

Rule:

- agents move freely
- blocks snap to grid

Basic movement intentions:

- move forward
- move backward
- move left
- move right
- jump
- move toward target

Movement and jump use the same movement energy rate for now.

## Starting setup

Start with:

- one Reactor Node
- two agents
- a small base/platform/path around the Reactor Node
- open generated Tron world extending outward

## Reactor Node

A Reactor Node is the energy structure where agents recharge.

Agents can recharge near a Reactor Node.

Agents can build normal blocks alone, but creating a new Reactor Node requires enough total Energy that one agent cannot realistically do it alone.

## Energy

Energy is the only vital value.

All values are 0-100.

If Energy reaches 0, the agent shuts down.

### Energy changes

| Action / state | Energy change |
|---|---:|
| Idle / wait | -0.05 per second |
| Movement | -0.3 per second |
| Place normal block | -3 |
| Remove normal block | -3 |
| Scan | -1 |
| Handshake | -2 |
| Recharge near Reactor Node | +3 per second |
| Build Reactor Node | 180 total Energy |
| Transfer Energy | agent chooses amount |

Normal blocks:

- cube
- half-cube
- ramp
- tile
- pillar

All normal block placement costs -3 Energy for now.
All normal block removal costs -3 Energy for now.

## Shutdown and revival

Shutdown happens when Energy reaches 0.

A shutdown agent:

- cannot move
- cannot build
- cannot make decisions
- has static red reactor glow
- waits for revival

Shutdown should usually happen because the agent is far from a Reactor Node and runs out of Energy.

Revival rules:

- only another active agent can revive a shutdown agent
- active agent must be near the shutdown agent
- active agent transfers Energy
- minimum revival transfer is 10 Energy
- donor cannot go below 10 Energy
- no recommended transfer amount should be shown to the agent
- the agent decides how much Energy to give

## Secondary motivators

Secondary motivators are soft pressures, not survival values.

They are all 0-100:

- Focus
- Connection
- Curiosity
- Purpose

They should influence decision priority, not kill the agent.

If several motivators are equally low, use personality weights instead of pure random selection.

## Personality weights

Each agent should have personality weights set at creation.

Example:

- Agent A: higher Curiosity weight
- Agent B: higher Purpose weight

When multiple secondary motivators are equally low, the agent's personality weights decide which pressure it is more likely to follow.

## Focus

Focus represents clarity and ability to stay coherent.

Focus decreases when the agent gets confused, fails actions, or loses track of its goal.

### Recalibration

Recalibration is not magic and should not be arbitrary.

It means the agent pauses for a duration and the system helps it regain focus by reminding it:

- what it was doing
- what its current goal was
- what direction it was moving
- what decision it had made
- what the intended next step was

Recalibration should restore Focus because it re-centers the agent on its own plan.

### Focus changes

| Event / action | Focus change |
|---|---:|
| Recalibrate | +20 Focus |
| Successful simple task | +5 Focus |
| Failed / invalid action | -5 Focus |

A successful simple task means the agent tried to do a clear basic thing and it worked.

Examples:

- reached intended target
- placed valid block
- completed handshake
- completed scan
- reached Reactor Node

## Connection

Connection represents social/sync pressure.

Connection increases through interaction with another agent.

| Event / action | Connection change |
|---|---:|
| Stay near another agent for a while | +5 Connection |
| Handshake | +25 Connection |
| Revive another agent | +20 Connection |
| Build Reactor Node together | +30 Connection |

At low Connection, the agent should seek another agent or attempt handshake.

## Curiosity

Curiosity represents need for novelty and new information.

Do not use vague “discover generated feature” rules yet unless the world element is clearly defined.

For now, Curiosity should increase from concrete perception events:

| Event / action | Curiosity change |
|---|---:|
| Enter unseen area | +15 Curiosity |
| Scan reveals new useful information | +10 Curiosity |
| First time seeing a new agent-made structure | +10 Curiosity |

Curiosity should not depend on fake abstract features. If later the world has defined elements, those can become curiosity sources.

## Purpose

Purpose represents feeling that the agent is doing useful work.

Remove repair actions for now because block damage has not been defined.

| Event / action | Purpose change |
|---|---:|
| Place useful block | +8 Purpose |
| Remove misplaced/useless block | +6 Purpose |
| Complete small structure/path | +15 Purpose |
| Help build Reactor Node | +30 Purpose |
| Revive another agent | +25 Purpose |

## Perception

Agents should not only have computational data. They should have a sense of seeing the world.

Use two layers:

### Passive vision

Always available.

The agent can see nearby visible world elements:

- blocks
- structures
- Reactor Nodes
- other agents
- open space
- obstacles

Passive vision should cost no Energy.

### Active scan

Scan is an intentional deeper perception action.

Scan costs Energy.

Scan can reveal:

- more precise local structure information
- useful unknown information
- nearby object details
- possible build site information

Scan should not replace normal vision.

## Agent point of view

Humans should be able to view the world from an agent's point of view.

This view should emulate what the agent sees and focuses on.

The view should be dynamic and smooth:

- agent looks toward interesting objects
- gaze can stay fixed on a focus point
- gaze changes when the agent intentionally attends to something else
- not just a raw computational list

## Action list

Current understood actions:

- move_forward
- move_backward
- move_left
- move_right
- jump
- move_toward
- place_block
- remove_block
- scan
- handshake
- recalibrate
- recharge
- transfer_energy
- build_reactor_node
- wait

## AI rule

LLM integration comes later.

When added:

- LLM proposes actions
- engine validates actions
- engine applies legal actions
- LLM never directly mutates world state

## Current priority logic

1. If Energy is 0, agent is shutdown.
2. If Energy is critical, seek recharge or help.
3. Otherwise, respond to secondary motivators.
4. If multiple motivators are equally low, use personality weights.
5. If no urgent pressure exists, continue current task.
