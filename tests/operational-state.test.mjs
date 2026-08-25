import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  inspectOperationalIntegrity
} from "../src/core/operational-state.mjs";
import {
  buildCandidateSet,
  persistCandidateSet
} from "../src/core/candidate.mjs";

test("operational integrity accepts a candidate-bound run", () => {
  const fixture = operationalFixture();
  const inspection = inspectOperationalIntegrity(fixture.root);
  assert.deepEqual(inspection.issues, []);
  assert.match(inspection.state_hash, /^[a-f0-9]{64}$/);
});

test("operational integrity rejects review and integration candidate drift", () => {
  const fixture = operationalFixture();
  const reviewPath = join(fixture.runDir, "review-report.json");
  const review = readJson(reviewPath);
  review.candidate_digest = "f".repeat(64);
  writeJson(reviewPath, review);
  const integrationPath = join(fixture.runDir, "integration-report.json");
  const integration = readJson(integrationPath);
  integration.candidate_digest = "e".repeat(64);
  writeJson(integrationPath, integration);

  const inspection = inspectOperationalIntegrity(fixture.root);
  assert.ok(inspection.issues.some((item) => item.kind === "review-candidate-mismatch"));
  assert.ok(inspection.issues.some((item) => item.kind === "integration-candidate-mismatch"));
});

test("operational integrity rejects corrupted candidate content", () => {
  const fixture = operationalFixture();
  const candidatePath = join(
    fixture.runDir,
    "candidates",
    `candidate-${fixture.candidate.candidate_digest}.json`
  );
  const candidate = readJson(candidatePath);
  candidate.plan_graph_hash = "0".repeat(64);
  writeJson(candidatePath, candidate);

  const inspection = inspectOperationalIntegrity(fixture.root);
  assert.ok(inspection.issues.some((item) => item.kind === "candidate-digest-mismatch"));
});

test("operational integrity rejects worker/queue drift and started transaction", () => {
  const fixture = operationalFixture();
  const workerPath = join(fixture.workerDir, "worker.json");
  const worker = readJson(workerPath);
  worker.status = "active";
  writeJson(workerPath, worker);
  writeJson(join(fixture.root, "transactions", "transaction-started.json"), {
    schema_version: "v0",
    transaction_id: "transaction-started",
    kind: "fixture",
    idempotency_key: "fixture",
    status: "started",
    started_at: "2026-08-14T00:00:00.000Z",
    completed_at: null,
    recovered_at: null,
    backup_path: ".apex-v2.transaction-backups/fixture/apex-v2",
    extra_snapshots: [],
    result: null,
    error: null
  });

  const inspection = inspectOperationalIntegrity(fixture.root);
  assert.ok(inspection.issues.some((item) => item.kind === "worker-merge-status-mismatch"));
  assert.ok(inspection.issues.some((item) => item.kind === "unfinished-transaction"));
});

test("operational integrity rejects drifted latest patch alias", () => {
  const fixture = operationalFixture();
  const aliasPath = join(fixture.workerDir, "patch-bundle.json");
  const patch = readJson(aliasPath);
  writeJson(join(
    fixture.workerDir,
    "patches",
    patch.patch_id,
    "patch-bundle.json"
  ), patch);
  patch.summary = "mutated alias";
  writeJson(aliasPath, patch);

  const inspection = inspectOperationalIntegrity(fixture.root);
  assert.ok(inspection.issues.some((item) => item.kind === "patch-alias-drift"));
});

test("operational integrity verifies Decision artifacts and Negative Control closure", () => {
  const fixture = operationalFixture();
  const artifact = {
    schema_version: "v0",
    artifact_id: "artifact-decision",
    run_id: "run-1",
    node_id: "plan_graph",
    type: "decision",
    title: "Decision",
    body: "Choose option A",
    refs: [],
    created_at: "2026-08-25T00:00:00.000Z",
    updated_at: "2026-08-25T00:00:00.000Z"
  };
  writeJson(join(
    fixture.root,
    "artifacts",
    "run-1",
    "artifact-decision.json"
  ), artifact);
  writeJson(join(fixture.root, "decisions", "index.json"), [{
    decision_id: "decision-1",
    run_id: "run-1",
    status: "proposed",
    mode: "shadow",
    revision: 1,
    artifact_id: artifact.artifact_id,
    artifact_sha256: createHash("sha256")
      .update(JSON.stringify(artifact))
      .digest("hex"),
    candidate_digest: null
  }]);
  writeJson(join(fixture.runDir, "negative-control.json"), {
    record_id: "negative-control-1",
    run_id: "run-1",
    mode: "enforce",
    status: "restored",
    revision: 4,
    red_evidence_refs: ["red"],
    green_evidence_refs: ["green"],
    restoration_evidence_refs: ["restored"],
    waiver: null
  });

  assert.equal(
    inspectOperationalIntegrity(fixture.root).issues.some((item) =>
      item.kind.startsWith("decision-")
      || item.kind.startsWith("negative-control-")
    ),
    false
  );

  artifact.body = "mutated";
  writeJson(join(
    fixture.root,
    "artifacts",
    "run-1",
    "artifact-decision.json"
  ), artifact);
  writeJson(join(fixture.runDir, "negative-control.json"), {
    record_id: "negative-control-1",
    run_id: "run-1",
    mode: "enforce",
    status: "restored",
    revision: 4,
    red_evidence_refs: [],
    green_evidence_refs: ["green"],
    restoration_evidence_refs: ["restored"],
    waiver: null
  });
  const inspection = inspectOperationalIntegrity(fixture.root);
  assert.ok(inspection.issues.some((item) =>
    item.kind === "decision-artifact-hash-mismatch"
  ));
  assert.ok(inspection.issues.some((item) =>
    item.kind === "negative-control-incomplete-restoration"
  ));
});

function operationalFixture() {
  const project = mkdtempSync(join(tmpdir(), "apex-operational-"));
  const root = join(project, ".apex-v2");
  const runId = "run-1";
  const runDir = join(root, "runs", runId);
  const workerDir = join(runDir, "workers", "worker-1");
  mkdirSync(workerDir, { recursive: true });
  mkdirSync(join(root, "approvals"), { recursive: true });
  mkdirSync(join(root, "transactions"), { recursive: true });
  write(project, "src/app.mjs", "export const value = 1;\n");
  writeJson(join(root, "project.json"), {
    schema_version: "v0",
    format_version: 1,
    revision: 1,
    project_id: "project-1",
    project_name: "Operational",
    created_at: "2026-08-14T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z",
    active_milestone: null,
    knowledge_version: 0,
    last_event_id: null,
    active_runs: [runId],
    wip_limits: { active_runs: 1, parallel_workers: 1 }
  });
  writeJson(join(runDir, "run.json"), {
    schema_version: "v0",
    run_id: runId,
    roadmap_node_id: "roadmap-1",
    status: "active"
  });
  writeJson(join(runDir, "plan-graph.json"), {
    schema_version: "v0",
    run_id: runId,
    verification_policy: { required_commands: ["npm test"], schema_check: "" },
    nodes: []
  });
  const patch = {
    schema_version: "v0",
    patch_id: "patch-1",
    worker_id: "worker-1",
    run_id: runId,
    plan_node_id: "delivery-implementation",
    summary: "fixture",
    changed_files: ["src/app.mjs"],
    operations: [{
      op: "replace_text",
      path: "src/app.mjs",
      old_text: "export const value = 1;\n",
      new_text: "export const value = 2;\n"
    }],
    evidence_refs: [],
    status: "submitted",
    created_at: "2026-08-14T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z"
  };
  writeJson(join(workerDir, "worker.json"), {
    worker_id: "worker-1",
    plan_node_id: "delivery-implementation",
    status: "queued",
    adapter: "codex",
    fencing_token: 0,
    claim_expires_at: null
  });
  writeJson(join(workerDir, "patch-bundle.json"), patch);
  const queue = {
    schema_version: "v0",
    run_id: runId,
    updated_at: "2026-08-14T00:00:00.000Z",
    items: [{
      patch_id: patch.patch_id,
      worker_id: patch.worker_id,
      plan_node_id: patch.plan_node_id,
      status: "queued",
      changed_files: patch.changed_files
    }],
    conflicts: [],
    resolutions: []
  };
  writeJson(join(runDir, "merge-queue.json"), queue);
  const candidate = buildCandidateSet(root, { run_id: runId }, queue, project);
  persistCandidateSet(root, candidate);
  writeJson(join(runDir, "verification-report.json"), {
    report_id: "verification-1",
    status: "PASS",
    candidate_digest: candidate.candidate_digest
  });
  writeJson(join(runDir, "review-report.json"), {
    report_id: "review-1",
    status: "PASS",
    candidate_digest: candidate.candidate_digest
  });
  writeJson(join(runDir, "integration-report.json"), {
    report_id: "integration-1",
    status: "MERGED",
    candidate_digest: candidate.candidate_digest
  });
  writeJson(join(root, "approvals", "items.json"), [{
    id: "approval-1",
    kind: "merge",
    run_id: runId,
    status: "decided",
    decision: "approved",
    candidate_digest: candidate.candidate_digest,
    action_hash: "a".repeat(64)
  }]);
  return { project, root, runDir, workerDir, candidate };
}

function write(project, path, content) {
  const target = join(project, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
