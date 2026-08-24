# Ship Workflow

This is an internal workflow reference for the `ship` route. It is not a
discoverable Skill.

## Workflow

1. Confirm every PlanGraph action has successful typed evidence and no required
   capability evidence remains missing under `enforce` mode.
2. Complete execute collection and run candidate-bound staged verification.
3. Confirm semantic review evidence binds the same candidate digest.
4. Inspect merge conflicts and candidate-bound approvals.
5. Ask the user only for a real policy approval or ambiguity decision.
6. Apply merge only when verification, review, approval, and merge recompute the
   same candidate digest.
7. Run final verification against the integrated project.
8. Queue learning governance with `project tick --integrate --learn`.
   Delivery closure waits for the durable proposal and apply job, not for
   knowledge mutation. Approved jobs may be applied later with
   `project tick --learning-worker`.
9. Verify persisted closure with `run show`, `status`, and `project reconcile`.
   Only report completion when `run.status=done`, every node passed, the run is
   absent from `project.active_runs`, and reconcile is `CONSISTENT`.
10. Report delivered behavior, verification evidence, residual risks, and
    carry-forward work.

Do not commit or push unless the user explicitly requests Git delivery.
Never claim end-to-end completion while the durable run remains active.
