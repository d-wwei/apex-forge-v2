import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBenchmarkPlan,
  evaluateBenchmark
} from "../src/benchmark/plugin-benchmark.mjs";
import { loadVerifiedBenchmarkResults } from "../src/benchmark/result-provenance.mjs";
import { validateBenchmarkTaskPlans } from "../src/benchmark/task-plans.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const benchmarkDir = join(repoRoot, "benchmarks", "plugin-vs-v1");
const matrix = JSON.parse(readFileSync(join(benchmarkDir, "matrix.json"), "utf8"));
const taskValidation = validateBenchmarkTaskPlans({
  matrix,
  schema: JSON.parse(readFileSync(
    join(repoRoot, "schemas", "benchmark-task-plan.schema.json"),
    "utf8"
  )),
  taskDir: join(benchmarkDir, "tasks"),
  workspaceRoot: join(benchmarkDir, "workspaces", "base")
});
if (taskValidation.status !== "PASS") {
  throw new Error(`benchmark task plans invalid: ${JSON.stringify(taskValidation.errors)}`);
}
const plan = buildBenchmarkPlan(matrix, taskValidation.tasks);
const resultsPaths = process.argv.slice(2);
let results;
if (resultsPaths.length === 0) {
  const manifestPath = join(benchmarkDir, "results-manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`benchmark results manifest 缺失：${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const expectedCandidateDigest = process.env.APEX_EXPECT_CANDIDATE_DIGEST
    || manifest.release_candidate_digest;
  results = loadVerifiedBenchmarkResults({
    repoRoot,
    benchmarkDir,
    manifest,
    expectedCandidateDigest,
    expectedTaskSetDigest: taskValidation.task_set_digest
  });
} else {
  results = resultsPaths.flatMap((resultsPath) =>
    existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, "utf8")) : []
  );
}
const evaluation = evaluateBenchmark(plan.tasks, results);
if (
  process.env.APEX_EXPECT_CANDIDATE_DIGEST
  && evaluation.candidate_digest !== process.env.APEX_EXPECT_CANDIDATE_DIGEST
) {
  throw new Error(
    `Product Gate candidate mismatch: ${evaluation.candidate_digest || "missing"}`
  );
}

writeFileSync(join(benchmarkDir, "benchmark-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
writeFileSync(join(benchmarkDir, "latest-evaluation.json"), `${JSON.stringify(evaluation, null, 2)}\n`);
console.log(JSON.stringify(evaluation, null, 2));
if (evaluation.status !== "PASS") process.exitCode = 1;
