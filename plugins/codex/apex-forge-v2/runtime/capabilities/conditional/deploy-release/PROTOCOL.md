# Deploy Release

## Purpose

Deploy an approved candidate with explicit authority, health evidence, and rollback.

## Method

1. Confirm candidate digest, environment, provider, and Approval.
2. Execute the declared deployment operation.
3. Verify deployment identity, canary, and health checks.
4. Preserve rollback token and incident evidence on failure.

## Output

Produce `deployment-receipt` with candidate, environment, approval, deployment
identity, health checks, canary results, rollback token, and external refs.

