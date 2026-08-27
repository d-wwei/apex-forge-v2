import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync
} from "node:fs";
import { relative, resolve, sep } from "node:path";
import { assertContract } from "../core/contracts.mjs";

export function loadVerifiedBenchmarkResults({
  repoRoot,
  benchmarkDir,
  manifest,
  expectedCandidateDigest,
  expectedTaskSetDigest,
  expectedArtifactPrefix = null
}) {
  assertContract(
    "benchmark-results-manifest.schema.json",
    manifest,
    "benchmark-results-manifest"
  );
  if (manifest.release_candidate_digest !== expectedCandidateDigest) {
    throw new Error(
      `benchmark candidate mismatch: ${manifest.release_candidate_digest} != ${expectedCandidateDigest}`
    );
  }
  if (manifest.task_set_digest !== expectedTaskSetDigest) {
    throw new Error(
      `benchmark task set mismatch: ${manifest.task_set_digest} != ${expectedTaskSetDigest}`
    );
  }

  const seen = new Set();
  return manifest.results.map((entry) => {
    if (seen.has(entry.path)) {
      throw new Error(`duplicate benchmark result path: ${entry.path}`);
    }
    seen.add(entry.path);
    const resultPath = resolveContainedFile(benchmarkDir, entry.path);
    if (fileSha256(resultPath) !== entry.sha256) {
      throw new Error(`benchmark result hash mismatch: ${entry.path}`);
    }
    const result = JSON.parse(readFileSync(resultPath, "utf8"));
    assertContract(
      "benchmark-result.schema.json",
      result,
      `benchmark-result:${entry.path}`
    );
    if (result.candidate_digest !== manifest.release_candidate_digest) {
      throw new Error(`benchmark result candidate mismatch: ${entry.path}`);
    }
    const runKey = `${result.task_id}--${result.mode}`;
    const expectedPath = [
      "results",
      result.candidate_digest,
      `${runKey}.json`
    ].join("/");
    if (normalized(entry.path) !== expectedPath) {
      throw new Error(
        `benchmark result path mismatch: ${entry.path} != ${expectedPath}`
      );
    }
    verifyBenchmarkResultArtifacts({
      repoRoot,
      result,
      expectedArtifactPrefix
    });
    return result;
  });
}

export function verifyBenchmarkResultArtifacts({
  repoRoot,
  result,
  expectedArtifactPrefix = null
}) {
  const refs = result.provenance.artifact_refs;
  const hashes = result.provenance.artifact_hashes;
  if (refs.length !== hashes.length) {
    throw new Error(
      `benchmark artifact ref/hash cardinality mismatch: ${result.task_id}:${result.mode}`
    );
  }
  if (new Set(refs).size !== refs.length) {
    throw new Error(`duplicate benchmark artifact ref: ${result.task_id}:${result.mode}`);
  }
  if (!result.provenance.raw_log_refs.every((ref) => refs.includes(ref))) {
    throw new Error(`raw log missing from artifact refs: ${result.task_id}:${result.mode}`);
  }
  const runKey = `${result.task_id}--${result.mode}`;
  const expectedPrefix = expectedArtifactPrefix
    ? `${normalized(expectedArtifactPrefix).replace(/\/+$/, "")}/${runKey}/`
    : [
        "benchmarks",
        "plugin-vs-v1",
        "workspaces",
        "runs",
        result.candidate_digest,
        "runs",
        runKey,
        ""
      ].join("/");
  for (const [index, ref] of refs.entries()) {
    if (!normalized(ref).startsWith(expectedPrefix)) {
      throw new Error(`benchmark artifact outside run root: ${ref}`);
    }
    const artifactPath = resolveContainedFile(repoRoot, ref);
    if (fileSha256(artifactPath) !== hashes[index]) {
      throw new Error(`benchmark artifact hash mismatch: ${ref}`);
    }
  }
}

export function collectBenchmarkProcessEvidence({ repoRoot, runRoot }) {
  const executionFiles = readdirSync(runRoot)
    .filter((name) => /^execution-\d+\.json$/.test(name))
    .sort((left, right) =>
      Number(left.match(/\d+/)[0]) - Number(right.match(/\d+/)[0])
    );
  const rawLogs = [];
  const artifacts = [];
  for (const name of executionFiles) {
    const executionPath = resolveContainedFile(runRoot, name);
    rawLogs.push(executionPath);
    artifacts.push(executionPath);
    const execution = JSON.parse(readFileSync(executionPath, "utf8"));
    for (const ref of execution.raw_logs || []) {
      const path = resolveContainedFile(repoRoot, ref);
      rawLogs.push(path);
      artifacts.push(path);
    }
    if (execution.output_path) {
      const outputPath = resolve(repoRoot, normalized(execution.output_path));
      if (existsSync(outputPath)) {
        artifacts.push(resolveContainedFile(repoRoot, execution.output_path));
      }
    }
  }
  return {
    raw_logs: unique(rawLogs),
    artifact_paths: unique(artifacts)
  };
}

export function fileSha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function resolveContainedFile(root, path) {
  const value = normalized(path);
  if (
    !value
    || value.startsWith("/")
    || value.includes("\0")
    || value.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error(`unsafe benchmark evidence path: ${path}`);
  }
  const target = resolve(root, value);
  if (!existsSync(target) || lstatSync(target).isSymbolicLink()) {
    throw new Error(`benchmark evidence file missing or symlinked: ${path}`);
  }
  if (!lstatSync(target).isFile()) {
    throw new Error(`benchmark evidence path is not a file: ${path}`);
  }
  const rootReal = realpathSync(root);
  const targetReal = realpathSync(target);
  const relativePath = relative(rootReal, targetReal);
  if (
    relativePath === ""
    || relativePath === ".."
    || relativePath.startsWith(`..${sep}`)
    || resolve(rootReal, relativePath) !== targetReal
  ) {
    throw new Error(`unsafe benchmark evidence path: ${path}`);
  }
  return targetReal;
}

function normalized(path) {
  return String(path || "").split("\\").join("/");
}

function unique(values) {
  return [...new Set(values)];
}
