# Energy

Power, recharge, danger fields, and Tesla Node context.

Examples:

- current Energy level
- low, stable, or full Energy state
- recharge field presence
- interference field presence
- nearest Tesla Node
- unfinished Tesla Node contribution progress
- current drain or recharge effect

This category answers: "What is happening to my power?"

## Files

- `buildEnergySnapshot.ts` combines the current body battery and nearby power environment into one sense snapshot.
- `types.ts` defines the energy sense facts.
- `describeEnergyState.ts` turns raw Energy values into normal language.
- `collectNearbyEnergySources.ts` reports Tesla Nodes, field state, direction, distance, and contribution progress.
- `assessEnergyDrain.ts` reports body drain, field drain, recharge, and net Energy change.
- `assessEnergySafety.ts` labels the current safety state without choosing a strategy.
- `estimateEnergyTime.ts` turns drain/recharge rates into natural time estimates.

This sense reports facts for the brain. It does not decide what the agent should do.
