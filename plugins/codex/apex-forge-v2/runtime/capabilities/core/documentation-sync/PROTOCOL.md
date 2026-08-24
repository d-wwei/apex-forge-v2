# Documentation Sync

## Purpose

Keep user and engineering documentation aligned with shipped behavior.

## Method

1. Compare the candidate diff with README, API, architecture, config, and changelog.
2. Update only documentation affected by observable behavior.
3. Record intentional non-updates and stale references.
4. Verify commands, paths, and examples against the candidate.

## Output

Produce `documentation-sync-evidence` with changed behavior, affected docs,
updates, intentional omissions, stale refs, and verification.

