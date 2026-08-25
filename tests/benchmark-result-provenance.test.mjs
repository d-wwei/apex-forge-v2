import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import {
  collectBenchmarkProcessEvidence,
  fileSha256,
  loadVerifiedBenchmarkResults
} from "../src/benchmark/result-provenance.mjs";

const CANDIDATE = "a".repeat(64);
const TASK_SET = "b".repeat(64);
const TASK_DIGEST = "c".repeat(64);
const RUNTIME_HASH = "d".repeat(64);

test("verified benchmark results bind candidate, task set, result hash, and artifacts", () => {
  const fixture = provenanceFixture();
  const results = loadVerifiedBenchmarkResults({
    repoRoot: fixture.root,
    benchmarkDir: fixture.benchmarkDir,
    manifest: fixture.manifest,
    expectedCandidateDigest: CANDIDATE,
    expectedTaskSetDigest: TASK_SET
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].candidate_digest, CANDIDATE);
});

test("verified benchmark results reject a release candidate mismatch", () => {
  const fixture = provenanceFixture();
  assert.throws(() => loadVerifiedBenchmarkResults({
    repoRoot: fixture.root,
    benchmarkDir: fixture.benchmarkDir,
    manifest: fixture.manifest,
    expectedCandidateDigest: "e".repeat(64),
    expectedTaskSetDigest: TASK_SET
  }), /candidate/i);
});

test("verified benchmark results reject artifact mutation after evaluation", () => {
  const fixture = provenanceFixture();
  writeFileSync(fixture.artifactPaths[0], "tampered\n");

  assert.throws(() => loadVerifiedBenchmarkResults({
    repoRoot: fixture.root,
    benchmarkDir: fixture.benchmarkDir,
    manifest: fixture.manifest,
    expectedCandidateDigest: CANDIDATE,
    expectedTaskSetDigest: TASK_SET
  }), /artifact hash mismatch/i);
});

test("verified benchmark results reject result mutation and path traversal", () => {
  const fixture = provenanceFixture();
  writeFileSync(fixture.resultPath, `${readFileSync(fixture.resultPath, "utf8")} \n`);
  assert.throws(() => loadVerifiedBenchmarkResults({
    repoRoot: fixture.root,
    benchmarkDir: fixture.benchmarkDir,
    manifest: fixture.manifest,
    expectedCandidateDigest: CANDIDATE,
    expectedTaskSetDigest: TASK_SET
  }), /result hash mismatch/i);

  const traversal = provenanceFixture();
  traversal.manifest.results[0].path = "../outside.json";
  assert.throws(() => loadVerifiedBenchmarkResults({
    repoRoot: traversal.root,
    benchmarkDir: traversal.benchmarkDir,
    manifest: traversal.manifest,
    expectedCandidateDigest: CANDIDATE,
    expectedTaskSetDigest: TASK_SET
  }), /unsafe benchmark evidence path/i);
});

test("process evidence collection preserves every recovery attempt", () => {
  const fixture = provenanceFixture();
  const runRoot = dirname(fixture.artifactPaths[0]);
  const secondLog = join(runRoot, "process-2.jsonl");
  const secondOutput = join(runRoot, "agent-output-2.json");
  writeFileSync(secondLog, "attempt-2\n");
  writeFileSync(secondOutput, "output-2\n");
  for (const [attempt, rawLog, output] of [
    [1, fixture.artifactPaths[0], fixture.artifactPaths[2]],
    [2, secondLog, secondOutput]
  ]) {
    writeFileSync(join(runRoot, `execution-${attempt}.json`), `${JSON.stringify({
      raw_logs: [relative(fixture.root, rawLog)],
      output_path: relative(fixture.root, output)
    }, null, 2)}\n`);
  }

  const evidence = collectBenchmarkProcessEvidence({
    repoRoot: fixture.root,
    runRoot
  });
  assert.equal(evidence.raw_logs.length, 4);
  assert.equal(evidence.artifact_paths.length, 6);
  assert.ok(evidence.raw_logs.some((path) => path.endsWith("execution-1.json")));
  assert.ok(evidence.raw_logs.some((path) => path.endsWith("execution-2.json")));
});

function provenanceFixture() {
  const root = mkdtempSync(join(tmpdir(), "apex-benchmark-provenance-"));
  const benchmarkDir = join(root, "benchmarks", "plugin-vs-v1");
  const runKey = "repo--simple--plugin-kernel";
  const artifactRoot = join(
    benchmarkDir,
    "workspaces",
    "runs",
    CANDIDATE,
    "runs",
    runKey
  );
  const artifactPaths = [
    join(artifactRoot, "process-1.jsonl"),
    join(artifactRoot, "process-1.stderr.log"),
    join(artifactRoot, "agent-output-1.json")
  ];
  for (const [index, path] of artifactPaths.entries()) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `artifact-${index}\n`);
  }
  const refs = artifactPaths.map((path) => relative(root, path));
  const result = {
    task_id: "repo--simple",
    task_digest: TASK_DIGEST,
    repository: "repo",
    scenario: "simple",
    mode: "plugin-kernel",
    candidate_digest: CANDIDATE,
    attempt: 1,
    metrics: {
      completion: 1,
      user_actions: 0,
      recovery: 1,
      evidence: 1,
      wall_ms: 100,
      cost: 100,
      safety: 1,
      hidden_acceptance: 1,
      defect_detection: 1,
      false_positive: 0,
      durable_closure: 1,
      false_completion_claim: false
    },
    provenance: {
      source_commit: "1234567",
      source_tree: "1".repeat(40),
      source_manifest_sha256: "2".repeat(64),
      runtime_hash: RUNTIME_HASH,
      model: "fixture-model",
      provider: "fixture-provider",
      reasoning_effort: "fixture-effort",
      runner_version: "fixture-runner",
      execution_config_fingerprint: RUNTIME_HASH,
      environment_fingerprint: "fixture-environment",
      raw_log_refs: refs.slice(0, 2),
      artifact_refs: refs,
      artifact_hashes: artifactPaths.map(fileSha256)
    },
    evidence: {
      tests: "PASS"
    }
  };
  const resultPath = join(
    benchmarkDir,
    "results",
    CANDIDATE,
    `${runKey}.json`
  );
  mkdirSync(dirname(resultPath), { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  const manifest = {
    schema_version: "v0",
    release_candidate_digest: CANDIDATE,
    task_set_digest: TASK_SET,
    results: [{
      path: relative(benchmarkDir, resultPath),
      sha256: fileSha256(resultPath)
    }]
  };
  return {
    root,
    benchmarkDir,
    resultPath,
    artifactPaths,
    manifest
  };
}
