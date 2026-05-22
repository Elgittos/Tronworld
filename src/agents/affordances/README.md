# Affordances

Generate possible things the agent could try from its current senses and memory.

This layer does not execute actions. It proposes candidates like move toward a Tesla Node, inspect a block, handshake, transfer Energy, build, scan, or wait.

Read `AFFORDANCE_SYSTEM_PLAN.md` before changing this layer.

Affordances must be emergent grounded opportunities, not hidden hardcoded
behavior scripts. They may expose possible `AgentAction` records, but motivation,
planning, validators, and runtime decide what happens later.
