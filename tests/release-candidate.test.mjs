import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateContent,
  isExcludedSourcePath,
  listReleaseSourceFiles,
  portableBenchmarkMatrixHash
} from "../src/release/candidate-bundle.mjs";

const REPO = new URL("../", import.meta.url).pathname;

test("release source selection includes implementation and benchmark definitions", () => {
  const files = listReleaseSourceFiles(REPO);
  assert.ok(files.includes("src/apex-v2.mjs"));
  assert.ok(files.includes("benchmarks/plugin-vs-v1/matrix.json"));
  assert.ok(files.includes("benchmarks/plugin-vs-v1/tasks/apex-forge-v1.json"));
  assert.ok(!files.includes(".benchmark-task-plan.json"));
  assert.ok(!files.includes("benchmarks/plugin-vs-v1/task-manifest.json"));
  assert.ok(!files.includes("planning/plugin-upgrade-execution-status.md"));
  assert.ok(!files.some((path) => path.includes("/runtime/")));
});

test("release source exclusions remove generated evidence and plugin output", () => {
  assert.equal(isExcludedSourcePath("benchmarks/plugin-vs-v1/evidence/run.json"), true);
  assert.equal(isExcludedSourcePath("planning/plugin-upgrade-execution-status.md"), true);
  assert.equal(isExcludedSourcePath("plugins/codex/apex-forge-v2/runtime/apex-v2.mjs"), true);
  assert.equal(isExcludedSourcePath("plugins/codex/apex-forge-v2/PROVENANCE.json"), true);
  assert.equal(isExcludedSourcePath("benchmarks/plugin-vs-v1/tasks/chorus.json"), false);
});

test("candidate content changes when the task set changes", () => {
  const base = {
    buildRoot: REPO,
    sourceRoot: REPO,
    sourceFiles: ["src/core/policy-defaults.mjs", "benchmarks/plugin-vs-v1/matrix.json"],
    sourceArchive: Buffer.from("source"),
    runtime: {
      release_version: "0.2.0-rc.1",
      source_commit: "a".repeat(40),
      source_tree_hash: "b".repeat(64),
      runtime_sha256: "c".repeat(64),
      schemas_sha256: "d".repeat(64)
    }
  };
  const first = candidateContent({
    ...base,
    taskValidation: { task_set_digest: "e".repeat(64) }
  });
  const second = candidateContent({
    ...base,
    taskValidation: { task_set_digest: "f".repeat(64) }
  });
  assert.notEqual(first.benchmark_task_set_digest, second.benchmark_task_set_digest);
});

test("portable matrix hash ignores only local source paths", () => {
  const first = {
    repositories: [{
      id: "repo",
      source_path: "/one",
      source_commit: "abc",
      install_command: "npm ci"
    }],
    scenarios: [{ id: "simple" }]
  };
  const second = structuredClone(first);
  second.repositories[0].source_path = "/two";
  assert.equal(
    portableBenchmarkMatrixHash(first),
    portableBenchmarkMatrixHash(second)
  );
  second.repositories[0].install_command = "npm install";
  assert.notEqual(
    portableBenchmarkMatrixHash(first),
    portableBenchmarkMatrixHash(second)
  );
});
