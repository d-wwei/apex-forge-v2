---
name: using-apex-forge
description: Use when the user explicitly asks for Apex Forge, when a project contains .apex-v2, or when a multi-step coding task needs durable planning, evidence, recovery, review, or optional parallel workers.
---

# Using Apex Forge

Apex Forge uses the current Codex session as the default reasoning and coding
host. The Kernel owns durable state, gates, evidence, verification, and merge.

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
- Claim Host actions before doing their work.
- Submit semantic summaries for cognitive actions.
- For workspace actions, let Host claim create the baseline before editing.
- Never mark a cognitive action complete from a shell exit code.
- Keep `.apex-v2` as the only project state source.
