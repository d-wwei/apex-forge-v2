# Capability Provenance

The `capabilities/` directory is the canonical source for Apex Forge V2
internal atomic capabilities.

## Policy

- `OWNED`: authored directly for Apex Forge V2.
- `MIT`: adapted from an identified MIT-licensed source.
- `REWRITE_ONLY`: source metadata is incomplete or the source is design-only;
  the release decision is `clean-room-no-copy` or `design-reference-only`.
  Only general methods were independently re-authored and no runtime/source
  dependency is retained.
- External state machines, shell preambles, hooks, dashboards, and persistence
  stores are not copied.
- Runtime behavior is governed by Apex Forge contracts, PlanGraph, Worker,
  Artifact, Approval, Risk, and Cost Governor.

## Source Families

- Local `dev-*` skills: method references only; standalone license metadata was
  not present in the installed folders.
- Apex Forge V1: MIT, pinned at
  `3755583552540121bcb1287c5bdba3c8b2578726`.
- Better Test: MIT, pinned at
  `0e03f45c79bd85e8a717d6d39c8649e0664cf56a`.
- Product Goal-Based Audit: MIT, pinned at
  `d480c33e36bba2a407241853afc1168951e668bf`.
- Design-to-Code Runner: MIT.
- DeepSeek Harness audit: static design evidence only; no DSH source or private
  Agent Teams implementation is copied.

The machine-readable source decision for every capability is recorded in
`source-inventory.json`.
