# Vision

What the agent can see in the world.

Vision is a grounded snapshot layer. It reads the current world and reports
visible facts; it does not choose actions or decide what the agent should do.

## Files

- `types.ts`: shared vision snapshot types.
- `buildVisionSnapshot.ts`: main entry point for building a full vision snapshot.
- `collectVisibleAvatars.ts`: visible avatar facts.
- `collectVisibleBlocks.ts`: visible block facts.
- `collectVisibleTeslaNodes.ts`: visible Tesla Node facts.
- `collectVisibleOpenSpaces.ts`: nearby open floor positions.
- `collectVisibleEnvironment.ts`: black sky, open overhead, grid horizon, and broad view state.
- `classifyDirection.ts`: ahead, left, right, and behind classification.
- `lineOfSight.ts`: blocks and Tesla Nodes can occlude vision.
- `visualImportance.ts`: simple "what stands out" scoring.

## Categories

- Avatars: visible beings in the world.
- Blocks: normal built world geometry.
- Tesla Nodes: survival-relevant Energy structures.
- Open spaces: nearby floor positions that appear open.
- Environment: black sky, open overhead, distant digital grid horizon, and far structures on that horizon.
- Attention candidates: visible things sorted by importance.

This category answers: "What is in view around me?"

Vision is not radar. By default, opaque-enough blocks and Tesla Nodes reduce
vision behind them. The blocker itself remains visible, and nearby objects in
the same front cluster can still be noticed.
