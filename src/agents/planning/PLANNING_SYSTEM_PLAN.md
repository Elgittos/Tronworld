# Tron World Planning System Plan

This is the living plan for agent planning. Update it whenever the planning
direction changes.

## North Star

Planning is the layer that turns sensed possibilities into a short, inspectable
line of intention.

It answers:

```txt
Given what this body senses, remembers, can try, and currently values, what is
the next coherent step?
```

It does not answer:

```txt
Did the action succeed?
Can the agent bypass validation?
Can the model invent a new action?
```

The world engine remains authoritative.

## Emergent Rule

Planning must not be a hidden script.

Bad:

```txt
if Energy is low, plan recharge
if an avatar is near, plan handshake
if blocked, plan jump
```

Good:

```txt
Senses expose pressure.
Affordances expose grounded possible actions.
Motivation scores why each possibility matters.
Planning chooses a compact intention from the scored, bounded candidates.
Validation still decides whether the chosen action can execute.
Outcome feeds memory and later plan revision.
```

The planner may use weights, interruptions, and continuity pressure, but those
must operate over grounded candidate effects rather than over hardcoded action
commands.

When motivation appraisals are available, planning treats the motivation total
as the primary score. Contextual pressure fit from the appraisal may support
the score, but raw affordance pressure is kept for explanation and fallback
only, so a candidate does not get double credit just because its predicted
effects look attractive before the real need pressure is considered.

Passive baseline candidates such as ordinary wait/recalibrate must stay weak.
They are safety valves and introspection options, not default behavior. Stronger
wait/recalibrate candidates can still come from touch, action feedback, or real
constraints when the body has a reason to pause.

## Inputs

Current planning inputs:

- `awareness`: identity, body state, current goal, recent decision, next step
- `vision`: visible objects, open spaces, horizon structures, novelty
- `space`: movement capability, blocked directions, local area type
- `energy`: Energy state, recharge/interference fields, source reachability
- `social`: nearby avatars, shutdown avatars, reachable interactions
- `touch`: grounded/airborne/contact state
- `action_feedback`: accepted/rejected/failed outcome context
- `attention`: current high-pressure focus
- `system`: engine tick and current engine message
- `memory`: retrieved core and cued active memories
- `affordances`: bounded candidate actions produced from senses and memory
- `motivation`: utility appraisals over the same affordance ids

Current senses override memory. Memory can support continuity, familiarity, and
confidence, but it cannot assert that a plan will work.

## Outputs

Planning outputs a compact `PlanningSnapshot`:

- current plan mode
- pressure context
- interruptions that could break continuity
- constraints and assumptions
- chosen plan candidate
- a small alternative set
- no world mutation
- no execution

Each `PlanCandidate` points back to one `AffordanceCandidate` and carries:

- candidate id and action
- objective
- horizon
- mode
- score parts
- evidence
- risks
- validation need
- memory role
- reason it was or was not selected

## Planning Modes

Modes are labels over pressures, not scripts:

- `recover`: regain viability or stability
- `stabilize`: reduce uncertainty, failure, or body instability
- `explore`: learn from novelty, open space, horizon, or unknown structure
- `connect`: respond to social opportunity or another avatar's state
- `build`: extend useful structure or Energy infrastructure
- `continue`: preserve a coherent current intention
- `observe`: wait, scan, or recalibrate when action confidence is low

A mode describes the shape of intention. It does not force a particular action.

## Continuity And Interruptions

Planning should preserve continuity unless a stronger pressure interrupts it.

Continuity sources:

- current goal
- intended next step
- recent accepted action
- retrieved memories supporting the same target or action family
- affordances with strong continuity/familiarity effects

Interruption sources:

- critical Energy state
- interference field
- shutdown or airborne body state
- nearby avatar needing Energy
- repeated rejection/failure
- newly visible important structure or unfamiliar Energy source

Interruptions raise pressure. They do not directly choose the action.

## Qwen 14B Budget

Planning must stay compact enough for a Qwen 14B class model:

- keep at most 6 plan candidates in chat context
- include one chosen candidate and 2 alternatives by default
- summarize evidence instead of dumping all affordance data
- use candidate ids so a later runtime prompt can choose by id
- never include full memory files

## Current Implementation

- `types.ts` defines planning records.
- `buildPlanningSnapshot.ts` builds a non-executing plan frame from senses,
  memory, affordances, and motivation appraisals.
- Chat-time planning is exposed through `debug planning` and compact prompt
  context.

This is still infrastructure. The autonomous runtime is not enabled by this
planner. Future runtime work must validate a chosen candidate before applying
any action.

## Future Runtime Flow

```txt
senses
-> memory cues and retrieval
-> affordance candidates
-> motivation appraisals
-> planning snapshot
-> bounded model chooses candidate id or accepts planner candidate
-> validator checks chosen action
-> action system applies or rejects
-> action feedback
-> memory candidate and curation
-> next planning snapshot
```

## Open Questions

- Should active plan state be persisted per avatar or rebuilt every tick until
  the autonomous loop exists?
- Should plan commitments live in world snapshot, runtime memory, or both?
- How many failed attempts break continuity for Qwen 14B baseline?
- Should a later model planner rewrite objectives, or only choose among plan
  candidates produced by code?
- What debug UI should show plan continuity, interruption, and selected
  candidate lineage?
