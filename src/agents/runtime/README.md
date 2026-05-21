# Runtime

Orchestrate the agent loop.

Expected flow: senses -> memory -> affordances -> motivation -> planning -> validated action request -> outcome -> memory update.

The runtime can call `src/actions`, but world changes still go through the action system.

