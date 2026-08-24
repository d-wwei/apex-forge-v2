# Source Grounding

## Purpose

Ground version-sensitive implementation in local or official authoritative sources.

## Method

1. Detect the local version and existing generated contracts.
2. Read the narrowest authoritative source.
3. Record verified claims, conflicts, and unverified assumptions.
4. Prefer repository-local schema or generated code when it defines shipped behavior.

## Output

Produce `source-grounding-evidence` with version, sources, verified claims,
conflicts, and remaining uncertainty.

