# Execute Workflow

This is an internal workflow reference for the `execute` route. It is not a
discoverable Skill.

## Interactive Workflow

1. Call `project drain --host-id {{HOST_ID}}`.
2. Follow the single returned `next_action`. The controller performs
   collection, dependency unlock, candidate verification, review scheduling,
   integration, and closure transitions deterministically.
3. Read the objective, scope, verification inputs and `submission_contract`
   returned in `next_action`. Treat that object as authoritative; do not inspect
   runtime source, CLI help or JSON schema files unless the Kernel rejects it.
4. Implement only inside the returned `workspace_path`. Never edit the project
   root for an Interactive patch action. Use TDD when behavior changes.
5. Run the declared verification commands inside the action workspace.
6. Submit one unified Evidence Artifact using the natural object shape:
   `semantic_evidence` is an object and each
   `capability_outputs[].output` is an object. The Kernel also accepts the old
   JSON-string fields for compatibility, then derives Capability Receipts and
   legacy projections. Use `--evidence-artifact-json` or
   `--evidence-artifact-file`, the exact `claim_token`, and a precise summary.
7. Confirm that Apex Forge:
   - detected only in-scope changes;
   - left the project root untouched;
   - created a patch bundle;
   - queued it for candidate-bound verification and merge.
8. Call `project drain --host-id {{HOST_ID}}` again. Do not manually compose
   `collect-results`, `complete-execute`, `verify`, `review`, or `integrate`.

## Quick Route

When `plan-graph.json` has `profile: quick`:

1. The single `delivery-implementation` ActionWorkspace owns both implementation
   and focused test changes.
2. Run the public acceptance command inside the ActionWorkspace, but do not run
   the full project verification suite against the unmaterialized project root.
3. After submitting it, call `project drain --host-id {{HOST_ID}}`.
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
After a Factory wave, call `project drain --host-id {{HOST_ID}}` for
coordinator actions and deterministic delivery transitions.

## Hard Stops

- Do not edit before claim.
- Do not edit outside the returned `workspace_path`.
- Do not submit or cancel with a stale/missing `claim_token`.
- Do not write `.apex-v2`.
- Do not bypass scope errors.
- Do not use shell evidence to complete cognitive work.
