# Space

How the nearby physical area is shaped.

Examples:

- open directions
- blocked directions
- nearby buildable positions
- reachable spots
- obstacle density
- distance to practical targets

This category answers: "Where can I go, and what blocks me?"

## Files

- `types.ts`: shared spatial awareness types.
- `buildSpatialAwarenessSnapshot.ts`: main entry point.
- `directionVectors.ts`: forward, backward, left, and right vectors from the body's facing direction.
- `collectNearbyObstacles.ts`: nearby physical blockers using edges and footprints.
- `collectWalkableDirections.ts`: clear, close obstacle, or blocked for each movement direction.
- `classifyLocalArea.ts`: open area, corridor, corner, near wall, or blocked pocket.
- `assessMovementCapability.ts`: grounded/shutdown movement basics.
- `assessJumpClearance.ts`: whether one jump can clear nearby obstacles.

Spatial awareness uses physical edges and footprints as truth. It should not
count from hidden object centers.
