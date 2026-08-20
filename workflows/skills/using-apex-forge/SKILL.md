---
name: using-apex-forge
description: Use when the user explicitly asks for Apex Forge, when a project contains .apex-v2, or when a multi-step coding task needs durable planning, evidence, recovery, review, or optional parallel workers.
---

# Using Apex Forge

Apex Forge uses the {{HOST_SESSION}} as the default reasoning and coding host.
The Kernel owns durable state, gates, evidence, verification, and merge.

## Start

1. Locate the project root.
2. Resolve this plugin's `scripts/apex-host.mjs` from the installed skill path.
3. If `.apex-v2/project.json` exists, inspect `status` and `host actions`.
4. If the project is not initialized and the user requested Apex Forge, run
   `init` silently with the project directory.
5. Route the request:
   - understand or create work -> `apex-forge-plan`
   - implement or continue -> `apex-forge-execute`
   - inspect quality -> `apex-forge-review`
   - integrate or deliver -> `apex-forge-ship`
   - ask what is happening -> `apex-forge-status`

## Interaction Rules

- Do not ask the user to type raw Kernel CLI commands.
- Use Interactive Mode unless the task is explicitly long-running, parallel, or
  background work that benefits from Factory Mode.
- Claim Host actions as `{{HOST_ID}}` before doing their work.
- Preserve the claim token, lease, and fencing token; submit/cancel only with
  the current claim token.
- Submit typed semantic evidence for cognitive actions.
- For workspace actions, edit only the action-owned workspace returned by claim.
- Never mark a cognitive action complete from a shell exit code.
- Keep `.apex-v2` as the only project state source.
- When the generated PlanGraph uses `profile: quick`, preserve that route:
  one ActionWorkspace patch, deterministic verification, one semantic review,
  and consolidated durable closeout. Do not expand it back into the full plan.
