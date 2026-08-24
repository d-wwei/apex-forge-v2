# TDD And Negative Control

## Purpose

Prove that a behavioral guard detects the old or invalid behavior.

## Method

1. Use the repository's real test entry.
2. Establish RED with the expected failure signature.
3. Implement the minimum behavior change.
4. Establish GREEN through the same entry.
5. Remove mutations or temporary overrides and prove restoration.

## Output

Produce `negative-control-evidence` with fault model, RED, GREEN, restoration,
and candidate identity.

