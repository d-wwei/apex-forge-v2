---
name: apex-forge-status
description: Use when the user asks for Apex Forge project status, current phase, pending approvals, risks, resumable work, active Host actions, or why progress is blocked.
---

# Apex Forge Status

## Workflow

1. Run the bundled bridge with `status --project <root>`.
2. Run `host actions --project <root> --host-id claude-code-host`.
3. Inspect queued approvals, open risks, active runs, merge conflicts, claim
   leases, candidate state, and Factory workers when relevant.
4. Reconcile only when persisted state and artifacts disagree.

## Response

Report the current project and active runs, the next Host action Claude Code
can claim, blockers/approvals/risks/conflicts, active Factory workers, and the
next concrete action. Explain names and context; do not return only internal IDs.
