# Test Strategy

## Purpose

Select the smallest test set that credibly covers the changed surfaces and risks.

## Method

1. Map changed behavior and files to test surfaces.
2. Select smoke, targeted, regression, integration, or full checks by risk.
3. Record excluded groups, known issues, environment requirements, and stop conditions.
4. Never use status code alone when a typed result is available.

## Output

Produce `test-strategy-evidence` with mode, affected surfaces, selected and
excluded groups, rationale, environment, known issues, and stop conditions.

