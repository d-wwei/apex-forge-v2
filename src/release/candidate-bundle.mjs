import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { stableHash } from "../core/candidate.mjs";
import { ensureDir, writeJson } from "../lib/common.mjs";
import { validateBenchmarkTaskPlans } from "../benchmark/task-plans.mjs";

const REPRODUCIBLE_TIMESTAMP = "2000-01-01T00:00:00.000Z";
const EXCLUDED_FILES = new Set([
  ".benchmark-task-plan.json",
  "node_modules",
  "benchmarks/plugin-vs-v1/workspaces",
  "benchmarks/plugin-vs-v1/benchmark-plan.json",
  "benchmarks/plugin-vs-v1/latest-evaluation.json",
  "benchmarks/plugin-vs-v1/results-manifest.json",
  "benchmarks/capability-absorption/latest-evaluation.json",
  "benchmarks/plugin-vs-v1/task-manifest.json",
  "benchmarks/plugin-vs-v1/task-preflight.json",
  "planning/plugin-upgrade-execution-status.md",
  ".product-audit/plugin-direction-2026-08-14/artifacts/plugin-validation.json"
]);
const EXCLUDED_PREFIXES = [
  ".apex-v2/",
  ".git/",
  "node_modules/",
  "benchmarks/plugin-vs-v1/evidence/",
  "benchmarks/plugin-vs-v1/results/",
  "benchmarks/plugin-vs-v1/workspaces/",
  "plugins/codex/apex-forge-v2/runtime/",
  "plugins/claude-code/apex-forge-v2/runtime/"
];
const EXCLUDED_PLUGIN_BASENAMES = new Set([
  "CHECKSUMS.sha256",
  "LICENSE",
  "PROVENANCE.json",
  "SBOM.json",
  "THIRD_PARTY_NOTICES"
]);

export function freezeReleaseCandidate({
  repoRoot,
  outputRoot = join(repoRoot, ".apex-v2", "releases", "candidates"),
  latestPath = join(repoRoot, ".apex-v2", "releases", "latest-candidate.json"),
  timestamp = REPRODUCIBLE_TIMESTAMP,
  expectedDigest = null
}) {
  const taskValidation = validateTaskPlans(repoRoot);
  if (taskValidation.status !== "PASS") {
    throw new Error(`benchmark task plans invalid: ${JSON.stringify(taskValidation.errors)}`);
  }

  const temp = mkdtempSync(join(tmpdir(), "apex-release-candidate-"));
  const sourceRoot = join(temp, "source");
  const buildRoot = join(temp, "build");
  mkdirSync(sourceRoot, { recursive: true });
  try {
    const sourceFiles = listReleaseSourceFiles(repoRoot);
    copySourceFiles(repoRoot, sourceRoot, sourceFiles);
    initializeSnapshotRepository(sourceRoot, timestamp);
    cloneSnapshot(sourceRoot, buildRoot);
    linkDependencies(repoRoot, buildRoot);
    runChecked("npm", ["run", "build:plugin"], {
      cwd: buildRoot,
      env: {
        ...process.env,
        APEX_BUILD_TIMESTAMP: timestamp
      }
    });

    const runtime = readJson(join(
      buildRoot,
      "plugins",
      "codex",
      "apex-forge-v2",
      "runtime",
      "runtime.json"
    ));
    if (runtime.source_dirty !== false) {
      throw new Error("candidate snapshot build reported source_dirty=true");
    }
    const sourceArchive = gitBuffer(sourceRoot, ["archive", "--format=tar", "HEAD"]);
    const content = candidateContent({
      buildRoot,
      sourceRoot,
      sourceFiles,
      sourceArchive,
      taskValidation,
      runtime
    });
    const candidateDigest = stableHash(content);
    if (expectedDigest && candidateDigest !== expectedDigest) {
      throw new Error(
        `release candidate changed: expected ${expectedDigest}, actual ${candidateDigest}`
      );
    }
    const candidateRoot = join(outputRoot, candidateDigest);
    const manifest = {
      schema_version: "v0",
      release_candidate_digest: candidateDigest,
      created_at: new Date().toISOString(),
      reproducible_timestamp: timestamp,
      content,
      provenance: {
        origin_commit: gitValue(repoRoot, ["rev-parse", "HEAD"]),
        origin_dirty: gitValue(repoRoot, ["status", "--porcelain"]).length > 0,
        origin_status_sha256: sha256(gitBuffer(repoRoot, [
          "status",
          "--porcelain=v1",
          "-z",
          "--untracked-files=all"
        ])),
        snapshot_commit: gitValue(sourceRoot, ["rev-parse", "HEAD"]),
        snapshot_tree: gitValue(sourceRoot, ["rev-parse", "HEAD^{tree}"]),
        snapshot_clean: gitValue(sourceRoot, ["status", "--porcelain"]).length === 0
      },
      artifacts: {
        source_archive: "source.tar",
        codex_plugin: "plugins/codex/apex-forge-v2",
        claude_plugin: "plugins/claude-code/apex-forge-v2"
      }
    };

    if (existsSync(candidateRoot)) {
      verifyExistingCandidate(candidateRoot, manifest);
    } else {
      persistCandidate({
        outputRoot,
        candidateRoot,
        sourceArchive,
        buildRoot,
        manifest
      });
    }
    writeJson(latestPath, {
      schema_version: "v0",
      release_candidate_digest: candidateDigest,
      candidate_path: relative(repoRoot, candidateRoot).split(sep).join("/"),
      manifest_sha256: sha256(readFileSync(join(candidateRoot, "manifest.json"))),
      updated_at: new Date().toISOString()
    });
    return { candidateRoot, manifest };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export function currentReleaseSourceManifest(repoRoot) {
  const files = listReleaseSourceFiles(repoRoot);
  return {
    source_file_count: files.length,
    source_manifest_sha256: hashSelectedFiles(repoRoot, files)
  };
}

export function verifyReleaseCandidateBundle({
  repoRoot,
  candidateRoot,
  checkCurrentSource = true
}) {
  const errors = [];
  const manifestPath = join(candidateRoot, "manifest.json");
  if (!existsSync(manifestPath)) {
    return { status: "FAIL", errors: ["manifest.json missing"] };
  }
  const manifest = readJson(manifestPath);
  const expectedDigest = stableHash(manifest.content);
  if (expectedDigest !== manifest.release_candidate_digest) {
    errors.push("release_candidate_digest does not match content");
  }
  const sourceArchivePath = join(candidateRoot, "source.tar");
  if (
    !existsSync(sourceArchivePath)
    || sha256(readFileSync(sourceArchivePath)) !== manifest.content.source_archive_sha256
  ) {
    errors.push("source archive hash mismatch");
  }
  for (const [name, path, expected] of [
    [
      "Codex plugin",
      join(candidateRoot, "plugins", "codex", "apex-forge-v2"),
      manifest.content.codex_plugin_sha256
    ],
    [
      "Claude plugin",
      join(candidateRoot, "plugins", "claude-code", "apex-forge-v2"),
      manifest.content.claude_plugin_sha256
    ]
  ]) {
    if (!existsSync(path) || hashTree(path) !== expected) {
      errors.push(`${name} hash mismatch`);
    }
  }
  const runtimePath = join(
    candidateRoot,
    "plugins",
    "codex",
    "apex-forge-v2",
    "runtime",
    "runtime.json"
  );
  if (!existsSync(runtimePath)) {
    errors.push("runtime.json missing");
  } else {
    const runtime = readJson(runtimePath);
    if (runtime.source_dirty !== false) errors.push("runtime source_dirty is not false");
    if (runtime.runtime_sha256 !== manifest.content.runtime_sha256) {
      errors.push("runtime hash differs from candidate content");
    }
    if (runtime.schemas_sha256 !== manifest.content.schemas_sha256) {
      errors.push("schema hash differs from candidate content");
    }
    if (runtime.capabilities_sha256 !== manifest.content.capabilities_sha256) {
      errors.push("capabilities hash differs from candidate content");
    }
  }
  if (checkCurrentSource) {
    const current = currentReleaseSourceManifest(repoRoot);
    if (current.source_file_count !== manifest.content.source_file_count) {
      errors.push(
        `current source file count differs: ${current.source_file_count} != ${manifest.content.source_file_count}`
      );
    }
    if (current.source_manifest_sha256 !== manifest.content.source_manifest_sha256) {
      errors.push("current releasable source hash differs from candidate");
    }
  }
  return {
    status: errors.length === 0 ? "PASS" : "FAIL",
    release_candidate_digest: manifest.release_candidate_digest,
    manifest,
    errors
  };
}

export function listReleaseSourceFiles(repoRoot) {
  const result = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repoRoot, encoding: "buffer" }
  );
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${String(result.stderr || "")}`);
  }
  return result.stdout.toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((path) => existsSync(join(repoRoot, path)))
    .filter((path) => !isExcludedSourcePath(path))
    .sort();
}

export function isExcludedSourcePath(path) {
  const normalized = path.split("\\").join("/");
  if (EXCLUDED_FILES.has(normalized)) return true;
  if (EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  if (
    normalized.startsWith("plugins/codex/apex-forge-v2/")
    || normalized.startsWith("plugins/claude-code/apex-forge-v2/")
  ) {
    return EXCLUDED_PLUGIN_BASENAMES.has(normalized.split("/").at(-1));
  }
  return false;
}

export function candidateContent({
  buildRoot,
  sourceRoot,
  sourceFiles,
  sourceArchive,
  taskValidation,
  runtime
}) {
  const codexPlugin = join(buildRoot, "plugins", "codex", "apex-forge-v2");
  const claudePlugin = join(buildRoot, "plugins", "claude-code", "apex-forge-v2");
  const policyFiles = [
    "src/core/policy-defaults.mjs",
    ...sourceFiles.filter((path) =>
      path.startsWith("schemas/")
      && (
        path.includes("policy")
        || path.endsWith("execution-route.schema.json")
        || path.endsWith("approval-request.schema.json")
      )
    )
  ].filter((path, index, values) => values.indexOf(path) === index);
  const portableMatrix = readJson(join(
    sourceRoot,
    "benchmarks",
    "plugin-vs-v1",
    "matrix.json"
  ));
  return {
    release_version: runtime.release_version,
    source_commit: runtime.source_commit,
    source_tree_hash: runtime.source_tree_hash,
    source_archive_sha256: sha256(sourceArchive),
    source_file_count: sourceFiles.length,
    source_manifest_sha256: hashSelectedFiles(sourceRoot, sourceFiles),
    runtime_sha256: runtime.runtime_sha256,
    schemas_sha256: runtime.schemas_sha256,
    capabilities_sha256: runtime.capabilities_sha256,
    codex_plugin_sha256: hashTree(codexPlugin),
    claude_plugin_sha256: hashTree(claudePlugin),
    policies_sha256: hashSelectedFiles(sourceRoot, policyFiles),
    benchmark_matrix_sha256: portableBenchmarkMatrixHash(portableMatrix),
    benchmark_task_set_digest: taskValidation.task_set_digest
  };
}

export function portableBenchmarkMatrixHash(matrix) {
  const portable = {
    ...matrix,
    repositories: matrix.repositories.map((repository) => {
      const { source_path: _sourcePath, ...value } = repository;
      return value;
    })
  };
  return sha256(Buffer.from(JSON.stringify(portable)));
}

function validateTaskPlans(repoRoot) {
  const benchmarkRoot = join(repoRoot, "benchmarks", "plugin-vs-v1");
  return validateBenchmarkTaskPlans({
    matrix: readJson(join(benchmarkRoot, "matrix.json")),
    schema: readJson(join(repoRoot, "schemas", "benchmark-task-plan.schema.json")),
    taskDir: join(benchmarkRoot, "tasks"),
    workspaceRoot: join(benchmarkRoot, "workspaces", "base")
  });
}

function copySourceFiles(repoRoot, targetRoot, files) {
  for (const path of files) {
    const source = join(repoRoot, path);
    const target = join(targetRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    const stat = lstatSync(source);
    if (stat.isSymbolicLink()) {
      symlinkSync(readlinkSync(source), target);
    } else if (stat.isFile()) {
      cpSync(source, target, { preserveTimestamps: true });
    }
  }
}

function initializeSnapshotRepository(sourceRoot, timestamp) {
  runChecked("git", ["init", "-q"], { cwd: sourceRoot });
  runChecked("git", ["config", "user.name", "Apex Forge Release"], { cwd: sourceRoot });
  runChecked("git", ["config", "user.email", "release@apex-forge.local"], { cwd: sourceRoot });
  runChecked("git", ["add", "-A"], { cwd: sourceRoot });
  runChecked("git", ["commit", "-q", "-m", "Apex Forge release candidate snapshot"], {
    cwd: sourceRoot,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: timestamp,
      GIT_COMMITTER_DATE: timestamp
    }
  });
  if (gitValue(sourceRoot, ["status", "--porcelain"]).length > 0) {
    throw new Error("candidate source snapshot is not clean");
  }
}

function cloneSnapshot(sourceRoot, buildRoot) {
  runChecked("git", ["clone", "-q", "--no-hardlinks", sourceRoot, buildRoot], {
    cwd: dirname(buildRoot)
  });
}

function linkDependencies(repoRoot, buildRoot) {
  const source = join(repoRoot, "node_modules");
  if (!existsSync(source)) throw new Error("node_modules missing; run npm ci before freezing candidate");
  writeFileSync(join(buildRoot, ".git", "info", "exclude"), "node_modules\nnode_modules/\n");
  symlinkSync(source, join(buildRoot, "node_modules"), "dir");
}

function persistCandidate({
  outputRoot,
  candidateRoot,
  sourceArchive,
  buildRoot,
  manifest
}) {
  ensureDir(outputRoot);
  const staging = `${candidateRoot}.tmp-${process.pid}`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(join(staging, "plugins", "codex"), { recursive: true });
  mkdirSync(join(staging, "plugins", "claude-code"), { recursive: true });
  writeFileSync(join(staging, "source.tar"), sourceArchive);
  cpSync(
    join(buildRoot, "plugins", "codex", "apex-forge-v2"),
    join(staging, "plugins", "codex", "apex-forge-v2"),
    { recursive: true }
  );
  cpSync(
    join(buildRoot, "plugins", "claude-code", "apex-forge-v2"),
    join(staging, "plugins", "claude-code", "apex-forge-v2"),
    { recursive: true }
  );
  writeJson(join(staging, "manifest.json"), manifest);
  renameSync(staging, candidateRoot);
}

function verifyExistingCandidate(candidateRoot, expected) {
  const existing = readJson(join(candidateRoot, "manifest.json"));
  if (existing.release_candidate_digest !== expected.release_candidate_digest) {
    throw new Error("existing candidate digest mismatch");
  }
  if (stableHash(existing.content) !== stableHash(expected.content)) {
    throw new Error("existing candidate content mismatch");
  }
  const checks = [
    [
      "source archive",
      sha256(readFileSync(join(candidateRoot, "source.tar"))),
      expected.content.source_archive_sha256
    ],
    [
      "Codex plugin",
      hashTree(join(candidateRoot, "plugins", "codex", "apex-forge-v2")),
      expected.content.codex_plugin_sha256
    ],
    [
      "Claude plugin",
      hashTree(join(candidateRoot, "plugins", "claude-code", "apex-forge-v2")),
      expected.content.claude_plugin_sha256
    ]
  ];
  for (const [name, actual, wanted] of checks) {
    if (actual !== wanted) throw new Error(`existing ${name} hash mismatch`);
  }
}

function hashSelectedFiles(root, files) {
  const hash = createHash("sha256");
  for (const path of files.sort()) {
    const target = join(root, path);
    if (!existsSync(target) || !lstatSync(target).isFile()) {
      throw new Error(`candidate source file missing: ${path}`);
    }
    hash.update(path);
    hash.update("\0");
    hash.update(readFileSync(target));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function hashTree(root) {
  const hash = createHash("sha256");
  for (const path of listFiles(root)) {
    const target = join(root, path);
    const stat = lstatSync(target);
    hash.update(path);
    hash.update("\0");
    hash.update(String(stat.mode & 0o777));
    hash.update("\0");
    hash.update(readFileSync(target));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function listFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const target = join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) files.push(relative(root, target).split(sep).join("/"));
    }
  };
  visit(root);
  return files;
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${result.stderr || result.stdout || result.error?.message}`
    );
  }
  return result;
}

function gitValue(cwd, args) {
  return runChecked("git", args, { cwd }).stdout.trim();
}

function gitBuffer(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "buffer",
    maxBuffer: 256 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${String(result.stderr || "")}`);
  }
  return result.stdout;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
