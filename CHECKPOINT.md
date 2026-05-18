# Tron World Protected Checkpoint

Protected baseline commit: `8bbc5f7`

Commit message: `Restore held right mouse steering`

This checkpoint is the current protected state of Tron World. Do not change its working behavior unless the requested task explicitly asks for that specific area.

Protected areas:

- Avatar eyes and current avatar-color glow behavior
- Current bloom/glow setup
- Right mouse held steering
- Camera movement and third-person feel
- Current grid/world visual baseline
- Building controls and right-click removal behavior
- Existing Tesla Node visuals and controls

Change protocol:

1. Check `git status` before editing.
2. Name the exact files to be edited before editing.
3. Edit only the requested area.
4. Review `git diff` before building or committing.
5. If unrelated protected behavior appears in the diff, revert that unrelated part before continuing.
6. Commit each accepted narrow change so there is a clear rollback point.

