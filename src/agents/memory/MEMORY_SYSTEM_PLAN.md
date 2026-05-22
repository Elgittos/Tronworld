# Tron World Memory System Plan

This is the living plan for agent memory. Update this file whenever the memory
direction changes so the architecture does not drift across sessions.

## North Star

Tron World agents are embodied digital beings. Memory should help them live in
the world with continuity without turning every perception into permanent noise.

The system should support Qwen 14B class local models as the baseline and scale
up to frontier models through larger budgets, not through different brains.

This memory system should fit the world that exists now: a continuous grid body
with Energy as the only vital value, Tesla Nodes as survival infrastructure,
buildable geometry, visible/touchable obstacles, avatar encounters, validated
actions, and action feedback.

## Values

- Grounded: memories come from senses, validated actions, and world events.
- Curated: memory is summarized, ranked, merged, or archived instead of logged
  raw.
- Embodied: repetition builds familiarity, habit, place sense, and confidence.
  Repeated experience is not automatically clutter.
- Protected: core identity and continuity are not automatically deleted,
  archived, or casually rewritten.
- Bounded: prompts should stay small enough for Qwen 14B to reason clearly.
- Revisable: non-core memories can gain confidence, lose relevance, merge, or
  move to archive.
- Engine-safe: memory never mutates world state and never decides an action
  succeeded. The world/action systems remain authoritative.

## Memory Tiers

### Core Memory

Files:

- `identity.json`
- `core.md`

Purpose:

- identity
- origin and continuity
- stable facts about being a digital being in Tron World
- protected self-truth

Rules:

- `core.md` is the single always-loaded truth memory file
- `identity.json` is metadata used for continuity, not a full memory document
- protected from automatic archive/delete
- changed only by an explicit guarded core update path, not normal curation
- kept compact

### Active Lived Memory

Files:

- `events.md`
- `places.md`
- `avatars.md`
- `energy.md`
- `failures.md`
- `skills.md`
- `self.md` may exist for local self records, but normal prompt truth should
  come from `core.md` plus identity metadata

Purpose:

- cue-addressable long-term memory from lived world experience
- memories of places, avatars, actions, failures, discoveries, Energy lessons,
  social encounters, and important events

Rules:

- not loaded wholesale
- retrieved by memory cues from current senses
- entries carry rank and lifecycle metadata
- repeated similar memories should reinforce familiarity, confidence, and habit
  instead of duplicating
- lower-retention raw details leave active memory first only after their useful
  pattern has been absorbed into active memory

### Archive Memory

File for now:

- `archive.md`

Purpose:

- cold storage for raw old episodes, superseded details, and less useful
  specifics
- deeper search later when a cue asks for older continuity

Rules:

- not part of normal recall
- do not archive merely because something repeated often
- repeated experience should first update an active familiarity/pattern memory
- archive the raw/specific episode trail after the useful pattern is preserved
- future direction may replace or supplement this with SQLite FTS search over
  episodes

## Memory Categories

Every active memory should belong to one primary category:

- `place`: locations, structures, landmarks, paths
- `avatar`: other beings, social encounters, relationships
- `action`: successful actions and useful outcomes
- `failure`: failed attempts, blocked movement, rejected actions
- `energy`: Tesla Nodes, recharge fields, interference, survival lessons
- `skill`: reusable procedure or learned tactic
- `important_event`: consequential discoveries, changes, rescues, firsts, major
  world events
- `familiarity`: repeated known places, routes, objects, fields, body contacts,
  or situations that become ordinary but useful

Important events can live in `events.md` with `category="important_event"` and
high impact. Do not create a separate file unless events become too dense.

## Memory Entry Shape

Target metadata for each memory block:

```txt
id
category
impact: high | medium | low
importance: 0.0 - 1.0
novelty: 0.0 - 1.0
confidence: 0.0 - 1.0
repeatCount
familiarity: 0.0 - 1.0
createdAt
lastSeenAt
lastConfirmedAt
lastRecalledAt
source
tags
protected
summary text
```

Current backend support includes category, merge key, novelty, repeat count,
familiarity, impact, importance, confidence, and protected flags.

## Ranking Model

Memory retention should balance importance, novelty, repetition, consequence,
familiarity, usefulness, recency, and staleness.

Conceptual score:

```txt
memoryStrength =
  importance
  + noveltyBoost
  + repetitionBoost
  + familiarityBoost
  + consequenceBoost
  + usefulnessBoost
  + recencyBoost
  - stalenessPenalty
  - noisePenalty
```

Guidelines:

- new discoveries rank higher because novelty matters
- repeated failures become stronger if unresolved
- repeated successful tactics become stronger and may become skills
- repeated ordinary facts become familiarity: "I know this place/object/route"
- repeated boring actions should not be archived just because they are boring;
  they should either strengthen a familiar pattern or be ignored as raw noise
- important events rank high even if they happen once
- old, low-impact, unrepeated raw episodes are archived first
- old repeated raw episodes can be archived only after an active pattern remains

## World-Fitted Memory Model

The current world suggests five active memory surfaces rather than a generic
note pile:

1. `identity`: who I am and when this continuity began.
2. `place familiarity`: where I have been, where power is, what paths/obstacles
   feel familiar, and what has changed.
3. `body skill`: what my grid body can do, including movement, jumping,
   building, scanning, recharging, transferring Energy, and failure patterns.
4. `social memory`: who other avatars are, whether they were helped, reachable,
   shutdown, familiar, or associated with important events.
5. `event marks`: singular consequential moments, firsts, discoveries, rescues,
   completions, dangers, and world changes.

Archive is not a sixth active mind surface. It is cold evidence behind these
surfaces.

## Data Flow

Current and target flow:

```txt
world state
-> senses
-> attention
-> memory cues
-> retrieve relevant core/active/archive memory
-> prompt context for chat or future agent loop
```

Memory write flow to build next:

```txt
world state
-> senses
-> action feedback / world event
-> memory candidate builder
-> bounded memory writer / future model curator
-> validated memory write
-> active memory update
-> consolidation/archive when needed
```

Future autonomous loop:

```txt
sense world
retrieve cued memory
generate valid action candidates
score motives/utility
choose action
execute through validators
observe outcome
build memory candidates
curate memory
write/merge/archive memory
```

## Code vs Model Responsibilities

Code should handle:

- senses and grounded facts
- candidate extraction from deterministic signals
- file routing and memory caps
- protected core rules
- merge keys and deduplication checks
- archive/consolidation mechanics
- schema validation
- action/world authority

The model/curator should handle:

- whether an experience is worth remembering
- summary wording
- category selection when ambiguous
- impact/importance/novelty estimates
- whether repeated events change the lesson
- whether an active memory should become a skill

The main agent should not freely edit memory files. It should propose bounded
memory operations that code validates.

## Memory Candidate Builder

This is now the bridge between senses and memory.

Inputs:

- awareness
- vision
- space
- energy
- social
- touch
- action feedback
- attention
- system snapshot
- recent retrieved memories

Outputs:

- candidate category
- source sense(s)
- proposed file
- raw grounded facts
- suggested tags
- possible merge key
- default importance/novelty hints

Example candidates:

- new structure seen near a Tesla Node -> `place`
- avatar encountered or revived -> `avatar` or `important_event`
- repeated rejected movement -> `failure`
- safe recharge location discovered -> `energy` and `place`
- repeated successful workaround -> `skill`
- familiar starting Node seen again -> reinforce `familiarity`, not a new event
- walking the same safe route repeatedly -> strengthen place/route familiarity
- touching the same obstacle repeatedly -> strengthen body/place familiarity

Current implementation:

- `buildMemoryCandidates.ts` creates bounded candidates from energy, social,
  action feedback, space, touch, and vision.
- Chat-time sensing writes at most a few candidates after memory retrieval.
- Cooldowns prevent repeated chats from hammering the same memory every time.
- Backend `mergeKey` handling reinforces existing memories instead of duplicating
  them.

## Memory Curator

The current curator is deterministic and bounded. A future model curator should
be an optional judgement step, suitable for Qwen 14B, inserted between candidate
building and validated memory writes.

It receives a small packet:

- one or a few memory candidates
- current relevant memories
- caps and rules
- allowed operations

Allowed operations:

- `ignore`
- `write_new`
- `merge_update`
- `reinforce`
- `archive`
- `promote_to_skill`
- `request_core_update`

Core update requests should not apply automatically.

Expected structured output:

```json
{
  "operation": "write_new",
  "file": "places.md",
  "category": "place",
  "impact": "medium",
  "importance": 0.62,
  "novelty": 0.74,
  "confidence": 0.8,
  "mergeKey": "place:tesla_starting_node",
  "tags": ["place", "tesla_node", "energy"],
  "summary": "The starting Tesla Node is at the center of the grid and provides safe recharge."
}
```

## Current Caps

Current backend profile caps:

```txt
balanced / Qwen 14B baseline:
coreChars: 3200
retrievedChars: 4200
maxEntries: 10
entryChars: 320
activeFileChars: 24000
archiveSearchChars: 2800

frontier:
coreChars: 6000
retrievedChars: 10000
maxEntries: 24
entryChars: 500
activeFileChars: 48000
archiveSearchChars: 8000
```

Hermes uses much smaller always-loaded durable memory caps. Tron World can keep
active files larger because they are cue-retrieved, but always-loaded core
memory should stay compact.

## Open Questions

- Should `important_event` remain a category in `events.md`, or become
  `important_events.md` later?
- Should archive remain Markdown, move to SQLite FTS, or use both?
- How often should curation run: every action, every meaningful event, periodic
  batches, or before sleep/shutdown?
- Should repeated memories decay if they become obsolete?
- What UI/debug view should show what the agent remembered and why?

## Near-Term Implementation Order

1. Define `MemoryCandidate` types.
2. Build deterministic memory candidates from existing senses/action feedback.
3. Add curator prompt and strict JSON output shape.
4. Add backend memory merge/reinforce operations.
5. Add category, novelty, repeat count, and last-seen metadata.
6. Add debug logging for candidate -> curator -> memory write.
7. Wire curation into chat-time testing first.
8. Later wire curation into the autonomous agent loop.
