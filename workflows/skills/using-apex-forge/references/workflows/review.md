# Review Workflow

This is an internal workflow reference for the `review` route. It is not a
discoverable Skill.

## Workflow

1. Claim the ready `delivery-review` Host action as `{{HOST_ID}}`.
2. Read source intake, acceptance criteria, typed context/design evidence,
   candidate digest, patch bundles, verification reports, risks, conflicts,
   capability bindings, protocols, and enforcement mode.
3. Review correctness, requirement fit, failure paths, security, maintainability,
   and rollback posture.
4. Submit typed `review` evidence bound to the current `candidate_digest`, with
   findings, residual risks, merge posture, source refs, and acceptance mapping.
   Submit one capability evidence object per required binding in the same Host
   result; candidate-sensitive capability outputs must bind the same digest.
5. If blocking findings exist, return the run to implementation.
6. Only after semantic Host review may deterministic `review generate`
   aggregate queue, candidate, and verification state.

For a `profile: quick` plan, submit the single `delivery-review` evidence and
then run one consolidated closeout tick:

`project tick --collect-results --complete-execute --verify --review --integrate --learn --apply-learning`

Do not repeat verification commands manually when candidate-bound staged
verification already records them.

## Evidence Rules

- A passing test suite alone is not a semantic review.
- A PASS names the requirement, candidate digest, diff, and verification evidence.
- Unknown or skipped checks remain visible.
