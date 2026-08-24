# Architecture Design

## Purpose

Define a minimal technical design with explicit ownership and failure boundaries.

## Method

1. State constraints and at least two viable alternatives when they exist.
2. Assign one owner for each durable fact and side effect.
3. Define dependencies, failure modes, rollback, and verification.
4. Reject duplicate state and speculative abstraction without a current consumer.

## Output

Produce `architecture-design-evidence` with alternatives, selected design,
state ownership, failure modes, rollback, and simplification conditions.

