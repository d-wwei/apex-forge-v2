# Incremental Delivery

## Purpose

Build multi-file changes as small coherent slices with bounded blast radius.

## Method

1. Identify the smallest useful slice.
2. Assign read/write scope and verification to each slice.
3. Complete and verify one dependency layer before expanding.
4. Keep unrelated cleanup outside the delivery.

## Output

Produce `incremental-plan-evidence` with slices, dependencies, scopes,
verification, rollback, and completion order.

