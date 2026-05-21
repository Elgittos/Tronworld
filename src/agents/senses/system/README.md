# System

Engine-only facts that do not fit a normal human-like sense.

Examples:

- tick number
- internal ids
- loaded chunk signals
- exact engine flags
- debug telemetry
- action cooldowns
- selectable or removable status from engine rules

This category answers: "What does the simulation engine know that is useful but not human-like?"

## Files

- `buildSystemSnapshot.ts` builds engine/computational facts for an avatar.
- `types.ts` defines model, tick, debug, and control status facts.

This sense is intentionally not human-like. It is for engine truth, debug state,
and model connection status.
