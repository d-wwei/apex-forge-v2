import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync
} from "node:fs";
import { relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const METADATA_FILES = new Set([
  ".benchmark-source.json",
  ".benchmark-dependencies.json",
  ".benchmark-baseline.json"
]);

export function sourceManifestFromGit(repository) {
  const commit = git(repository.source_path, [
    "rev-parse",
    repository.source_commit
  ]);
  const tree = git(repository.source_path, [
    "rev-parse",
    `${repository.source_commit}^{tree}`
  ]);
  const listing = spawnSync("git", [
    "ls-tree",
    "-rz",
    "--full-tree",
    repository.source_commit
  ], {
    cwd: repository.source_path,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024
  });
  if (listing.status !== 0) {
    throw new Error(
      `git ls-tree failed for ${repository.id}: ${String(listing.stderr || "")}`
    );
  }
  const entries = listing.stdout.toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\w+)\s+([a-f0-9]+)\t(.+)$/);
      if (!match) throw new Error(`invalid git tree entry: ${line}`);
      return {
        mode: match[1],
        type: match[2],
        oid: match[3],
        path: match[4]
      };
    })
    .filter((entry) => entry.type !== "tree")
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    source_commit: commit,
    source_tree: tree,
    source_file_count: entries.length,
    source_manifest_sha256: digest(entries),
    entries
  };
}

export function inspectPreparedSource({ repository, workspace }) {
  const expected = sourceManifestFromGit(repository);
  const errors = [];
  if (expected.source_commit !== repository.source_commit) {
    errors.push(issue(
      "source_commit_mismatch",
      `expected=${repository.source_commit} actual=${expected.source_commit}`
    ));
  }
  if (expected.source_tree !== repository.source_tree) {
    errors.push(issue(
      "source_tree_mismatch",
      `expected=${repository.source_tree} actual=${expected.source_tree}`
    ));
  }

  const expectedPaths = new Set(expected.entries.map((entry) => entry.path));
  for (const entry of expected.entries) {
    const path = resolve(workspace, entry.path);
    if (!existsSync(path)) {
      errors.push(issue("source_file_missing", entry.path));
      continue;
    }
    const stat = lstatSync(path);
    const actualMode = fileMode(stat);
    if (actualMode !== entry.mode) {
      errors.push(issue(
        "source_mode_mismatch",
        `${entry.path} expected=${entry.mode} actual=${actualMode}`
      ));
      continue;
    }
    if (gitBlobOid(path, stat) !== entry.oid) {
      errors.push(issue("source_content_mismatch", entry.path));
    }
  }

  const unexpected = listFiles(workspace)
    .filter((path) => !expectedPaths.has(path))
    .filter((path) => !isAllowedGeneratedPath(path, repository.prepare_outputs || []));
  for (const path of unexpected) {
    errors.push(issue("unexpected_source_file", path));
  }

  return {
    status: errors.length === 0 ? "PASS" : "FAIL",
    source_commit: expected.source_commit,
    source_tree: expected.source_tree,
    source_file_count: expected.source_file_count,
    source_manifest_sha256: expected.source_manifest_sha256,
    errors
  };
}

function listFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const relativePath = relative(root, path).split(sep).join("/");
      if (relativePath === ".git" || relativePath.startsWith(".git/")) continue;
      if (
        relativePath === "node_modules"
        || relativePath.startsWith("node_modules/")
        || relativePath.includes("/node_modules/")
      ) {
        continue;
      }
      if (entry.isDirectory()) visit(path);
      else files.push(relativePath);
    }
  };
  visit(root);
  return files.sort();
}

function isAllowedGeneratedPath(path, prepareOutputs) {
  if (METADATA_FILES.has(path)) return true;
  return prepareOutputs.some((prefix) => {
    const normalized = String(prefix).replace(/\/+$/, "");
    return path === normalized || path.startsWith(`${normalized}/`);
  });
}

function fileMode(stat) {
  if (stat.isSymbolicLink()) return "120000";
  if (stat.isFile()) return stat.mode & 0o111 ? "100755" : "100644";
  return "unsupported";
}

function gitBlobOid(path, stat) {
  const content = stat.isSymbolicLink()
    ? Buffer.from(readlinkSync(path))
    : readFileSync(path);
  return createHash("sha1")
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest("hex");
}

function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return result.stdout.trim();
}

function issue(kind, detail) {
  return { kind, detail };
}
