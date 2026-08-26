#!/usr/bin/env node

import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../src/cli/args.mjs";
import { assertDiskHeadroom } from "../src/core/process-guard.mjs";
import { writeJson } from "../src/lib/common.mjs";
import {
  decideOptimizationExperiment,
  evaluateOptimizationSample,
  initialOptimizationState,
  nextOptimizationState,
  validateOptimizationConfig
} from "../src/optimization/quality-cost.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(3));
const command = process.argv[2] || "status";
const configPath = resolve(repoRoot, String(
  args.config || "benchmarks/optimization-loop/config.json"
));
const runtimeRoot = resolve(repoRoot, String(args["state-dir"] || ".apex-loop"));
const statePath = join(runtimeRoot, "state.json");
const historyPath = join(runtimeRoot, "history.jsonl");

if (command === "check") {
  const context = loadConfigContext();
  print({
    status: "PASS",
    campaign_id: context.config.campaign_id,
    config_digest: context.configDigest,
    immutable_digests: context.immutableDigests
  });
} else if (command === "start") {
  start();
} else if (command === "record") {
  record();
} else if (command === "status") {
  print(readState());
} else if (command === "next") {
  const context = loadConfigContext();
  const state = readState();
  const hypotheses = context.config.hypotheses || [];
  print({
    campaign_id: state.campaign_id,
    status: state.status,
    next_hypothesis: hypotheses[state.experiment_count] || null,
    stop_reasons: state.stop_reasons
  });
} else {
  throw new Error(`unknown optimization loop command: ${command}`);
}

function start() {
  if (existsSync(statePath) && !args.force) {
    throw new Error(`optimization loop already initialized: ${statePath}`);
  }
  const context = loadConfigContext();
  assertSafeExperimentBranch(context.config);
  assertDiskHeadroom(
    repoRoot,
    Number(context.config.budgets.min_free_disk_gib) * 1024 ** 3
  );
  mkdirSync(runtimeRoot, { recursive: true });
  const state = initialOptimizationState(
    context.config,
    context.configDigest,
    context.immutableDigests
  );
  state.branch = currentBranch();
  state.baseline = null;
  state.consecutive_target_task_ids = [];

  const baselinePath = resolve(repoRoot, context.config.baseline_sample);
  const sample = readJson(baselinePath);
  const evaluation = evaluateOptimizationSample(context.config, sample);
  state.baseline = {
    experiment_id: sample.experiment_id,
    commit: sample.commit,
    ...evaluation
  };
  if (evaluation.quality_pass) state.best = state.baseline;
  state.updated_at = new Date().toISOString();
  writeJson(statePath, state);
  appendHistory({
    kind: "baseline",
    recorded_at: state.updated_at,
    sample,
    evaluation,
    decision: {
      decision: "baseline",
      reason: evaluation.quality_pass
        ? "quality-valid baseline"
        : "baseline records the current quality failure"
    }
  });
  print(state);
}

function record() {
  const context = loadConfigContext();
  const state = readState();
  if (state.status !== "running") {
    throw new Error(`optimization loop is not running: ${state.status}`);
  }
  assertSafeExperimentBranch(context.config);
  assertImmutableInputs(state, context);
  assertDiskHeadroom(
    repoRoot,
    Number(context.config.budgets.min_free_disk_gib) * 1024 ** 3
  );
  const samplePath = resolve(repoRoot, requiredArg("sample"));
  const sampleBytes = statSync(samplePath).size;
  if (sampleBytes > context.config.budgets.max_single_artifact_bytes) {
    throw new Error(
      `experiment sample exceeds artifact budget: ${sampleBytes} bytes`
    );
  }
  const sample = readJson(samplePath);
  if (sample.commit !== runGit(["rev-parse", "HEAD"])) {
    throw new Error(
      `experiment commit does not match worktree HEAD: ${sample.commit}`
    );
  }
  if (!sample.hypothesis_id || sample.hypothesis_id === "BASELINE") {
    throw new Error("recorded experiment requires a non-baseline hypothesis_id");
  }
  if (
    !Array.isArray(sample.changed_variables)
    || sample.changed_variables.length !== 1
  ) {
    throw new Error("recorded experiment must change exactly one variable");
  }
  if (historyHasExperiment(sample.experiment_id)) {
    throw new Error(`experiment already recorded: ${sample.experiment_id}`);
  }
  const evaluation = evaluateOptimizationSample(context.config, sample);
  const decision = decideOptimizationExperiment({
    evaluation,
    best: state.best,
    minimumImprovementRatio:
      context.config.decision.minimum_improvement_ratio
  });
  const next = nextOptimizationState(
    context.config,
    state,
    sample,
    evaluation,
    decision
  );
  const targetIds = evaluation.target_pass
    ? [...(state.consecutive_target_task_ids || []), sample.task_id]
    : [];
  next.consecutive_target_task_ids = [...new Set(targetIds)];
  next.consecutive_target_passes = next.consecutive_target_task_ids.length;
  const requiredPasses =
    context.config.route_targets[sample.route].consecutive_passes;
  if (
    evaluation.target_pass
    && next.consecutive_target_passes >= requiredPasses
  ) {
    next.stop_reasons = [...new Set([
      ...(next.stop_reasons || []),
      "target-achieved"
    ])];
    next.status = "stopped";
  }
  writeJson(statePath, next);
  appendHistory({
    kind: "experiment",
    recorded_at: next.updated_at,
    sample,
    evaluation,
    decision
  });
  print({ state: next, evaluation, decision });
}

function loadConfigContext() {
  const config = readJson(configPath);
  const errors = validateOptimizationConfig(config);
  if (errors.length > 0) {
    throw new Error(`invalid optimization config: ${errors.join("; ")}`);
  }
  const configDigest = sha256(readFileSync(configPath));
  const immutableDigests = Object.fromEntries(
    config.immutable_paths.map((path) => [
      path,
      hashPath(resolve(repoRoot, path))
    ])
  );
  return { config, configDigest, immutableDigests };
}

function assertImmutableInputs(state, context) {
  if (state.config_digest !== context.configDigest) {
    throw new Error("optimization config changed after campaign start");
  }
  for (const [path, digest] of Object.entries(state.immutable_digests)) {
    if (context.immutableDigests[path] !== digest) {
      throw new Error(`immutable evaluator input changed: ${path}`);
    }
  }
}

function assertSafeExperimentBranch(config) {
  const branch = currentBranch();
  const protectedBranches = new Set(config.safety.protected_branches || []);
  if (protectedBranches.has(branch)) {
    throw new Error(`optimization loop refuses protected branch: ${branch}`);
  }
  if (config.safety.require_clean_worktree) {
    const status = runGit(["status", "--porcelain=v1"]);
    const allowed = new Set(["node_modules"]);
    const dirty = status.split("\n").filter(Boolean).filter((line) => {
      const path = line.slice(3).trim();
      return ![...allowed].some((entry) =>
        path === entry || path.startsWith(`${entry}/`)
      );
    });
    if (dirty.length > 0) {
      throw new Error("optimization loop requires a clean experiment worktree");
    }
  }
}

function currentBranch() {
  return runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function hashPath(path) {
  if (!existsSync(path)) throw new Error(`immutable path missing: ${path}`);
  const stat = statSync(path);
  if (stat.isFile()) return sha256(readFileSync(path));
  const hash = createHash("sha256");
  for (const file of listFiles(path)) {
    hash.update(relative(path, file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function listFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

function appendHistory(value) {
  mkdirSync(dirname(historyPath), { recursive: true });
  appendFileSync(historyPath, `${JSON.stringify(value)}\n`);
  const descriptor = openSync(historyPath, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function historyHasExperiment(experimentId) {
  if (!existsSync(historyPath)) return false;
  return readFileSync(historyPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .some((line) => JSON.parse(line).sample?.experiment_id === experimentId);
}

function readState() {
  if (!existsSync(statePath)) {
    throw new Error(`optimization loop is not initialized: ${statePath}`);
  }
  return readJson(statePath);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requiredArg(name) {
  const value = args[name];
  if (value == null || value === true || String(value).trim() === "") {
    throw new Error(`missing --${name}`);
  }
  return String(value);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
