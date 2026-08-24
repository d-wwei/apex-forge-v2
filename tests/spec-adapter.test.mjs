import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { assertContract } from "../src/core/contracts.mjs";
import { normalizeSpecSource } from "../src/core/spec-adapter.mjs";

test("normalizes a native Markdown file into an intake payload", () => {
  const project = fixtureProject();
  write(project, "docs/payment-retry.md", `---
title: Payment retry policy
description: Retry transient payment failures without duplicating charges.
affected_area:
  - src/payment_jobs
  - tests/payments
acceptance_commands:
  - npm test -- tests/payments
  - npm run test_ci
evidence_refs:
  - tests/payments/retry.test.mjs
---

# Ignored fallback title
`);

  const payload = normalizeSpecSource(project, {
    format: "native",
    path: "docs/payment-retry.md"
  });

  assert.equal(payload.source, "spec:native");
  assert.equal(payload.type, "feature");
  assert.equal(payload.title, "Payment retry policy");
  assert.equal(
    payload.description,
    "Retry transient payment failures without duplicating charges."
  );
  assert.equal(payload.affected_area, "src/payment_jobs, tests/payments");
  assert.deepEqual(payload.acceptance_commands, [
    "npm test -- tests/payments",
    "npm run test_ci"
  ]);
  assert.deepEqual(payload.evidence_refs, [
    "docs/payment-retry.md",
    "tests/payments/retry.test.mjs"
  ]);
  assert.deepEqual(payload.source_spec.files, ["docs/payment-retry.md"]);
  assert.equal(payload.source_spec.format, "native");
  assert.equal(payload.source_spec.kind, "file");
  assert.match(payload.source_spec.checksum, /^sha256:[a-f0-9]{64}$/);
  assert.doesNotThrow(() => assertContract(
    "spec-source.schema.json",
    payload.source_spec
  ));

  const firstChecksum = payload.source_spec.checksum;
  write(project, "docs/payment-retry.md", `${readFileSync(
    join(project, "docs/payment-retry.md"),
    "utf8"
  )}\nAdditional constraint.\n`);
  assert.notEqual(
    normalizeSpecSource(project, {
      format: "native",
      path: "docs/payment-retry.md"
    }).source_spec.checksum,
    firstChecksum
  );
});

test("normalizes an OpenSpec change directory and combines its Markdown evidence", () => {
  const project = fixtureProject();
  write(project, "openspec/changes/add-audit/proposal.md", `# Add audit trail

## Description
Persist an immutable audit trail for governed actions.

## Affected Area
- src/core/governance.mjs
- tests/governance

## Evidence
- docs/security/audit-model.md
`);
  write(project, "openspec/changes/add-audit/tasks.md", `# Tasks

## Acceptance Commands
\`\`\`bash
npm test -- tests/governance.test.mjs
npm run check:schemas
\`\`\`
`);
  write(project, "openspec/changes/add-audit/design.md", "# Design\n\nAppend-only records.\n");

  const payload = normalizeSpecSource(project, {
    format: "auto",
    path: "openspec/changes/add-audit"
  });

  assert.equal(payload.source_spec.format, "openspec");
  assert.equal(payload.title, "Add audit trail");
  assert.equal(
    payload.description,
    "Persist an immutable audit trail for governed actions."
  );
  assert.equal(
    payload.affected_area,
    "src/core/governance.mjs, tests/governance"
  );
  assert.deepEqual(payload.acceptance_commands, [
    "npm test -- tests/governance.test.mjs",
    "npm run check:schemas"
  ]);
  assert.deepEqual(payload.source_spec.files, [
    "openspec/changes/add-audit/design.md",
    "openspec/changes/add-audit/proposal.md",
    "openspec/changes/add-audit/tasks.md"
  ]);
  assert.ok(payload.evidence_refs.includes("docs/security/audit-model.md"));
  assert.ok(payload.evidence_refs.includes("openspec/changes/add-audit/proposal.md"));
  assert.ok(payload.evidence_refs.includes("openspec/changes/add-audit/tasks.md"));
});

test("normalizes a Spec Kit feature directory using spec.md as the primary document", () => {
  const project = fixtureProject();
  write(project, "specs/001-checkout-owner/spec.md", `# Checkout ownership

## Summary
Prevent two workers from mutating the same checkout.

## Affected Components
- src/core/action-workspace.mjs
- src/core/project-lock.mjs
`);
  write(project, "specs/001-checkout-owner/plan.md", "# Implementation Plan\n\nUse fenced ownership tokens.\n");
  write(project, "specs/001-checkout-owner/tasks.md", `# Tasks

## Verification
- \`node --test tests/action-workspace.test.mjs\`
`);

  const payload = normalizeSpecSource(project, {
    format: "spec-kit",
    path: "specs/001-checkout-owner"
  });

  assert.equal(payload.source, "spec:spec-kit");
  assert.equal(payload.title, "Checkout ownership");
  assert.equal(
    payload.description,
    "Prevent two workers from mutating the same checkout."
  );
  assert.equal(
    payload.affected_area,
    "src/core/action-workspace.mjs, src/core/project-lock.mjs"
  );
  assert.deepEqual(payload.acceptance_commands, [
    "node --test tests/action-workspace.test.mjs"
  ]);
  assert.equal(payload.source_spec.path, "specs/001-checkout-owner");
  assert.equal(payload.source_spec.kind, "directory");
  assert.equal(payload.source_spec.format, "spec-kit");
});

test("rejects lexical and symlink paths that escape the project root", () => {
  const base = mkdtempSync(join(tmpdir(), "apex-spec-adapter-boundary-"));
  const project = join(base, "project");
  const outside = join(base, "outside.md");
  mkdirSync(project);
  writeFileSync(outside, "# Outside\n");
  symlinkSync(outside, join(project, "linked.md"));

  assert.throws(
    () => normalizeSpecSource(project, {
      format: "native",
      path: "../outside.md"
    }),
    /项目根目录之外/
  );
  assert.throws(
    () => normalizeSpecSource(project, {
      format: "native",
      path: "linked.md"
    }),
    /项目根目录之外/
  );
});

test("rejects unsupported adapters and non-Markdown sources", () => {
  const project = fixtureProject();
  write(project, "spec.txt", "not markdown\n");
  write(project, "empty/.keep", "\n");

  assert.throws(
    () => normalizeSpecSource(project, {
      format: "unknown",
      path: "spec.txt"
    }),
    /不支持的 Spec 格式/
  );
  assert.throws(
    () => normalizeSpecSource(project, {
      format: "native",
      path: "spec.txt"
    }),
    /只支持 Markdown/
  );
  assert.throws(
    () => normalizeSpecSource(project, {
      format: "native",
      path: "empty"
    }),
    /没有 Markdown 文件/
  );
});

test("CLI imports a normalized Spec source into durable intake", () => {
  const project = fixtureProject();
  write(project, "specs/002-budget/spec.md", `# Route budget

## Summary
Persist a cost budget on every new execution route.

## Affected Area
- src/core/execution-router.mjs

## Verification
- \`node --test tests/execution-router.test.mjs\`
`);
  const cli = new URL("../src/apex-v2.mjs", import.meta.url).pathname;
  const initialized = spawnSync(process.execPath, [cli, "init", "--project", project], {
    encoding: "utf8"
  });
  assert.equal(initialized.status, 0, initialized.stderr);
  const imported = spawnSync(process.execPath, [
    cli,
    "intake",
    "import-spec",
    "--project",
    project,
    "--format",
    "spec-kit",
    "--path",
    "specs/002-budget"
  ], { encoding: "utf8" });
  assert.equal(imported.status, 0, imported.stderr);
  const item = JSON.parse(imported.stdout);
  assert.equal(item.source, "spec:spec-kit");
  assert.equal(item.title, "Route budget");
  assert.equal(item.source_spec.path, "specs/002-budget");
  assert.equal(item.source_spec.format, "spec-kit");
  assert.deepEqual(item.acceptance_commands, [
    "node --test tests/execution-router.test.mjs"
  ]);
});

function fixtureProject() {
  return mkdtempSync(join(tmpdir(), "apex-spec-adapter-"));
}

function write(root, relativePath, contents) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}
