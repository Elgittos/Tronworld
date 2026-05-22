# Agent Guardrails

This file is the short guardrail document for Tron World agent behavior.

Important status: the previous "world truth" roadmap is out of date. The agent
engine was scrambled/disabled because the old version was not working right.
Treat this file as current prohibitions and direction, not as proof that the full
science-based engine already exists.

If this file conflicts with an implementation idea, preserve the do-not rules
unless the user explicitly changes them.

## Current Source Documents

Before changing agent behavior, read:

- `CHECKPOINT.md`
- `AI_AGENT_MANUAL.md`
- `src/agents/README.md`
- the README files under `src/agents/*/`
- the living plan files under `src/agents/*/*_SYSTEM_PLAN.md`

The older science-engine docs referenced in previous versions are not currently
present in this checkout. Do not block on missing docs; use the guardrails here
and the current code state.

## Current Truths

1. The world engine is authoritative.
2. Energy is the only vital stat.
3. Agents must request actions through validators and the action system.
4. The LLM must not directly mutate world state.
5. The LLM must not invent actions, blocks, Tesla Nodes, success, or world facts.
6. Protected camera/input behavior must not be changed during agent work.
7. Agent cognition must be emergent from senses, memory, affordances,
   motivation, planning, validation, and outcomes; do not hide scripted behavior
   behind agent language.

## Do Nots

These are still true:

- Do not add hidden scripted brains and call them AI.
- Do not hardcode behavior policies such as "if low Energy, always recharge";
  generate grounded affordances and let motivation/planning appraise them.
- Do not build prompt-only personality vibes as the behavior engine.
- Do not add fake motivator HUD bars as if they are real cognition.
- Do not bypass validators or let prompts replace validation.
- Do not let the LLM teleport, mutate world state, or decide that an action succeeded.
- Do not change right-click steering, pointer behavior, camera feel, or build controls during agent work.
- Do not hide fallback behavior from the log once fallback behavior exists.
- Do not recreate focus, connection, curiosity, or purpose as draining survival bars.

## Preferred Direction

Future agent work should move toward:

- Candidate actions: generate possible actions before asking an LLM.
- Emergent affordances: expose grounded opportunities from senses and memory,
  not scripts that decide the agent's behavior.
- Validation: filter impossible or illegal candidates before execution.
- Utility scoring: normalize and score possible actions on a common scale.
- Empowerment: prefer states with more safe future control and reachable options.
- Curiosity: prefer real novelty and information gain, not random wandering.
- Memory/planning: use evidence, outcomes, and short-term plans, not vibes.
- Bounded LLMs: use language models for judgement among valid options, not world authority.

This is a target direction, not a statement that the current implementation is
complete.

## Draft Engine Shape

```txt
observe world
write memory
select mode bucket
generate candidates
validate candidates
predict outcomes
score candidates
shortlist valid candidates
retrieve relevant memory and plan context
ask LLM to choose one candidate id
parse strict JSON
revalidate chosen candidate
execute or deterministic fallback
record outcome and telemetry
```

This shape may be revised before implementation. The do-not rules above are the
stable part.

## Current Implementation Status

`src/agents/AgentBrainGateway.ts` now adapts the embodied runtime in
`src/agents/avatar_runtime/`.

The first runtime loop is active infrastructure: it builds senses, retrieves
cued memory, generates affordances, scores motivation, builds a planning
snapshot, validates a selected candidate, applies non-movement actions through
the action system, and exposes movement intents to physics.

This is still bounded deterministic runtime work, not unrestricted LLM control.
Models must not invent actions or decide outcomes.

## Next Safe Step

The next safe implementation step is to inspect and tune runtime telemetry,
candidate scoring, and memory write behavior before adding any LLM candidate-id
chooser or long-horizon GOAP.
