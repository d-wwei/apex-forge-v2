---
name: apex-forge-ship
description: Use when an Apex Forge run has completed semantic review and verification and the user wants governed integration, approval handling, final evidence, or delivery closeout.
---

# Apex Forge Ship

## Workflow

1. Confirm every PlanGraph action has successful evidence.
2. Complete execute collection and run staged verification.
3. Confirm semantic review evidence exists, then run the deterministic review
   gate.
4. Inspect merge conflicts and required approvals.
5. Ask the user only for a real policy approval or ambiguity decision.
6. Apply the merge queue after approval.
7. Run final verification against the integrated project.
8. Complete learning governance:
   - use `project tick --integrate --learn --apply-learning` when the generated
     knowledge changes are safe to apply;
   - otherwise leave `learn` pending and explicitly report the required user
     decision. A pending learning node means the run is not closed.
9. Verify persisted closure with `run show`, `status`, and `project reconcile`.
   Only report completion when:
   - `run.status` is `done`;
   - every run node, including `learn`, is `passed`;
   - the run is absent from `project.active_runs`;
   - reconcile is `CONSISTENT`.
10. Report delivered behavior, verification evidence, residual risks, and any
    carry-forward work.

Do not commit or push unless the user explicitly requests Git delivery.
Never claim end-to-end completion while the durable run remains active.
