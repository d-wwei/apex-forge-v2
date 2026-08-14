import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBenchmarkPlan,
  evaluateBenchmark
} from "../src/benchmark/plugin-benchmark.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const benchmarkDir = join(repoRoot, "benchmarks", "plugin-vs-v1");
const matrix = JSON.parse(readFileSync(join(benchmarkDir, "matrix.json"), "utf8"));
const plan = buildBenchmarkPlan(matrix);
const resultsPaths = process.argv.slice(2);
if (resultsPaths.length === 0) resultsPaths.push(join(benchmarkDir, "results", "current.json"));
const results = resultsPaths.flatMap((resultsPath) =>
  existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, "utf8")) : []
);
const evaluation = evaluateBenchmark(plan.tasks, results);

writeFileSync(join(benchmarkDir, "benchmark-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
writeFileSync(join(benchmarkDir, "latest-evaluation.json"), `${JSON.stringify(evaluation, null, 2)}\n`);
console.log(JSON.stringify(evaluation, null, 2));
if (evaluation.status !== "PASS") process.exitCode = 1;
