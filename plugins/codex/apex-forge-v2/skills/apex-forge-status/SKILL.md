---
name: apex-forge-status
description: Use when the user asks for Apex Forge project status, current phase, pending approvals, risks, resumable work, active Host actions, or why progress is blocked.
---

# Apex Forge Status

## Workflow

1. Run the bundled bridge with `status --project <root>`.
2. Run `host actions --project <root> --host-id codex-host`.
3. Inspect queued approvals, open risks, active runs, and merge conflicts when
   they are relevant to the question.
4. Reconcile only when persisted state and artifacts disagree.

## Response

Report:

- current project and active runs;
- the next Host action Codex can claim;
- blockers, approvals, risks, or conflicts;
- whether Factory workers are active;
- the next concrete action.

Explain names and context. Do not return only internal IDs.
