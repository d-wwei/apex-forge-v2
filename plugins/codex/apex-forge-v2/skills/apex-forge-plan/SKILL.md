---
name: apex-forge-plan
description: Use when the user wants to add a requirement, bug, review finding, or technical task to Apex Forge and produce a durable, task-aware plan before implementation.
---

# Apex Forge Plan

## Workflow

1. Initialize Apex Forge if the user requested it and the project has no
   `.apex-v2`.
2. Convert the request into one intake item with type, title, description,
   affected area, risk, and acceptance evidence.
3. Triage it as accepted only when scope and success criteria are clear.
4. Run `project tick --advance --dispatch`.
5. Repeatedly list Host actions.
6. For each cognitive action:
   - claim it as `codex-host`;
   - inspect the declared read scope and existing evidence;
   - perform the objective;
   - submit a concrete summary with source refs.
7. Run `project tick --collect-results --dispatch` after each completed layer.
8. Stop when implementation/test actions are ready or when a typed blocker
   requires the user.

## Quality Bar

- Context must name affected files, constraints, and acceptance criteria.
- Risk must include failure paths and regression scope.
- Design must state slices, dependencies, verification, and rollback.
- Do not edit production code during planning.
