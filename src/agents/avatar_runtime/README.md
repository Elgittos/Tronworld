# Avatar Runtime

Bind the agent cognition stack to validated world action.

Read `AVATAR_RUNTIME_SYSTEM_PLAN.md` before changing this layer.

This runtime orchestrates senses, memory retrieval, affordances, motivation,
planning, validation, movement intents, action application, telemetry, and
bounded memory writes.

It must not bypass validators, mutate world state directly, or touch protected
camera/input/rendering behavior.
