import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ContractValidationError,
  migrateLegacyContracts,
  scanProjectContracts,
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

test("immutable release bundles are validated by the release candidate gate, not runtime contracts", () => {
  const project = mkdtempSync(join(tmpdir(), "apex-release-contract-scan-"));
  const releaseSchema = join(
    project,
    ".apex-v2",
    "releases",
    "candidates",
    "digest",
    "plugins",
    "codex",
    "runtime",
    "schemas",
    "candidate-set.schema.json"
  );
  mkdirSync(join(releaseSchema, ".."), { recursive: true });
  writeFileSync(releaseSchema, JSON.stringify({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object"
  }));
  const result = scanProjectContracts(project);
  assert.equal(result.errors.length, 0);
  assert.equal(result.json_files, 0);
});

test("action workspace payloads are excluded from runtime contract scans", () => {
  const project = mkdtempSync(join(tmpdir(), "apex-action-workspace-contract-scan-"));
  const workspaceRoot = join(
    project,
    ".apex-v2",
    "runs",
    "run-1",
    "workers",
    "worker-1",
    "action-workspace"
  );
  mkdirSync(join(workspaceRoot, "base", "hooks", "fixtures"), { recursive: true });
  mkdirSync(join(workspaceRoot, "workspace", "hooks", "fixtures"), { recursive: true });
  writeFileSync(
    join(workspaceRoot, "base", "hooks", "fixtures", "results-v3-nonfinite.json"),
    "{\"coverage\":{\"pct\":NaN}}\n"
  );
  writeFileSync(
    join(workspaceRoot, "workspace", "hooks", "fixtures", "results-v3-nonfinite.json"),
    "{\"coverage\":{\"pct\":NaN}}\n"
  );

  const result = scanProjectContracts(project);
  assert.equal(result.errors.length, 0);
  assert.equal(result.json_files, 0);
});

test("contract migration failpoint rolls back every file before retry", () => {
  const project = mkdtempSync(join(tmpdir(), "apex-contract-migration-"));
  const root = join(project, ".apex-v2");
  mkdirSync(root, { recursive: true });
  const projectPath = join(root, "project.json");
  writeFileSync(projectPath, `${JSON.stringify({
    schema_version: "v0",
    project_id: "legacy-project",
    project_name: "Legacy",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    active_milestone: null,
    knowledge_version: 0,
    last_event_id: null,
    active_runs: [],
    wip_limits: { active_runs: 1, parallel_workers: 1 }
  }, null, 2)}\n`);

  const previous = process.env.APEX_V2_TRANSACTION_FAILPOINT;
  process.env.APEX_V2_TRANSACTION_FAILPOINT = "contract-migration";
  try {
    assert.throws(() => migrateLegacyContracts(project, true), /transaction failpoint/);
  } finally {
    if (previous == null) delete process.env.APEX_V2_TRANSACTION_FAILPOINT;
    else process.env.APEX_V2_TRANSACTION_FAILPOINT = previous;
  }
  const rolledBack = JSON.parse(readFileSync(projectPath, "utf8"));
  assert.equal("format_version" in rolledBack, false);
  assert.equal("revision" in rolledBack, false);
  assert.equal(existsSync(join(project, ".apex-v2.transaction-backups")), false);

  const migrated = migrateLegacyContracts(project, true);
  assert.equal(migrated.status, "MIGRATED");
  const current = JSON.parse(readFileSync(projectPath, "utf8"));
  assert.equal(current.format_version, 1);
  assert.equal(current.revision, 0);
});
