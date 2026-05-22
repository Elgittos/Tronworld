# Tron World Affordance System Plan

This is the living plan for agent affordances. Update it whenever the
affordance direction changes.

## North Star

Affordances are not scripts. They are grounded opportunities that emerge from
the agent's current body, senses, memory, and world rules.

This layer answers:

```txt
What does the world make possible for this body right now?
```

It does not answer:

```txt
What should I do?
```

Motivation and planning answer that later.

## Emergent Rule

Do not build affordances as hidden behavior scripts.

Bad:

```txt
if Energy is low, go recharge
```

Good:

```txt
Energy sense reports Energy pressure.
Vision/energy/memory expose a reachable Tesla Node opportunity.
Space reports whether movement is locally plausible.
The affordance layer proposes "move_toward this Node" with predicted effects.
Motivation later decides whether it matters most.
```

Affordances may be action-specific because the world has a finite action set,
but the agent must not be steered by hardcoded policy here.

## Inputs

Every live sense should be allowed to shape affordances:

- `awareness`: online state, body position, current goal, intended next step
- `vision`: visible avatars, blocks, Tesla Nodes, open spaces, distant structures
- `space`: clear directions, blocked movement, jump clearance, reachable counts
- `energy`: current Energy, recharge/interference fields, reachable Energy sources
- `social`: reachable avatars, shutdown avatars, Energy-transfer opportunities
- `touch`: body contact, standing surface, airborne state
- `action_feedback`: recent accepted/rejected/failed actions
- `attention`: current high-pressure sense focus
- `system`: engine/debug context and control status
- `memory`: remembered places, failures, skills, familiarity, and prior outcomes

Current senses override memory. Memory can add familiarity or remembered
positions, but it cannot assert that an action will succeed.

## Output Shape

Affordances output bounded candidate records:

```ts
type AffordanceCandidate = {
  id: string;
  action: AgentAction;
  label: string;
  sources: AffordanceSource[];
  target?: AffordanceTarget;
  preconditions: string[];
  evidence: string[];
  predictedEffects: AffordancePredictedEffects;
  confidence: number;
  grounding: 'sensed' | 'remembered' | 'sensed_and_remembered';
  validation: 'needs_engine_validation' | 'locally_grounded';
};
```

Predicted effects are not final motivation scores. They are consequence hints
for the motivation layer:

- viability
- agency
- competence
- curiosity
- familiarity
- social
- construction
- continuity
- risk
- optional Energy delta
- optional distance-to-Energy change

## Safety Rules

- The affordance layer never mutates world state.
- The affordance layer never executes actions.
- The affordance layer never lets an LLM invent actions.
- Candidate actions must use `AgentAction`.
- Candidates that require world truth still need engine validation before
  execution.
- Rejected/failed feedback should create new possible responses, not force a
  script.

## Current Implementation

- `types.ts` defines `AffordanceCandidate` and effect signals.
- `buildAffordanceCandidates.ts` builds candidates from all sense categories,
  retrieved memory, attention, and system context.
- Candidates are deduplicated and sorted by grounded opportunity, not by final
  motivation.

This is still non-executing infrastructure. The autonomous agent gateway remains
off until affordances, motivation, planning, validation, and telemetry are wired
carefully.
