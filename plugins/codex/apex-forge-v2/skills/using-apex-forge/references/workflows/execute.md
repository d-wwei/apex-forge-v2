# Execute Workflow

This is an internal workflow reference for the `execute` route. It is not a
discoverable Skill.

## Interactive Workflow

1. Call `project drain --host-id codex-host`.
2. Follow the single returned `next_action`. The controller performs
   collection, dependency unlock, candidate verification, review scheduling,
   integration, and closure transitions deterministically.
3. Read the objective, deliverables, required evidence, read scope, write scope,
   verification commands, capability bindings, protocols, and enforcement mode.
4. Implement only inside the returned `workspace_path`. Never edit the project
   root for an Interactive patch action. Use TDD when behavior changes.
5. Run the declared verification commands inside the action workspace.
6. Prefer one unified Evidence Artifact: provide semantic evidence once and a
   compact `capability_outputs` section containing each required typed output.
   The Kernel derives Capability Receipts and legacy projections. Submit it
   with `--evidence-artifact-json` or `--evidence-artifact-file`, the exact
   `claim_token`, and a precise summary.
7. Confirm that Apex Forge:
   - detected only in-scope changes;
   - left the project root untouched;
   - created a patch bundle;
   - queued it for candidate-bound verification and merge.
8. Call `project drain --host-id codex-host` again. Do not manually compose
   `collect-results`, `complete-execute`, `verify`, `review`, or `integrate`.

## Quick Route

When `plan-graph.json` has `profile: quick`:

1. The single `delivery-implementation` ActionWorkspace owns both implementation
   and focused test changes.
2. Run the public acceptance command inside the ActionWorkspace, but do not run
   the full project verification suite against the unmaterialized project root.
3. After submitting it, call `project drain --host-id codex-host`.
4. The Kernel must complete staged verification before returning the
   `delivery-review` action.
5. Before reporting completion, verify all four landing conditions:
   - the implementation patch is `merged` in `merge-queue.json`;
   - `integration-report.json` is `MERGED` and names that patch;
   - the public acceptance commands pass again in the project root;
   - `status.active_runs` is empty.
6. If any landing condition fails, report `BLOCKED` with the queued patch and
   failed condition. Never treat an ActionWorkspace-local PASS as delivery.

Do not claim implementation and test patch actions concurrently in the same
project. Submit the first action, then claim the next action.

## Factory Mode

Use `project tick --run-agents` only when the user or routing policy explicitly
selects Factory Mode for parallel, durable, or background work. One tick drains
bounded scheduler waves:

```text
dispatch -> parallel run -> collect -> unlock -> refill
```

The scheduler stops when it reaches a coordinator-owned action, a durable
blocker, no further progress, or `--agent-cycles`.
After a Factory wave, call `project drain --host-id codex-host` for
coordinator actions and deterministic delivery transitions.

## Hard Stops

- Do not edit before claim.
- Do not edit outside the returned `workspace_path`.
- Do not submit or cancel with a stale/missing `claim_token`.
- Do not write `.apex-v2`.
- Do not bypass scope errors.
- Do not use shell evidence to complete cognitive work.
