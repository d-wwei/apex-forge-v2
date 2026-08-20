import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync
} from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { ensureDir, readJson, writeJson } from "../lib/common.mjs";
import { assertContract } from "./contracts.mjs";
import { findPatch } from "./worker.mjs";
import { SCHEMA_VERSION } from "./store.mjs";

const IGNORED_ROOT_NAMES = new Set([
  ".git",
  ".apex-v2",
  ".apex-v2.lock",
  ".apex-v2.transaction-backups",
  "node_modules"
]);
const IGNORED_TREE_NAMES = new Set(["node_modules"]);
const SECRET_BASENAMES = new Set([".npmrc", ".pypirc", ".netrc", "credentials", "credentials.json"]);

export function buildCandidateSet(root, run, queue, projectDir = resolve(root, "..")) {
  const plan = readJson(join(root, "runs", run.run_id, "plan-graph.json"), null);
  if (!plan) throw new Error(`candidate 缺少 plan graph：${run.run_id}`);
  const patches = queue.items
    .filter((item) => item.status !== "dropped" && item.status !== "merged")
    .map((item) => {
      const patch = findPatch(root, run.run_id, item.patch_id);
      return {
        patch_id: item.patch_id,
        worker_id: item.worker_id,
        plan_node_id: item.plan_node_id,
        content_hash: stableHash(patch)
      };
    });
  const resolutions = (queue.resolutions || []).map((resolution) => ({
    resolution_id: resolution.resolution_id,
    content_hash: stableHash(resolution)
  }));
  const sourceFingerprint = projectSourceFingerprint(projectDir);
  const value = {
    schema_version: SCHEMA_VERSION,
    run_id: run.run_id,
    project_revision: sourceFingerprint,
    base_source_fingerprint: sourceFingerprint,
    patches,
    resolutions,
    plan_graph_hash: stableHash(plan),
    verification_policy_hash: stableHash(plan.verification_policy || {}),
    contract_version: SCHEMA_VERSION
  };
  return {
    ...value,
    candidate_digest: stableHash(value)
  };
}

export function persistCandidateSet(root, candidate) {
  const dir = join(root, "runs", candidate.run_id, "candidates");
  const path = join(dir, `candidate-${candidate.candidate_digest}.json`);
  assertContract("candidate-set.schema.json", candidate, path);
  ensureDir(dir);
  if (!existsSync(path)) writeJson(path, candidate);
  return {
    candidate,
    ref: `.apex-v2/runs/${candidate.run_id}/candidates/candidate-${candidate.candidate_digest}.json`
  };
}

export function projectSourceFingerprint(projectDir) {
  const entries = [];
  for (const path of listProjectSourceFiles(projectDir)) {
    if (isSecretPath(path)) continue;
    const target = join(projectDir, path);
    const stat = lstatSync(target);
    if (!stat.isFile()) continue;
    entries.push({
      path,
      mode: stat.mode & 0o777,
      sha256: createHash("sha256").update(readFileSync(target)).digest("hex")
    });
  }
  return stableHash(entries);
}

export function stableHash(value) {
  return createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalStringify(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
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
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (directory === projectDir && IGNORED_ROOT_NAMES.has(entry.name)) continue;
      if (entry.isDirectory() && IGNORED_TREE_NAMES.has(entry.name)) continue;
      const target = join(directory, entry.name);
      const path = relative(projectDir, target);
      if (entry.isDirectory()) visit(target);
      else files.push(path);
    }
  };
  visit(projectDir);
  return files.filter((path) => !isIgnoredPath(path)).sort();
}

function isIgnoredPath(path) {
  const parts = path.split("/");
  return IGNORED_ROOT_NAMES.has(parts[0]) || parts.some((part) => IGNORED_TREE_NAMES.has(part));
}

function isSecretPath(path) {
  return path.toLowerCase().split("/").some((part) =>
    part === ".env"
    || part.startsWith(".env.")
    || part.endsWith(".pem")
    || part.endsWith(".key")
    || part.startsWith("credentials")
    || SECRET_BASENAMES.has(part)
  );
}
