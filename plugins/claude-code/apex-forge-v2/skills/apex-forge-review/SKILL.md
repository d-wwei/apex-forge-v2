---
name: apex-forge-review
description: Use when an Apex Forge run needs semantic review of requirements, candidate patches, verification evidence, risks, and merge posture before integration.
---

# Apex Forge Review

## Workflow

1. Claim the ready `delivery-review` Host action.
2. Read:
   - source intake and acceptance criteria;
   - context and design artifacts;
   - candidate patch bundles and changed files;
   - verification reports;
   - risk register and unresolved conflicts.
   Review candidate patch bundles and staged verification artifacts rather than
   assuming the restored project root already contains queued changes.
3. Review correctness, requirement fit, failure paths, security, maintainability,
   and rollback posture.
4. If blocking findings exist, submit them as explicit evidence and return the
   run to implementation.
5. If review passes, submit a summary that explains why the candidate is ready.
6. Only after the semantic Host review is complete may the deterministic
   `review generate` gate aggregate queue and verification state.

## Evidence Rules

- A passing test suite alone is not a semantic review.
- A PASS must name the requirement, candidate diff, and verification evidence.
- Unknown or skipped checks remain visible.
