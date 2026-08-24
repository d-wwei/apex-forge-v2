---
name: using-apex-forge
description: Use when the user explicitly asks for Apex Forge, when a project contains .apex-v2, or when a multi-step coding task needs durable planning, evidence, recovery, review, or optional parallel workers.
---

# Using Apex Forge

Apex Forge uses the {{HOST_SESSION}} as the default reasoning and coding host.
The Kernel owns durable state, gates, evidence, verification, and merge.

## Route

Select exactly one primary lifecycle route from the user's intent and current
durable state, then read the matching internal workflow reference before acting:

| Intent or state | Route | Internal reference |
| --- | --- | --- |
| understand, add, triage, or plan work | `plan` | `references/workflows/plan.md` |
| implement, test, fix, resume, or continue ready actions | `execute` | `references/workflows/execute.md` |
| inspect quality, requirements, patches, evidence, or risks | `review` | `references/workflows/review.md` |
| verify closure, approve, integrate, deliver, or release | `ship` | `references/workflows/ship.md` |
| explain progress, blockers, approvals, risks, or next action | `status` | `references/workflows/status.md` |

Route by durable state when wording is ambiguous:

- ready cognitive planning action -> `plan`;
- ready `workspace_patch` action or returned implementation finding -> `execute`;
- ready semantic review action -> `review`;
- all actions complete and integration/closure remains -> `ship`;
- user asks a question without requesting state advancement -> `status`.

The internal references are package-private workflow knowledge, not discoverable
Skills. Load only the selected reference unless a transition requires the next
lifecycle route. The deprecated names `apex-forge-plan`,
`apex-forge-execute`, `apex-forge-review`, `apex-forge-ship`, and
`apex-forge-status` map one-to-one to these routes in compatibility builds.

## Start

1. Locate the project root.
2. Resolve this plugin's `scripts/apex-host.mjs` from the installed skill path.
3. If `.apex-v2/project.json` exists, inspect `status` and `host actions`.
4. If the project is not initialized and the user requested Apex Forge, run
   `init` silently with the project directory.
5. Select the route above, read its internal reference, and follow it.

## Interaction Rules

- Do not ask the user to type raw Kernel CLI commands.
- Use Interactive Mode unless the task is explicitly long-running, parallel, or
  background work that benefits from Factory Mode.
- Claim Host actions as `{{HOST_ID}}` before doing their work.
- Preserve the claim token, lease, and fencing token; submit/cancel only with
  the current claim token.
- Inspect every action's `capability_bindings`, `capability_protocols`, and
  `capability_enforcement` before acting. Produce one typed capability evidence
  object per required binding and submit the array with the Host result.
- In `enforce` mode, never omit required capability evidence. In `shadow` mode,
  missing evidence remains an auditable gap and must not be described as
  capability-complete.
- Submit typed semantic evidence for cognitive actions.
- For workspace actions, edit only the action-owned workspace returned by claim.
- Never mark a cognitive action complete from a shell exit code.
- Keep `.apex-v2` as the only project state source.
- When the generated PlanGraph uses `profile: quick`, preserve that route:
  one ActionWorkspace patch, deterministic verification, one semantic review,
  and consolidated durable closeout. Do not expand it back into the full plan.
