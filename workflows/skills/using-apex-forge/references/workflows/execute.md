# Execute Workflow

This is an internal workflow reference for the `execute` route. It is not a
discoverable Skill.

## Interactive Workflow

1. List Host actions and select a ready `workspace_patch` action.
2. Claim exactly one `workspace_patch` action at a time as `{{HOST_ID}}`.
   Claiming returns an action-owned `workspace_path`, `claim_token`, lease,
   fencing token, and write scope.
3. Read the objective, deliverables, required evidence, read scope, write scope,
   verification commands, capability bindings, protocols, and enforcement mode.
4. Implement only inside the returned `workspace_path`. Never edit the project
   root for an Interactive patch action. Use TDD when behavior changes.
5. Run the declared verification commands inside the action workspace.
6. Produce one typed capability evidence object per required binding, including
   RED/GREEN or other protocol-specific proof, then submit it with the exact
   `claim_token` and a precise summary.
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

## Hard Stops

- Do not edit before claim.
- Do not edit outside the returned `workspace_path`.
- Do not submit or cancel with a stale/missing `claim_token`.
- Do not write `.apex-v2`.
- Do not bypass scope errors.
- Do not use shell evidence to complete cognitive work.
