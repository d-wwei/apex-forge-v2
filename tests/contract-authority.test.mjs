import test from "node:test";
import assert from "node:assert/strict";
import {
  ContractValidationError,
  validatePersistedValue
} from "../src/core/contracts.mjs";

const legacyApproval = [{
  schema_version: "v0",
  id: "legacy",
  kind: "merge",
  run_id: "run",
  fingerprint: "old",
  status: "decided",
  decision: "approved",
  reasons: [],
  changed_files: [],
  requested_at: "2026-08-01T00:00:00.000Z",
  decided_at: "2026-08-01T00:00:01.000Z",
  decided_by: "human",
  decision_reason: "historical"
}];

test("archived sandbox JSON is non-authoritative and does not use current contracts", () => {
  const count = validatePersistedValue(
    "/project/.apex-v2/runs/run/workers/worker/sandbox/.apex-v2/approvals/items.json",
    legacyApproval
  );
  assert.equal(count, 0);
});

test("authoritative approval JSON still rejects legacy records", () => {
  assert.throws(() => validatePersistedValue(
    "/project/.apex-v2/approvals/items.json",
    legacyApproval
  ), ContractValidationError);
});

test("worker sandbox manifest remains authoritative", () => {
  const count = validatePersistedValue(
    "/project/.apex-v2/runs/run/workers/worker/sandbox/sandbox.json",
    {
      schema_version: "v0",
      worker_id: "worker",
      run_id: "run",
      plan_node_id: "implementation",
      requested_type: "scratch",
      type: "scratch",
      fallback_reason: "",
      created_at: "2026-08-13T00:00:00.000Z",
      read_scope: ["src/"],
      write_scope: ["src/"],
      verification: ["npm test"]
    }
  );
  assert.equal(count, 1);
});
