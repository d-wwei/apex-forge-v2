import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { benchmarkEnvironment } from "../src/benchmark/environment.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const benchmarkRoot = join(repoRoot, "benchmarks", "plugin-vs-v1");
const matrix = JSON.parse(readFileSync(join(benchmarkRoot, "matrix.json"), "utf8"));
const outputRoot = join(benchmarkRoot, "workspaces", "base");
const listOnly = process.argv.includes("--list");
const withDependencies = process.argv.includes("--with-dependencies");
const repositoryFilter = argumentValue("--repository");

if (listOnly) {
  console.log(JSON.stringify({
    repositories: matrix.repositories.map(repositoryManifest)
  }, null, 2));
  process.exit(0);
}

if (!repositoryFilter) rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });
const selectedRepositories = repositoryFilter
  ? matrix.repositories.filter((repository) => repository.id === repositoryFilter)
  : matrix.repositories;
if (selectedRepositories.length === 0) {
  throw new Error(`unknown benchmark repository: ${repositoryFilter}`);
}
const prepared = repositoryFilter
  ? existingPreparedRepositories(matrix.repositories, outputRoot, repositoryFilter)
  : [];
for (const repository of selectedRepositories) {
  verifyRepository(repository);
  const target = join(outputRoot, repository.id);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  const archive = spawnSync("git", ["archive", "--format=tar", repository.source_commit], {
    cwd: repository.source_path,
    encoding: null,
    maxBuffer: 256 * 1024 * 1024
  });
  if (archive.status !== 0) {
    throw new Error(`git archive failed for ${repository.id}: ${archive.stderr?.toString()}`);
  }
  const extract = spawnSync("tar", ["-xf", "-", "-C", target], {
    input: archive.stdout,
    encoding: null,
    maxBuffer: 256 * 1024 * 1024
  });
  if (extract.status !== 0) {
    throw new Error(`tar extract failed for ${repository.id}: ${extract.stderr?.toString()}`);
  }
  const manifest = {
    ...repositoryManifest(repository),
    prepared_at: new Date().toISOString(),
    target
  };
  if (withDependencies) {
    manifest.dependencies = prepareDependencies(target, repository);
  }
  writeFileSync(join(target, ".benchmark-source.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  initializeBaseRepository(target, repository);
  if (withDependencies) {
    manifest.baseline = runBaseline(target, repository);
    writeFileSync(
      join(target, ".benchmark-baseline.json"),
      `${JSON.stringify(manifest.baseline, null, 2)}\n`
    );
  }
  prepared.push(manifest);
}
prepared.sort((left, right) =>
  matrix.repositories.findIndex((repository) => repository.id === left.id)
  - matrix.repositories.findIndex((repository) => repository.id === right.id)
);
writeFileSync(
  join(outputRoot, "manifest.json"),
  `${JSON.stringify({ schema_version: "v0", repositories: prepared }, null, 2)}\n`
);
console.log(JSON.stringify({ status: "PASS", repositories: prepared }, null, 2));

function verifyRepository(repository) {
  if (!existsSync(repository.source_path)) {
    throw new Error(`benchmark source missing: ${repository.source_path}`);
  }
  const head = git(repository.source_path, ["rev-parse", repository.source_commit]);
  const tree = git(repository.source_path, ["rev-parse", `${repository.source_commit}^{tree}`]);
  if (head !== repository.source_commit) {
    throw new Error(`benchmark commit mismatch: ${repository.id}`);
  }
  if (tree !== repository.source_tree) {
    throw new Error(`benchmark tree mismatch: ${repository.id}`);
  }
}

function repositoryManifest(repository) {
  return {
    id: repository.id,
    archetype: repository.archetype,
    source_url: repository.source_url,
    source_path: repository.source_path,
    source_commit: repository.source_commit,
    source_tree: repository.source_tree,
    install_command: repository.install_command,
    prepare_command: repository.prepare_command || null,
    prepare_outputs: repository.prepare_outputs || [],
    baseline_command: repository.baseline_command,
    test_command: repository.test_command
  };
}

function runBaseline(target, repository) {
  if (!repository.baseline_command) {
    throw new Error(`benchmark baseline command missing: ${repository.id}`);
  }
  const started = Date.now();
  const result = spawnSync("/bin/zsh", ["-lc", repository.baseline_command], {
    cwd: target,
    encoding: "utf8",
    env: benchmarkEnvironment(process.env),
    maxBuffer: 256 * 1024 * 1024
  });
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: target,
    encoding: "utf8"
  });
  const report = {
    command: repository.baseline_command,
    status: result.status === 0 && status.status === 0 && status.stdout.trim() === ""
      ? "PASS"
      : "FAIL",
    exit_code: result.status ?? 1,
    duration_ms: Date.now() - started,
    source_clean: status.status === 0 && status.stdout.trim() === "",
    stdout_tail: tail(result.stdout),
    stderr_tail: tail(result.stderr || result.error?.message || "")
  };
  if (report.status !== "PASS") {
    throw new Error(`baseline failed for ${repository.id}: ${JSON.stringify(report)}`);
  }
  return report;
}

function prepareDependencies(target, repository) {
  if (!repository.install_command) {
    throw new Error(`benchmark install command missing: ${repository.id}`);
  }
  const before = snapshotSource(target);
  const started = Date.now();
  const result = spawnSync("/bin/zsh", ["-lc", repository.install_command], {
    cwd: target,
    encoding: "utf8",
    env: benchmarkEnvironment(process.env),
    maxBuffer: 256 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(
      `dependency install failed for ${repository.id}: ${result.stderr || result.stdout}`
    );
  }
  const dependencyEvidence = dependencyEvidenceFiles(target).map((path) => ({
    path,
    sha256: fileHash(join(target, path))
  }));
  const dependencyHash = hashEntries(dependencyEvidence);
  restoreSourceShape(target, before);
  if (!existsSync(join(target, "node_modules"))) {
    throw new Error(`dependency install produced no node_modules: ${repository.id}`);
  }
  const prepared = prepareRepositoryArtifacts(target, repository, before);
  const manifest = {
    install_command: repository.install_command,
    duration_ms: Date.now() - started,
    node_version: process.version,
    package_manager_versions: packageManagerVersions(),
    evidence: dependencyEvidence,
    dependency_hash: dependencyHash,
    prepare: prepared
  };
  writeFileSync(
    join(target, ".benchmark-dependencies.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  return manifest;
}

function prepareRepositoryArtifacts(target, repository, sourceBefore) {
  if (!repository.prepare_command) {
    return {
      command: null,
      duration_ms: 0,
      artifacts: []
    };
  }
  const started = Date.now();
  const result = spawnSync("/bin/zsh", ["-lc", repository.prepare_command], {
    cwd: target,
    encoding: "utf8",
    env: benchmarkEnvironment(process.env),
    maxBuffer: 256 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(
      `prepare command failed for ${repository.id}: ${result.stderr || result.stdout}`
    );
  }
  for (const [path, hash] of sourceBefore) {
    const current = join(target, path);
    if (!existsSync(current) || fileHash(current) !== hash) {
      throw new Error(`prepare command mutated pinned source: ${path}`);
    }
  }
  const allowedPrefixes = (repository.prepare_outputs || [])
    .map((path) => path.replace(/\/+$/, ""));
  const generated = listFiles(target, { excludeNodeModules: true })
    .filter((path) => !sourceBefore.has(path));
  const outside = generated.filter((path) =>
    !allowedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
  );
  if (outside.length > 0) {
    throw new Error(`prepare command wrote undeclared outputs: ${outside.join(", ")}`);
  }
  return {
    command: repository.prepare_command,
    duration_ms: Date.now() - started,
    artifacts: generated.map((path) => ({
      path,
      sha256: fileHash(join(target, path))
    }))
  };
}

function snapshotSource(root) {
  return new Map(listFiles(root, { excludeNodeModules: true }).map((path) => [
    path,
    fileHash(join(root, path))
  ]));
}

function restoreSourceShape(root, before) {
  const after = listFiles(root, { excludeNodeModules: true });
  for (const path of after) {
    if (before.has(path)) {
      if (fileHash(join(root, path)) !== before.get(path)) {
        throw new Error(`dependency install mutated source file: ${path}`);
      }
    } else {
      rmSync(join(root, path), { force: true });
    }
  }
}

function dependencyEvidenceFiles(root) {
  const candidates = [
    "bun.lock",
    "bun.lockb",
    "package-lock.json",
    "pnpm-lock.yaml",
    "node_modules/.package-lock.json",
    "node_modules/.modules.yaml",
    "node_modules/.pnpm/lock.yaml"
  ];
  return candidates.filter((path) => existsSync(join(root, path)));
}

function packageManagerVersions() {
  return Object.fromEntries([
    ["npm", ["npm", "--version"]],
    ["bun", ["bun", "--version"]],
    ["pnpm", ["pnpm", "--version"]]
  ].map(([name, command]) => {
    const result = spawnSync(command[0], command.slice(1), { encoding: "utf8" });
    return [name, result.status === 0 ? result.stdout.trim() : null];
  }));
}

function listFiles(root, options = {}) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (options.excludeNodeModules && entry.name === "node_modules") continue;
      const target = join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) files.push(relative(root, target).split(sep).join("/"));
    }
  };
  visit(root);
  return files.sort();
}

function fileHash(path) {
  const stat = lstatSync(path);
  const hash = createHash("sha256");
  hash.update(String(stat.mode & 0o777));
  hash.update("\0");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function hashEntries(entries) {
  return createHash("sha256")
    .update(JSON.stringify(entries))
    .digest("hex");
}

function tail(value, max = 8000) {
  const text = String(value || "");
  return text.length > max ? text.slice(-max) : text;
}

function initializeBaseRepository(target, repository) {
  const timestamp = git(repository.source_path, [
    "show",
    "-s",
    "--format=%cI",
    repository.source_commit
  ]);
  const initialized = spawnSync("git", ["init", "-q"], {
    cwd: target,
    encoding: "utf8"
  });
  if (initialized.status !== 0) {
    throw new Error(`base git init failed: ${initialized.stderr || initialized.stdout}`);
  }
  writeFileSync(
    join(target, ".git", "info", "exclude"),
    "node_modules\nnode_modules/\n**/node_modules\n**/node_modules/\n"
  );
  const commands = [
    ["config", "user.name", "Apex Forge Benchmark"],
    ["config", "user.email", "benchmark@apex-forge.local"],
    ["add", "-A"]
  ];
  for (const args of commands) {
    const result = spawnSync("git", args, { cwd: target, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`base git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
    }
  }
  const committed = spawnSync("git", [
    "commit",
    "-q",
    "-m",
    `Benchmark source ${repository.source_commit}`
  ], {
    cwd: target,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: timestamp,
      GIT_COMMITTER_DATE: timestamp
    }
  });
  if (committed.status !== 0) {
    throw new Error(`base git commit failed: ${committed.stderr || committed.stdout}`);
  }
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function existingPreparedRepositories(repositories, root, excludedId) {
  const values = [];
  for (const repository of repositories) {
    if (repository.id === excludedId) continue;
    const sourcePath = join(root, repository.id, ".benchmark-source.json");
    const baselinePath = join(root, repository.id, ".benchmark-baseline.json");
    if (!existsSync(sourcePath) || !existsSync(baselinePath)) {
      throw new Error(
        `cannot incrementally prepare ${excludedId}; existing base missing for ${repository.id}`
      );
    }
    const source = JSON.parse(readFileSync(sourcePath, "utf8"));
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    if (
      source.source_commit !== repository.source_commit
      || source.source_tree !== repository.source_tree
      || baseline.status !== "PASS"
    ) {
      throw new Error(`existing base invalid for ${repository.id}`);
    }
    values.push({ ...source, baseline });
  }
  return values;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}
