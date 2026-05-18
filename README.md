# Tron World

Tron World is an AI-powered MVP foundation for a dynamic, chunk-generated digital world inspired by TRON-style identity, agents, Energy, and buildable grid architecture.

The first build uses Vite, TypeScript, Three.js, and Rapier 3D. Human input already routes through a validated action system so later AI agents can submit the same kind of actions without directly mutating world state.

## Current Build

- Dynamic chunk-generated Tron grid world around avatars.
- Manual avatar creation with tint color and personality weights.
- Third-person, avatar POV, and free camera modes.
- Continuous WASD avatar movement with Energy drain and Rapier collision.
- Grid-snapped block building with ghost validation.
- Starting Tesla Node recharge field and partial Tesla Node construction.
- Energy, recharge, shutdown-ready avatar visuals, and Tesla interference rules.
- Placeholder `src/llm/` area for future LM Studio integration.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
