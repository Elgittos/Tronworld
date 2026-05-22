# Tron World AI Agent Manual

## Current Status

The old prompt/parser/manual-brain architecture is no longer trusted.

The current repo has AI avatar creation, AI connection UI, avatar chat, LLM
client plumbing, and an initial embodied avatar runtime.

`src/agents/AgentBrainGateway.ts` adapts `src/agents/avatar_runtime/` into the
world loop. The runtime is deterministic and bounded: it builds senses, retrieves
cued memory, generates affordances, scores motivation, builds planning context,
validates a selected candidate, applies non-movement actions through the action
system, and exposes movement intents for physics.

This is not unrestricted LLM control. Models still cannot invent actions,
mutate world state, or decide action outcomes.

Before changing agent behavior, read:

- `WORLD_TRUTH_AGENT_RULES.md`
- `CHECKPOINT.md`
- `src/agents/README.md`
- the README files under `src/agents/*/`
- the living plan files under `src/agents/*/*_SYSTEM_PLAN.md`

The old science-engine docs referenced earlier are not present in this checkout.
The do-not rules in `WORLD_TRUTH_AGENT_RULES.md` still apply.

## Start The World

From the project root:

```bash
npm run dev
```

Vite starts the world on `http://127.0.0.1:5173/` by default. If that port is
busy, it automatically picks the next available local port and prints it in the
terminal.

## Historical Agent Flow

This section describes the older design shape and is kept only as historical
context. Do not recreate it blindly.

```txt
World State
-> Observation Builder
-> Prompt Builder
-> Agent Brain Gateway
-> Model Adapter
-> JSON Action Parser
-> Action Validator
-> World Engine Applies Or Rejects
-> Event Log
```

The AI never mutates the world directly. Runtime-selected actions still pass
through validators before anything changes.

That rule is still true.

## LM Studio Setup

1. Open LM Studio.
2. Load a local chat model.
3. Start the local server.
4. Use the in-app AI Connection menu.

The app can talk to LM Studio through the Vite proxy:

```txt
/lmstudio
```

It can also use LM Studio's OpenAI-compatible endpoint through:

```txt
/lmstudio/v1
```

The local LM Studio server is expected at:

```txt
http://127.0.0.1:1234
```

## Default AI Config

The current default config in code is:

```ts
provider: "lmstudio-rest"
baseUrl: "/lmstudio"
model: "qwen/qwen3-14b"
apiKey: "not-needed"
```

Set your LM Studio model name in browser devtools if needed:

```js
localStorage.setItem("tron-world:llm-provider", "lmstudio-rest");
localStorage.setItem("tron-world:llm-base-url", "/lmstudio");
localStorage.setItem("tron-world:llm-model", "your-loaded-model-name");
localStorage.setItem("tron-world:llm-api-key", "not-needed");
```

Then refresh the page.

Scripted fallback is not part of the target architecture. Deterministic fallback
is allowed only when it is explicit, validated, and logged.

Agent behavior must be emergent from grounded senses, curated memory,
affordances, motivation, planning, validation, and outcomes. Do not implement
hidden hardcoded policies such as "if low Energy, always recharge" and call that
AI.

## Future Model Action Shape

The live gateway does not currently ask the model for simulation actions. The
current runtime selects from deterministic planning candidates. A future model
layer should use a strict bounded shape based on candidate ids instead of
invented free-form actions.

Older example JSON:

```json
{
  "action": "move_toward",
  "parameters": {
    "target": { "x": 0, "y": 0, "z": 0 }
  },
  "shortReason": "Energy is low, so I am moving toward the Tesla Node.",
  "attentionTarget": {
    "type": "tesla_node",
    "id": "tesla_starting_node"
  }
}
```

If the model fails, times out, or returns invalid JSON, Tron World must fall back
safely. The simulation should not crash.

## Supported Actions

```txt
move_forward
move_backward
move_left
move_right
jump
move_toward
place_block
remove_block
scan
handshake
recalibrate
recharge
transfer_energy
build_tesla_node
wait
```

## Engine Rules

- Energy is the only vital value.
- The AI cannot control camera modes or free camera.
- The AI cannot teleport.
- The AI cannot invent actions.
- The AI cannot invent blocks or Tesla Nodes.
- The AI cannot decide that an action succeeded.
- The engine validates all actions.
- Rejected actions should be logged once the autonomous behavior loop exists.

## First AI Agent

When a human enters the world, the app spawns one AI agent named `Grid Witness`.

Current behavior: `Grid Witness` exists as an AI avatar and can be driven by the
bounded avatar runtime when spawned/assigned as an AI agent.
