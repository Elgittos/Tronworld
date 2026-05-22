# Runtime

Orchestrate the agent loop.

Expected flow: senses -> memory -> affordances -> motivation -> planning -> validated action request -> outcome -> memory update.

The runtime can call `src/actions`, but world changes still go through the action system.

Current implementation lives in `src/agents/avatar_runtime/` because it is the
runtime for embodied avatar agents specifically. `AgentBrainGateway` adapts that
runtime to the world loop.
