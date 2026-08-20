---
name: apex-forge-execute
description: Use when an Apex Forge run has ready implementation or test actions and the current Codex session should execute them in Interactive Mode with governed patch capture.
---

# Apex Forge Execute

## Interactive Workflow

1. List Host actions and select a ready `workspace_patch` action.
2. Claim exactly one `workspace_patch` action at a time as `codex-host`.
   Claiming returns an action-owned `workspace_path`, `claim_token`, lease,
   fencing token, and write scope.
3. Read the objective, deliverables, required evidence, read scope, write scope,
   and verification commands.
4. Implement only inside the returned `workspace_path`. Never edit the project
   root for an Interactive patch action. Use TDD when behavior changes.
5. Run the declared verification commands inside the action workspace.
6. Submit the Host action with the exact `claim_token` and a precise summary.
7. Confirm that Apex Forge:
   - detected only in-scope changes;
   - left the project root untouched;
   - created a patch bundle;
   - queued it for candidate-bound verification and merge.
8. Run `project tick --collect-results --dispatch` and continue with the next
   ready action.

## Quick Route

When `plan-graph.json` has `profile: quick`:

1. The single `delivery-implementation` ActionWorkspace owns both implementation
   and focused test changes.
2. Run the public acceptance command inside the ActionWorkspace, but do not run
   the full project verification suite against the unmaterialized project root.
3. After submitting it, run: `project tick --collect-results --dispatch`.
4. Continue directly to the ready `delivery-review` action; do not create
   context, risk, design, test, or verification workers that are absent from
   the quick plan.

Do not claim implementation and test patch actions concurrently in the same
project. Submit the first action, then claim the next action.

## Factory Mode

Use `project tick --run-agents` only when the user or routing policy explicitly
selects Factory Mode for parallel, durable, or background work.

## Hard Stops

- Do not edit before claim.
- Do not edit outside the returned `workspace_path`.
- Do not submit or cancel with a stale/missing `claim_token`.
- Do not write `.apex-v2`.
- Do not bypass scope errors.
- Do not use shell evidence to complete cognitive work.
