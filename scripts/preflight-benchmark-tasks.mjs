import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareBenchmarkWorkspace } from "../src/benchmark/controller-state.mjs";
import { runChecks } from "../src/benchmark/result-evaluator.mjs";
import { validateBenchmarkTaskPlans } from "../src/benchmark/task-plans.mjs";
import { writeJson } from "../src/lib/common.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const benchmarkRoot = join(repoRoot, "benchmarks", "plugin-vs-v1");
const baseRoot = join(benchmarkRoot, "workspaces", "base");
const preflightRoot = join(benchmarkRoot, "workspaces", "preflight");
const reportPath = join(benchmarkRoot, "task-preflight.json");
const args = parseArgs(process.argv.slice(2));
const matrix = readJson(join(benchmarkRoot, "matrix.json"));
const validation = validateBenchmarkTaskPlans({
  matrix,
  schema: readJson(join(repoRoot, "schemas", "benchmark-task-plan.schema.json")),
  taskDir: join(benchmarkRoot, "tasks"),
  workspaceRoot: baseRoot
});
if (validation.status !== "PASS") {
  throw new Error(`benchmark tasks invalid: ${JSON.stringify(validation.errors)}`);
}

rmSync(preflightRoot, { recursive: true, force: true });
mkdirSync(preflightRoot, { recursive: true });
const selected = validation.tasks.filter((task) =>
  (!args.repository || task.repository === args.repository)
  && (!args.task || task.task_id === args.task)
  && (!args.scenario || task.scenario === args.scenario)
);
const results = [];
for (const task of selected) {
  const taskRoot = join(preflightRoot, safeName(task.task_id));
  const clean = prepareBenchmarkWorkspace({
    baseWorkspace: join(baseRoot, task.repository),
    runRoot: join(taskRoot, "clean"),
    candidateDigest: "0".repeat(64),
    task: {
      ...task,
      setup_operations: []
    },
    reset: true
  });
  const cleanAcceptance = runChecks(clean.workspace, task.acceptance_commands);
  const cleanHidden = runChecks(
    clean.workspace,
    task.hidden_checks.map((check) => check.command)
  );
  const injected = prepareBenchmarkWorkspace({
    baseWorkspace: join(baseRoot, task.repository),
    runRoot: join(taskRoot, "injected"),
    candidateDigest: "0".repeat(64),
    task,
    reset: true
  });
  const injectedAcceptance = runChecks(injected.workspace, task.acceptance_commands);
  const injectedHidden = runChecks(
    injected.workspace,
    task.hidden_checks.map((check) => check.command)
  );
  const cleanAcceptancePass = allPass(cleanAcceptance);
  const cleanHiddenPass = allPass(cleanHidden);
  const injectedHiddenPass = allPass(injectedHidden);
  let semanticPass;
  if (["bug-fix", "review-defect"].includes(task.scenario)) {
    semanticPass = task.setup_operations.length > 0
      && cleanHiddenPass
      && !injectedHiddenPass;
  } else {
    semanticPass = !injectedHiddenPass;
  }
  results.push({
    task_id: task.task_id,
    repository: task.repository,
    scenario: task.scenario,
    status: cleanAcceptancePass && semanticPass ? "PASS" : "FAIL",
    expectations: {
      clean_acceptance_pass: cleanAcceptancePass,
      clean_hidden_pass: cleanHiddenPass,
      injected_hidden_pass: injectedHiddenPass,
      setup_operation_count: task.setup_operations.length
    },
    clean: {
      acceptance: cleanAcceptance,
      hidden_checks: cleanHidden
    },
    injected: {
      acceptance: injectedAcceptance,
      hidden_checks: injectedHidden
    }
  });
}
const report = {
  schema_version: "v0",
  generated_at: new Date().toISOString(),
  status: results.every((result) => result.status === "PASS") ? "PASS" : "FAIL",
  task_set_digest: validation.task_set_digest,
  task_count: results.length,
  results
};
writeJson(reportPath, report);
console.log(JSON.stringify(report, null, 2));
rmSync(preflightRoot, { recursive: true, force: true });
if (report.status !== "PASS") process.exitCode = 1;

function allPass(checks) {
  return checks.length > 0 && checks.every((check) => check.status === "PASS");
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const next = values[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[value.slice(2)] = next;
      index += 1;
    }
  }
  return parsed;
}

function readJson(path) {
  if (!existsSync(path)) throw new Error(`JSON missing: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function safeName(value) {
  return value.replaceAll(/[^A-Za-z0-9._-]/g, "_");
}
