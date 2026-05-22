# Tron World Motivation System Plan

This is the living plan for agent motivation. Update it whenever motivation
direction changes.

## North Star

Motivation is the agent's bounded appraisal layer.

It answers:

```txt
Why does one grounded affordance matter more than another for this embodied
being, in this world state, with this memory and this Energy situation?
```

It does not answer:

```txt
What action succeeded?
Can the model invent an action?
Can motivation mutate the world?
```

The world engine and validators remain authoritative.

## Research Synthesis

The local research report in `src/deep-research-report.md` points to the best
fit architecture for Tron World:

```txt
needs-based internal pressure
-> utility scoring over advertised affordances
-> planning / commitment
-> deterministic validator
```

This matches the systems already in this workspace:

- senses produce grounded current facts
- memory retrieves only relevant continuity, not full memory dumps
- affordances advertise what the body could try
- motivation scores why each affordance matters now
- planning organizes a compact intention frame
- validators and the action system own reality

The research is explicit that pure LLM control should not own the critical
control loop. LLMs can later help with reflection, dialogue, naming, or memory
curation, but concrete action choice must stay bounded by grounded candidates
and validation.

## Core Architecture

The motivation model is a deterministic utility field over candidate
affordances.

```txt
live senses
-> latent need estimates
-> global pressure field
-> candidate utility appraisal
-> sorted appraisals for planning/model context
```

The current implementation is `buildMotivationAppraisals.ts`.

It creates:

- `MotivationNeedState`
- `MotivationLatentState`
- `globalPressures`
- one `MotivationAppraisal` per affordance candidate
- compact debug and chat formatting

This is non-executing infrastructure. It does not start the autonomous runtime.

## Energy Is Different

Energy is the only vital stat in Tron World.

Energy is not treated like a normal emotional bar. It creates a sharp viability
pressure using a runway estimate:

```txt
runway =
  current Energy
  - reserve
  - estimated return cost to reachable Energy safety
```

Low runway creates sharply rising viability pressure. That pressure can make
Energy-improving candidates score higher, but it still does not hardcode a
specific action such as "always recharge." If the body is already in a recharge
field, recharge may appraise well. If not, moving toward a sensed or remembered
safe Node may appraise well. If the current field is interference, leaving the
field may appraise well. The action comes from affordances and validation, not a
hidden rule.

## Latent Secondary Needs

The research mentions focus, connection, curiosity, purpose, trust,
commitment, and frustration. In Tron World these must not become fake vital
bars.

They are latent pressure estimates recomputed from the current slice:

- `focus`: plan coherence, recent failure load, body stability, attention
- `connection`: nearby avatars, avatars needing Energy, social memory
- `curiosity`: visible novelty, distant structures, open spaces, memory novelty
- `purpose`: build/Energy-infrastructure opportunities and current goal context
- `commitment`: current goal, intended next step, accepted progress, low failure
- `frustration`: rejected/failed actions, recent failure, failure memories
- `trust`: avatar memories, help/rescue/handshake/failure cues

These values are not persisted as hidden needs. Future runtime may persist some
working-memory state, but the current motivation layer derives them from
senses, memory, affordances, and feedback.

## Pressure Fields

Motivation appraises candidates through eight pressure channels already shared
with affordances and planning:

- `viability`: Energy runway, recharge/interference, shutdown risk
- `agency`: reachable options, open directions, future control
- `competence`: body stability, failure load, confidence
- `curiosity`: novelty and information gain
- `familiarity`: trusted places/routes/skills when uncertainty or risk matters
- `social`: nearby beings, rescue/support opportunities, remembered relations
- `construction`: useful structures and Energy infrastructure
- `continuity`: current goal, intended next step, commitment

Every pressure is computed from current evidence. No pressure directly chooses
an action.

## Candidate Utility

Each `AffordanceCandidate` already carries predicted effects:

```txt
viability, agency, competence, curiosity, familiarity,
social, construction, continuity, risk, Energy delta
```

Motivation combines those effects with the global pressure field:

```txt
candidate utility =
  feasibility
  * safety
  * (
      need utility
      + Energy term
      + memory influence
      + commitment bonus
      + novelty bonus
      + trust/social prior
    )
  - repeat penalty
  - proximity penalty
  - risk penalty
  - veto penalty
```

The important design choice is that the score is not based on action names. It
is based on predicted consequences, sensed pressure, memory support, and
validation risk.

Actions have marginal utility. If a candidate only says "move toward this
target" and the body is already close to that target, motivation applies a
general proximity penalty. If the body is already safe inside a recharge field,
full or effectively full, recharge and same-field Energy-target movement lose
value. This is not a Tesla Node script. It is satiation: an action that no
longer changes the state should stop dominating the next decision.

Repeated accepted passive actions also receive a small habituation penalty
unless Energy pressure is active. This keeps wait, recalibrate, recharge, scan,
and handshake from becoming a loop when the action is no longer resolving a
live pressure.

## Memory Influence

Memory acts as priors, not commands.

Examples:

- familiar safe Node memory can improve familiarity and viability appraisal
- repeated failure memory can reduce competence or raise repeat penalty
- skill memory can improve competence
- avatar help/rescue/handshake memory can affect trust and social pressure
- interference memory can add risk

Current senses override memory. A memory-only target receives lower feasibility
and can be softly vetoed when Energy safety is low.

## Hysteresis And Commitment

The research strongly recommends avoiding thrashing. Tron World motivation does
this before runtime exists by giving continuity/commitment credit to candidates
that overlap with:

- current goal
- intended next step
- recent accepted action
- optional current plan candidate
- supporting memory

Failure and critical Energy lower commitment. This lets planning later keep a
coherent intention unless a stronger pressure interrupts it.

## Safety And Vetoes

Motivation can attach vetoes, but it does not execute them.

Current veto examples:

- hard veto: body is shutdown
- soft veto: Energy runway is very low and a candidate spends Energy without
  moving closer to Energy
- soft veto: remembered target only while safety margin is low

These vetoes reduce utility and explain risk. They do not replace the engine
validator.

## Qwen 14B Budget

The motivation layer must compress, not expand, context.

Rules:

- appraise structured affordances in code
- send only compact top-level motivation summaries to chat/planning
- expose full details only through `debug motivation`
- do not dump all memory
- do not ask the model to compute raw utility from long text
- use candidate ids so a future model can choose among validated options

## Current Implementation

Files:

- `types.ts`
- `buildMotivationAppraisals.ts`

Chat/debug wiring:

- `debug motivation`
- `raw motivation`
- `show motivation`
- `motivation debug`

Planning now receives `motivation.appraisals` in the non-runtime chat-time
path. This is still not autonomous execution.

## Relation To Affordances

Affordances answer:

```txt
What could this body try?
```

Motivation answers:

```txt
Why would trying this matter now?
```

Motivation must never invent candidates. It only appraises the affordances it
receives.

## Relation To Planning

Planning answers:

```txt
What compact intention should carry forward?
```

Motivation should feed planning with appraisals, reasons, risks, tensions, and
vetoes. Planning can then preserve commitment or switch intention when pressures
justify it.

## Future Work

Do not start runtime until the cognition layers are inspectable.

Next motivation-focused steps:

1. Add tests for pressure curves and candidate scoring.
2. Add a tiny debug UI panel for top pressures and top candidate ids.
3. Add optional persisted working-memory state only after runtime design is
   agreed: current intention, current target, recent failures, commitment.
4. Add model-assisted reflection only for summaries and memory curation, not
   direct action authority.
5. Later compare ablations: no memory, no commitment, no social/trust, and
   no motivation appraisal.
