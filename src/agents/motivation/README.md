# Motivation

Score candidate affordances using emergent pressure and utility.

This layer answers: why is one possible action more attractive than another right now?

Examples: Energy viability, future agency, body competence, curiosity,
familiarity, social connection, construction purpose, and continuity.

See `MOTIVATION_SYSTEM_PLAN.md` for the living design. Motivation should be
emergent from sensed pressure, memory, predicted affordance effects, and current
plans, not hardcoded action scripts.

`buildMotivationAppraisals.ts` creates non-executing motivation snapshots from
current senses, retrieved memory, and affordance candidates. It does not mutate
the world, invent actions, or bypass validators.
