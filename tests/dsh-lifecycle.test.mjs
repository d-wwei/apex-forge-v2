import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initializeLifecycleRecord,
  transitionLifecycleRecord
} from "../src/core/lifecycle.mjs";
import { negativeControlPolicy } from "../src/core/negative-control.mjs";
import { decisionNotePolicy } from "../src/core/decision-notes.mjs";

test("shared lifecycle increments revision on legal transitions", () => {
  const record = initializeLifecycleRecord({
    status: "required",
    record_id: "record-1"
  }, "2026-08-25T00:00:00.000Z");
  transitionLifecycleRecord(record, "red_verified", {
    required: ["red_verified"],
    red_verified: []
  }, "2026-08-25T00:00:01.000Z");

  assert.equal(record.status, "red_verified");
  assert.equal(record.revision, 2);
  assert.equal(record.updated_at, "2026-08-25T00:00:01.000Z");
});

test("shared lifecycle rejects illegal and terminal-state transitions", () => {
  const record = initializeLifecycleRecord({
    status: "required",
    record_id: "record-1"
  });
  assert.throws(() => transitionLifecycleRecord(record, "restored", {
    required: ["red_verified"],
    restored: []
  }), /非法 lifecycle transition/);

  record.status = "restored";
  assert.throws(() => transitionLifecycleRecord(record, "required", {
    restored: []
  }), /非法 lifecycle transition/);
});

test("legacy projects without DSH policy fields safely default to shadow", () => {
  const project = mkdtempSync(join(tmpdir(), "apex-dsh-policy-"));
  const root = join(project, ".apex-v2");
  mkdirSync(join(root, "policies"), { recursive: true });
  writeFileSync(join(root, "policies", "gates.json"), `${JSON.stringify({
    schema_version: "v0",
    updated_at: "2026-08-25T00:00:00.000Z",
    human_gates: [],
    automatic_gates: []
  }, null, 2)}\n`);

  assert.deepEqual(negativeControlPolicy(root), {
    mode: "shadow",
    intake_types: ["bug", "test_failure"]
  });
  assert.deepEqual(decisionNotePolicy(root), {
    mode: "shadow",
    auto_propose: true,
    risk_levels: ["high", "critical"],
    workflows: ["governed"]
  });
});
