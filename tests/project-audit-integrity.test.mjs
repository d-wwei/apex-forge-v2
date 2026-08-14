import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  parseNodeTestSummary,
  runProjectAuditTests
} from "../src/core/project-audit.mjs";

const CLI = new URL("../src/apex-v2.mjs", import.meta.url).pathname;

function tempProject() {
  return mkdtempSync(join(tmpdir(), "apex-v2-audit-test-"));
}

function run(args, options = {}) {
  const execution = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    ...options
  });
  assert.equal(execution.status, 0, `命令失败：${args.join(" ")}\n${execution.stderr}`);
  return execution;
}

function writeProjectFile(project, relativePath, content) {
  const path = join(project, relativePath);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function seedProject(project) {
  writeProjectFile(project, "package.json", JSON.stringify({
    name: "audit-integrity-fixture",
    version: "0.0.0",
    type: "module",
    scripts: {
      test: "node --test tests/*.test.mjs"
    }
  }, null, 2));
  writeProjectFile(project, "src/apex-v2.mjs", "console.log('fixture');\n");
  writeProjectFile(project, "tests/fixture.test.mjs", "import test from 'node:test';\ntest('fixture pass', () => {});\n");
  writeProjectFile(project, "schemas/fixture.schema.json", "{\"type\":\"object\"}\n");
  writeProjectFile(project, "planning/project-operating-model.md", "# Model\n");
  writeProjectFile(project, "planning/roadmap.md", "# Roadmap\n");
  writeProjectFile(project, "planning/v2-planning-recommendation.md", "# Recommendation\n");
  writeProjectFile(project, "contracts/stage-contracts-v0.md", "# Contracts\n");
  writeProjectFile(project, "research/source-inventory.md", "# Sources\n");
}

test("audit test evidence parser records executed test totals and names", () => {
  const summary = parseNodeTestSummary(`
✔ alpha behavior (1.2ms)
✔ beta behavior (2.1ms)
ℹ tests 2
ℹ pass 2
ℹ fail 0
`);
  assert.deepEqual(summary, {
    tests: 2,
    pass: 2,
    fail: 0,
    test_names: ["alpha behavior", "beta behavior"]
  });
});

test("runProjectAuditTests executes the configured test command", () => {
  const project = tempProject();
  const fixture = join(project, "fake-test.mjs");
  writeFileSync(fixture, `#!/usr/bin/env node
console.log("✔ executed behavior (1ms)");
console.log("ℹ tests 1");
console.log("ℹ pass 1");
console.log("ℹ fail 0");
`);
  chmodSync(fixture, 0o755);
  const evidence = runProjectAuditTests(project, { command: fixture });
  assert.equal(evidence.status, "PASS");
  assert.equal(evidence.tests, 1);
  assert.deepEqual(evidence.test_names, ["executed behavior"]);
});

test("false audit PASS cannot be created by capability declarations when tests are skipped", () => {
  const project = tempProject();
  seedProject(project);
  run(["init", "--project", project]);
  const capabilities = {
    schema_version: "v0",
    updated_at: "2026-08-13",
    features: [
      { id: "task-aware-plan-graph", purpose: "declaration only" },
      { id: "complete-plan-execute-gate", purpose: "declaration only" },
      { id: "staged-patch-verification", purpose: "declaration only" }
    ],
    groups: [
      {
        id: "fake",
        purpose: "inflate command count",
        commands: Array.from({ length: 30 }, (_, index) => `fake-${index}`)
      }
    ]
  };
  writeFileSync(join(project, "capabilities.json"), `${JSON.stringify(capabilities, null, 2)}\n`);

  const audit = JSON.parse(run([
    "project",
    "audit",
    "--project",
    project,
    "--skip-tests"
  ]).stdout);
  assert.equal(audit.summary.test_execution_status, "SKIPPED");
  assert.equal(audit.summary.test_count, 0);
  assert.equal(audit.checks.find((item) => item.id === "automation-tests").status, "FAIL");
  assert.equal(audit.checks.find((item) => item.id === "task-aware-planning").status, "FAIL");

  const persisted = JSON.parse(readFileSync(
    join(project, ".apex-v2", "audits", `${audit.audit_id}.json`),
    "utf8"
  ));
  assert.equal(persisted.summary.test_execution_status, "SKIPPED");
});
