# Tron World Avatar Runtime System Plan

This is the living plan for the avatar runtime. Update it whenever runtime
direction changes.

## North Star

The avatar runtime is the binding layer that lets an AI-inhabited avatar act in
Tron World without letting the model or cognition layers own world truth.

It answers:

```txt
How do senses, memory, affordances, motivation, and planning become one
validated action request or one short movement command?
```

It does not answer:

```txt
Can the agent invent actions?
Can the agent bypass physics or validation?
Can the LLM decide an action succeeded?
```

The world engine, physics, validators, and action system remain authoritative.

## Runtime Flow

Current target flow:

```txt
AI avatar selected by gateway
-> build live senses
-> build memory cues
-> retrieve compact memory context
-> build affordance candidates
-> build motivation snapshot
-> build planning snapshot
-> choose planning candidate by id
-> validate AgentAction
-> apply non-movement action through ActionValidator/ActionSystem
-> expose movement command through AgentBrainGateway.getMoveFrame
-> record event log telemetry
-> write bounded memory candidates
```

The runtime runs at a low decision frequency. Continuous movement is handled by
short movement intents between cognition ticks.

## Boundaries

- Runtime may call `ActionValidator`.
- Runtime may call `ActionSystem` only through `ActionValidator.apply`.
- Runtime may return movement frames for physics.
- Runtime may update avatar yaw as part of embodied AI movement.
- Runtime may log telemetry.
- Runtime may write bounded memory candidates through the validated memory API.

Runtime must not:

- directly place/remove blocks
- directly change Energy
- directly teleport avatars
- mutate camera/input/UI state
- let LLM text create actions
- treat memory as present-world truth
- run every frame as a heavy cognition loop

## First Implementation

Files:

- `types.ts`
- `AvatarRuntime.ts`

`AgentBrainGateway` owns one `AvatarRuntime` instance and remains the public
bridge used by `src/main.ts`.

The first runtime is deterministic. It chooses the planning snapshot's top
candidate after motivation has scored affordances. Future LLM judgement can be
inserted later only as a bounded candidate-id chooser.

## Movement

Movement actions are validated like all other actions, then converted to a
short-lived movement intent:

- `move_forward`
- `move_backward`
- `move_left`
- `move_right`
- `move_toward`
- `jump`

The main loop still moves the avatar through Rapier physics. The runtime only
returns desired velocity/jump for `getMoveFrame`.

## Memory

Runtime memory uses the existing memory rules:

- retrieve only cued context
- never load all memory
- write only bounded memory candidates
- use cooldowns to avoid repetitive writes
- current senses override memory

Memory writes are telemetry/continuity, not action authority.

## Open Questions

- Should later runtime state persist current plan/target across reloads?
- Should model judgement choose among the top 3 candidates after deterministic
  scoring?
- Should the UI expose runtime traces per avatar?
- Should long-horizon GOAP live in this folder or in a separate planner module
  after the first runtime is stable?
