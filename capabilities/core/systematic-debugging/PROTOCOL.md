# Systematic Debugging

## Purpose

Find and prove the root cause before changing production behavior.

## Method

1. Reproduce the exact failure and capture its signature.
2. Trace the input-to-failure path and narrow the failing layer.
3. Test distinct hypotheses against direct evidence.
4. Confirm the root cause and define the smallest safe fix.
5. Name the regression target that must fail before the fix and pass after it.

## Output

Produce `root-cause-evidence` with reproduction, hypotheses, experiments,
confirmed cause, affected scope, and fix constraints.

