import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { assertContract } from "./contracts.mjs";
import { isFileAllowedByScope, workerDir } from "./worker.mjs";
import {
  assertSafeRelativePath,
  now,
  readJson,
  writeJson
} from "../lib/common.mjs";
import { SCHEMA_VERSION } from "./schema-version.mjs";

const IGNORED_ROOT_NAMES = new Set([
  ".git",
  ".apex-v2",
  ".apex-v2.lock",
  ".apex-v2.transaction-backups",
  "node_modules"
]);
const IGNORED_TREE_NAMES = new Set(["node_modules"]);
const SECRET_BASENAMES = new Set([".npmrc", ".pypirc", ".netrc", "credentials", "credentials.json"]);

export function createActionWorkspace(root, worker, actionId) {
  const projectDir = resolve(root, "..");
  const dir = workerDir(root, worker.run_id, worker.worker_id);
  const manifestPath = join(dir, "action-workspace.json");
  const existing = readJson(manifestPath, null);
  if (
    existing?.action_id === actionId
    && existing.status === "active"
    && existingActionWorkspaceExists(projectDir, existing)
  ) {
    return existing;
  }

  const container = join(dir, "action-workspace");
  const baseDir = join(container, "base");
  const workspaceDir = join(container, "workspace");
  rmSync(container, { recursive: true, force: true });
  mkdirSync(baseDir, { recursive: true });
  mkdirSync(workspaceDir, { recursive: true });

  const excluded = { ignored: 0, secret: 0, symlink: 0 };
  const included = [];
  for (const path of listProjectSourceFiles(projectDir)) {
    const source = join(projectDir, path);
    const stat = lstatSync(source);
    if (stat.isSymbolicLink()) {
      excluded.symlink += 1;
      continue;
    }
    if (!stat.isFile()) {
      excluded.ignored += 1;
      continue;
    }
    if (isSecretPath(path)) {
      excluded.secret += 1;
      continue;
    }
    copyFile(source, join(baseDir, path), stat.mode);
    copyFile(source, join(workspaceDir, path), stat.mode);
    included.push({ path, sha256: fileHash(source), mode: stat.mode & 0o777 });
  }

  linkDependencyDirectories(projectDir, workspaceDir);

  const timestamp = now();
  const manifest = {
    schema_version: SCHEMA_VERSION,
    action_id: actionId,
    worker_id: worker.worker_id,
    run_id: worker.run_id,
    status: "active",
    workspace_path: relative(projectDir, workspaceDir),
    base_path: relative(projectDir, baseDir),
    base_fingerprint: hashEntries(included),
    write_scope: worker.write_scope,
    included_file_count: included.length,
    excluded,
    created_at: timestamp,
    updated_at: timestamp
  };
  assertContract("action-workspace.schema.json", manifest, manifestPath);
  writeJson(manifestPath, manifest);
  return manifest;
}

export function collectActionWorkspaceChanges(projectDir, manifest) {
  const { baseDir, workspaceDir } = ownedActionWorkspacePaths(projectDir, manifest);
  if (!existsSync(baseDir) || !existsSync(workspaceDir)) {
    throw new Error(`ActionWorkspace 缺失：${manifest.action_id}`);
  }

  const base = scanTree(baseDir);
  const workspace = scanTree(workspaceDir);
  const ignoredWorkspacePaths = gitIgnoredPaths(projectDir, [...workspace.keys()]);
  const paths = new Set([...base.keys(), ...workspace.keys()]);
  const changedFiles = [];
  const outOfScopeFiles = [];
  const unsupportedFiles = [];
  const operations = [];

  for (const path of [...paths].sort()) {
    const before = base.get(path);
    const after = workspace.get(path);
    if (sameEntry(before, after)) continue;
    if (
      !before
      && ignoredWorkspacePaths.has(path)
      && !isFileAllowedByScope(path, manifest.write_scope)
    ) {
      continue;
    }
    changedFiles.push(path);
    if (!isFileAllowedByScope(path, manifest.write_scope)) {
      outOfScopeFiles.push(path);
      continue;
    }
    if (isSecretPath(path)) {
      unsupportedFiles.push(`${path}:secret`);
      continue;
    }
    if (!after) {
      unsupportedFiles.push(`${path}:delete`);
      continue;
    }
    if (after.type === "symlink") {
      unsupportedFiles.push(`${path}:symlink`);
      continue;
    }
    if (after.type !== "file") {
      unsupportedFiles.push(`${path}:${after.type}`);
      continue;
    }
    const next = readFileSync(join(workspaceDir, path));
    if (isBinary(next)) {
      unsupportedFiles.push(`${path}:binary`);
      continue;
    }
    if (!before) {
      operations.push({ op: "write_text", path, content: next.toString("utf8") });
      continue;
    }
    if (before.type !== "file") {
      unsupportedFiles.push(`${path}:base_${before.type}`);
      continue;
    }
    const previous = readFileSync(join(baseDir, path));
    if (isBinary(previous)) {
      unsupportedFiles.push(`${path}:binary`);
      continue;
    }
    operations.push({
      op: "replace_text",
      path,
      old_text: previous.toString("utf8"),
      new_text: next.toString("utf8")
    });
  }

  return {
    changed_files: changedFiles,
    out_of_scope_files: outOfScopeFiles,
    unsupported_files: unsupportedFiles,
    operations
  };
}

function linkDependencyDirectories(projectDir, workspaceDir) {
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if ([".git", ".apex-v2"].includes(entry.name)) continue;
      const source = join(directory, entry.name);
      if (entry.name === "node_modules") {
        const target = join(workspaceDir, relative(projectDir, source));
        createWritableDependencyShell(source, target);
      } else if (entry.isDirectory()) {
        visit(source);
      }
    }
  };
  visit(projectDir);
}

function createWritableDependencyShell(source, target) {
  if (existsSync(target)) return;
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const dependency = join(source, entry.name);
    const linked = join(target, entry.name);
    if ([".cache", ".tmp", ".vite", ".vite-temp"].includes(entry.name)) {
      mkdirSync(linked, { recursive: true });
      continue;
    }
    symlinkSync(dependency, linked, entry.isDirectory() ? "dir" : "file");
  }
}

function gitIgnoredPaths(projectDir, paths) {
  if (paths.length === 0 || !existsSync(join(projectDir, ".git"))) return new Set();
  const result = spawnSync(
    "git",
    ["check-ignore", "--stdin", "-z"],
    {
      cwd: projectDir,
      encoding: "buffer",
      input: Buffer.from(`${paths.join("\0")}\0`)
    }
  );
  if (![0, 1].includes(result.status)) return new Set();
  return new Set(
    result.stdout.toString("utf8").split("\0").filter(Boolean)
  );
}

export function markActionWorkspaceSubmitted(projectDir, manifest) {
  const path = actionWorkspaceManifestPath(projectDir, manifest);
  const updated = {
    ...manifest,
    status: "submitted",
    updated_at: now()
  };
  assertContract("action-workspace.schema.json", updated, path);
  writeJson(path, updated);
  return updated;
}

export function discardActionWorkspace(projectDir, manifest, status = "cancelled") {
  const path = actionWorkspaceManifestPath(projectDir, manifest);
  const { container } = ownedActionWorkspacePaths(projectDir, manifest);
  rmSync(container, { recursive: true, force: true });
  const updated = {
    ...manifest,
    status,
    updated_at: now()
  };
  assertContract("action-workspace.schema.json", updated, path);
  writeJson(path, updated);
  return updated;
}

export function recoverOrphanActionWorkspaces(root, options = {}) {
  const projectDir = resolve(root, "..");
  const runsDir = join(root, "runs");
  if (!existsSync(runsDir)) return [];
  const nowMs = Date.parse(options.now || new Date().toISOString());
  const recovered = [];

  for (const runEntry of readdirSync(runsDir, { withFileTypes: true })) {
    if (!runEntry.isDirectory()) continue;
    const workersDir = join(runsDir, runEntry.name, "workers");
    if (!existsSync(workersDir)) continue;
    for (const workerEntry of readdirSync(workersDir, { withFileTypes: true })) {
      if (!workerEntry.isDirectory()) continue;
      const dir = join(workersDir, workerEntry.name);
      const manifest = readJson(join(dir, "action-workspace.json"), null);
      if (!manifest || manifest.status !== "active") continue;
      if (
        manifest.run_id !== runEntry.name
        || manifest.worker_id !== workerEntry.name
      ) {
        throw new Error(
          `ActionWorkspace identity mismatch：${runEntry.name}/${workerEntry.name}`
        );
      }
      const worker = readJson(join(dir, "worker.json"), null);
      const reason = orphanReason(worker, nowMs);
      if (!reason) continue;
      discardActionWorkspace(projectDir, manifest, "failed");
      recovered.push({
        run_id: manifest.run_id,
        worker_id: manifest.worker_id,
        action_id: manifest.action_id,
        reason
      });
    }
  }
  return recovered;
}

function actionWorkspaceManifestPath(projectDir, manifest) {
  assertSafePathSegment(manifest.run_id, "run_id");
  assertSafePathSegment(manifest.worker_id, "worker_id");
  return join(
    projectDir,
    ".apex-v2",
    "runs",
    manifest.run_id,
    "workers",
    manifest.worker_id,
    "action-workspace.json"
  );
}

function existingActionWorkspaceExists(projectDir, manifest) {
  const { baseDir, workspaceDir } = ownedActionWorkspacePaths(projectDir, manifest);
  return existsSync(workspaceDir) && existsSync(baseDir);
}

function ownedActionWorkspacePaths(projectDir, manifest) {
  assertSafePathSegment(manifest.run_id, "run_id");
  assertSafePathSegment(manifest.worker_id, "worker_id");
  const projectRoot = resolve(projectDir);
  const container = resolve(
    projectRoot,
    ".apex-v2",
    "runs",
    manifest.run_id,
    "workers",
    manifest.worker_id,
    "action-workspace"
  );
  const workspaceDir = resolveActionWorkspacePath(
    projectRoot,
    manifest.workspace_path,
    "workspace_path"
  );
  const baseDir = resolveActionWorkspacePath(
    projectRoot,
    manifest.base_path,
    "base_path"
  );
  if (
    workspaceDir !== join(container, "workspace")
    || baseDir !== join(container, "base")
  ) {
    throw new Error(`ActionWorkspace path 越出 owned container：${manifest.action_id}`);
  }
  return { projectRoot, container, workspaceDir, baseDir };
}

function resolveActionWorkspacePath(projectRoot, path, field) {
  const normalized = String(path || "").split("\\").join("/");
  assertSafeRelativePath(normalized);
  const target = resolve(projectRoot, normalized);
  if (target === projectRoot || !target.startsWith(`${projectRoot}${sep}`)) {
    throw new Error(`ActionWorkspace ${field} 越出项目根：${path}`);
  }
  return target;
}

function assertSafePathSegment(value, field) {
  if (
    typeof value !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
  ) {
    throw new Error(`ActionWorkspace ${field} 无效：${value}`);
  }
}

function orphanReason(worker, nowMs) {
  if (!worker) return "worker_missing";
  if (worker.status !== "claimed") return `worker_${worker.status}`;
  const expiresAt = Date.parse(worker.claim_expires_at || "");
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return "claim_expired";
  return null;
}

function listProjectSourceFiles(projectDir) {
  const tracked = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: projectDir,
    encoding: "buffer"
  });
  if (tracked.status === 0) {
    return tracked.stdout.toString("utf8").split("\0").filter(Boolean)
      .filter((path) => !isIgnoredPath(path))
      .sort();
  }
  return listFilesRecursive(projectDir)
    .filter((path) => !isIgnoredPath(path))
    .sort();
}

function listFilesRecursive(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (directory === root && IGNORED_ROOT_NAMES.has(entry.name)) continue;
      if (entry.isDirectory() && IGNORED_TREE_NAMES.has(entry.name)) continue;
      const path = join(directory, entry.name);
      const relativePath = relative(root, path);
      if (entry.isDirectory()) visit(path);
      else files.push(relativePath);
    }
  };
  visit(root);
  return files;
}

function scanTree(root) {
  const entries = new Map();
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (IGNORED_TREE_NAMES.has(entry.name)) continue;
      const path = join(directory, entry.name);
      const relativePath = relative(root, path);
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        visit(path);
      } else if (stat.isSymbolicLink()) {
        entries.set(relativePath, { type: "symlink" });
      } else if (stat.isFile()) {
        entries.set(relativePath, {
          type: "file",
          sha256: fileHash(path),
          mode: stat.mode & 0o777
        });
      } else {
        entries.set(relativePath, { type: "unsupported" });
      }
    }
  };
  visit(root);
  return entries;
}

function isIgnoredPath(path) {
  const parts = path.split("/");
  return IGNORED_ROOT_NAMES.has(parts[0]) || parts.some((part) => IGNORED_TREE_NAMES.has(part));
}

function isSecretPath(path) {
  const parts = path.toLowerCase().split("/");
  return parts.some((part) =>
    part === ".env"
    || part.startsWith(".env.")
    || part.endsWith(".pem")
    || part.endsWith(".key")
    || part.startsWith("credentials")
    || SECRET_BASENAMES.has(part)
  );
}

function copyFile(source, target, mode) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  chmodSync(target, mode & 0o777);
}

function sameEntry(left, right) {
  if (!left || !right) return false;
  if (left.type !== right.type) return false;
  if (left.type !== "file") return true;
  return left.sha256 === right.sha256 && left.mode === right.mode;
}

function fileHash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function hashEntries(entries) {
  const hash = createHash("sha256");
  for (const entry of [...entries].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(entry.path);
    hash.update("\0");
    hash.update(entry.sha256);
    hash.update("\0");
    hash.update(String(entry.mode));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function isBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0);
}
