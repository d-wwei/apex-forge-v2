# Migration Safety

## Purpose

Make schema, data, state, and compatibility migrations reversible and replayable.

## Method

1. Verify source and target versions and preconditions.
2. Run a dry-run against disposable state.
3. Define backup, forward, rollback, idempotency, and post-check.
4. Test interruption and retry before approving destructive execution.

## Output

Produce `migration-safety-evidence` with versions, dry-run, backup, forward and
rollback steps, idempotency, reconciliation, and data diff.

