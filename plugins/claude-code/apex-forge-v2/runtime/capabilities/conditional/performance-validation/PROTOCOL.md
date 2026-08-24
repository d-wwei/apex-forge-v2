# Performance Validation

## Purpose

Detect material performance regressions using comparable environments and samples.

## Method

1. Define metric, baseline, threshold, and environment fingerprint.
2. Run enough samples to report a distribution, not one lucky value.
3. Compare candidate and baseline under the same conditions.
4. Report missing baselines and environment drift instead of fabricating improvement.

## Output

Produce `performance-evidence` with metric, baseline, candidate samples,
environment, threshold, regression percentage, and verdict.

