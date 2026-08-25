# Plan Workflow

This is an internal workflow reference for the `plan` route. It is not a
discoverable Skill.

## Workflow

1. Initialize Apex Forge if the user requested it and the project has no
   `.apex-v2`.
2. Convert the request into one intake item with type, title, description,
   affected area, risk, and acceptance evidence.
3. Triage it as accepted only when scope and success criteria are clear.
4. Run `project tick --advance --dispatch`.
5. Repeatedly list Host actions.
6. For each cognitive action:
   - claim it as `{{HOST_ID}}`;
   - preserve the returned `claim_token` and lease;
   - inspect the declared read scope, existing evidence,
     `capability_bindings`, `capability_protocols`, and enforcement mode;
   - perform the objective;
   - create role-specific typed evidence with source refs, claims,
     uncertainties, and acceptance mapping;
   - create one capability evidence object for every required binding, using
     the declared capability version and `output_contract`;
   - submit the evidence and summary with the exact `claim_token`.
7. Run `project tick --collect-results --dispatch` after each completed layer.
8. Stop when implementation/test actions are ready or when a typed blocker
   requires the user.

When the source intake is `bug` or `test_failure`, inspect the generated
`negative-control.json`. In shadow mode, preserve the gap without claiming RED
or GREEN evidence that was not executed. For high/critical Governed plans,
inspect the generated proposed Decision Note before implementation.

## Quality Bar

- Context names affected files, constraints, unknowns, and acceptance criteria.
- Risk includes failure paths, blast radius, mitigation, and rollback.
- Design states slices, dependencies, verification, and rollback.
- Do not edit production code during planning.
