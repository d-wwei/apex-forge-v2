import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateBenchmarkTaskPlans } from "../src/benchmark/task-plans.mjs";

const scenarios = [
  "simple",
  "multi-step",
  "bug-fix",
  "interrupted",
  "review-defect",
  "parallel"
];

test("validates complete task plans and emits stable digests", () => {
  const fixture = createFixture();
  const first = validateFixture(fixture);
  const second = validateFixture(fixture);
  assert.equal(first.status, "PASS", JSON.stringify(first.errors, null, 2));
  assert.equal(first.task_count, 6);
  assert.equal(first.task_set_digest, second.task_set_digest);
  assert.equal(new Set(first.tasks.map((task) => task.task_digest)).size, 6);
});

test("fails closed on placeholder commands and missing defect injection", () => {
  const fixture = createFixture();
  writeFileSync(join(fixture.workspace, "outside.txt"), "GOOD\n");
  const plan = readJson(fixture.planPath);
  plan.tasks.find((task) => task.scenario === "simple").acceptance_commands = ["true"];
  plan.tasks.find((task) => task.scenario === "bug-fix").setup_operations = [];
  plan.tasks.find((task) => task.scenario === "review-defect")
    .setup_operations[0].path = "outside.txt";
  writeJson(fixture.planPath, plan);
  const result = validateFixture(fixture);
  assert.equal(result.status, "FAIL");
  assert.ok(result.errors.some((error) => error.kind === "placeholder_command"));
  assert.ok(result.errors.some((error) => error.kind === "missing_setup_injection"));
  assert.ok(result.errors.some((error) => error.kind === "setup_outside_affected_files"));
});

test("fails closed when setup replacement is ambiguous", () => {
  const fixture = createFixture();
  writeFileSync(join(fixture.workspace, "source.txt"), "GOOD\nGOOD\n");
  const result = validateFixture(fixture);
  assert.equal(result.status, "FAIL");
  assert.ok(result.errors.some((error) => error.kind === "replace_source_cardinality"));
});

test("chorus interruption closure tracks implementation and test changes without syntax binding", () => {
  const plan = readJson(new URL(
    "../benchmarks/plugin-vs-v1/tasks/chorus.json",
    import.meta.url
  ));
  const task = plan.tasks.find((item) => item.scenario === "interrupted");
  const closure = task.hidden_checks.find((check) => check.kind === "closure");
  assert.doesNotMatch(closure.command, /\brg\b/);
  assert.match(closure.command, /src\/lib\/api-response\.ts/);
  assert.match(closure.command, /src\/lib\/__tests__\/api-response\.test\.ts/);
});

test("hidden checks do not bind correct behavior to one implementation spelling", () => {
  for (const repository of [
    "agent-recall",
    "apex-forge-v1",
    "apex-manager",
    "chorus",
    "understand-codebase"
  ]) {
    const plan = readJson(new URL(
      `../benchmarks/plugin-vs-v1/tasks/${repository}.json`,
      import.meta.url
    ));
    for (const task of plan.tasks) {
      const implementationFiles = task.affected_files.filter((path) =>
        !/(?:^|\/)(?:__tests__|tests)(?:\/|$)|\.test\.[^.]+$/.test(path)
      );
      for (const check of task.hidden_checks) {
        for (const segment of check.command.split(/&&|;/)) {
          const normalized = segment.trim();
          if (!normalized.includes("rg ")) continue;
          if (/^!\s*rg\b/.test(normalized)) continue;
          const boundSource = implementationFiles.find((path) =>
            normalized.includes(path)
          );
          assert.equal(
            boundSource,
            undefined,
            `${repository}/${task.scenario} binds hidden evidence to ${boundSource}`
          );
        }
      }
    }
  }
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "apex-benchmark-tasks-"));
  const taskDir = join(root, "tasks");
  const workspaceRoot = join(root, "workspaces");
  const workspace = join(workspaceRoot, "repo");
  mkdirSync(taskDir, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(workspace, "source.txt"), "GOOD\n");
  writeJson(join(workspace, ".benchmark-source.json"), {
    id: "repo",
    source_commit: "abcdef0",
    source_tree: "1234567"
  });
  const planPath = join(taskDir, "repo.json");
  writeJson(planPath, {
    repository_id: "repo",
    tasks: scenarios.map((scenario) => ({
      scenario,
      title: `${scenario} task`,
      instructions: `Implement a concrete ${scenario} behavior and verify it.`,
      affected_files: ["source.txt"],
      acceptance_commands: ["node --version"],
      setup_operations: ["bug-fix", "review-defect"].includes(scenario)
        ? [{
            op: "replace_text",
            path: "source.txt",
            content: "",
            old_text: "GOOD",
            new_text: `BAD_${scenario}`
          }]
        : [],
      hidden_checks: [{
        kind: "behavior",
        description: "Executes a behavior check.",
        command: "node --version"
      }]
    }))
  });
  return {
    taskDir,
    workspaceRoot,
    workspace,
    planPath,
    matrix: {
      repositories: [{
        id: "repo",
        source_commit: "abcdef0",
        source_tree: "1234567"
      }],
      scenarios: scenarios.map((id) => ({ id }))
    },
    schema: readJson(new URL("../schemas/benchmark-task-plan.schema.json", import.meta.url))
  };
}

function validateFixture(fixture) {
  return validateBenchmarkTaskPlans({
    matrix: fixture.matrix,
    schema: fixture.schema,
    taskDir: fixture.taskDir,
    workspaceRoot: fixture.workspaceRoot
  });
}

function readJson(path) {
  return JSON.parse(readFile(path));
}

function readFile(path) {
  return readFileSync(path, "utf8");
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
