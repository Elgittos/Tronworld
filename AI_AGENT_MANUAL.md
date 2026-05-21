# Tron World AI Agent Manual

## Current Status

The old prompt/parser/manual-brain architecture is no longer trusted.

The current repo has AI avatar creation, AI connection UI, avatar chat, and LLM
client plumbing. The autonomous simulation behavior loop is not currently active:
`src/agents/AgentBrainGateway.ts` is a stub.

Before changing agent behavior, read:

- `WORLD_TRUTH_AGENT_RULES.md`
- `CHECKPOINT.md`
- `src/agents/README.md`
- the README files under `src/agents/*/`

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

The AI never mutates the world directly. It only proposes one action request.
The engine validates the action before anything changes.

That rule is still true, even though the live autonomous loop is currently
disabled.

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
model: "google/gemma-3-4b"
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

## Future Model Action Shape

The live gateway does not currently ask the model for simulation actions. A
future behavior loop should use a strict bounded shape, likely based on candidate
ids instead of invented free-form actions.

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

Current behavior: `Grid Witness` exists as an AI avatar, but autonomous movement
and decision-making are not active until the agent gateway is rebuilt.
