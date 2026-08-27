import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const CLI = new URL("../src/apex-v2.mjs", import.meta.url).pathname;

function run(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    return result.stdout;
  }
}

function command(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function file(project, relative, content) {
  const path = join(project, relative);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function fakeAgent(project, name, target) {
  const path = join(project, `${name}.mjs`);
  writeFileSync(path, `#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
if (process.argv.includes("--version")) { console.log("fake 1.0"); process.exit(0); }
const args = process.argv.slice(2);
const workspace = args[args.indexOf("-C") + 1];
const output = args[args.indexOf("-o") + 1];
readFileSync(0, "utf8");
const target = join(workspace, ${JSON.stringify(target)});
mkdirSync(dirname(target), { recursive: true });
await new Promise((resolve) => setTimeout(resolve, 300));
writeFileSync(target, ${JSON.stringify(`export const ${name} = true;\n`)});
writeFileSync(output, JSON.stringify({ verdict:"pass", summary:"concurrent worker", tests:[], risks:[], evidence_refs:[] }));
`);
  chmodSync(path, 0o755);
  return path;
}

function passNode(project, runId, nodeId) {
  run(["run", "node", "start", "--project", project, "--run-id", runId, "--node-id", nodeId]);
  const artifact = run(["artifact", "submit", "--project", project, "--run-id", runId, "--node-id", nodeId, "--type", "evidence", "--title", nodeId]);
  run(["run", "node", "complete", "--project", project, "--run-id", runId, "--node-id", nodeId, "--gate", "PASS", "--evidence", artifact.artifact_id]);
}

test("concurrent worker processes preserve isolated patches and ProjectState", async () => {
  const project = mkdtempSync(join(tmpdir(), "apex-concurrent-worker-"));
  file(project, "package.json", JSON.stringify({ name:"fixture", version:"0.0.0", type:"module", scripts:{ test:"node --test tests/*.test.mjs" } }, null, 2));
  file(project, "src/base.mjs", "export const base = true;\n");
  file(project, "tests/base.test.mjs", "import test from 'node:test'; test('base',()=>{});\n");
  file(project, "schemas/base.schema.json", "{\"type\":\"object\"}\n");
  file(project, "planning/project-operating-model.md", "# model\n");
  file(project, "planning/roadmap.md", "# roadmap\n");
  file(project, "planning/v2-planning-recommendation.md", "# recommendation\n");
  file(project, "contracts/stage-contracts-v0.md", "# contracts\n");
  file(project, "research/source-inventory.md", "# sources\n");
  run(["init", "--project", project]);
  const intake = run([
    "intake",
    "add",
    "--project",
    project,
    "--title",
    "concurrent delivery",
    "--area",
    "src/,tests/",
    "--method-pack",
    "governed-v1"
  ]);
  run(["intake", "triage", "--project", project, "--id", intake.id, "--decision", "accepted"]);
  const roadmap = run(["roadmap", "promote", "--project", project, "--intake-id", intake.id]);
  const delivery = run(["run", "create", "--project", project, "--roadmap-id", roadmap.id]);
  passNode(project, delivery.run_id, "mandate");
  run(["knowledge", "refresh", "--project", project]);
  passNode(project, delivery.run_id, "context");
  const generated = run(["run", "plan", "generate", "--project", project, "--run-id", delivery.run_id]);
  run(["run", "node", "start", "--project", project, "--run-id", delivery.run_id, "--node-id", "plan_graph"]);
  run(["run", "node", "complete", "--project", project, "--run-id", delivery.run_id, "--node-id", "plan_graph", "--gate", "PASS", "--evidence", generated.artifact_id]);
  const implementation = run(["worker", "create", "--project", project, "--run-id", delivery.run_id, "--plan-node-id", "delivery-implementation"]);
  const tests = run(["worker", "create", "--project", project, "--run-id", delivery.run_id, "--plan-node-id", "delivery-tests"]);
  const implementationAgent = fakeAgent(project, "implementation", "src/concurrent.mjs");
  const testsAgent = fakeAgent(project, "tests", "tests/concurrent.test.mjs");
  run(["worker", "sandbox", "init", "--project", project, "--worker-id", implementation.worker_id]);
  run(["worker", "sandbox", "init", "--project", project, "--worker-id", tests.worker_id]);
  const [left, right] = await Promise.all([
    command(["worker", "exec-agent", "--project", project, "--worker-id", implementation.worker_id, "--adapter", "codex", "--command", implementationAgent]),
    command(["worker", "exec-agent", "--project", project, "--worker-id", tests.worker_id, "--adapter", "codex", "--command", testsAgent])
  ]);
  assert.equal(left.code, 0, left.stderr);
  assert.equal(right.code, 0, right.stderr);
  const root = join(project, ".apex-v2");
  for (const worker of [implementation, tests]) {
    assert.ok(readFileSync(join(root, "runs", delivery.run_id, "workers", worker.worker_id, "patch-bundle.json"), "utf8"));
  }
  assert.equal(readFileSync(join(project, "src", "base.mjs"), "utf8"), "export const base = true;\n");
  const events = readFileSync(join(root, "events.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  const state = JSON.parse(readFileSync(join(root, "project.json"), "utf8"));
  assert.equal(state.last_event_id, events.at(-1).event_id);
});
