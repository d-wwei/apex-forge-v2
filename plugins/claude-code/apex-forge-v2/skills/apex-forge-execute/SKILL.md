---
name: apex-forge-execute
description: Use when an Apex Forge run has ready implementation or test actions and the current Codex session should execute them in Interactive Mode with governed patch capture.
---

# Apex Forge Execute

## Interactive Workflow

1. List Host actions and select a ready `workspace_patch` action.
2. Claim exactly one `workspace_patch` action at a time. Claiming records the workspace
   baseline and write scope.
3. Read the objective, deliverables, required evidence, read scope, write scope,
   and verification commands.
4. Implement only the claimed action. Use TDD when behavior changes.
5. Run the declared verification commands.
6. Submit the Host action with a precise summary.
7. Confirm that Apex Forge:
   - detected only in-scope changes;
   - restored the project baseline;
   - created a patch bundle;
   - queued it for governed verification and merge.
8. Run `project tick --collect-results --dispatch` and continue with the next
   ready action.

Do not claim implementation and test patch actions concurrently in the same
project workspace. Submit the first action so its baseline is restored and its
patch is queued, then claim the next action.

Tests run before submit validate the temporary local slice. After submit, the
project root is restored to baseline; only Kernel staged verification proves the
combined queued patches.

## Factory Mode

Use `project tick --run-agents` only when the user or routing policy explicitly
selects Factory Mode for parallel, durable, or background work.

## Hard Stops

- Do not edit before claim.
- Do not write `.apex-v2`.
- Do not bypass scope errors.
- Do not use shell evidence to complete cognitive work.
