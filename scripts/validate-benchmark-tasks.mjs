import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateBenchmarkTaskPlans } from "../src/benchmark/task-plans.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const benchmarkRoot = join(repoRoot, "benchmarks", "plugin-vs-v1");
const result = validateBenchmarkTaskPlans({
  matrix: readJson(join(benchmarkRoot, "matrix.json")),
  schema: readJson(join(repoRoot, "schemas", "benchmark-task-plan.schema.json")),
  taskDir: join(benchmarkRoot, "tasks"),
  workspaceRoot: join(benchmarkRoot, "workspaces", "base")
});
const manifest = {
  schema_version: "v0",
  generated_at: new Date().toISOString(),
  status: result.status,
  repository_count: result.repository_count,
  task_count: result.task_count,
  task_set_digest: result.task_set_digest,
  tasks: result.tasks.map((task) => ({
    task_id: task.task_id,
    repository: task.repository,
    scenario: task.scenario,
    title: task.title,
    task_digest: task.task_digest,
    task_plan_path: task.task_plan_path
  })),
  errors: result.errors
};
writeFileSync(
  join(benchmarkRoot, "task-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);
console.log(JSON.stringify(manifest, null, 2));
if (result.status !== "PASS") process.exitCode = 1;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
