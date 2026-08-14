import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decideApproval,
  ensureMergeApproval
} from "../src/core/governance.mjs";
import { readJson, writeJson } from "../src/lib/common.mjs";

function fixture() {
  const project = mkdtempSync(join(tmpdir(), "apex-approval-v1-"));
  const root = join(project, ".apex-v2");
  const workerDir = join(root, "runs", "run-1", "workers", "worker-1");
  mkdirSync(join(root, "policies"), { recursive: true });
  mkdirSync(join(root, "roadmap"), { recursive: true });
  mkdirSync(join(root, "approvals"), { recursive: true });
  mkdirSync(workerDir, { recursive: true });
  writeJson(join(root, "policies", "execution.json"), {
    schema_version: "v0",
    updated_at: "2026-08-13T00:00:00.000Z",
    budgets: {
      max_changed_files_per_patch: 20,
      max_patch_bytes: 1000000,
      max_agent_duration_ms: 1200000,
      max_agent_runs_per_tick: 3
    },
    permissions: {
      allowed_adapters: ["shell", "human", "codex", "claude", "gemini"],
      adapter_fallback_order: ["codex", "claude", "gemini"],
      adapter_fallback_failure_kinds: ["timeout"],
      merge_approval_risks: ["critical"],
      sensitive_paths: [".github/"]
    },
    approval: {
      ttl_minutes: 60,
      required_capabilities: {
        merge: "merge_apply",
        adapter_baseline: "adapter_baseline_update"
      }
    }
  });
  writeJson(join(root, "roadmap", "graph.json"), {
    nodes: [{ id: "roadmap-1", risk: "critical" }]
  });
  writeJson(join(root, "approvals", "items.json"), []);
  writeJson(join(workerDir, "patch-bundle.json"), {
    schema_version: "v0",
    patch_id: "patch-1",
    worker_id: "worker-1",
    run_id: "run-1",
    plan_node_id: "implementation",
    summary: "approval fixture",
    changed_files: ["src/a.mjs"],
    operations: [{ op: "write_text", path: "src/a.mjs", content: "one\n" }],
    evidence_refs: [],
    status: "submitted",
    created_at: "2026-08-13T00:00:00.000Z",
    updated_at: "2026-08-13T00:00:00.000Z"
  });
  return {
    root,
    run: { run_id: "run-1", roadmap_node_id: "roadmap-1" },
    queue: {
      items: [{
        patch_id: "patch-1",
        worker_id: "worker-1",
        changed_files: ["src/a.mjs"],
        status: "queued"
      }]
    },
    workerDir
  };
}

test("Approval V1 requires the bound capability to decide", () => {
  const { root, run, queue } = fixture();
  const request = ensureMergeApproval(root, run, queue);
  assert.equal(request.allowed, false);
  assert.equal(request.approval.contract_version, "v1");
  assert.equal(request.approval.capability, "merge_apply");
  assert.match(request.approval.action_hash, /^[a-f0-9]{64}$/);
  assert.match(request.approval.policy_revision, /^[a-f0-9]{64}$/);
  assert.ok(Date.parse(request.approval.expires_at) > Date.parse(request.approval.requested_at));
  assert.throws(() => decideApproval(
    root,
    request.approval.id,
    "approved",
    "missing capability",
    { actor: "reviewer", capabilities: [] }
  ), /缺少 approval capability/);

  const approved = decideApproval(
    root,
    request.approval.id,
    "approved",
    "authorized",
    { actor: "reviewer", capabilities: ["merge_apply"] }
  );
  assert.equal(approved.decision, "approved");
  assert.deepEqual(approved.decision_capabilities, ["merge_apply"]);
  assert.equal(ensureMergeApproval(root, run, queue).allowed, true);
});

test("patch content and policy revisions invalidate an approved action", () => {
  const { root, run, queue, workerDir } = fixture();
  const first = ensureMergeApproval(root, run, queue);
  decideApproval(root, first.approval.id, "approved", "initial", {
    actor: "reviewer",
    capabilities: ["merge_apply"]
  });
  assert.equal(ensureMergeApproval(root, run, queue).allowed, true);

  const patchPath = join(workerDir, "patch-bundle.json");
  const patch = readJson(patchPath);
  patch.operations[0].content = "two\n";
  writeJson(patchPath, patch);
  const changedPatch = ensureMergeApproval(root, run, queue);
  assert.equal(changedPatch.allowed, false);
  assert.notEqual(changedPatch.approval.action_hash, first.approval.action_hash);

  decideApproval(root, changedPatch.approval.id, "approved", "changed patch", {
    actor: "reviewer",
    capabilities: ["merge_apply"]
  });
  const policyPath = join(root, "policies", "execution.json");
  const policy = readJson(policyPath);
  policy.updated_at = "2026-08-13T01:00:00.000Z";
  policy.budgets.max_patch_bytes += 1;
  writeJson(policyPath, policy);
  const changedPolicy = ensureMergeApproval(root, run, queue);
  assert.equal(changedPolicy.allowed, false);
  assert.notEqual(changedPolicy.approval.policy_revision, changedPatch.approval.policy_revision);
});

test("expired approval decisions are not reusable", () => {
  const { root, run, queue } = fixture();
  const first = ensureMergeApproval(root, run, queue);
  decideApproval(root, first.approval.id, "approved", "initial", {
    actor: "reviewer",
    capabilities: ["merge_apply"]
  });
  const path = join(root, "approvals", "items.json");
  const approvals = readJson(path);
  approvals[0].expires_at = "2000-01-01T00:00:00.000Z";
  writeJson(path, approvals);

  const replacement = ensureMergeApproval(root, run, queue);
  assert.equal(replacement.allowed, false);
  assert.equal(replacement.created, true);
  assert.notEqual(replacement.approval.id, first.approval.id);
});
