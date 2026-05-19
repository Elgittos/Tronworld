# Tron World AI Agent Manual

## Start The World

From the project root:

```bash
npm run dev
```

Vite starts the world on `http://127.0.0.1:5173/` by default. If that port is busy, it automatically picks the next available local port and prints it in the terminal.

## Current Agent Flow

Tron World keeps the world engine as the source of truth.

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

The AI never mutates the world directly. It only proposes one JSON action. The engine validates the action before anything changes.

## LM Studio Setup

1. Open LM Studio.
2. Load a local chat model.
3. Start the local server.
4. Use the OpenAI-compatible server endpoint:

```txt
http://localhost:1234/v1
```

The app sends requests to:

```txt
http://localhost:1234/v1/chat/completions
```

## Default AI Config

The default config is:

```ts
provider: "openai-compatible"
baseUrl: "http://localhost:1234/v1"
model: "local-model"
apiKey: "not-needed"
```

Set your LM Studio model name in browser devtools if needed:

```js
localStorage.setItem("tron-world:llm-provider", "openai-compatible");
localStorage.setItem("tron-world:llm-base-url", "http://localhost:1234/v1");
localStorage.setItem("tron-world:llm-model", "your-loaded-model-name");
localStorage.setItem("tron-world:llm-api-key", "not-needed");
```

Then refresh the page.

For scripted fallback/testing:

```js
localStorage.setItem("tron-world:llm-provider", "scripted");
```

## What The Model Must Return

The model should return only JSON:

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

If the model fails, times out, or returns invalid JSON, Tron World falls back safely. The simulation should not crash.

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
- Rejected actions are logged and shown to the next agent prompt.

## First AI Agent

When a human enters the world, the app spawns one AI agent named `Grid Witness`.

If LM Studio is running and configured, `Grid Witness` uses the OpenAI-compatible brain. If the model is unavailable, it falls back to a safe scripted action.

