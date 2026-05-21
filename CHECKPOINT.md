# Tron World UI And Controls Checkpoint

Protected baseline commit: `8bbc5f7`

Commit message: `Restore held right mouse steering`

This checkpoint is only for the protected world UI, camera, controls, visuals,
and interaction feel. It is not an avatar AI or agent-engine doctrine file.

Do not change the protected behavior below unless the requested task explicitly
asks for that specific area.

## Protected Areas

- Avatar eyes and current avatar-color glow behavior
- Current bloom/glow setup
- Right mouse held steering
- Right mouse held turn/look feel, including the user's expectation that holding right mouse stays "locked in" for steering
- Camera movement and third-person feel
- Current grid/world visual baseline
- Building controls and right-click removal behavior
- Existing Tesla Node visuals and controls

## Critical Control Rule

- Do not remove, weaken, or silently replace right-mouse held steering/turn behavior while working on any UI, tooltip, camera, pointer, menu, or input task.
- The browser Esc tooltip is tied to native Pointer Lock. If asked to remove or change that tooltip, first preserve the intended right-mouse steering feel and state the tradeoff before editing.
- Do not swap true locked-turn behavior for pointer-capture behavior as an incidental patch. That changes the feel and is a protected behavior change.
- Any edit to `src/controls/inputController.ts` must be treated as high-risk because it controls movement, camera feel, build clicks, and right-click removal.

## Change Protocol

1. Check `git status` before editing.
2. Name the exact files to be edited before editing.
3. Edit only the requested area.
4. Review `git diff` before building or committing.
5. If unrelated protected behavior appears in the diff, revert that unrelated part before continuing.
6. Commit each accepted narrow change so there is a clear rollback point.
