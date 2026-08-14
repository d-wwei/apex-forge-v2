import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  registerJsonWriteValidator,
  writeJson as writeContractJson
} from "../src/lib/common.mjs";
import { validatePersistedValue } from "../src/core/contracts.mjs";
import { inspectAgentAdapters, resolveAgentAdapter } from "../src/adapters/registry.mjs";
import { executeClaudeAdapter } from "../src/adapters/claude.mjs";
import { executeGeminiAdapter } from "../src/adapters/gemini.mjs";
import { syncAdapterSmokeRisk } from "../src/core/risks.mjs";

const CLI = new URL("../src/apex-v2.mjs", import.meta.url).pathname;

function tempProject() {
  return mkdtempSync(join(tmpdir(), "apex-v2-test-"));
}

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    ...options
  });

  if (options.expectFailure) {
    assert.notEqual(result.status, 0, `命令应该失败：${args.join(" ")}`);
  } else {
    assert.equal(result.status, 0, `命令失败：${args.join(" ")}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }

  return result;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function gitAvailable() {
  return spawnSync("git", ["--version"], { encoding: "utf8" }).status === 0;
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

function writeProjectFile(project, relativePath, content) {
  const parts = relativePath.split("/");
  parts.pop();
  if (parts.length > 0) {
    mkdirSync(join(project, ...parts), { recursive: true });
  }
  writeFileSync(join(project, relativePath), content);
}

function createFakeCodex(project, options = {}) {
  const target = options.target || "src/apex-v2.mjs";
  const content = options.content || "console.log('from fake codex');\n";
  const path = join(project, `fake-codex-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(path, `#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

if (process.argv.includes("--version")) {
  console.log("fake-codex 1.0.0");
  process.exit(0);
}
${options.fail ? 'console.error("simulated adapter failure"); process.exit(7);' : ''}

const args = process.argv.slice(2);
const workspace = args[args.indexOf("-C") + 1];
const output = args[args.indexOf("-o") + 1];
const prompt = readFileSync(0, "utf8");
if (!prompt.includes("## Objective") || !prompt.includes("## Write Scope")) {
  console.error("missing worker contract");
  process.exit(2);
}
const target = join(workspace, ${JSON.stringify(target)});
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, ${JSON.stringify(content)});
writeFileSync(output, JSON.stringify({
  verdict: "pass",
  summary: "fake codex completed scoped change",
  tests: [{ command: "node --check", status: "pass", detail: "fixture" }],
  risks: [],
  evidence_refs: []
}));
`);
  chmodSync(path, 0o755);
  return path;
}

function createFakeAdapterSuite(project, options = {}) {
  const bin = join(project, `fake-adapters-${Math.random().toString(36).slice(2)}`);
  mkdirSync(bin, { recursive: true });
  for (const adapter of ["codex", "claude", "gemini"]) {
    const path = join(bin, adapter);
    writeFileSync(path, `#!/usr/bin/env node
import { writeFileSync } from "node:fs";

const adapter = ${JSON.stringify(adapter)};
if (process.argv.includes("--version")) {
  console.log(\`\${adapter} ${options.version || "1.0.0"}\`);
  process.exit(0);
}
if (adapter === ${JSON.stringify(options.failAdapter || "")}) {
  console.error("simulated smoke failure");
  process.exit(7);
}
const result = {
  verdict: "pass",
  summary: "adapter smoke",
  tests: [],
  risks: [],
  evidence_refs: []
};
if (adapter === "codex") {
  const outputIndex = process.argv.indexOf("-o");
  writeFileSync(process.argv[outputIndex + 1], JSON.stringify(result));
} else if (adapter === "claude") {
  console.log(JSON.stringify({ session_id: "claude-smoke", structured_output: result }));
} else {
  console.log(JSON.stringify({ session_id: "gemini-smoke", response: JSON.stringify(result) }));
}
`);
    chmodSync(path, 0o755);
  }
  return {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`
  };
}

function seedProjectFiles(project) {
  writeProjectFile(project, "package.json", JSON.stringify({
    name: "demo-project",
    version: "0.0.0",
    type: "module",
    scripts: {
      test: "node --test tests/*.test.mjs",
      validate: "node src/apex-v2.mjs validate --project ."
    }
  }, null, 2));
  writeProjectFile(project, "src/apex-v2.mjs", "console.log('cli');\n");
  writeProjectFile(project, "tests/apex-v2.test.mjs", "import test from 'node:test';\n");
  writeProjectFile(project, "schemas/demo.schema.json", "{\n  \"type\": \"object\"\n}\n");
  writeProjectFile(project, "planning/project-operating-model.md", "# 项目级运行模型\n");
  writeProjectFile(project, "contracts/stage-contracts-v0.md", "# Contract\n");
  writeProjectFile(project, "research/source-inventory.md", "# 资料盘点\n");
}

function createAcceptedRun(project) {
  run(["init", "--project", project, "--name", "Factory"]);
  const intake = JSON.parse(run(["intake", "add", "--project", project, "--title", "交付节点状态机"]).stdout);
  run(["intake", "triage", "--project", project, "--id", intake.id, "--decision", "accepted"]);
  const roadmapNode = JSON.parse(run(["roadmap", "promote", "--project", project, "--intake-id", intake.id]).stdout);
  const deliveryRun = JSON.parse(run(["run", "create", "--project", project, "--roadmap-id", roadmapNode.id]).stdout);
  return { intake, roadmapNode, deliveryRun };
}

function passNode(project, runId, nodeId, title = `${nodeId} evidence`) {
  run(["run", "node", "start", "--project", project, "--run-id", runId, "--node-id", nodeId]);
  const artifact = JSON.parse(run([
    "artifact",
    "submit",
    "--project",
    project,
    "--run-id",
    runId,
    "--node-id",
    nodeId,
    "--type",
    "evidence",
    "--title",
    title
  ]).stdout);
  run([
    "run",
    "node",
    "complete",
    "--project",
    project,
    "--run-id",
    runId,
    "--node-id",
    nodeId,
    "--gate",
    "PASS",
    "--evidence",
    artifact.artifact_id,
    "--reason",
    `${nodeId} 已通过`
  ]);
  return artifact;
}

function createRunWithPlanGraph(project) {
  seedProjectFiles(project);
  const { deliveryRun } = createAcceptedRun(project);
  passNode(project, deliveryRun.run_id, "mandate", "目标已明确");
  run(["knowledge", "refresh", "--project", project]);
  passNode(project, deliveryRun.run_id, "context", "Context Fabric 已刷新");
  const generated = JSON.parse(run(["run", "plan", "generate", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "plan_graph", generated.artifact_id);
  return { deliveryRun, generated };
}

function submitEvidenceForRemainingPlanNodes(project, runId) {
  const root = join(project, ".apex-v2");
  const plan = readJson(join(root, "runs", runId, "plan-graph.json"));
  const existing = new Set(
    JSON.parse(run(["worker", "list", "--project", project, "--run-id", runId]).stdout)
      .map((worker) => worker.plan_node_id)
  );
  const created = [];

  for (const node of plan.nodes) {
    if (existing.has(node.id)) continue;
    const worker = JSON.parse(run([
      "worker",
      "create",
      "--project",
      project,
      "--run-id",
      runId,
      "--plan-node-id",
      node.id
    ]).stdout);
    run(["worker", "exec-shell", "--project", project, "--worker-id", worker.worker_id, "--cmd", "node --version"]);
    created.push(worker);
  }

  return created;
}

function createRunWithQueuedPatches(project) {
  const { deliveryRun } = createRunWithPlanGraph(project);
  const workerA = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-implementation"
  ]).stdout);
  const patchA = JSON.parse(run([
    "worker",
    "submit-patch",
    "--project",
    project,
    "--worker-id",
    workerA.worker_id,
    "--summary",
    "worker isolation patch",
    "--files",
    "src/apex-v2.mjs",
    "--replace-file",
    "src/apex-v2.mjs",
    "--old-text",
    "console.log('cli');",
    "--new-text",
    "console.log('cli staged');"
  ]).stdout);
  const workerB = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-tests"
  ]).stdout);
  const patchB = JSON.parse(run([
    "worker",
    "submit-patch",
    "--project",
    project,
    "--worker-id",
    workerB.worker_id,
    "--summary",
    "verification patch",
    "--files",
    "tests/apex-v2.test.mjs",
    "--replace-file",
    "tests/apex-v2.test.mjs",
    "--old-text",
    "import test from 'node:test';",
    "--new-text",
    "import test from 'node:test';\n// staged verification fixture"
  ]).stdout);
  run(["merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id, "--patch-id", patchA.patch.patch_id]);
  run(["merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id, "--patch-id", patchB.patch.patch_id]);
  passNodeWithEvidence(project, deliveryRun.run_id, "execute", `${patchA.artifact_id},${patchB.artifact_id}`);
  return { deliveryRun, workerA, workerB, patchA, patchB };
}

function createIntegratedRun(project) {
  const { deliveryRun, patchA, patchB } = createRunWithQueuedPatches(project);
  const verified = JSON.parse(run(["verify", "run", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "verify", verified.artifact_id);
  const review = JSON.parse(run(["review", "generate", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "review", review.artifact_id);
  const applied = JSON.parse(run(["merge", "apply", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "integrate", applied.artifact_id);
  return { deliveryRun, patchA, patchB, verified, review, applied };
}

function passNodeWithEvidence(project, runId, nodeId, artifactId) {
  run(["run", "node", "start", "--project", project, "--run-id", runId, "--node-id", nodeId]);
  run([
    "run",
    "node",
    "complete",
    "--project",
    project,
    "--run-id",
    runId,
    "--node-id",
    nodeId,
    "--gate",
    "PASS",
    "--evidence",
    artifactId,
    "--reason",
    `${nodeId} 已通过`
  ]);
}

test("init 创建项目级 .apex-v2 工作区和共享知识库，并且可重复执行", () => {
  const project = tempProject();

  run(["init", "--project", project, "--name", "Demo"]);
  run(["init", "--project", project, "--name", "Demo"]);
  run(["validate", "--project", project]);

  const root = join(project, ".apex-v2");
  assert.ok(existsSync(join(root, "project.json")));
  assert.ok(existsSync(join(root, "events.jsonl")));
  assert.ok(existsSync(join(root, "knowledge", "index.md")));
  assert.ok(existsSync(join(root, "knowledge", "module-map.md")));
  assert.ok(existsSync(join(root, "knowledge", "test-map.md")));
  assert.ok(existsSync(join(root, "knowledge", "decisions.md")));
  assert.ok(existsSync(join(root, "policies", "retry.json")));

  const projectState = readJson(join(root, "project.json"));
  assert.equal(projectState.project_name, "Demo");
  assert.equal(projectState.knowledge_version, 0);
  assert.deepEqual(projectState.active_runs, []);

  const eventLines = readFileSync(join(root, "events.jsonl"), "utf8").trim().split("\n");
  assert.equal(eventLines.length, 1, "重复 init 不应追加重复初始化事件");
  assert.equal(JSON.parse(eventLines[0]).type, "project.initialized");
});

test("intake -> triage -> roadmap -> run 形成项目级需求到交付子图的闭环", () => {
  const project = tempProject();
  run(["init", "--project", project, "--name", "Factory"]);

  const added = run([
    "intake",
    "add",
    "--project",
    project,
    "--type",
    "feature",
    "--title",
    "支持多线并行研发",
    "--description",
    "项目需要持续接收新需求并并行研发。",
    "--priority",
    "P1",
    "--risk",
    "high",
    "--area",
    "orchestration"
  ]);
  const intake = JSON.parse(added.stdout);
  assert.match(intake.id, /^intake-/);
  assert.equal(intake.triage.status, "new");

  const triaged = run([
    "intake",
    "triage",
    "--project",
    project,
    "--id",
    intake.id,
    "--decision",
    "accepted",
    "--target-milestone",
    "MVP-Project-Kernel",
    "--reason",
    "项目级目标的核心能力"
  ]);
  assert.equal(JSON.parse(triaged.stdout).triage.status, "accepted");

  const promoted = run(["roadmap", "promote", "--project", project, "--intake-id", intake.id]);
  const roadmapNode = JSON.parse(promoted.stdout);
  assert.match(roadmapNode.id, /^roadmap-/);
  assert.equal(roadmapNode.status, "ready");
  assert.equal(roadmapNode.risk, "high");

  const createdRun = run(["run", "create", "--project", project, "--roadmap-id", roadmapNode.id]);
  const deliveryRun = JSON.parse(createdRun.stdout);
  assert.match(deliveryRun.run_id, /^run-/);
  assert.equal(deliveryRun.roadmap_node_id, roadmapNode.id);
  assert.equal(deliveryRun.status, "planned");
  assert.ok(deliveryRun.context_snapshot.files.includes("knowledge/index.md"));

  const root = join(project, ".apex-v2");
  const projectState = readJson(join(root, "project.json"));
  assert.deepEqual(projectState.active_runs, [deliveryRun.run_id]);
  assert.ok(existsSync(join(root, "runs", deliveryRun.run_id, "run.json")));
  assert.ok(existsSync(join(root, "artifacts", deliveryRun.run_id)));

  const status = JSON.parse(run(["status", "--project", project]).stdout);
  assert.equal(status.intake.accepted, 1);
  assert.equal(status.roadmap.active, 1);
  assert.deepEqual(status.active_runs, [deliveryRun.run_id]);

  run(["validate", "--project", project]);
});

test("project tick 自动提升 accepted intake 并按 WIP 派生 delivery runs，且重复执行幂等", () => {
  const project = tempProject();
  run(["init", "--project", project, "--name", "Tick Demo"]);
  const root = join(project, ".apex-v2");
  const statePath = join(root, "project.json");
  const state = readJson(statePath);
  state.wip_limits.active_runs = 1;
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

  const low = JSON.parse(run(["intake", "add", "--project", project, "--title", "低优先级需求", "--priority", "P2", "--risk", "medium"]).stdout);
  const high = JSON.parse(run(["intake", "add", "--project", project, "--title", "高优先级需求", "--priority", "P0", "--risk", "critical"]).stdout);
  run(["intake", "triage", "--project", project, "--id", low.id, "--decision", "accepted", "--target-milestone", "M1"]);
  run(["intake", "triage", "--project", project, "--id", high.id, "--decision", "accepted", "--target-milestone", "M1"]);

  const firstTick = JSON.parse(run(["project", "tick", "--project", project]).stdout);
  assert.equal(firstTick.promoted.length, 2);
  assert.equal(firstTick.created_runs.length, 1);
  assert.equal(firstTick.remaining_ready, 1);

  const roadmap = readJson(join(root, "roadmap", "graph.json"));
  const createdRoadmapNode = roadmap.nodes.find((node) => node.id === firstTick.created_runs[0].roadmap_node_id);
  assert.equal(createdRoadmapNode.title, "高优先级需求");

  const secondTick = JSON.parse(run(["project", "tick", "--project", project]).stdout);
  assert.equal(secondTick.promoted.length, 0);
  assert.equal(secondTick.created_runs.length, 0);
  assert.equal(secondTick.remaining_ready, 1);

  const projectState = readJson(statePath);
  assert.deepEqual(projectState.active_runs, [firstTick.created_runs[0].run_id]);
});

test("project tick --advance 自动推进 active run 到 plan_graph，但不越过 execute 边界", () => {
  const project = tempProject();
  seedProjectFiles(project);
  run(["init", "--project", project, "--name", "Advance Demo"]);
  run(["knowledge", "refresh", "--project", project]);
  const intake = JSON.parse(run(["intake", "add", "--project", project, "--title", "自动推进规划阶段", "--priority", "P1", "--risk", "high"]).stdout);
  run(["intake", "triage", "--project", project, "--id", intake.id, "--decision", "accepted"]);

  const tick = JSON.parse(run(["project", "tick", "--project", project, "--advance"]).stdout);
  assert.equal(tick.created_runs.length, 1);
  assert.equal(tick.advanced_runs.length, 1);
  const runId = tick.created_runs[0].run_id;
  assert.deepEqual(tick.advanced_runs[0].actions.map((action) => action.node_id), ["mandate", "context", "plan_graph"]);

  const runState = readJson(join(project, ".apex-v2", "runs", runId, "run.json"));
  assert.equal(runState.nodes.find((node) => node.id === "mandate").status, "passed");
  assert.equal(runState.nodes.find((node) => node.id === "context").status, "passed");
  assert.equal(runState.nodes.find((node) => node.id === "plan_graph").status, "passed");
  assert.equal(runState.nodes.find((node) => node.id === "execute").status, "pending");
  assert.ok(existsSync(join(project, ".apex-v2", "runs", runId, "plan-graph.json")));

  const secondTick = JSON.parse(run(["project", "tick", "--project", project, "--advance"]).stdout);
  assert.equal(secondTick.created_runs.length, 0);
  assert.equal(secondTick.advanced_runs.length, 0);
});

test("project tick --advance --dispatch 自动为 ready plan nodes 创建 worker 且受 parallel WIP 限制", () => {
  const project = tempProject();
  seedProjectFiles(project);
  run(["init", "--project", project, "--name", "Dispatch Demo"]);
  run(["knowledge", "refresh", "--project", project]);
  const root = join(project, ".apex-v2");
  const statePath = join(root, "project.json");
  const state = readJson(statePath);
  state.wip_limits.parallel_workers = 1;
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

  const intake = JSON.parse(run(["intake", "add", "--project", project, "--title", "自动派发 worker", "--priority", "P1", "--risk", "high"]).stdout);
  run(["intake", "triage", "--project", project, "--id", intake.id, "--decision", "accepted"]);

  const firstTick = JSON.parse(run(["project", "tick", "--project", project, "--advance", "--dispatch"]).stdout);
  assert.equal(firstTick.created_runs.length, 1);
  assert.equal(firstTick.dispatched_workers.length, 1);
  const runId = firstTick.created_runs[0].run_id;
  assert.equal(firstTick.dispatched_workers[0].run_id, runId);

  const workers = JSON.parse(run(["worker", "list", "--project", project, "--run-id", runId]).stdout);
  assert.equal(workers.length, 1);
  assert.equal(workers[0].status, "active");
  assert.ok(["delivery-context", "delivery-risk"].includes(workers[0].plan_node_id));

  const secondTick = JSON.parse(run(["project", "tick", "--project", project, "--advance", "--dispatch"]).stdout);
  assert.equal(secondTick.dispatched_workers.length, 0);
  const workersAfterSecondTick = JSON.parse(run(["worker", "list", "--project", project, "--run-id", runId]).stdout);
  assert.equal(workersAfterSecondTick.length, 1);
});

test("project tick --run-workers 自动执行 active worker 的验证命令并保持幂等", () => {
  const project = tempProject();
  seedProjectFiles(project);
  run(["init", "--project", project, "--name", "Run Worker Demo"]);
  run(["knowledge", "refresh", "--project", project]);
  const intake = JSON.parse(run(["intake", "add", "--project", project, "--title", "自动运行 worker", "--priority", "P1", "--risk", "high"]).stdout);
  run(["intake", "triage", "--project", project, "--id", intake.id, "--decision", "accepted"]);
  const tick = JSON.parse(run(["project", "tick", "--project", project, "--advance", "--dispatch"]).stdout);
  const runId = tick.created_runs[0].run_id;

  const runWorkers = JSON.parse(run(["project", "tick", "--project", project, "--run-workers", "--worker-limit", "1"]).stdout);
  assert.equal(runWorkers.worker_runs.length, 1);
  assert.equal(runWorkers.worker_runs[0].status, "PASS");
  assert.match(runWorkers.worker_runs[0].artifact_id, /^artifact-/);

  const workers = JSON.parse(run(["worker", "list", "--project", project, "--run-id", runId]).stdout);
  assert.equal(workers.filter((worker) => worker.status === "evidence_submitted").length, 1);

  const second = JSON.parse(run(["project", "tick", "--project", project, "--run-workers", "--worker-limit", "1"]).stdout);
  assert.equal(second.worker_runs.length, 1, "第二次应运行另一个尚未执行的 active worker");

  const third = JSON.parse(run(["project", "tick", "--project", project, "--run-workers", "--worker-limit", "2"]).stdout);
  assert.equal(third.worker_runs.length, 0, "已有 adapter result 的 worker 不应重复执行");
});

test("project tick --run-workers 遇到失败命令会阻塞 worker", () => {
  const project = tempProject();
  seedProjectFiles(project);
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-context"
  ]).stdout);

  const workerPath = join(project, ".apex-v2", "runs", deliveryRun.run_id, "workers", worker.worker_id, "worker.json");
  const workerState = readJson(workerPath);
  workerState.verification = ["node -e \"process.exit(9)\""];
  writeFileSync(workerPath, `${JSON.stringify(workerState, null, 2)}\n`);

  const tick = JSON.parse(run(["project", "tick", "--project", project, "--run-workers"]).stdout);
  assert.equal(tick.worker_runs.length, 1);
  assert.equal(tick.worker_runs[0].status, "FAIL");

  const workers = JSON.parse(run(["worker", "list", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(workers.find((item) => item.worker_id === worker.worker_id).status, "blocked");
});

test("project tick --complete-execute 必须等待全部 PlanGraph 节点完成", () => {
  const project = tempProject();
  seedProjectFiles(project);
  const { deliveryRun } = createRunWithPlanGraph(project);

  const evidenceWorker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-implementation"
  ]).stdout);
  const decisionWorker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-context"
  ]).stdout);

  run(["worker", "exec-shell", "--project", project, "--worker-id", evidenceWorker.worker_id, "--cmd", "node --version"]);
  run(["worker", "decide", "--project", project, "--worker-id", decisionWorker.worker_id, "--decision", "context worker 不提交 patch"]);

  const partialTick = JSON.parse(run(["project", "tick", "--project", project, "--collect-results", "--complete-execute"]).stdout);
  assert.equal(partialTick.collected_results.length, 2);
  assert.equal(partialTick.completed_execute_runs.length, 0);

  submitEvidenceForRemainingPlanNodes(project, deliveryRun.run_id);
  const tick = JSON.parse(run(["project", "tick", "--project", project, "--collect-results", "--complete-execute"]).stdout);
  assert.ok(tick.collected_results.length >= 5);
  assert.equal(tick.completed_execute_runs.length, 1);
  assert.equal(tick.completed_execute_runs[0].run_id, deliveryRun.run_id);

  const root = join(project, ".apex-v2");
  assert.ok(existsSync(join(root, "runs", deliveryRun.run_id, "decision-queue.json")));
  const queue = readJson(join(root, "runs", deliveryRun.run_id, "decision-queue.json"));
  assert.equal(queue.items.length, 7);

  const runState = readJson(join(root, "runs", deliveryRun.run_id, "run.json"));
  assert.equal(runState.nodes.find((node) => node.id === "execute").status, "passed");

  const secondTick = JSON.parse(run(["project", "tick", "--project", project, "--collect-results", "--complete-execute"]).stdout);
  assert.equal(secondTick.collected_results.length, 0);
  assert.equal(secondTick.completed_execute_runs.length, 0);
});

test("project tick --verify --review 自动生成报告并在 review PASS 时通过节点", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithQueuedPatches(project);

  const tick = JSON.parse(run(["project", "tick", "--project", project, "--verify", "--review"]).stdout);
  assert.equal(tick.verified_runs.length, 1);
  assert.equal(tick.verified_runs[0].status, "PASS");
  assert.equal(tick.reviewed_runs.length, 1);
  assert.equal(tick.reviewed_runs[0].status, "PASS");

  const root = join(project, ".apex-v2");
  const runState = readJson(join(root, "runs", deliveryRun.run_id, "run.json"));
  assert.equal(runState.nodes.find((node) => node.id === "verify").status, "passed");
  assert.equal(runState.nodes.find((node) => node.id === "review").status, "passed");
  assert.ok(existsSync(join(root, "runs", deliveryRun.run_id, "verification-report.json")));
  assert.ok(existsSync(join(root, "runs", deliveryRun.run_id, "review-report.json")));

  const secondTick = JSON.parse(run(["project", "tick", "--project", project, "--verify", "--review"]).stdout);
  assert.equal(secondTick.verified_runs.length, 0);
  assert.equal(secondTick.reviewed_runs.length, 0);
});

test("project tick --review 对 evidence-only run 允许 no-op integration", () => {
  const project = tempProject();
  seedProjectFiles(project);
  const { deliveryRun } = createRunWithPlanGraph(project);
  const evidenceWorker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-implementation"
  ]).stdout);
  run(["worker", "exec-shell", "--project", project, "--worker-id", evidenceWorker.worker_id, "--cmd", "node --version"]);
  submitEvidenceForRemainingPlanNodes(project, deliveryRun.run_id);
  const tick = JSON.parse(run(["project", "tick", "--project", project, "--collect-results", "--complete-execute", "--verify", "--review"]).stdout);
  assert.equal(tick.completed_execute_runs.length, 1);
  assert.equal(tick.verified_runs.length, 1);
  assert.equal(tick.reviewed_runs.length, 1);
  assert.equal(tick.reviewed_runs[0].status, "PASS");

  const reviewReport = readJson(join(project, ".apex-v2", "runs", deliveryRun.run_id, "review-report.json"));
  assert.equal(reviewReport.status, "PASS");
  assert.ok(reviewReport.non_blocking_findings.some((finding) => finding.includes("no-op integration")));
});

test("project tick --review 对手工 execute evidence-only run 也允许 no-op integration", () => {
  const project = tempProject();
  seedProjectFiles(project);
  const { deliveryRun } = createRunWithPlanGraph(project);
  passNode(project, deliveryRun.run_id, "execute", "manual execute evidence");
  const verified = JSON.parse(run(["verify", "run", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "verify", verified.artifact_id);

  const tick = JSON.parse(run(["project", "tick", "--project", project, "--review"]).stdout);
  assert.equal(tick.reviewed_runs.length, 1);
  assert.equal(tick.reviewed_runs[0].status, "PASS");
});

test("merge apply 对 evidence-only run 生成 NOOP integration report", () => {
  const project = tempProject();
  seedProjectFiles(project);
  const { deliveryRun } = createRunWithPlanGraph(project);
  const evidenceWorker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-implementation"
  ]).stdout);
  run(["worker", "exec-shell", "--project", project, "--worker-id", evidenceWorker.worker_id, "--cmd", "node --version"]);
  submitEvidenceForRemainingPlanNodes(project, deliveryRun.run_id);
  const tick = JSON.parse(run(["project", "tick", "--project", project, "--collect-results", "--complete-execute", "--verify", "--review"]).stdout);
  assert.equal(tick.reviewed_runs[0].status, "PASS");

  const applied = JSON.parse(run(["merge", "apply", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(applied.report.status, "NOOP");
  assert.deepEqual(applied.report.merged_patches, []);
  passNodeWithEvidence(project, deliveryRun.run_id, "integrate", applied.artifact_id);
});

test("project tick --integrate 自动处理 evidence-only no-op integration", () => {
  const project = tempProject();
  seedProjectFiles(project);
  const { deliveryRun } = createRunWithPlanGraph(project);
  const evidenceWorker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-implementation"
  ]).stdout);
  run(["worker", "exec-shell", "--project", project, "--worker-id", evidenceWorker.worker_id, "--cmd", "node --version"]);
  submitEvidenceForRemainingPlanNodes(project, deliveryRun.run_id);
  run(["project", "tick", "--project", project, "--collect-results", "--complete-execute", "--verify", "--review"]);

  const integrated = JSON.parse(run(["project", "tick", "--project", project, "--integrate"]).stdout);
  assert.equal(integrated.integrated_runs.length, 1);
  assert.equal(integrated.integrated_runs[0].status, "NOOP");

  const root = join(project, ".apex-v2");
  const runState = readJson(join(root, "runs", deliveryRun.run_id, "run.json"));
  assert.equal(runState.nodes.find((node) => node.id === "integrate").status, "passed");
});

test("project tick --learn 默认只生成提案，--apply-learning 才写回并关闭 run", () => {
  const project = tempProject();
  seedProjectFiles(project);
  const { deliveryRun } = createIntegratedRun(project);

  const proposedOnly = JSON.parse(run(["project", "tick", "--project", project, "--learn"]).stdout);
  assert.equal(proposedOnly.learned_runs.length, 1);
  assert.equal(proposedOnly.learned_runs[0].applied.length, 0);

  const root = join(project, ".apex-v2");
  let runState = readJson(join(root, "runs", deliveryRun.run_id, "run.json"));
  assert.equal(runState.nodes.find((node) => node.id === "learn").status, "pending");

  const applied = JSON.parse(run(["project", "tick", "--project", project, "--learn", "--apply-learning"]).stdout);
  assert.equal(applied.learned_runs.length, 1);
  assert.ok(applied.learned_runs[0].applied.length > 0);

  runState = readJson(join(root, "runs", deliveryRun.run_id, "run.json"));
  assert.equal(runState.status, "done");
  assert.equal(runState.nodes.find((node) => node.id === "learn").status, "passed");
});

test("project tick --review 在有 patch 但未进入 merge queue 时仍 BLOCKED", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-implementation"
  ]).stdout);
  const patch = JSON.parse(run([
    "worker",
    "submit-patch",
    "--project",
    project,
    "--worker-id",
    worker.worker_id,
    "--summary",
    "patch not queued",
    "--files",
    "src/apex-v2.mjs"
  ]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "execute", patch.artifact_id);
  const verified = JSON.parse(run(["verify", "run", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "verify", verified.artifact_id);

  const tick = JSON.parse(run(["project", "tick", "--project", project, "--review"]).stdout);
  assert.equal(tick.reviewed_runs.length, 1);
  assert.equal(tick.reviewed_runs[0].status, "BLOCKED");

  const root = join(project, ".apex-v2");
  const runState = readJson(join(root, "runs", deliveryRun.run_id, "run.json"));
  assert.equal(runState.nodes.find((node) => node.id === "review").status, "pending");
  const report = readJson(join(root, "runs", deliveryRun.run_id, "review-report.json"));
  assert.equal(report.status, "BLOCKED");
});

test("project tick --complete-execute 不会越过 blocked worker", () => {
  const project = tempProject();
  seedProjectFiles(project);
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-context"
  ]).stdout);
  run(["worker", "exec-shell", "--project", project, "--worker-id", worker.worker_id, "--cmd", "node -e \"process.exit(5)\""]);

  const tick = JSON.parse(run(["project", "tick", "--project", project, "--collect-results", "--complete-execute"]).stdout);
  assert.equal(tick.completed_execute_runs.length, 0);

  const runState = readJson(join(project, ".apex-v2", "runs", deliveryRun.run_id, "run.json"));
  assert.equal(runState.nodes.find((node) => node.id === "execute").status, "pending");
});

test("未 triage 的 intake 不能直接进入 roadmap", () => {
  const project = tempProject();
  run(["init", "--project", project]);
  const added = run(["intake", "add", "--project", project, "--title", "未确认需求"]);
  const intake = JSON.parse(added.stdout);

  const result = run(["roadmap", "promote", "--project", project, "--intake-id", intake.id], {
    expectFailure: true
  });
  assert.match(result.stderr, /尚未 accepted/);
});

test("达到 active run WIP 限制后拒绝继续创建 run", () => {
  const project = tempProject();
  run(["init", "--project", project]);

  const root = join(project, ".apex-v2");
  const statePath = join(root, "project.json");
  const state = readJson(statePath);
  state.wip_limits.active_runs = 1;
  state.updated_at = new Date().toISOString();
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

  const first = JSON.parse(run(["intake", "add", "--project", project, "--title", "任务一"]).stdout);
  run(["intake", "triage", "--project", project, "--id", first.id, "--decision", "accepted"]);
  const firstNode = JSON.parse(run(["roadmap", "promote", "--project", project, "--intake-id", first.id]).stdout);
  run(["run", "create", "--project", project, "--roadmap-id", firstNode.id]);

  const second = JSON.parse(run(["intake", "add", "--project", project, "--title", "任务二"]).stdout);
  run(["intake", "triage", "--project", project, "--id", second.id, "--decision", "accepted"]);
  const secondNode = JSON.parse(run(["roadmap", "promote", "--project", project, "--intake-id", second.id]).stdout);
  const failed = run(["run", "create", "--project", project, "--roadmap-id", secondNode.id], {
    expectFailure: true
  });
  assert.match(failed.stderr, /WIP 限制/);
});

test("run node PASS 必须引用当前节点已提交的 artifact evidence", () => {
  const project = tempProject();
  const { deliveryRun } = createAcceptedRun(project);

  run([
    "run",
    "node",
    "start",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--node-id",
    "mandate"
  ]);

  const noEvidence = run([
    "run",
    "node",
    "complete",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--node-id",
    "mandate",
    "--gate",
    "PASS",
    "--reason",
    "没有证据不应该通过"
  ], {
    expectFailure: true
  });
  assert.match(noEvidence.stderr, /必须提供 --evidence/);

  const artifact = JSON.parse(run([
    "artifact",
    "submit",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--node-id",
    "mandate",
    "--type",
    "evidence",
    "--title",
    "Mandate 已明确",
    "--body",
    "目标、范围和成功标准已记录。"
  ]).stdout);

  const completed = JSON.parse(run([
    "run",
    "node",
    "complete",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--node-id",
    "mandate",
    "--gate",
    "PASS",
    "--evidence",
    artifact.artifact_id,
    "--reason",
    "mandate evidence 已提交"
  ]).stdout);
  const mandate = completed.nodes.find((node) => node.id === "mandate");
  assert.equal(mandate.status, "passed");
  assert.deepEqual(mandate.evidence_refs, [artifact.artifact_id]);

  const artifacts = JSON.parse(run([
    "artifact",
    "list",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id
  ]).stdout);
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].artifact_id, artifact.artifact_id);
});

test("PARTIAL_PASS 必须声明 carry-forward，且未处理风险会暂停 run", () => {
  const project = tempProject();
  seedProjectFiles(project);
  const { roadmapNode, deliveryRun } = createAcceptedRun(project);
  run(["run", "node", "start", "--project", project, "--run-id", deliveryRun.run_id, "--node-id", "mandate"]);
  const mandateArtifact = JSON.parse(run([
    "artifact", "submit", "--project", project, "--run-id", deliveryRun.run_id,
    "--node-id", "mandate", "--type", "evidence", "--title", "partial mandate"
  ]).stdout);
  const missingCarry = run([
    "run", "node", "complete", "--project", project, "--run-id", deliveryRun.run_id,
    "--node-id", "mandate", "--gate", "PARTIAL_PASS", "--evidence", mandateArtifact.artifact_id
  ], { expectFailure: true });
  assert.match(missingCarry.stderr, /必须提供 --carry-forward/);

  const partial = JSON.parse(run([
    "run", "node", "complete", "--project", project, "--run-id", deliveryRun.run_id,
    "--node-id", "mandate", "--gate", "PARTIAL_PASS",
    "--evidence", mandateArtifact.artifact_id,
    "--carry-forward", "验收 owner 尚未最终确认",
    "--carry-severity", "high",
    "--carry-target", "review",
    "--reason", "目标可继续规划，但最终验收需人工确认"
  ]).stdout);
  assert.equal(partial.nodes.find((node) => node.id === "mandate").status, "partial_pass");
  assert.equal(partial.carry_forward.length, 1);
  assert.equal(partial.carry_forward[0].status, "open");
  assert.equal(JSON.parse(run(["risk", "list", "--project", project, "--status", "open"]).stdout).length, 1);

  const contextArtifact = passNode(project, deliveryRun.run_id, "context");
  for (const nodeId of ["plan_graph", "execute", "verify", "review", "integrate", "learn"]) {
    passNode(project, deliveryRun.run_id, nodeId);
  }
  const root = join(project, ".apex-v2");
  const paused = readJson(join(root, "runs", deliveryRun.run_id, "run.json"));
  assert.equal(paused.status, "paused");
  assert.equal(paused.gate.status, "ESCALATE");
  assert.deepEqual(readJson(join(root, "project.json")).active_runs, [deliveryRun.run_id]);
  assert.equal(readJson(join(root, "roadmap", "graph.json")).nodes.find((node) => node.id === roadmapNode.id).status, "active");

  const resolved = JSON.parse(run([
    "run", "carry", "resolve", "--project", project, "--run-id", deliveryRun.run_id,
    "--id", paused.carry_forward[0].id, "--evidence", contextArtifact.artifact_id,
    "--reason", "验收 owner 已通过 context evidence 确认"
  ]).stdout);
  assert.equal(resolved.carry.status, "resolved");
  assert.equal(resolved.run.status, "done");
  assert.equal(JSON.parse(run(["risk", "list", "--project", project, "--status", "mitigated"]).stdout).length, 1);
  assert.deepEqual(readJson(join(root, "project.json")).active_runs, []);
  assert.equal(readJson(join(root, "roadmap", "graph.json")).nodes.find((node) => node.id === roadmapNode.id).status, "done");
});

test("所有节点 PASS 后自动关闭 delivery run 并回写 roadmap/project 状态", () => {
  const project = tempProject();
  const { roadmapNode, deliveryRun } = createAcceptedRun(project);
  const nodeIds = ["mandate", "context", "plan_graph", "execute", "verify", "review", "integrate", "learn"];

  for (const nodeId of nodeIds) {
    run(["run", "node", "start", "--project", project, "--run-id", deliveryRun.run_id, "--node-id", nodeId]);
    const artifact = JSON.parse(run([
      "artifact",
      "submit",
      "--project",
      project,
      "--run-id",
      deliveryRun.run_id,
      "--node-id",
      nodeId,
      "--type",
      "evidence",
      "--title",
      `${nodeId} evidence`
    ]).stdout);
    run([
      "run",
      "node",
      "complete",
      "--project",
      project,
      "--run-id",
      deliveryRun.run_id,
      "--node-id",
      nodeId,
      "--gate",
      "PASS",
      "--evidence",
      artifact.artifact_id,
      "--reason",
      `${nodeId} 通过`
    ]);
  }

  const root = join(project, ".apex-v2");
  const finalRun = readJson(join(root, "runs", deliveryRun.run_id, "run.json"));
  assert.equal(finalRun.status, "done");
  assert.equal(finalRun.gate.status, "PASS");
  assert.ok(finalRun.nodes.every((node) => node.status === "passed"));

  const projectState = readJson(join(root, "project.json"));
  assert.deepEqual(projectState.active_runs, []);

  const roadmap = readJson(join(root, "roadmap", "graph.json"));
  const node = roadmap.nodes.find((entry) => entry.id === roadmapNode.id);
  assert.equal(node.status, "done");
});

test("fail 和 escalate 节点动作写入可追踪 gate 状态", () => {
  const project = tempProject();
  const { deliveryRun } = createAcceptedRun(project);

  const failed = JSON.parse(run([
    "run",
    "node",
    "fail",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--node-id",
    "execute",
    "--mode",
    "replan",
    "--reason",
    "计划拆分错误"
  ]).stdout);
  assert.equal(failed.nodes.find((node) => node.id === "execute").status, "failed_replan");

  const escalated = JSON.parse(run([
    "run",
    "node",
    "escalate",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--node-id",
    "review",
    "--reason",
    "需要人工接受风险"
  ]).stdout);
  const review = escalated.nodes.find((node) => node.id === "review");
  assert.equal(review.status, "escalated");
  assert.equal(review.gate.status, "ESCALATE");
});

test("knowledge refresh 将占位知识库升级为带来源的 Context Fabric", () => {
  const project = tempProject();
  seedProjectFiles(project);
  run(["init", "--project", project, "--name", "Knowledge Demo"]);

  const strictBefore = run(["validate", "--project", project, "--strict-knowledge"], {
    expectFailure: true
  });
  assert.match(strictBefore.stderr, /strict-knowledge/);

  const refreshed = JSON.parse(run(["knowledge", "refresh", "--project", project]).stdout);
  assert.equal(refreshed.knowledge_version, 1);
  assert.ok(refreshed.source_refs.includes("src/apex-v2.mjs"));
  assert.ok(refreshed.source_refs.includes("tests/apex-v2.test.mjs"));
  assert.ok(refreshed.source_refs.includes("schemas/demo.schema.json"));

  run(["validate", "--project", project, "--strict-knowledge"]);

  const root = join(project, ".apex-v2");
  const projectState = readJson(join(root, "project.json"));
  const manifest = readJson(join(root, "knowledge", "manifest.json"));
  const index = readFileSync(join(root, "knowledge", "index.md"), "utf8");
  const testMap = readFileSync(join(root, "knowledge", "test-map.md"), "utf8");

  assert.equal(projectState.knowledge_version, 1);
  assert.equal(manifest.version, 1);
  assert.match(index, /src\/apex-v2\.mjs/);
  assert.match(index, /tests\/apex-v2\.test\.mjs/);
  assert.match(testMap, /npm test/);
});

test("knowledge refresh 会更新尚未通过 context 节点的 active run context snapshot", () => {
  const project = tempProject();
  seedProjectFiles(project);
  const { deliveryRun } = createAcceptedRun(project);

  const before = readJson(join(project, ".apex-v2", "runs", deliveryRun.run_id, "run.json"));
  assert.equal(before.context_snapshot.knowledge_version, 0);

  const refreshed = JSON.parse(run(["knowledge", "refresh", "--project", project]).stdout);
  assert.equal(refreshed.knowledge_version, 1);
  assert.deepEqual(refreshed.updated_runs, [deliveryRun.run_id]);

  const after = readJson(join(project, ".apex-v2", "runs", deliveryRun.run_id, "run.json"));
  assert.equal(after.context_snapshot.knowledge_version, 1);
  assert.ok(after.context_snapshot.files.includes("knowledge/index.md"));
});

test("plan graph 必须在 mandate/context 通过后生成，并产出可校验 plan artifact", () => {
  const project = tempProject();
  seedProjectFiles(project);
  const { deliveryRun } = createAcceptedRun(project);

  const tooEarly = run(["run", "plan", "generate", "--project", project, "--run-id", deliveryRun.run_id], {
    expectFailure: true
  });
  assert.match(tooEarly.stderr, /必须先 PASS\/PARTIAL_PASS mandate/);

  passNode(project, deliveryRun.run_id, "mandate", "目标已明确");
  const stillEarly = run(["run", "plan", "generate", "--project", project, "--run-id", deliveryRun.run_id], {
    expectFailure: true
  });
  assert.match(stillEarly.stderr, /必须先 PASS\/PARTIAL_PASS context/);

  run(["knowledge", "refresh", "--project", project]);
  passNode(project, deliveryRun.run_id, "context", "Context Fabric 已刷新");

  const generated = JSON.parse(run(["run", "plan", "generate", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(generated.validation.status, "PASS");
  assert.equal(generated.validation.errors.length, 0);
  assert.ok(generated.plan.nodes.length >= 5);
  assert.ok(generated.plan.parallel_lanes.length >= 3);
  assert.match(generated.artifact_id, /^artifact-/);

  const root = join(project, ".apex-v2");
  assert.ok(existsSync(join(root, "runs", deliveryRun.run_id, "plan-graph.json")));
  assert.ok(existsSync(join(root, "runs", deliveryRun.run_id, "PLAN_GRAPH.md")));

  const validation = JSON.parse(run(["run", "plan", "validate", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(validation.status, "PASS");

  const artifacts = JSON.parse(run(["artifact", "list", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  const planArtifact = artifacts.find((artifact) => artifact.artifact_id === generated.artifact_id);
  assert.equal(planArtifact.type, "plan");
  assert.equal(planArtifact.node_id, "plan_graph");

  run(["run", "node", "start", "--project", project, "--run-id", deliveryRun.run_id, "--node-id", "plan_graph"]);
  const completed = JSON.parse(run([
    "run",
    "node",
    "complete",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--node-id",
    "plan_graph",
    "--gate",
    "PASS",
    "--evidence",
    generated.artifact_id,
    "--reason",
    "plan graph 已生成并通过校验"
  ]).stdout);
  assert.equal(completed.nodes.find((node) => node.id === "plan_graph").status, "passed");
});

test("plan graph 会按 intake 类型、标题和 affected area 生成任务相关范围", () => {
  const project = tempProject();
  seedProjectFiles(project);
  writeProjectFile(project, "src/session.mjs", "export function restore() {}\n");
  writeProjectFile(project, "tests/session.test.mjs", "import test from 'node:test';\n");
  run(["init", "--project", project, "--name", "Task Aware Plan"]);
  run(["knowledge", "refresh", "--project", project]);
  const intake = JSON.parse(run([
    "intake",
    "add",
    "--project",
    project,
    "--type",
    "bug",
    "--title",
    "修复 session 恢复丢失状态",
    "--description",
    "恢复后必须保留最后一个 gate 和 evidence refs。",
    "--area",
    "src/session.mjs,tests/session.test.mjs"
  ]).stdout);
  run(["intake", "triage", "--project", project, "--id", intake.id, "--decision", "accepted"]);
  const roadmap = JSON.parse(run(["roadmap", "promote", "--project", project, "--intake-id", intake.id]).stdout);
  const deliveryRun = JSON.parse(run(["run", "create", "--project", project, "--roadmap-id", roadmap.id]).stdout);
  passNode(project, deliveryRun.run_id, "mandate");
  passNode(project, deliveryRun.run_id, "context");

  const generated = JSON.parse(run(["run", "plan", "generate", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(generated.plan.source_intake_id, intake.id);
  assert.equal(generated.plan.source_intake_type, "bug");
  assert.equal(generated.plan.source_title, "修复 session 恢复丢失状态");
  assert.match(generated.plan.strategy, /先复现失败/);
  assert.ok(generated.plan.planning_basis.some((ref) => ref.includes(intake.id)));
  const implementation = generated.plan.nodes.find((node) => node.id === "delivery-implementation");
  const tests = generated.plan.nodes.find((node) => node.id === "delivery-tests");
  assert.deepEqual(implementation.write_scope, ["src/session.mjs"]);
  assert.deepEqual(tests.write_scope, ["tests/session.test.mjs"]);
  assert.equal(implementation.adapter, "codex");
  assert.equal(implementation.output_contract, "patch");
  assert.equal(tests.adapter, "codex");
  assert.ok(generated.plan.nodes.every((node) => node.objective.includes("修复 session 恢复丢失状态")));
  assert.ok(generated.plan.nodes.every((node) => !node.title.includes("Project Kernel")));
});

test("worker 只能按 plan node 的 write_scope 提交 patch bundle", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);

  const worker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-implementation"
  ]).stdout);
  assert.match(worker.worker_id, /^worker-/);
  assert.equal(worker.plan_node_id, "delivery-implementation");
  assert.ok(worker.write_scope.includes("src/"));

  const rejected = run([
    "worker",
    "submit-patch",
    "--project",
    project,
    "--worker-id",
    worker.worker_id,
    "--summary",
    "越界修改",
    "--files",
    "README.md"
  ], {
    expectFailure: true
  });
  assert.match(rejected.stderr, /超出 worker write_scope/);

  const submitted = JSON.parse(run([
    "worker",
    "submit-patch",
    "--project",
    project,
    "--worker-id",
    worker.worker_id,
    "--summary",
    "实现 worker isolation",
    "--files",
    "src/apex-v2.mjs,schemas/delivery-run.schema.json"
  ]).stdout);
  assert.match(submitted.patch.patch_id, /^patch-/);
  assert.match(submitted.artifact_id, /^artifact-/);

  const root = join(project, ".apex-v2");
  assert.ok(existsSync(join(root, "runs", deliveryRun.run_id, "workers", worker.worker_id, "worker.json")));
  assert.ok(existsSync(join(root, "runs", deliveryRun.run_id, "workers", worker.worker_id, "patch-bundle.json")));
});

test("execution policy 阻止超出 changed-files 预算的 patch", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const policyPath = join(project, ".apex-v2", "policies", "execution.json");
  const policy = readJson(policyPath);
  policy.budgets.max_changed_files_per_patch = 1;
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation"
  ]).stdout);
  const rejected = run([
    "worker", "submit-patch", "--project", project, "--worker-id", worker.worker_id,
    "--summary", "too many files", "--files", "src/apex-v2.mjs,schemas/delivery-run.schema.json"
  ], { expectFailure: true });
  assert.match(rejected.stderr, /patch 超出文件预算：2\/1/);
  assert.equal(existsSync(join(project, ".apex-v2", "runs", deliveryRun.run_id, "workers", worker.worker_id, "patch-bundle.json")), false);
});

test("worker sandbox init 创建 scratch sandbox 并记录 scope manifest", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-implementation"
  ]).stdout);

  const initialized = JSON.parse(run(["worker", "sandbox", "init", "--project", project, "--worker-id", worker.worker_id]).stdout);
  assert.equal(initialized.worker.sandbox.type, "scratch");
  assert.equal(initialized.worker.sandbox.status, "ready");

  const root = join(project, ".apex-v2");
  const sandboxPath = join(root, "runs", deliveryRun.run_id, "workers", worker.worker_id, "sandbox");
  assert.ok(existsSync(join(sandboxPath, "sandbox.json")));
  assert.ok(existsSync(join(sandboxPath, ".apex-agent", "README.md")));
  assert.ok(existsSync(join(sandboxPath, ".apex-v2", "project.json")));
  assert.ok(existsSync(join(sandboxPath, ".apex-v2", "knowledge", "manifest.json")));
  const manifest = readJson(join(sandboxPath, "sandbox.json"));
  assert.deepEqual(manifest.write_scope, worker.write_scope);

  const initializedAgain = JSON.parse(run(["worker", "sandbox", "init", "--project", project, "--worker-id", worker.worker_id]).stdout);
  assert.equal(initializedAgain.worker.sandbox.status, "ready");
});

test("worker sandbox init --type worktree 在非 git 项目中显式降级为 scratch", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-implementation"
  ]).stdout);
  const initialized = JSON.parse(run([
    "worker",
    "sandbox",
    "init",
    "--project",
    project,
    "--worker-id",
    worker.worker_id,
    "--type",
    "worktree"
  ]).stdout);
  assert.equal(initialized.worker.sandbox.type, "scratch");
  assert.match(initialized.worker.sandbox.fallback_reason, /不是 git repository/);
  assert.equal(initialized.manifest.requested_type, "worktree");
  assert.equal(initialized.manifest.type, "scratch");
});

test("worker sandbox init --type worktree 在 git 项目中创建真实 worktree", { skip: !gitAvailable() }, () => {
  const project = tempProject();
  seedProjectFiles(project);
  runGit(project, ["init"]);
  runGit(project, ["config", "user.email", "apex-v2@example.test"]);
  runGit(project, ["config", "user.name", "Apex V2 Test"]);
  runGit(project, ["add", "."]);
  runGit(project, ["commit", "-m", "initial"]);

  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-implementation"
  ]).stdout);
  const initialized = JSON.parse(run([
    "worker",
    "sandbox",
    "init",
    "--project",
    project,
    "--worker-id",
    worker.worker_id,
    "--type",
    "worktree"
  ]).stdout);

  assert.equal(initialized.worker.sandbox.type, "worktree");
  assert.equal(initialized.worker.sandbox.status, "ready");
  assert.equal(initialized.worker.sandbox.fallback_reason, "");

  const sandboxAbs = join(project, initialized.worker.sandbox.path);
  assert.ok(existsSync(join(sandboxAbs, ".git")));
  assert.ok(existsSync(join(sandboxAbs, "package.json")));

  const worktreeList = runGit(project, ["worktree", "list"]);
  assert.match(worktreeList.stdout, new RegExp(initialized.worker.worker_id));
});

test("worker sandbox write/promote 生成 patch bundle 并通过 merge apply 写入目标文件", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-implementation"
  ]).stdout);

  const notReady = run([
    "worker",
    "sandbox",
    "write",
    "--project",
    project,
    "--worker-id",
    worker.worker_id,
    "--path",
    "draft.txt",
    "--content",
    "draft"
  ], { expectFailure: true });
  assert.match(notReady.stderr, /sandbox 尚未 ready/);

  run(["worker", "sandbox", "init", "--project", project, "--worker-id", worker.worker_id]);
  run([
    "worker",
    "sandbox",
    "write",
    "--project",
    project,
    "--worker-id",
    worker.worker_id,
    "--path",
    "drafts/new-cli.txt",
    "--content",
    "console.log('from sandbox');\n"
  ]);

  const promoted = JSON.parse(run([
    "worker",
    "promote-sandbox",
    "--project",
    project,
    "--worker-id",
    worker.worker_id,
    "--sandbox-path",
    "drafts/new-cli.txt",
    "--target-file",
    "src/apex-v2.mjs",
    "--summary",
    "promote sandbox draft"
  ]).stdout);
  assert.match(promoted.patch.patch_id, /^patch-/);
  assert.equal(promoted.patch.operations[0].op, "write_text");

  run(["merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id, "--patch-id", promoted.patch.patch_id]);
  passNodeWithEvidence(project, deliveryRun.run_id, "execute", promoted.artifact_id);
  const verified = JSON.parse(run(["verify", "run", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "verify", verified.artifact_id);
  const review = JSON.parse(run(["review", "generate", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "review", review.artifact_id);
  const applied = JSON.parse(run(["merge", "apply", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(applied.report.status, "MERGED");
  assert.equal(readFileSync(join(project, "src", "apex-v2.mjs"), "utf8"), "console.log('from sandbox');\n");
});

test("worker promote-sandbox 拒绝越界目标文件", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-implementation"
  ]).stdout);
  run(["worker", "sandbox", "init", "--project", project, "--worker-id", worker.worker_id]);
  run(["worker", "sandbox", "write", "--project", project, "--worker-id", worker.worker_id, "--path", "draft.txt", "--content", "draft"]);
  const rejected = run([
    "worker",
    "promote-sandbox",
    "--project",
    project,
    "--worker-id",
    worker.worker_id,
    "--sandbox-path",
    "draft.txt",
    "--target-file",
    "README.md",
    "--summary",
    "bad target"
  ], { expectFailure: true });
  assert.match(rejected.stderr, /超出 worker write_scope/);
});

test("worker shell/human adapters 产出可追踪 artifact，shell 失败会阻塞 worker", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);

  const worker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-context"
  ]).stdout);

  const shell = JSON.parse(run([
    "worker",
    "exec-shell",
    "--project",
    project,
    "--worker-id",
    worker.worker_id,
    "--cmd",
    "node --version"
  ]).stdout);
  assert.equal(shell.result.adapter, "shell");
  assert.equal(shell.result.status, "PASS");
  assert.match(shell.artifact_id, /^artifact-/);

  const decision = JSON.parse(run([
    "worker",
    "decide",
    "--project",
    project,
    "--worker-id",
    worker.worker_id,
    "--decision",
    "继续使用无外部依赖 CLI 内核",
    "--summary",
    "该 worker 当前只记录决策，不提交 patch。"
  ]).stdout);
  assert.equal(decision.result.adapter, "human");
  assert.equal(decision.result.status, "DECISION");
  assert.match(decision.artifact_id, /^artifact-/);

  const failedWorker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-implementation"
  ]).stdout);
  const failed = JSON.parse(run([
    "worker",
    "exec-shell",
    "--project",
    project,
    "--worker-id",
    failedWorker.worker_id,
    "--cmd",
    "node -e \"process.exit(7)\""
  ]).stdout);
  assert.equal(failed.result.status, "FAIL");

  const workers = JSON.parse(run(["worker", "list", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(workers.find((item) => item.worker_id === failedWorker.worker_id).status, "blocked");
});

test("adapter registry 检测多 CLI 并按显式 fallback order 解析", () => {
  const adapters = inspectAgentAdapters();
  assert.ok(adapters.some((item) => item.adapter === "codex"));
  assert.ok(adapters.some((item) => item.adapter === "claude"));
  assert.ok(adapters.some((item) => item.adapter === "gemini"));
  assert.ok(adapters.find((item) => item.adapter === "claude").capabilities.includes("session_resume"));
  assert.ok(adapters.find((item) => item.adapter === "codex").capabilities.includes("structured_output"));
  const resolved = resolveAgentAdapter("unavailable", ["claude", "gemini"], ["claude", "gemini"]);
  assert.equal(resolved.name, "claude");
  assert.equal(resolved.fallback, true);
  assert.equal(resolved.info.available, true);
});

test("adapter capability 基线发生变化时必须审批后才能重录", () => {
  const project = tempProject();
  run(["init", "--project", project]);
  run(["worker", "adapters", "--project", project, "--record"]);
  const baselinePath = join(project, ".apex-v2", "adapters", "capabilities.json");
  const baseline = readJson(baselinePath);
  baseline.adapters.find((item) => item.adapter === "codex").capabilities.push("removed-capability-probe");
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);

  const blocked = run(["worker", "adapters", "--project", project, "--record"], { expectFailure: true });
  assert.match(blocked.stderr, /adapter baseline approval required/);
  const approval = JSON.parse(run(["approval", "list", "--project", project]).stdout)
    .find((item) => item.kind === "adapter_baseline");
  assert.equal(approval.status, "pending");
  run(["approval", "decide", "--project", project, "--id", approval.id, "--decision", "approved", "--reason", "accept new capability baseline"]);
  run(["worker", "adapters", "--project", project, "--record"]);
  const diff = JSON.parse(run(["worker", "adapters", "--project", project, "--diff"]).stdout);
  assert.equal(diff.status, "PASS");
  assert.equal(diff.changes.length, 0);
});

test("adapter smoke FAIL report 阻止新 run", () => {
  const project = tempProject();
  run(["init", "--project", project]);
  run(["worker", "adapters", "--project", project, "--smoke", "--record"]);
  const smokePath = join(project, ".apex-v2", "adapters", "latest-live-smoke.json");
  const smoke = readJson(join(project, ".apex-v2", "adapters", "latest-static-smoke.json"));
  smoke.status = "FAIL";
  smoke.results[0].status = "FAIL";
  smoke.results[0].errors = ["probe failure"];
  writeFileSync(smokePath, `${JSON.stringify(smoke, null, 2)}\n`);
  const intake = JSON.parse(run(["intake", "add", "--project", project, "--title", "blocked by smoke"]).stdout);
  run(["intake", "triage", "--project", project, "--id", intake.id, "--decision", "accepted"]);
  const blocked = run(["project", "tick", "--project", project], { expectFailure: true });
  assert.match(blocked.stderr, /adapter smoke gate 阻止创建新 run：codex/);
});

test("adapter smoke 风险在 FAIL 时 open、PASS 后 mitigated", () => {
  const project = tempProject();
  run(["init", "--project", project]);
  const root = join(project, ".apex-v2");
  syncAdapterSmokeRisk(root, { mode: "live", status: "FAIL", results: [{ adapter: "codex", status: "FAIL", errors: ["probe"] }] });
  assert.equal(JSON.parse(run(["risk", "list", "--project", project, "--status", "open"]).stdout).length, 1);
  syncAdapterSmokeRisk(root, { mode: "static", status: "PASS", results: [] });
  assert.equal(JSON.parse(run(["risk", "list", "--project", project, "--status", "open"]).stdout).length, 1);
  syncAdapterSmokeRisk(root, { mode: "live", status: "PASS", results: [] });
  assert.equal(JSON.parse(run(["risk", "list", "--project", project, "--status", "mitigated"]).stdout).length, 1);
  syncAdapterSmokeRisk(root, { mode: "live", status: "FAIL", results: [{ adapter: "codex", status: "FAIL", errors: ["regression"] }] });
  assert.equal(JSON.parse(run(["risk", "list", "--project", project, "--status", "open"]).stdout).length, 1);
});

test("过期 adapter smoke 阻止新 run，刷新 smoke 后恢复调度", () => {
  const project = tempProject();
  run(["init", "--project", project]);
  run(["project", "quality", "set", "--project", project, "--adapter-smoke-auto-refresh", "false"]);
  run(["worker", "adapters", "--project", project, "--smoke", "--record"]);
  const smokePath = join(project, ".apex-v2", "adapters", "latest-live-smoke.json");
  const smoke = readJson(join(project, ".apex-v2", "adapters", "latest-static-smoke.json"));
  smoke.generated_at = "2000-01-01T00:00:00.000Z";
  writeFileSync(smokePath, `${JSON.stringify(smoke, null, 2)}\n`);
  const intake = JSON.parse(run(["intake", "add", "--project", project, "--title", "blocked by stale smoke"]).stdout);
  run(["intake", "triage", "--project", project, "--id", intake.id, "--decision", "accepted"]);
  const blocked = run(["project", "tick", "--project", project], { expectFailure: true });
  assert.match(blocked.stderr, /latest smoke 已过期/);
  run(["worker", "adapters", "--project", project, "--smoke", "--record"]);
  writeFileSync(smokePath, `${JSON.stringify(readJson(join(project, ".apex-v2", "adapters", "latest-static-smoke.json")), null, 2)}\n`);
  const tick = JSON.parse(run(["project", "tick", "--project", project]).stdout);
  assert.equal(tick.created_runs.length, 1);
});

test("project tick 在待调度任务遇到过期 live smoke 时自动刷新并继续创建 run", () => {
  const project = tempProject();
  const env = createFakeAdapterSuite(project);
  run(["init", "--project", project]);
  run(["worker", "adapters", "--project", project, "--smoke", "--record"], { env });
  const root = join(project, ".apex-v2");
  const stale = readJson(join(root, "adapters", "latest-static-smoke.json"));
  stale.mode = "live";
  stale.generated_at = "2000-01-01T00:00:00.000Z";
  writeFileSync(join(root, "adapters", "latest-live-smoke.json"), `${JSON.stringify(stale, null, 2)}\n`);
  const intake = JSON.parse(run(["intake", "add", "--project", project, "--title", "auto refresh smoke"]).stdout);
  run(["intake", "triage", "--project", project, "--id", intake.id, "--decision", "accepted"]);

  const tick = JSON.parse(run(["project", "tick", "--project", project], { env }).stdout);
  assert.equal(tick.adapter_smoke_refresh.attempted, true);
  assert.equal(tick.adapter_smoke_refresh.status, "PASS");
  assert.equal(tick.created_runs.length, 1);
  const latest = readJson(join(root, "adapters", "latest-live-smoke.json"));
  assert.equal(latest.mode, "live");
  assert.equal(latest.status, "PASS");
  assert.notEqual(latest.generated_at, "2000-01-01T00:00:00.000Z");
});

test("live adapter smoke 失败按通知策略进入去重 outbox", () => {
  const project = tempProject();
  const env = createFakeAdapterSuite(project, { failAdapter: "codex" });
  run(["init", "--project", project]);
  run(["worker", "adapters", "--project", project, "--smoke", "--live", "--record"], { env, expectFailure: true });
  run(["worker", "adapters", "--project", project, "--smoke", "--live", "--record"], { env, expectFailure: true });

  const notifications = JSON.parse(run(["notification", "list", "--project", project]).stdout);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].event_type, "adapter.smoke.failed");
  assert.equal(notifications[0].severity, "critical");
  assert.equal(notifications[0].status, "queued");
  assert.match(notifications[0].body, /codex/);
  const acknowledged = JSON.parse(run([
    "notification",
    "acknowledge",
    "--project",
    project,
    "--id",
    notifications[0].id,
    "--reason",
    "failure reviewed"
  ]).stdout);
  assert.equal(acknowledged.status, "acknowledged");
  assert.equal(acknowledged.acknowledgement_reason, "failure reviewed");
});

test("adapter capability/version 观测形成 append-only 趋势历史", () => {
  const project = tempProject();
  run(["init", "--project", project]);
  run(["worker", "adapters", "--project", project, "--smoke", "--live", "--record"], {
    env: createFakeAdapterSuite(project, { version: "1.0.0" })
  });
  run(["worker", "adapters", "--project", project, "--smoke", "--live", "--record"], {
    env: createFakeAdapterSuite(project, { version: "2.0.0" })
  });

  const trend = JSON.parse(run(["worker", "adapters", "--project", project, "--history"]).stdout);
  assert.equal(trend.snapshot_count, 2);
  const codex = trend.adapters.find((item) => item.adapter === "codex");
  assert.equal(codex.observations, 2);
  assert.equal(codex.version_changes.length, 1);
  assert.deepEqual(codex.version_changes[0], {
    from: "codex 1.0.0",
    to: "codex 2.0.0",
    observed_at: codex.version_changes[0].observed_at
  });
});

test("Claude/Gemini adapters 解析 structured output、session id 和 resume 参数", () => {
  const project = tempProject();
  const schema = join(project, "schema.json");
  writeFileSync(schema, JSON.stringify({
    type: "object",
    properties: { verdict: { type: "string" }, summary: { type: "string" }, tests: { type: "array" }, risks: { type: "array" }, evidence_refs: { type: "array" } },
    required: ["verdict", "summary", "tests", "risks", "evidence_refs"],
    additionalProperties: false
  }));
  const claudeFake = join(project, "fake-claude.mjs");
  writeFileSync(claudeFake, `#!/usr/bin/env node\nconsole.log(JSON.stringify({session_id:"claude-session",structured_output:{verdict:"pass",summary:"ok",tests:[],risks:[],evidence_refs:[]}}));\n`);
  chmodSync(claudeFake, 0o755);
  const claudeOutput = join(project, "claude-result.json");
  const claude = executeClaudeAdapter({ executable: claudeFake, workspaceDir: project, prompt: "resume", outputSchemaPath: schema, outputPath: claudeOutput, sessionId: "old-claude", timeoutMs: 10000 });
  assert.equal(claude.exit_code, 0);
  assert.equal(claude.session_id, "claude-session");
  assert.ok(claude.args.includes("--resume"));
  assert.equal(readJson(claudeOutput).verdict, "pass");

  const geminiFake = join(project, "fake-gemini.mjs");
  writeFileSync(geminiFake, `#!/usr/bin/env node\nconsole.log(JSON.stringify({session_id:"gemini-session",response:JSON.stringify({verdict:"pass",summary:"ok",tests:[],risks:[],evidence_refs:[]})}));\n`);
  chmodSync(geminiFake, 0o755);
  const geminiOutput = join(project, "gemini-result.json");
  const gemini = executeGeminiAdapter({ executable: geminiFake, workspaceDir: project, prompt: "resume", outputPath: geminiOutput, sessionId: "old-gemini", timeoutMs: 10000 });
  assert.equal(gemini.exit_code, 0);
  assert.equal(gemini.session_id, "gemini-session");
  assert.ok(gemini.args.includes("--resume"));
  assert.equal(readJson(geminiOutput).verdict, "pass");
});

test("worker exec-agent 在 scratch 副本执行 Codex 并自动生成 patch bundle", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const fakeCodex = createFakeCodex(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation"
  ]).stdout);
  const initialized = JSON.parse(run([
    "worker", "sandbox", "init", "--project", project, "--worker-id", worker.worker_id,
    "--type", "scratch"
  ]).stdout);
  const sandbox = join(project, initialized.worker.sandbox.path);
  assert.ok(existsSync(join(sandbox, "package.json")));
  assert.equal(readFileSync(join(sandbox, "src", "apex-v2.mjs"), "utf8"), "console.log('cli');\n");

  const executed = JSON.parse(run([
    "worker", "exec-agent", "--project", project, "--worker-id", worker.worker_id,
    "--adapter", "codex", "--command", fakeCodex, "--timeout-ms", "10000"
  ]).stdout);
  assert.equal(executed.result.status, "PASS");
  assert.equal(executed.result.adapter, "codex");
  assert.equal(executed.patch.changed_files.length, 1);
  assert.equal(executed.patch.changed_files[0], "src/apex-v2.mjs");
  assert.equal(executed.patch.operations[0].op, "replace_text");
  assert.equal(readFileSync(join(project, "src", "apex-v2.mjs"), "utf8"), "console.log('cli');\n");

  const root = join(project, ".apex-v2");
  const workerState = readJson(join(root, "runs", deliveryRun.run_id, "workers", worker.worker_id, "worker.json"));
  assert.equal(workerState.status, "patch_submitted");
  assert.equal(workerState.last_adapter, "codex");
  assert.ok(existsSync(join(root, "runs", deliveryRun.run_id, "workers", worker.worker_id, "agent-prompt.md")));
  assert.ok(existsSync(join(root, "runs", deliveryRun.run_id, "workers", worker.worker_id, "agent-result.json")));
});

test("project tick --run-agents 自动初始化 sandbox、运行 Codex 并把 patch 加入 merge queue", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const fakeCodex = createFakeCodex(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation"
  ]).stdout);

  const tick = JSON.parse(run([
    "project", "tick", "--project", project, "--run-agents",
    "--agent-limit", "1", "--agent-sandbox", "scratch",
    "--agent-command", fakeCodex, "--agent-timeout-ms", "10000"
  ]).stdout);
  assert.equal(tick.agent_runs.length, 1);
  assert.equal(tick.agent_runs[0].status, "PASS");
  assert.equal(tick.agent_runs[0].queue_status, "queued");
  assert.match(tick.agent_runs[0].patch_id, /^patch-/);

  const root = join(project, ".apex-v2");
  const queue = readJson(join(root, "runs", deliveryRun.run_id, "merge-queue.json"));
  assert.equal(queue.items.length, 1);
  assert.equal(queue.items[0].status, "queued");
  const workerState = readJson(join(root, "runs", deliveryRun.run_id, "workers", worker.worker_id, "worker.json"));
  assert.equal(workerState.status, "queued");
  assert.equal(readFileSync(join(project, "src", "apex-v2.mjs"), "utf8"), "console.log('cli');\n");
});

test("worker exec-agent 检测并阻断 Codex 越界写入", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const originalProjectState = readJson(join(project, ".apex-v2", "project.json"));
  const fakeCodex = createFakeCodex(project, {
    target: ".apex-v2/project.json",
    content: "{}\n"
  });
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation"
  ]).stdout);
  run(["worker", "sandbox", "init", "--project", project, "--worker-id", worker.worker_id, "--type", "scratch"]);

  const executed = JSON.parse(run([
    "worker", "exec-agent", "--project", project, "--worker-id", worker.worker_id,
    "--adapter", "codex", "--command", fakeCodex, "--timeout-ms", "10000"
  ]).stdout);
  assert.equal(executed.result.status, "FAIL");
  assert.equal(executed.patch, null);
  assert.deepEqual(executed.result.out_of_scope_files, [".apex-v2/project.json"]);
  const workerState = readJson(join(project, ".apex-v2", "runs", deliveryRun.run_id, "workers", worker.worker_id, "worker.json"));
  assert.equal(workerState.status, "blocked");
  const currentProjectState = readJson(join(project, ".apex-v2", "project.json"));
  assert.equal(currentProjectState.project_id, originalProjectState.project_id);
  assert.equal(currentProjectState.project_name, originalProjectState.project_name);

  const retryRejected = run([
    "worker", "retry", "--project", project, "--worker-id", worker.worker_id
  ], { expectFailure: true });
  assert.match(retryRejected.stderr, /不允许 retry：scope_violation/);
  assert.equal(existsSync(join(project, workerState.sandbox.path)), true);
});

test("worker fallback 在 retryable adapter failure 后切换到下一个可用 runtime", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const failingCodex = createFakeCodex(project, { fail: true });
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation"
  ]).stdout);
  run(["worker", "sandbox", "init", "--project", project, "--worker-id", worker.worker_id, "--type", "scratch"]);
  const failed = JSON.parse(run([
    "worker", "exec-agent", "--project", project, "--worker-id", worker.worker_id,
    "--adapter", "codex", "--command", failingCodex, "--timeout-ms", "10000"
  ]).stdout);
  assert.equal(failed.result.status, "FAIL");
  assert.equal(failed.result.failure_kind, "execution_error");

  const fallback = JSON.parse(run([
    "worker", "fallback", "--project", project, "--worker-id", worker.worker_id
  ]).stdout);
  assert.equal(fallback.from, "codex");
  assert.equal(fallback.to, "claude");
  assert.equal(fallback.worker.status, "active");
  assert.equal(fallback.worker.adapter, "claude");
  assert.equal(fallback.worker.sandbox.status, "missing");
  run(["worker", "exec-shell", "--project", project, "--worker-id", worker.worker_id, "--cmd", "node --version"]);
  const summary = JSON.parse(run([
    "worker", "results", "--project", project, "--worker-id", worker.worker_id, "--record"
  ]).stdout);
  assert.equal(summary.verdict, "pass");
  assert.deepEqual(summary.adapters, ["codex", "shell"]);
  assert.equal(summary.attempts.length, 2);
  assert.deepEqual(summary.failures, ["execution_error"]);
  assert.ok(existsSync(join(project, ".apex-v2", "runs", deliveryRun.run_id, "workers", worker.worker_id, "worker-summary.json")));
});

test("worker retry 遵守 adapter 最大尝试次数并重置 sandbox", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-context"
  ]).stdout);
  run(["worker", "sandbox", "init", "--project", project, "--worker-id", worker.worker_id]);
  run([
    "worker", "exec-shell", "--project", project, "--worker-id", worker.worker_id,
    "--cmd", "node -e \"process.exit(7)\""
  ]);

  const retried = JSON.parse(run([
    "worker", "retry", "--project", project, "--worker-id", worker.worker_id
  ]).stdout);
  assert.equal(retried.worker.status, "active");
  assert.equal(retried.worker.sandbox.status, "missing");
  assert.equal(retried.policy.attempt, 1);
  assert.equal(retried.policy.max_attempts, 2);

  run([
    "worker", "exec-shell", "--project", project, "--worker-id", worker.worker_id,
    "--cmd", "node -e \"process.exit(8)\""
  ]);
  const exhausted = run([
    "worker", "retry", "--project", project, "--worker-id", worker.worker_id
  ], { expectFailure: true });
  assert.match(exhausted.stderr, /最大尝试次数：2\/2/);
});

test("project tick --retry-workers 自动恢复可重试 shell worker", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-context"
  ]).stdout);
  run([
    "worker", "exec-shell", "--project", project, "--worker-id", worker.worker_id,
    "--cmd", "node -e \"process.exit(9)\""
  ]);

  const tick = JSON.parse(run([
    "project", "tick", "--project", project,
    "--retry-workers", "--retry-limit", "1",
    "--run-workers", "--worker-limit", "1"
  ]).stdout);
  assert.equal(tick.retried_workers.length, 1);
  assert.equal(tick.retried_workers[0].status, "RETRY_READY");
  assert.equal(tick.worker_runs.length, 1);
  assert.equal(tick.worker_runs[0].status, "PASS");
  const workerState = readJson(join(project, ".apex-v2", "runs", deliveryRun.run_id, "workers", worker.worker_id, "worker.json"));
  assert.equal(workerState.status, "evidence_submitted");
  assert.equal(workerState.attempt, 2);
});

test("merge queue 接收无冲突并行 patch，并在同文件 patch 时生成冲突报告", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);

  const workerA = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-implementation"
  ]).stdout);
  const patchA = JSON.parse(run([
    "worker",
    "submit-patch",
    "--project",
    project,
    "--worker-id",
    workerA.worker_id,
    "--summary",
    "worker isolation patch",
    "--files",
    "src/apex-v2.mjs"
  ]).stdout).patch;

  const workerB = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-tests"
  ]).stdout);
  const patchB = JSON.parse(run([
    "worker",
    "submit-patch",
    "--project",
    project,
    "--worker-id",
    workerB.worker_id,
    "--summary",
    "verification fabric patch",
    "--files",
    "tests/apex-v2.test.mjs"
  ]).stdout).patch;

  const queueA = JSON.parse(run(["merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id, "--patch-id", patchA.patch_id]).stdout);
  assert.equal(queueA.conflicts.length, 0);
  const queueB = JSON.parse(run(["merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id, "--patch-id", patchB.patch_id]).stdout);
  assert.equal(queueB.conflicts.length, 0);
  assert.ok(queueB.items.every((item) => item.status === "queued"));

  const workerC = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-review"
  ]).stdout);
  const patchC = JSON.parse(run([
    "worker",
    "submit-patch",
    "--project",
    project,
    "--worker-id",
    workerC.worker_id,
    "--summary",
    "conflicting patch",
    "--files",
    "src/apex-v2.mjs"
  ]).stdout).patch;

  const conflictQueue = JSON.parse(run(["merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id, "--patch-id", patchC.patch_id]).stdout);
  assert.equal(conflictQueue.conflicts.length, 1);
  assert.equal(conflictQueue.conflicts[0].file, "src/apex-v2.mjs");
  assert.ok(conflictQueue.items.filter((item) => item.status === "blocked_conflict").length >= 2);

  const workers = JSON.parse(run(["worker", "list", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  const blockedWorkers = workers.filter((worker) => worker.status === "blocked");
  assert.ok(blockedWorkers.length >= 2);
});

test("verify run 运行验证命令并产出 verification artifact", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithQueuedPatches(project);

  const verified = JSON.parse(run(["verify", "run", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(verified.report.status, "PASS");
  assert.ok(verified.report.checks.length >= 4);
  assert.equal(verified.report.workspace.mode, "staged-copy");
  assert.equal(verified.report.workspace.unmaterialized_patch_ids.length, 0);
  assert.ok(verified.report.workspace.applied_files.includes("src/apex-v2.mjs"));
  assert.equal(readFileSync(join(project, "src", "apex-v2.mjs"), "utf8"), "console.log('cli');\n");
  assert.match(verified.artifact_id, /^artifact-/);

  const root = join(project, ".apex-v2");
  assert.ok(existsSync(join(root, "runs", deliveryRun.run_id, "verification-report.json")));
  passNodeWithEvidence(project, deliveryRun.run_id, "verify", verified.artifact_id);
  const runState = readJson(join(root, "runs", deliveryRun.run_id, "run.json"));
  assert.equal(runState.nodes.find((node) => node.id === "verify").status, "passed");
});

test("verify run 在 staged workspace 捕获候选 patch 语法错误且不污染项目根目录", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation"
  ]).stdout);
  const patch = JSON.parse(run([
    "worker", "submit-patch", "--project", project, "--worker-id", worker.worker_id,
    "--summary", "introduce staged syntax error", "--files", "src/apex-v2.mjs",
    "--write-text-file", "src/apex-v2.mjs", "--write-text", "console.log(\n"
  ]).stdout);
  run(["merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id, "--patch-id", patch.patch.patch_id]);
  passNodeWithEvidence(project, deliveryRun.run_id, "execute", patch.artifact_id);

  const verified = JSON.parse(run(["verify", "run", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(verified.report.status, "FAIL");
  assert.equal(verified.report.workspace.mode, "staged-copy");
  assert.ok(verified.report.workspace.applied_files.includes("src/apex-v2.mjs"));
  assert.ok(verified.report.checks.some((check) => check.status === "FAIL"));
  assert.equal(readFileSync(join(project, "src", "apex-v2.mjs"), "utf8"), "console.log('cli');\n");
  const risks = JSON.parse(run(["risk", "list", "--project", project, "--status", "open"]).stdout);
  assert.ok(risks.some((risk) => risk.source === "verification" && risk.run_id === deliveryRun.run_id));
});

test("verify run 拒绝 changed_files 没有完整 operations 的 patch", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation"
  ]).stdout);
  const patch = JSON.parse(run([
    "worker", "submit-patch", "--project", project, "--worker-id", worker.worker_id,
    "--summary", "metadata-only patch", "--files", "src/apex-v2.mjs"
  ]).stdout);
  run(["merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id, "--patch-id", patch.patch.patch_id]);
  passNodeWithEvidence(project, deliveryRun.run_id, "execute", patch.artifact_id);

  const verified = JSON.parse(run(["verify", "run", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(verified.report.status, "FAIL");
  assert.deepEqual(verified.report.workspace.unmaterialized_patch_ids, [patch.patch.patch_id]);
  assert.equal(verified.report.checks.find((check) => check.id === "patch-materialization").status, "FAIL");
});

test("review generate 在验证未通过或 merge queue 冲突时阻断，在条件满足时 PASS", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithQueuedPatches(project);

  const earlyReview = JSON.parse(run(["review", "generate", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(earlyReview.report.status, "BLOCKED");
  assert.ok(earlyReview.report.blocking_findings.some((finding) => finding.includes("verify")));
  assert.ok(JSON.parse(run(["risk", "list", "--project", project, "--status", "open"]).stdout).some((risk) => risk.source === "review"));

  const verified = JSON.parse(run(["verify", "run", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "verify", verified.artifact_id);
  const review = JSON.parse(run(["review", "generate", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(review.report.status, "PASS");
  assert.equal(review.report.blocking_findings.length, 0);
  assert.ok(JSON.parse(run(["risk", "list", "--project", project, "--status", "mitigated"]).stdout).some((risk) => risk.source === "review"));
  passNodeWithEvidence(project, deliveryRun.run_id, "review", review.artifact_id);
});

test("merge apply 必须等待 review PASS，成功后标记 patch 和 worker 为 merged", () => {
  const project = tempProject();
  const { deliveryRun, patchA, patchB } = createRunWithQueuedPatches(project);

  const tooEarly = run(["merge", "apply", "--project", project, "--run-id", deliveryRun.run_id], {
    expectFailure: true
  });
  assert.match(tooEarly.stderr, /必须先 PASS review/);

  const verified = JSON.parse(run(["verify", "run", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "verify", verified.artifact_id);
  const review = JSON.parse(run(["review", "generate", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "review", review.artifact_id);

  const applied = JSON.parse(run(["merge", "apply", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(applied.report.status, "MERGED");
  assert.deepEqual(applied.report.merged_patches.sort(), [patchA.patch.patch_id, patchB.patch.patch_id].sort());
  assert.match(applied.artifact_id, /^artifact-/);

  const root = join(project, ".apex-v2");
  const queue = readJson(join(root, "runs", deliveryRun.run_id, "merge-queue.json"));
  assert.ok(queue.items.every((item) => item.status === "merged"));
  const queueAfterStatus = JSON.parse(run(["merge", "status", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.ok(queueAfterStatus.items.every((item) => item.status === "merged"));

  const workers = JSON.parse(run(["worker", "list", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.ok(workers.every((worker) => worker.status === "merged"));

  passNodeWithEvidence(project, deliveryRun.run_id, "integrate", applied.artifact_id);
});

test("critical merge 必须通过内容指纹 approval 后才能 apply", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithQueuedPatches(project);
  const root = join(project, ".apex-v2");
  const roadmapPath = join(root, "roadmap", "graph.json");
  const roadmap = readJson(roadmapPath);
  roadmap.nodes.find((node) => node.id === deliveryRun.roadmap_node_id).risk = "critical";
  writeFileSync(roadmapPath, `${JSON.stringify(roadmap, null, 2)}\n`);
  const verified = JSON.parse(run(["verify", "run", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "verify", verified.artifact_id);
  const review = JSON.parse(run(["review", "generate", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "review", review.artifact_id);

  const blocked = run(["merge", "apply", "--project", project, "--run-id", deliveryRun.run_id], { expectFailure: true });
  assert.match(blocked.stderr, /merge approval required/);
  const approvals = JSON.parse(run(["approval", "list", "--project", project]).stdout);
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].status, "pending");
  assert.ok(approvals[0].reasons.includes("risk=critical"));

  const approved = JSON.parse(run([
    "approval", "decide", "--project", project, "--id", approvals[0].id,
    "--decision", "approved", "--reason", "测试批准 critical merge"
  ]).stdout);
  assert.equal(approved.decision, "approved");
  const applied = JSON.parse(run(["merge", "apply", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(applied.report.status, "MERGED");
});

test("merge apply 会应用 write_text patch operation 并记录 applied_files", () => {
  const project = tempProject();
  seedProjectFiles(project);
  const { deliveryRun } = createRunWithPlanGraph(project);

  const worker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-implementation"
  ]).stdout);
  const patch = JSON.parse(run([
    "worker",
    "submit-patch",
    "--project",
    project,
    "--worker-id",
    worker.worker_id,
    "--summary",
    "write real file",
    "--files",
    "src/apex-v2.mjs",
    "--write-text-file",
    "src/apex-v2.mjs",
    "--write-text",
    "console.log('patched');\n"
  ]).stdout);
  run(["merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id, "--patch-id", patch.patch.patch_id]);
  passNodeWithEvidence(project, deliveryRun.run_id, "execute", patch.artifact_id);
  const verified = JSON.parse(run(["verify", "run", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "verify", verified.artifact_id);
  const review = JSON.parse(run(["review", "generate", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "review", review.artifact_id);

  const applied = JSON.parse(run(["merge", "apply", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(applied.report.status, "MERGED");
  assert.deepEqual(applied.report.applied_files, ["src/apex-v2.mjs"]);
  assert.equal(readFileSync(join(project, "src", "apex-v2.mjs"), "utf8"), "console.log('patched');\n");
});

test("merge apply 支持同文件不同 replace_text 片段并行合并", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  writeProjectFile(project, "src/apex-v2.mjs", "const alpha = 1;\nconst beta = 2;\n");

  const workerA = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-implementation"
  ]).stdout);
  const patchA = JSON.parse(run([
    "worker",
    "submit-patch",
    "--project",
    project,
    "--worker-id",
    workerA.worker_id,
    "--summary",
    "replace alpha",
    "--files",
    "src/apex-v2.mjs",
    "--replace-file",
    "src/apex-v2.mjs",
    "--old-text",
    "const alpha = 1;",
    "--new-text",
    "const alpha = 10;"
  ]).stdout);

  const workerB = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-review"
  ]).stdout);
  const patchB = JSON.parse(run([
    "worker",
    "submit-patch",
    "--project",
    project,
    "--worker-id",
    workerB.worker_id,
    "--summary",
    "replace beta",
    "--files",
    "src/apex-v2.mjs",
    "--replace-file",
    "src/apex-v2.mjs",
    "--old-text",
    "const beta = 2;",
    "--new-text",
    "const beta = 20;"
  ]).stdout);

  const queueA = JSON.parse(run(["merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id, "--patch-id", patchA.patch.patch_id]).stdout);
  assert.equal(queueA.conflicts.length, 0);
  const queueB = JSON.parse(run(["merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id, "--patch-id", patchB.patch.patch_id]).stdout);
  assert.equal(queueB.conflicts.length, 0);

  passNodeWithEvidence(project, deliveryRun.run_id, "execute", `${patchA.artifact_id},${patchB.artifact_id}`);
  const verified = JSON.parse(run(["verify", "run", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "verify", verified.artifact_id);
  const review = JSON.parse(run(["review", "generate", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "review", review.artifact_id);
  const applied = JSON.parse(run(["merge", "apply", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(applied.report.status, "MERGED");
  assert.equal(readFileSync(join(project, "src", "apex-v2.mjs"), "utf8"), "const alpha = 10;\nconst beta = 20;\n");
});

test("merge queue 对同文件同 old_text 的 replace_text 生成 operation 级冲突", () => {
  const project = tempProject();
  seedProjectFiles(project);
  writeProjectFile(project, "src/apex-v2.mjs", "const alpha = 1;\n");
  const { deliveryRun } = createRunWithPlanGraph(project);
  const workerA = JSON.parse(run(["worker", "create", "--project", project, "--run-id", deliveryRun.run_id, "--plan-node-id", "delivery-implementation"]).stdout);
  const patchA = JSON.parse(run([
    "worker", "submit-patch", "--project", project, "--worker-id", workerA.worker_id,
    "--summary", "replace alpha A", "--files", "src/apex-v2.mjs",
    "--replace-file", "src/apex-v2.mjs", "--old-text", "const alpha = 1;", "--new-text", "const alpha = 10;"
  ]).stdout);
  const workerB = JSON.parse(run(["worker", "create", "--project", project, "--run-id", deliveryRun.run_id, "--plan-node-id", "delivery-review"]).stdout);
  const patchB = JSON.parse(run([
    "worker", "submit-patch", "--project", project, "--worker-id", workerB.worker_id,
    "--summary", "replace alpha B", "--files", "src/apex-v2.mjs",
    "--replace-file", "src/apex-v2.mjs", "--old-text", "const alpha = 1;", "--new-text", "const alpha = 11;"
  ]).stdout);

  run(["merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id, "--patch-id", patchA.patch.patch_id]);
  const conflictQueue = JSON.parse(run(["merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id, "--patch-id", patchB.patch.patch_id]).stdout);
  assert.equal(conflictQueue.conflicts.length, 1);
  assert.equal(conflictQueue.conflicts[0].kind, "same_text_patch");
});

test("merge resolve 可选择保留一个冲突 patch 并丢弃其他 patch 后继续合并", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  writeProjectFile(project, "src/apex-v2.mjs", "const alpha = 1;\n");
  const workerA = JSON.parse(run(["worker", "create", "--project", project, "--run-id", deliveryRun.run_id, "--plan-node-id", "delivery-implementation"]).stdout);
  const patchA = JSON.parse(run([
    "worker", "submit-patch", "--project", project, "--worker-id", workerA.worker_id,
    "--summary", "keep alpha A", "--files", "src/apex-v2.mjs",
    "--replace-file", "src/apex-v2.mjs", "--old-text", "const alpha = 1;", "--new-text", "const alpha = 10;"
  ]).stdout);
  const workerB = JSON.parse(run(["worker", "create", "--project", project, "--run-id", deliveryRun.run_id, "--plan-node-id", "delivery-review"]).stdout);
  const patchB = JSON.parse(run([
    "worker", "submit-patch", "--project", project, "--worker-id", workerB.worker_id,
    "--summary", "drop alpha B", "--files", "src/apex-v2.mjs",
    "--replace-file", "src/apex-v2.mjs", "--old-text", "const alpha = 1;", "--new-text", "const alpha = 11;"
  ]).stdout);

  run(["merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id, "--patch-id", patchA.patch.patch_id]);
  const conflictQueue = JSON.parse(run(["merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id, "--patch-id", patchB.patch.patch_id]).stdout);
  assert.equal(conflictQueue.conflicts.length, 1);

  const resolved = JSON.parse(run([
    "merge", "resolve", "--project", project, "--run-id", deliveryRun.run_id,
    "--keep-patch-id", patchA.patch.patch_id,
    "--reason", "保留 A，丢弃 B"
  ]).stdout);
  assert.equal(resolved.queue.conflicts.length, 0);
  assert.equal(resolved.resolution.kept_patch_id, patchA.patch.patch_id);
  assert.deepEqual(resolved.resolution.dropped_patch_ids, [patchB.patch.patch_id]);

  const workers = JSON.parse(run(["worker", "list", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(workers.find((worker) => worker.worker_id === workerB.worker_id).status, "dropped");

  passNodeWithEvidence(project, deliveryRun.run_id, "execute", patchA.artifact_id);
  const verified = JSON.parse(run(["verify", "run", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "verify", verified.artifact_id);
  const review = JSON.parse(run(["review", "generate", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "review", review.artifact_id);
  const applied = JSON.parse(run(["merge", "apply", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(applied.report.status, "MERGED");
  assert.deepEqual(applied.report.merged_patches, [patchA.patch.patch_id]);
  assert.equal(readFileSync(join(project, "src", "apex-v2.mjs"), "utf8"), "const alpha = 10;\n");
});

test("merge apply 拒绝 replace_text old_text 非唯一匹配", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  writeProjectFile(project, "src/apex-v2.mjs", "const alpha = 1;\nconst alpha = 1;\n");
  const worker = JSON.parse(run(["worker", "create", "--project", project, "--run-id", deliveryRun.run_id, "--plan-node-id", "delivery-implementation"]).stdout);
  const patch = JSON.parse(run([
    "worker", "submit-patch", "--project", project, "--worker-id", worker.worker_id,
    "--summary", "non unique replace", "--files", "src/apex-v2.mjs",
    "--replace-file", "src/apex-v2.mjs", "--old-text", "const alpha = 1;", "--new-text", "const alpha = 10;"
  ]).stdout);
  run(["merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id, "--patch-id", patch.patch.patch_id]);
  passNodeWithEvidence(project, deliveryRun.run_id, "execute", patch.artifact_id);
  const verified = JSON.parse(run(["verify", "run", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "verify", verified.artifact_id);
  const review = JSON.parse(run(["review", "generate", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "review", review.artifact_id);
  const failed = run(["merge", "apply", "--project", project, "--run-id", deliveryRun.run_id], { expectFailure: true });
  assert.match(failed.stderr, /唯一匹配/);
});

test("submit-patch 拒绝 operation path 不在 changed_files 或不安全路径", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-implementation"
  ]).stdout);

  const missingChangedFile = run([
    "worker",
    "submit-patch",
    "--project",
    project,
    "--worker-id",
    worker.worker_id,
    "--summary",
    "bad operation",
    "--files",
    "src/apex-v2.mjs",
    "--write-text-file",
    "tests/apex-v2.test.mjs",
    "--write-text",
    "bad"
  ], { expectFailure: true });
  assert.match(missingChangedFile.stderr, /operation path 必须包含/);

  const unsafe = run([
    "worker",
    "submit-patch",
    "--project",
    project,
    "--worker-id",
    worker.worker_id,
    "--summary",
    "unsafe path",
    "--files",
    "../outside.txt",
    "--write-text-file",
    "../outside.txt",
    "--write-text",
    "bad"
  ], { expectFailure: true });
  assert.match(unsafe.stderr, /超出 worker write_scope|不安全/);
});

test("learn propose/approve/apply 通过 governance gate 写回项目知识库并可经 refresh 保留", () => {
  const project = tempProject();
  const { deliveryRun } = createIntegratedRun(project);

  const proposed = JSON.parse(run(["learn", "propose", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(proposed.proposals.length, 3);
  assert.match(proposed.artifact_id, /^artifact-/);
  assert.ok(proposed.proposals.every((proposal) => proposal.status === "proposed"));

  const applyBeforeApproval = run(["learn", "apply", "--project", project, "--id", proposed.proposals[0].id], {
    expectFailure: true
  });
  assert.match(applyBeforeApproval.stderr, /只有 approved/);

  const approved = JSON.parse(run(["learn", "approve", "--project", project, "--id", proposed.proposals[0].id]).stdout);
  assert.equal(approved.status, "approved");

  const root = join(project, ".apex-v2");
  const beforeVersion = readJson(join(root, "project.json")).knowledge_version;
  const applied = JSON.parse(run(["learn", "apply", "--project", project, "--id", approved.id]).stdout);
  assert.equal(applied.status, "applied");

  const afterVersion = readJson(join(root, "project.json")).knowledge_version;
  assert.equal(afterVersion, beforeVersion + 1);
  const targetKnowledge = readFileSync(join(root, applied.target_file), "utf8");
  assert.match(targetKnowledge, new RegExp(`learning_id: ${applied.id}`));

  run(["knowledge", "refresh", "--project", project]);
  const afterRefresh = readFileSync(join(root, applied.target_file), "utf8");
  assert.match(afterRefresh, new RegExp(`learning_id: ${applied.id}`));

  passNodeWithEvidence(project, deliveryRun.run_id, "learn", proposed.artifact_id);
  const finalRun = readJson(join(root, "runs", deliveryRun.run_id, "run.json"));
  assert.equal(finalRun.status, "done");
});

test("project audit 生成目标覆盖审计报告", () => {
  const project = tempProject();
  seedProjectFiles(project);
  const { deliveryRun } = createIntegratedRun(project);
  const proposed = JSON.parse(run(["learn", "propose", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  for (const proposal of proposed.proposals) {
    run(["learn", "approve", "--project", project, "--id", proposal.id]);
    run(["learn", "apply", "--project", project, "--id", proposal.id]);
  }
  passNodeWithEvidence(project, deliveryRun.run_id, "learn", proposed.artifact_id);

  const audit = JSON.parse(run(["project", "audit", "--project", project, "--skip-tests"]).stdout);
  assert.match(audit.audit_id, /^audit-/);
  assert.ok(["PASS", "PARTIAL", "FAIL"].includes(audit.status));
  assert.ok(audit.checks.some((check) => check.id === "continuous-intake"));
  assert.ok(audit.checks.some((check) => check.id === "merge-conflict"));
  assert.ok(audit.checks.some((check) => check.id === "capability-discoverability"));
  assert.equal(typeof audit.summary.test_count, "number");
  assert.equal(typeof audit.summary.capability_commands, "number");

  const root = join(project, ".apex-v2");
  assert.ok(existsSync(join(root, "audits", `${audit.audit_id}.json`)));
  assert.ok(existsSync(join(root, "audits", `${audit.audit_id}.md`)));
});

test("project audit --create-intake 将审计缺口转成 intake 并幂等去重", () => {
  const project = tempProject();
  seedProjectFiles(project);
  run(["init", "--project", project, "--name", "Audit Gap Demo"]);

  const first = JSON.parse(run(["project", "audit", "--project", project, "--create-intake", "--skip-tests"]).stdout);
  assert.ok(first.report.status !== "PASS");
  assert.ok(first.created_intake.length > 0);
  assert.ok(first.created_intake.every((item) => item.source === "project-audit"));
  assert.ok(first.created_intake.every((item) => item.evidence_refs.some((ref) => ref.startsWith("audit-gap:"))));

  const second = JSON.parse(run(["project", "audit", "--project", project, "--create-intake", "--skip-tests"]).stdout);
  assert.equal(second.created_intake.length, 0);

  const intake = readJson(join(project, ".apex-v2", "intake", "items.json"));
  const gapRefs = intake.flatMap((item) => item.evidence_refs.filter((ref) => ref.startsWith("audit-gap:")));
  assert.equal(new Set(gapRefs).size, gapRefs.length);
});

test("project reconcile 检测并修复 ProjectState、Roadmap 和 knowledge 漂移", () => {
  const project = tempProject();
  seedProjectFiles(project);
  const { roadmapNode, deliveryRun } = createAcceptedRun(project);
  run(["knowledge", "refresh", "--project", project]);
  const root = join(project, ".apex-v2");
  const projectPath = join(root, "project.json");
  const projectState = readJson(projectPath);
  projectState.active_runs = [];
  projectState.knowledge_version = 999;
  projectState.last_event_id = "event-bogus";
  writeFileSync(projectPath, `${JSON.stringify(projectState, null, 2)}\n`);
  const roadmapPath = join(root, "roadmap", "graph.json");
  const roadmap = readJson(roadmapPath);
  roadmap.nodes.find((node) => node.id === roadmapNode.id).status = "done";
  writeFileSync(roadmapPath, `${JSON.stringify(roadmap, null, 2)}\n`);

  const dryRun = JSON.parse(run(["project", "reconcile", "--project", project]).stdout);
  assert.equal(dryRun.status, "DRIFT");
  assert.equal(dryRun.applied, false);
  assert.ok(dryRun.inspection.changes.some((change) => change.field === "active_runs"));
  assert.ok(dryRun.inspection.changes.some((change) => change.field === "knowledge_version"));
  assert.ok(dryRun.inspection.changes.some((change) => change.field.includes(`${roadmapNode.id}.status`)));

  const repaired = JSON.parse(run(["project", "reconcile", "--project", project, "--apply"]).stdout);
  assert.equal(repaired.status, "REPAIRED");
  assert.equal(repaired.applied, true);
  assert.equal(repaired.post_check.status, "CONSISTENT");
  const currentProject = readJson(projectPath);
  assert.deepEqual(currentProject.active_runs, [deliveryRun.run_id]);
  assert.equal(currentProject.knowledge_version, 1);
  assert.match(currentProject.last_event_id, /^event-/);
  assert.equal(readJson(roadmapPath).nodes.find((node) => node.id === roadmapNode.id).status, "active");
  assert.ok(existsSync(join(root, "reconciliations", `${repaired.report_id}.json`)));
});

test("project reconcile 在 event log 损坏时拒绝 apply", () => {
  const project = tempProject();
  run(["init", "--project", project]);
  const eventsPath = join(project, ".apex-v2", "events.jsonl");
  writeFileSync(eventsPath, `${readFileSync(eventsPath, "utf8")}{invalid-json\n`);

  const inspection = JSON.parse(run(["project", "reconcile", "--project", project]).stdout);
  assert.equal(inspection.status, "INVALID");
  assert.ok(inspection.inspection.issues.some((issue) => issue.kind === "invalid-event-json"));
  const rejected = run(["project", "reconcile", "--project", project, "--apply"], { expectFailure: true });
  assert.match(rejected.stderr, /拒绝 apply/);
});

test("project metrics 生成并持久化交付、质量和风险快照", () => {
  const project = tempProject();
  seedProjectFiles(project);
  createAcceptedRun(project);
  const snapshot = JSON.parse(run(["project", "metrics", "--project", project, "--record"]).stdout);
  assert.match(snapshot.snapshot_id, /^metrics-/);
  assert.equal(snapshot.delivery.runs_total, 1);
  assert.equal(snapshot.delivery.runs_active, 1);
  assert.equal(typeof snapshot.quality.verification_pass, "number");
  const root = join(project, ".apex-v2", "metrics");
  assert.ok(existsSync(join(root, `${snapshot.snapshot_id}.json`)));
  assert.equal(readJson(join(root, "latest.json")).snapshot_id, snapshot.snapshot_id);
});

test("quality metrics FAIL 阻止新 run，风险缓解并重录 PASS 后恢复调度", () => {
  const project = tempProject();
  seedProjectFiles(project);
  run(["init", "--project", project]);
  const risk = JSON.parse(run([
    "risk", "add", "--project", project, "--title", "blocking quality risk", "--severity", "high"
  ]).stdout);
  const failedMetrics = JSON.parse(run(["project", "metrics", "--project", project, "--record"]).stdout);
  assert.equal(failedMetrics.evaluation.status, "FAIL");
  assert.ok(failedMetrics.evaluation.failures.includes("open-risks"));
  const intake = JSON.parse(run(["intake", "add", "--project", project, "--title", "blocked by quality"]).stdout);
  run(["intake", "triage", "--project", project, "--id", intake.id, "--decision", "accepted"]);
  const blocked = run(["project", "tick", "--project", project], { expectFailure: true });
  assert.match(blocked.stderr, /quality gate 阻止创建新 run：open-risks/);

  run(["risk", "update", "--project", project, "--id", risk.id, "--status", "mitigated", "--reason", "fixed"]);
  const recoveredMetrics = JSON.parse(run(["project", "metrics", "--project", project, "--record"]).stdout);
  assert.equal(recoveredMetrics.evaluation.status, "PASS");
  const tick = JSON.parse(run(["project", "tick", "--project", project]).stdout);
  assert.equal(tick.created_runs.length, 1);
});

test("runtime contract gate 在无效 ProjectState 落盘前拒绝写入", () => {
  const project = tempProject();
  run(["init", "--project", project]);
  const projectPath = join(project, ".apex-v2", "project.json");
  const original = readJson(projectPath);
  registerJsonWriteValidator(validatePersistedValue);

  assert.throws(() => {
    writeContractJson(projectPath, {
      ...original,
      knowledge_version: -1
    });
  }, /contract validation failed.*must be >= 0/);
  assert.deepEqual(readJson(projectPath), original);
});

test("contracts validate 定位绕过写入 gate 的持久化 contract 损坏", () => {
  const project = tempProject();
  run(["init", "--project", project]);
  const projectPath = join(project, ".apex-v2", "project.json");
  const corrupted = readJson(projectPath);
  corrupted.wip_limits.parallel_workers = 0;
  writeFileSync(projectPath, `${JSON.stringify(corrupted, null, 2)}\n`);

  const failed = run(["contracts", "validate", "--project", project], { expectFailure: true });
  const report = JSON.parse(failed.stdout);
  assert.equal(report.status, "FAIL");
  const projectError = report.errors.find((error) => error.path === ".apex-v2/project.json");
  assert.equal(projectError.schema_name, "project-state.schema.json");
  assert.ok(projectError.errors.some((error) =>
    error.instance_path === "/wip_limits/parallel_workers"
    && error.keyword === "minimum"
  ));
});
