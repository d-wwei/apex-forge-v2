import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  buildCandidateSet,
  persistCandidateSet
} from "../src/core/candidate.mjs";
import { applyPatchOperations } from "../src/core/worker.mjs";

test("replace_text preserves replacement metacharacters byte-for-byte", () => {
  const project = mkdtempSync(join(tmpdir(), "apex-patch-replacement-"));
  const path = "src/format.ts";
  const before = "export const format = (n: number) => `${n.toFixed(2)}`;\n";
  const after = "export const format = (n: number) => `$${n.toFixed(2)}`;\n";
  write(project, path, before);

  applyPatchOperations(project, {
    operations: [{
      op: "replace_text",
      path,
      old_text: before,
      new_text: after
    }]
  });

  assert.equal(readFileSync(join(project, path), "utf8"), after);
});

test("candidate digest changes when queue order changes", () => {
  const fixture = candidateFixture();
  const first = buildCandidateSet(fixture.root, fixture.run, fixture.queue, fixture.project);
  fixture.queue.items.reverse();
  const reordered = buildCandidateSet(fixture.root, fixture.run, fixture.queue, fixture.project);
  assert.notEqual(reordered.candidate_digest, first.candidate_digest);
});

test("candidate digest changes when patch content changes", () => {
  const fixture = candidateFixture();
  const first = buildCandidateSet(fixture.root, fixture.run, fixture.queue, fixture.project);
  const patchPath = join(fixture.workerDirs[0], "patch-bundle.json");
  const patch = JSON.parse(readFileSync(patchPath, "utf8"));
  patch.operations[0].new_text = "export const value = 99;\n";
  writeFileSync(patchPath, `${JSON.stringify(patch, null, 2)}\n`);
  const changed = buildCandidateSet(fixture.root, fixture.run, fixture.queue, fixture.project);
  assert.notEqual(changed.candidate_digest, first.candidate_digest);
});

test("candidate digest changes when merge resolution changes", () => {
  const fixture = candidateFixture();
  const first = buildCandidateSet(fixture.root, fixture.run, fixture.queue, fixture.project);
  fixture.queue.resolutions.push({
    resolution_id: "resolution-1",
    kept_patch_id: "patch-1",
    dropped_patch_ids: ["patch-2"],
    reason: "keep patch 1"
  });
  const resolved = buildCandidateSet(fixture.root, fixture.run, fixture.queue, fixture.project);
  assert.notEqual(resolved.candidate_digest, first.candidate_digest);
});

test("candidate digest changes when verification policy changes", () => {
  const fixture = candidateFixture();
  const first = buildCandidateSet(fixture.root, fixture.run, fixture.queue, fixture.project);
  const planPath = join(fixture.root, "runs", fixture.run.run_id, "plan-graph.json");
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  plan.verification_policy.required_commands.push("node --check src/app.mjs");
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  const changed = buildCandidateSet(fixture.root, fixture.run, fixture.queue, fixture.project);
  assert.notEqual(changed.candidate_digest, first.candidate_digest);
});

test("candidate digest changes when base source changes", () => {
  const fixture = candidateFixture();
  const first = buildCandidateSet(fixture.root, fixture.run, fixture.queue, fixture.project);
  write(fixture.project, "README.md", "source drift\n");
  const changed = buildCandidateSet(fixture.root, fixture.run, fixture.queue, fixture.project);
  assert.notEqual(changed.candidate_digest, first.candidate_digest);
});

test("persisted candidate is immutable and content-addressed", () => {
  const fixture = candidateFixture();
  const candidate = buildCandidateSet(fixture.root, fixture.run, fixture.queue, fixture.project);
  const first = persistCandidateSet(fixture.root, candidate);
  const second = persistCandidateSet(fixture.root, candidate);
  const dir = join(fixture.root, "runs", fixture.run.run_id, "candidates");
  assert.equal(first.ref, second.ref);
  assert.equal(readdirSync(dir).length, 1);
  assert.equal(existsSync(join(fixture.project, first.ref)), true);
});

function candidateFixture() {
  const project = mkdtempSync(join(tmpdir(), "apex-candidate-"));
  const root = join(project, ".apex-v2");
  const run = { run_id: "run-1" };
  const runDir = join(root, "runs", run.run_id);
  const workerDirs = [
    join(runDir, "workers", "worker-1"),
    join(runDir, "workers", "worker-2")
  ];
  for (const dir of workerDirs) mkdirSync(dir, { recursive: true });
  write(project, "src/app.mjs", "export const value = 1;\n");
  write(project, "tests/app.test.mjs", "export const testValue = 1;\n");
  write(project, "README.md", "fixture\n");
  writeFileSync(join(runDir, "plan-graph.json"), `${JSON.stringify({
    schema_version: "v0",
    run_id: run.run_id,
    verification_policy: {
      required_commands: ["npm test"],
      schema_check: ""
    },
    nodes: []
  }, null, 2)}\n`);
  const patches = [
    patch("patch-1", "worker-1", "src/app.mjs", "export const value = 1;\n", "export const value = 2;\n"),
    patch("patch-2", "worker-2", "tests/app.test.mjs", "export const testValue = 1;\n", "export const testValue = 2;\n")
  ];
  patches.forEach((value, index) => {
    writeFileSync(join(workerDirs[index], "patch-bundle.json"), `${JSON.stringify(value, null, 2)}\n`);
  });
  const queue = {
    schema_version: "v0",
    run_id: run.run_id,
    updated_at: "2026-08-14T00:00:00.000Z",
    items: patches.map((value) => ({
      patch_id: value.patch_id,
      worker_id: value.worker_id,
      plan_node_id: value.plan_node_id,
      status: "queued",
      changed_files: value.changed_files
    })),
    conflicts: [],
    resolutions: []
  };
  return { project, root, run, workerDirs, queue };
}

function patch(patchId, workerId, path, oldText, newText) {
  return {
    schema_version: "v0",
    patch_id: patchId,
    worker_id: workerId,
    run_id: "run-1",
    plan_node_id: workerId === "worker-1" ? "delivery-implementation" : "delivery-tests",
    summary: patchId,
    changed_files: [path],
    operations: [{ op: "replace_text", path, old_text: oldText, new_text: newText }],
    evidence_refs: [],
    status: "submitted",
    created_at: "2026-08-14T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z"
  };
}

function write(project, path, content) {
  const target = join(project, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
