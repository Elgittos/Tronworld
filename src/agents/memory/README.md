# Memory

Store agent experience over time.

This is not the UI chat log. Agent memory is for known Tesla Nodes, known agents, seen structures, recent actions, recent failures, useful discoveries, and important events.

For the focused living architecture plan, see `MEMORY_SYSTEM_PLAN.md`. Update
that plan whenever the memory direction changes.

## Current Target

The memory system is being shaped for the current Qwen 14B class local model and
larger frontier models. The default `balanced` profile should be treated as the
Qwen 14B baseline: enough context to preserve continuity without dumping long
documents into every prompt. The `frontier` profile can retrieve more material,
but it follows the same lifecycle rules.

The old idea of separate tiny/medium/large cognitive modes should not become
three different brains. Profiles are only context budgets. The memory model is
one system with clear tiers.

## Memory Tiers

- `core`: `core.md`, plus `identity.json` metadata.
  `core.md` is the single always-loaded truth memory file. Core identity is
  protected and should not be automatically rewritten, deleted, or archived.

- `active`: `events.md`, `places.md`, `avatars.md`, `energy.md`, `failures.md`,
  `skills.md`, and optional self records.
  These are the cue-addressable long-term memories. Entries carry `importance`
  and `impact` (`high`, `medium`, or `low`). Repeated experience reinforces
  familiarity/confidence instead of duplicating. When an active file grows too
  large, lower-retention raw details leave active recall only after useful
  patterns are preserved.

- `archive`: `archive.md`.
  Cold memory for deeper search. It is not part of normal recall. Memory cues can
  request archive search for critical/deeper continuity later.

## Cue Flow

Senses do not directly load every memory. They produce current facts. The
`memory_cues` sense turns those facts into targeted retrieval requests, such as:

- low Energy -> `energy.md` and `places.md`
- nearby known avatar -> `avatars.md` and `events.md`
- blocked movement or failed action -> `failures.md` and `skills.md`
- identity question -> `identity.json` and `core.md`

Current senses remain authoritative. If memory says something used to exist but
current perception does not show it, the agent should treat it as remembered,
not presently perceived.

## Curation Contract

Core memories are protected. Active memories are maintained by rank:

- protected entries stay in active memory
- high-impact entries are retained before medium-impact entries
- medium-impact entries are retained before low-impact entries
- low-impact memories are the first to move to archive when active memory grows

Future agent curation should improve summaries and confidence, not turn memory
files into unbounded transcripts.
