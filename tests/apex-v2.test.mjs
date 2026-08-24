import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
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
import { buildCandidateSet } from "../src/core/candidate.mjs";
import { readCheckoutClaim } from "../src/core/git-delivery.mjs";

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
  const resultValue = options.invalidResult
    ? { summary: "invalid result without verdict" }
    : {
        verdict: "pass",
        summary: "fake codex completed scoped change",
        tests: [{ command: "node --check", status: "pass", detail: "fixture" }],
        risks: [],
        evidence_refs: []
      };
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
${options.noPatch ? "" : `writeFileSync(target, ${JSON.stringify(content)});`}
writeFileSync(output, JSON.stringify(${JSON.stringify(resultValue)}));
`);
  chmodSync(path, 0o755);
  return path;
}

function createFakeClaudeWorker(project) {
  const path = join(project, `fake-claude-worker-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(path, `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

if (process.argv.includes("--version")) {
  console.log("fake-claude 1.0.0");
  process.exit(0);
}

const target = join(process.cwd(), "src/apex-v2.mjs");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, "console.log('from fake claude');\\n");
console.log(JSON.stringify({
  session_id: "fake-claude-session",
  structured_output: {
    verdict: "pass",
    summary: "fake claude completed scoped change",
    tests: [{ command: "node --check", status: "pass", detail: "fixture" }],
    risks: [],
    evidence_refs: []
  }
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

function createAcceptedRun(project, options = {}) {
  run(["init", "--project", project, "--name", "Factory"]);
  const intakeArgs = ["intake", "add", "--project", project, "--title", "交付节点状态机"];
  if (options.methodPack) intakeArgs.push("--method-pack", options.methodPack);
  const intake = JSON.parse(run(intakeArgs).stdout);
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
  const { deliveryRun } = createAcceptedRun(project, { methodPack: "governed" });
  passNode(project, deliveryRun.run_id, "mandate", "目标已明确");
  run(["knowledge", "refresh", "--project", project]);
  passNode(project, deliveryRun.run_id, "context", "Context Fabric 已刷新");
  const generated = JSON.parse(run(["run", "plan", "generate", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "plan_graph", generated.artifact_id);
  return { deliveryRun, generated };
}

function submitEvidenceForRemainingPlanNodes(project, runId) {
  enableInteractiveWorkspacePatch(project);
  const root = join(project, ".apex-v2");
  const plan = readJson(join(root, "runs", runId, "plan-graph.json"));
  const existing = new Set(
    JSON.parse(run(["worker", "list", "--project", project, "--run-id", runId]).stdout)
      .map((worker) => worker.plan_node_id)
  );
  const created = [];

  for (const node of plan.nodes) {
    if (existing.has(node.id)) continue;
    const createArgs = [
      "worker",
      "create",
      "--project",
      project,
      "--run-id",
      runId,
      "--plan-node-id",
      node.id
    ];
    if (node.execution_class !== "deterministic_check") {
      createArgs.push("--mode", "interactive");
    }
    const worker = JSON.parse(run(createArgs).stdout);
    if (worker.execution_class === "cognitive") {
      completeHostWorker(project, worker, `${node.id} semantic evidence`);
    } else if (worker.execution_class === "workspace_patch") {
      completeHostWorker(project, worker, `${node.id} interactive patch`, true);
    } else {
      run(["worker", "exec-shell", "--project", project, "--worker-id", worker.worker_id, "--cmd", "node --version"]);
    }
    created.push(worker);
  }

  return created;
}

function completeHostWorker(project, worker, summary, modifyWorkspace = false) {
  if (modifyWorkspace) enableInteractiveWorkspacePatch(project);
  const claimed = JSON.parse(run([
    "host", "claim", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id
  ]).stdout);
  if (modifyWorkspace) {
    const target = worker.write_scope.find((scope) => !scope.endsWith("/"))
      || (worker.write_scope.some((scope) => scope.startsWith("tests/"))
        ? "tests/apex-v2.test.mjs"
        : "src/apex-v2.mjs");
    const path = join(project, claimed.action.payload.workspace_path, target);
    const current = existsSync(path) ? readFileSync(path, "utf8") : "";
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, `${current}\n// ${worker.worker_id}\n`);
  }
  const submitArgs = [
    "host", "submit", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id, "--claim-token", claimed.action.claim_token,
    "--summary", summary
  ];
  if (!modifyWorkspace) {
    submitArgs.push("--evidence-json", JSON.stringify(semanticEvidenceForWorker(project, worker)));
  }
  return JSON.parse(run(submitArgs).stdout);
}

function enableInteractiveWorkspacePatch(project) {
  const policyPath = join(project, ".apex-v2", "policies", "execution.json");
  const policy = readJson(policyPath);
  policy.interactive_workspace_patch = { enabled: true };
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
}

function semanticEvidenceForWorker(project, worker) {
  const evidenceType = worker.plan_node_id.split("-").at(-1);
  const sourceRef = worker.read_scope[0] || "README.md";
  const evidence = {
    schema_version: "v0",
    evidence_type: evidenceType,
    objective: worker.objective,
    source_refs: [sourceRef],
    claims: [`${worker.plan_node_id} typed claim`],
    uncertainties: [],
    acceptance_mapping: [{
      criterion: worker.required_evidence[0] || "typed evidence",
      evidence_ref: sourceRef,
      status: "supported"
    }],
    created_at: new Date().toISOString()
  };
  if (evidenceType === "context") {
    return { ...evidence, affected_files: worker.read_scope, constraints: [], unknowns: [] };
  }
  if (evidenceType === "risk") {
    return {
      ...evidence,
      failure_paths: ["fixture failure path"],
      blast_radius: worker.read_scope,
      mitigations: ["fixture mitigation"],
      rollback: ["revert candidate"]
    };
  }
  if (evidenceType === "design") {
    return {
      ...evidence,
      slices: worker.deliverables,
      dependencies: [],
      verification: worker.verification,
      rollback: ["revert candidate"]
    };
  }
  if (evidenceType === "review") {
    const root = join(project, ".apex-v2");
    const runState = readJson(join(root, "runs", worker.run_id, "run.json"));
    const queue = readJson(join(root, "runs", worker.run_id, "merge-queue.json"), {
      schema_version: "v0",
      run_id: worker.run_id,
      updated_at: new Date().toISOString(),
      items: [],
      conflicts: [],
      resolutions: []
    });
    return {
      ...evidence,
      candidate_digest: buildCandidateSet(root, runState, queue, project).candidate_digest,
      findings: [],
      residual_risks: [],
      merge_posture: "approve"
    };
  }
  throw new Error(`unsupported cognitive evidence type: ${evidenceType}`);
}

function setPlanCapabilityEnforcement(project, runId, mode) {
  const path = join(project, ".apex-v2", "runs", runId, "plan-graph.json");
  const plan = readJson(path);
  plan.capability_plan.enforcement_mode = mode;
  for (const node of plan.nodes) {
    node.capability_enforcement = mode;
  }
  writeFileSync(path, `${JSON.stringify(plan, null, 2)}\n`);
}

function capabilityEvidenceForWorker(worker, capabilityId) {
  const binding = worker.capability_bindings.find((item) =>
    item.capability_id === capabilityId
  );
  assert.ok(binding, `worker 缺少 capability binding：${capabilityId}`);
  const common = {
    schema_version: "v0",
    capability_id: binding.capability_id,
    capability_version: binding.capability_version,
    invocation_id: `capinv-${worker.worker_id}-${capabilityId}`,
    objective: worker.objective,
    source_refs: ["src/apex-v2.mjs", "tests/apex-v2.test.mjs"],
    claims: [`${capabilityId} produced typed integration evidence`],
    uncertainties: [],
    verification_refs: ["node --test tests/apex-v2.test.mjs"],
    output_contract: binding.output_contract,
    created_at: "2026-08-21T00:00:00.000Z"
  };
  if (capabilityId === "engineering-spec") {
    return {
      ...common,
      output: {
        objective: worker.objective,
        in_scope: ["src/apex-v2.mjs"],
        out_of_scope: ["plugin packaging"],
        acceptance: ["Host action persists typed capability evidence"],
        assumptions: ["PlanGraph binding is authoritative"],
        open_questions: [],
        verification_plan: ["run Host integration test"]
      }
    };
  }
  if (capabilityId === "tdd-negative-control") {
    return {
      ...common,
      output: {
        test_entry: "tests/apex-v2.test.mjs",
        fault_model: "required capability evidence is omitted",
        red_command: "node --test tests/apex-v2.test.mjs",
        red_signature: "missing required capability evidence",
        green_command: "node --test tests/apex-v2.test.mjs",
        green_result: "capability evidence accepted",
        restoration_result: "fixture restored after negative control"
      }
    };
  }
  if (capabilityId === "test-strategy") {
    return {
      ...common,
      output: {
        test_mode: "targeted",
        affected_surfaces: ["parser"],
        selected_test_groups: ["parser-regression"],
        excluded_groups: ["browser"],
        selection_rationale: "The fixture changes only parser behavior.",
        stop_conditions: ["targeted regression failure"]
      }
    };
  }
  throw new Error(`unsupported capability fixture: ${capabilityId}`);
}

function createCapabilityFakeCodex(project, options = {}) {
  const evidence = options.evidence || [];
  const path = join(project, `fake-capability-codex-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(path, `#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

if (process.argv.includes("--version")) {
  console.log("fake-capability-codex 1.0.0");
  process.exit(0);
}

const args = process.argv.slice(2);
const workspace = args[args.indexOf("-C") + 1];
const output = args[args.indexOf("-o") + 1];
const prompt = readFileSync(0, "utf8");
for (const expected of ${JSON.stringify(options.expectedPrompt || [])}) {
  if (!prompt.includes(expected)) {
    console.error(\`missing capability prompt content: \${expected}\`);
    process.exit(2);
  }
}
const target = join(workspace, "src/apex-v2.mjs");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, "console.log('capability integration fixture');\\n");
writeFileSync(output, JSON.stringify({
  verdict: "pass",
  summary: "fake capability worker completed scoped change",
  tests: [{ command: "node --check", status: "pass", detail: "fixture" }],
  risks: [],
  evidence_refs: [],
  capability_evidence: ${JSON.stringify(evidence)}
}));
`);
  chmodSync(path, 0o755);
  return path;
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

test("run create transaction failpoint 不留下半完成 ProjectState", () => {
  const project = tempProject();
  run(["init", "--project", project, "--name", "Transactional Run"]);
  const intake = JSON.parse(run([
    "intake", "add", "--project", project, "--title", "transactional run"
  ]).stdout);
  run(["intake", "triage", "--project", project, "--id", intake.id, "--decision", "accepted"]);
  const roadmap = JSON.parse(run([
    "roadmap", "promote", "--project", project, "--intake-id", intake.id
  ]).stdout);

  const failed = run([
    "run", "create", "--project", project, "--roadmap-id", roadmap.id
  ], {
    env: { ...process.env, APEX_V2_TRANSACTION_FAILPOINT: "run-create" },
    expectFailure: true
  });
  assert.match(failed.stderr, /transaction failpoint/);
  const root = join(project, ".apex-v2");
  assert.deepEqual(readJson(join(root, "project.json")).active_runs, []);
  assert.equal(readJson(join(root, "roadmap", "graph.json")).nodes[0].status, "ready");
  assert.equal(readdirSync(join(root, "runs")).length, 0);

  const created = JSON.parse(run([
    "run", "create", "--project", project, "--roadmap-id", roadmap.id
  ]).stdout);
  assert.match(created.run_id, /^run-/);
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
  assert.equal(workers[0].plan_node_id, "delivery-design");

  const secondTick = JSON.parse(run(["project", "tick", "--project", project, "--advance", "--dispatch"]).stdout);
  assert.equal(secondTick.dispatched_workers.length, 0);
  const workersAfterSecondTick = JSON.parse(run(["worker", "list", "--project", project, "--run-id", runId]).stdout);
  assert.equal(workersAfterSecondTick.length, 1);
});

test("认知节点由当前 Host Agent claim 并提交语义 evidence", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-context", "--mode", "interactive"
  ]).stdout);

  assert.equal(worker.adapter, "host");
  assert.equal(worker.execution_class, "cognitive");
  assert.equal(worker.preferred_mode, "interactive");

  const listed = JSON.parse(run([
    "host", "actions", "--project", project, "--host-id", "codex-host"
  ]).stdout);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].worker_id, worker.worker_id);

  const claimed = JSON.parse(run([
    "host", "claim", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id
  ]).stdout);
  assert.equal(claimed.worker.status, "claimed");
  assert.equal(claimed.worker.claimed_by, "codex-host");
  assert.match(claimed.action.claim_token, /^claim-/);
  assert.equal(claimed.action.fencing_token, 1);
  assert.ok(Date.parse(claimed.action.lease_expires_at) > Date.now());

  const rejected = run([
    "host", "submit", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id, "--claim-token", "claim-invalid",
    "--summary", "invalid token must fail"
  ], { expectFailure: true });
  assert.match(rejected.stderr, /claim token 无效/);

  const submitted = JSON.parse(run([
    "host", "submit", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id,
    "--claim-token", claimed.action.claim_token,
    "--evidence-json", JSON.stringify(semanticEvidenceForWorker(project, worker)),
    "--summary", "已核对任务上下文、验收边界与未知项。"
  ]).stdout);
  assert.equal(submitted.result.status, "completed");
  assert.equal(submitted.worker.status, "evidence_submitted");
  assert.ok(submitted.artifact_id);

  const persisted = readJson(join(
    project,
    ".apex-v2",
    "runs",
    deliveryRun.run_id,
    "workers",
    worker.worker_id,
    "host-result.json"
  ));
  assert.equal(persisted.host_id, "codex-host");
  assert.match(persisted.semantic_evidence_ref, /cognitive-evidence\.json$/);
});

test("Host capability shadow 模式注入 binding/protocol 且缺失 evidence 可审计但不阻塞", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-design"
  ]).stdout);
  const binding = worker.capability_bindings.find((item) =>
    item.capability_id === "engineering-spec"
  );
  assert.ok(binding);
  assert.equal(binding.input_contract, "engineering-spec-request");
  assert.equal(worker.capability_enforcement, "shadow");
  assert.ok(worker.capability_invocation_refs.length > 0);
  const invocationRef = worker.capability_invocation_refs.find((item) =>
    item.endsWith("capability-invocation-engineering-spec.json")
  );
  assert.ok(invocationRef);
  const invocationPath = join(project, invocationRef);
  const invocation = readJson(invocationPath);
  assert.equal(invocation.input_contract, "engineering-spec-request");
  assert.equal(invocation.input.capability_id, "engineering-spec");
  assert.equal(invocation.output_contract, "engineering-spec-evidence");
  assert.equal(validatePersistedValue(invocationPath, invocation), 1);

  const listed = JSON.parse(run([
    "host", "actions", "--project", project, "--host-id", "codex-host"
  ]).stdout);
  const listedAction = listed.find((item) => item.worker_id === worker.worker_id);
  assert.deepEqual(listedAction.capability_bindings, worker.capability_bindings);
  assert.deepEqual(
    listedAction.capability_invocation_refs,
    worker.capability_invocation_refs
  );
  assert.equal(listedAction.capability_enforcement, "shadow");
  assert.match(
    listedAction.capability_protocols.find((item) =>
      item.capability_id === "engineering-spec"
    ).protocol,
    /# Engineering Spec/
  );

  const claimed = JSON.parse(run([
    "host", "claim", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id
  ]).stdout);
  assert.deepEqual(claimed.action.payload.capability_bindings, worker.capability_bindings);
  assert.deepEqual(
    claimed.action.payload.capability_invocation_refs,
    worker.capability_invocation_refs
  );
  assert.equal(claimed.action.payload.capability_enforcement, "shadow");
  assert.match(
    claimed.action.payload.capability_protocols.find((item) =>
      item.capability_id === "engineering-spec"
    ).protocol,
    /Produce `engineering-spec-evidence`/
  );

  const submitted = JSON.parse(run([
    "host", "submit", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id,
    "--claim-token", claimed.action.claim_token,
    "--evidence-json", JSON.stringify(semanticEvidenceForWorker(project, worker)),
    "--summary", "shadow mode records missing capability evidence"
  ]).stdout);
  assert.equal(submitted.result.status, "completed");
  assert.deepEqual(submitted.result.capability_evidence_status, {
    enforcement: "shadow",
    submitted: [],
    missing: ["engineering-spec"]
  });
  assert.deepEqual(submitted.result.capability_evidence_refs, []);
  assert.equal(submitted.worker.status, "evidence_submitted");

  const dir = join(
    project,
    ".apex-v2",
    "runs",
    deliveryRun.run_id,
    "workers",
    worker.worker_id
  );
  assert.deepEqual(
    readJson(join(dir, "host-result.json")).capability_evidence_status,
    submitted.result.capability_evidence_status
  );
  assert.equal(
    existsSync(join(dir, "capability-evidence-engineering-spec.json")),
    false
  );
});

test("Host capability enforce 模式缺失 evidence fail closed，完整 evidence 可持久化通过", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  setPlanCapabilityEnforcement(project, deliveryRun.run_id, "enforce");
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-design"
  ]).stdout);
  assert.equal(worker.capability_enforcement, "enforce");
  const claimed = JSON.parse(run([
    "host", "claim", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id
  ]).stdout);

  const missing = run([
    "host", "submit", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id,
    "--claim-token", claimed.action.claim_token,
    "--evidence-json", JSON.stringify(semanticEvidenceForWorker(project, worker)),
    "--summary", "enforce mode must reject missing capability evidence"
  ], { expectFailure: true });
  assert.match(missing.stderr, /缺少 required capability evidence：engineering-spec/);

  const dir = join(
    project,
    ".apex-v2",
    "runs",
    deliveryRun.run_id,
    "workers",
    worker.worker_id
  );
  assert.equal(readJson(join(dir, "worker.json")).status, "claimed");
  assert.equal(existsSync(join(dir, "host-result.json")), false);
  assert.equal(existsSync(join(dir, "cognitive-evidence.json")), false);
  assert.equal(
    existsSync(join(dir, "capability-evidence-engineering-spec.json")),
    false
  );

  const capabilityEvidence = capabilityEvidenceForWorker(
    worker,
    "engineering-spec"
  );
  const submitted = JSON.parse(run([
    "host", "submit", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id,
    "--claim-token", claimed.action.claim_token,
    "--evidence-json", JSON.stringify(semanticEvidenceForWorker(project, worker)),
    "--capability-evidence-json", JSON.stringify([capabilityEvidence]),
    "--summary", "enforce mode accepts complete capability evidence"
  ]).stdout);
  assert.equal(submitted.result.status, "completed");
  assert.deepEqual(submitted.result.capability_evidence_status, {
    enforcement: "enforce",
    submitted: ["engineering-spec"],
    missing: []
  });
  assert.deepEqual(submitted.result.capability_evidence_refs, [
    `${worker.namespace}/capability-evidence-engineering-spec.json`
  ]);
  assert.deepEqual(
    readJson(join(dir, "capability-evidence-engineering-spec.json")),
    capabilityEvidence
  );
  assert.ok(
    submitted.result.artifact_refs.includes(
      `${worker.namespace}/capability-evidence-engineering-spec.json`
    )
  );
});

test("cognitive Host action 拒绝 summary-only、空 source refs 和复制 objective", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-context", "--mode", "interactive"
  ]).stdout);
  const claimed = JSON.parse(run([
    "host", "claim", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id
  ]).stdout);

  const summaryOnly = run([
    "host", "submit", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id, "--claim-token", claimed.action.claim_token,
    "--summary", "generic summary"
  ], { expectFailure: true });
  assert.match(summaryOnly.stderr, /typed semantic evidence/);

  const invalid = semanticEvidenceForWorker(project, worker);
  invalid.source_refs = [];
  const emptyRefs = run([
    "host", "submit", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id, "--claim-token", claimed.action.claim_token,
    "--evidence-json", JSON.stringify(invalid),
    "--summary", "invalid refs"
  ], { expectFailure: true });
  assert.match(emptyRefs.stderr, /cognitive evidence contract 无效/);

  const copied = semanticEvidenceForWorker(project, worker);
  copied.claims = [worker.objective];
  const copiedClaim = run([
    "host", "submit", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id, "--claim-token", claimed.action.claim_token,
    "--evidence-json", JSON.stringify(copied),
    "--summary", "copied objective"
  ], { expectFailure: true });
  assert.match(copiedClaim.stderr, /semantic conflict.*copied the objective/);
});

test("Host submit transaction failpoint 全量回滚并支持幂等重试", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-context", "--mode", "interactive"
  ]).stdout);
  const claimed = JSON.parse(run([
    "host", "claim", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id
  ]).stdout);
  const args = [
    "host", "submit", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id, "--claim-token", claimed.action.claim_token,
    "--evidence-json", JSON.stringify(semanticEvidenceForWorker(project, worker)),
    "--summary", "transactional cognitive evidence"
  ];
  const failed = run(args, {
    expectFailure: true,
    env: { ...process.env, APEX_V2_TRANSACTION_FAILPOINT: "host-submit" }
  });
  assert.match(failed.stderr, /transaction failpoint/);

  const dir = join(
    project,
    ".apex-v2",
    "runs",
    deliveryRun.run_id,
    "workers",
    worker.worker_id
  );
  assert.equal(readJson(join(dir, "worker.json")).status, "claimed");
  assert.equal(existsSync(join(dir, "host-result.json")), false);
  assert.equal(existsSync(join(dir, "cognitive-evidence.json")), false);

  const first = JSON.parse(run(args).stdout);
  const replay = JSON.parse(run(args).stdout);
  assert.equal(first.worker.status, "evidence_submitted");
  assert.equal(replay.artifact_id, first.artifact_id);
  assert.equal(replay.result.action_id, first.result.action_id);
});

test("过期 Host claim 可被重新领取且旧 fencing token 失效", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-context", "--mode", "interactive"
  ]).stdout);
  const first = JSON.parse(run([
    "host", "claim", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id
  ]).stdout);
  const dir = join(
    project,
    ".apex-v2",
    "runs",
    deliveryRun.run_id,
    "workers",
    worker.worker_id
  );
  const workerState = readJson(join(dir, "worker.json"));
  workerState.claim_expires_at = "2000-01-01T00:00:00.000Z";
  writeFileSync(join(dir, "worker.json"), `${JSON.stringify(workerState, null, 2)}\n`);
  const actionState = readJson(join(dir, "host-action.json"));
  actionState.lease_expires_at = "2000-01-01T00:00:00.000Z";
  writeFileSync(join(dir, "host-action.json"), `${JSON.stringify(actionState, null, 2)}\n`);

  const second = JSON.parse(run([
    "host", "claim", "--project", project, "--host-id", "claude-code-host",
    "--worker-id", worker.worker_id
  ]).stdout);
  assert.equal(second.worker.claimed_by, "claude-code-host");
  assert.equal(second.action.fencing_token, first.action.fencing_token + 1);
  assert.notEqual(second.action.claim_token, first.action.claim_token);

  const stale = run([
    "host", "submit", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id, "--claim-token", first.action.claim_token,
    "--summary", "stale claim"
  ], { expectFailure: true });
  assert.match(stale.stderr, /当前 host claim|claim token 无效/);
});

test("Interactive workspace patch 可显式禁用并保留 Factory 路径", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const policyPath = join(project, ".apex-v2", "policies", "execution.json");
  const policy = readJson(policyPath);
  policy.interactive_workspace_patch = { enabled: false };
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation"
  ]).stdout);

  const listed = JSON.parse(run([
    "host", "actions", "--project", project, "--host-id", "codex-host"
  ]).stdout);
  assert.equal(listed.some((item) => item.worker_id === worker.worker_id), false);
  assert.equal(worker.preferred_mode, "factory");
  const blocked = run([
    "host", "claim", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id
  ], { expectFailure: true });
  assert.match(blocked.stderr, /不是可 claim 的 Interactive Host action/);
  assert.equal(worker.adapter, "codex");
});

test("Interactive Host Agent 在 ActionWorkspace 提交 merge queue", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation", "--mode", "interactive"
  ]).stdout);
  assert.equal(worker.adapter, "codex");
  assert.equal(worker.preferred_mode, "interactive");

  const claimed = JSON.parse(run([
    "host", "claim", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id
  ]).stdout);
  assert.equal(claimed.worker.adapter, "host");
  assert.equal(claimed.worker.factory_executor_id, "codex");
  assert.ok(claimed.action.payload.workspace_path);
  assert.match(claimed.workspace.base_fingerprint, /^[a-f0-9]{64}$/);

  writeProjectFile(
    project,
    `${claimed.action.payload.workspace_path}/src/apex-v2.mjs`,
    "console.log('interactive host change');\n"
  );
  const submitted = JSON.parse(run([
    "host", "submit", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id,
    "--claim-token", claimed.action.claim_token,
    "--summary", "当前 Codex 已完成受控实现。"
  ]).stdout);
  assert.ok(submitted.patch_id);
  assert.equal(submitted.queue_status, "queued");
  assert.equal(submitted.worker.status, "queued");

  const patch = readJson(join(
    project,
    ".apex-v2",
    "runs",
    deliveryRun.run_id,
    "workers",
    worker.worker_id,
    "patch-bundle.json"
  ));
  assert.deepEqual(patch.changed_files, ["src/apex-v2.mjs"]);
  assert.equal(
    readFileSync(join(project, "src", "apex-v2.mjs"), "utf8"),
    "console.log('cli');\n"
  );
});

test("Interactive Host Agent 取消 action 时只删除 ActionWorkspace", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  enableInteractiveWorkspacePatch(project);
  const original = readFileSync(join(project, "src", "apex-v2.mjs"), "utf8");
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation", "--mode", "interactive"
  ]).stdout);
  const claimed = JSON.parse(run([
    "host", "claim", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id
  ]).stdout);
  writeProjectFile(
    project,
    `${claimed.action.payload.workspace_path}/src/apex-v2.mjs`,
    "console.log('cancel me');\n"
  );

  const cancelled = JSON.parse(run([
    "host", "cancel", "--project", project, "--host-id", "codex-host",
    "--worker-id", worker.worker_id, "--claim-token", claimed.action.claim_token,
    "--reason", "user cancelled"
  ]).stdout);

  assert.equal(cancelled.result.status, "cancelled");
  assert.equal(cancelled.worker.status, "cancelled");
  assert.equal(readFileSync(join(project, "src", "apex-v2.mjs"), "utf8"), original);
  assert.equal(existsSync(join(project, claimed.action.payload.workspace_path)), false);
});

test("Interactive workspace patch action 必须串行 claim", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  enableInteractiveWorkspacePatch(project);
  const implementation = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation", "--mode", "interactive"
  ]).stdout);
  const testsWorker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-tests", "--mode", "interactive"
  ]).stdout);

  const firstClaim = JSON.parse(run([
    "host", "claim", "--project", project, "--host-id", "codex-host",
    "--worker-id", implementation.worker_id
  ]).stdout);
  const blocked = run([
    "host", "claim", "--project", project, "--host-id", "codex-host",
    "--worker-id", testsWorker.worker_id
  ], { expectFailure: true });
  assert.match(blocked.stderr, /已有 workspace_patch action 被 claim/);

  writeProjectFile(
    project,
    `${firstClaim.action.payload.workspace_path}/src/apex-v2.mjs`,
    "console.log('first patch');\n"
  );
  run([
    "host", "submit", "--project", project, "--host-id", "codex-host",
    "--worker-id", implementation.worker_id,
    "--claim-token", firstClaim.action.claim_token,
    "--summary", "first patch"
  ]);
  const claimed = JSON.parse(run([
    "host", "claim", "--project", project, "--host-id", "codex-host",
    "--worker-id", testsWorker.worker_id
  ]).stdout);
  assert.equal(claimed.worker.status, "claimed");
});

test("project tick --run-workers 自动执行 active worker 的验证命令并保持幂等", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const runId = deliveryRun.run_id;
  run([
    "worker", "create", "--project", project, "--run-id", runId,
    "--plan-node-id", "delivery-verification"
  ]);

  const runWorkers = JSON.parse(run(["project", "tick", "--project", project, "--run-workers", "--worker-limit", "1"]).stdout);
  assert.equal(runWorkers.worker_runs.length, 1);
  assert.equal(runWorkers.worker_runs[0].status, "PASS");
  assert.match(runWorkers.worker_runs[0].artifact_id, /^artifact-/);

  const workers = JSON.parse(run(["worker", "list", "--project", project, "--run-id", runId]).stdout);
  assert.equal(workers.filter((worker) => worker.status === "evidence_submitted").length, 1);

  const second = JSON.parse(run(["project", "tick", "--project", project, "--run-workers", "--worker-limit", "1"]).stdout);
  assert.equal(second.worker_runs.length, 0, "已有 adapter result 的 worker 不应重复执行");
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
    "delivery-verification"
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

test("shell worker 在 enforce 模式必须提交 typed capability evidence", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  setPlanCapabilityEnforcement(project, deliveryRun.run_id, "enforce");
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-verification"
  ]).stdout);
  const binding = worker.capability_bindings.find((item) =>
    item.capability_id === "test-strategy"
  );
  assert.ok(binding);

  const missing = JSON.parse(run([
    "worker", "exec-shell", "--project", project,
    "--worker-id", worker.worker_id,
    "--cmd", "node --version"
  ]).stdout);
  assert.equal(missing.result.status, "FAIL");
  assert.equal(missing.result.failure_kind, "contract_error");
  assert.match(
    missing.result.capability_evidence_status.error,
    /缺少 required capability evidence：test-strategy/
  );

  run([
    "worker", "retry", "--project", project, "--worker-id", worker.worker_id
  ]);
  const retried = JSON.parse(run([
    "worker", "list", "--project", project, "--run-id", deliveryRun.run_id
  ]).stdout).find((item) => item.worker_id === worker.worker_id);
  const evidence = capabilityEvidenceForWorker(retried, "test-strategy");
  const completed = JSON.parse(run([
    "worker", "exec-shell", "--project", project,
    "--worker-id", worker.worker_id,
    "--cmd", "node --version",
    "--capability-evidence-json", JSON.stringify([evidence])
  ]).stdout);
  assert.equal(completed.result.status, "PASS");
  assert.deepEqual(completed.result.capability_evidence_status, {
    enforcement: "enforce",
    submitted: ["test-strategy"],
    missing: [],
    error: ""
  });
  const dir = join(
    project,
    ".apex-v2",
    "runs",
    deliveryRun.run_id,
    "workers",
    worker.worker_id
  );
  assert.equal(
    existsSync(join(dir, "capability-evidence-test-strategy.json")),
    true
  );
});

test("project tick --complete-execute 必须等待全部 PlanGraph 节点完成", () => {
  const project = tempProject();
  seedProjectFiles(project);
  const { deliveryRun } = createRunWithPlanGraph(project);
  enableInteractiveWorkspacePatch(project);

  const evidenceWorker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-implementation",
    "--mode",
    "interactive"
  ]).stdout);
  const decisionWorker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-context",
    "--mode",
    "interactive"
  ]).stdout);

  completeHostWorker(project, evidenceWorker, "implementation patch", true);
  completeHostWorker(project, decisionWorker, "context evidence");

  const partialTick = JSON.parse(run(["project", "tick", "--project", project, "--collect-results", "--complete-execute"]).stdout);
  assert.equal(partialTick.collected_results.length, 1);
  assert.equal(partialTick.completed_execute_runs.length, 0);

  submitEvidenceForRemainingPlanNodes(project, deliveryRun.run_id);
  const tick = JSON.parse(run(["project", "tick", "--project", project, "--collect-results", "--complete-execute"]).stdout);
  assert.ok(tick.collected_results.length >= 4);
  assert.equal(tick.completed_execute_runs.length, 1);
  assert.equal(tick.completed_execute_runs[0].run_id, deliveryRun.run_id);

  const root = join(project, ".apex-v2");
  assert.ok(existsSync(join(root, "runs", deliveryRun.run_id, "decision-queue.json")));
  const queue = readJson(join(root, "runs", deliveryRun.run_id, "decision-queue.json"));
  assert.equal(queue.items.length, 5);

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
  passNode(project, deliveryRun.run_id, "execute", "manual evidence-only execute");
  const tick = JSON.parse(run(["project", "tick", "--project", project, "--verify", "--review"]).stdout);
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
  passNode(project, deliveryRun.run_id, "execute", "manual evidence-only execute");
  const tick = JSON.parse(run(["project", "tick", "--project", project, "--verify", "--review"]).stdout);
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
  passNode(project, deliveryRun.run_id, "execute", "manual evidence-only execute");
  run(["project", "tick", "--project", project, "--verify", "--review"]);

  const integrated = JSON.parse(run(["project", "tick", "--project", project, "--integrate"]).stdout);
  assert.equal(integrated.integrated_runs.length, 1);
  assert.equal(integrated.integrated_runs[0].status, "NOOP");

  const root = join(project, ".apex-v2");
  const runState = readJson(join(root, "runs", deliveryRun.run_id, "run.json"));
  assert.equal(runState.nodes.find((node) => node.id === "integrate").status, "passed");
});

test("project tick --learn 排队后立即关闭 run，learning worker 后台应用", () => {
  const project = tempProject();
  seedProjectFiles(project);
  const { deliveryRun } = createIntegratedRun(project);

  const proposedOnly = JSON.parse(run(["project", "tick", "--project", project, "--learn"]).stdout);
  assert.equal(proposedOnly.learned_runs.length, 1);
  assert.equal(proposedOnly.learned_runs[0].applied.length, 0);

  const root = join(project, ".apex-v2");
  let runState = readJson(join(root, "runs", deliveryRun.run_id, "run.json"));
  assert.equal(runState.status, "done");
  assert.equal(runState.nodes.find((node) => node.id === "learn").status, "passed");
  assert.equal(readJson(join(root, "project.json")).active_runs.length, 0);
  assert.match(runState.closure_event_id, /^event-/);
  const jobs = readJson(join(root, "learning", "jobs.json"));
  assert.equal(jobs.length, 3);
  assert.ok(jobs.every((job) => job.status === "waiting_approval"));
  const reconciled = JSON.parse(run(["project", "reconcile", "--project", project]).stdout);
  assert.equal(reconciled.status, "CONSISTENT");

  for (const proposalId of proposedOnly.learned_runs[0].proposal_ids) {
    run(["learn", "approve", "--project", project, "--id", proposalId]);
  }
  const applied = JSON.parse(run([
    "project", "tick", "--project", project,
    "--learning-worker", "--learning-limit", "3"
  ]).stdout);
  assert.equal(applied.learning_jobs.length, 3);
  assert.ok(applied.learning_jobs.every((job) => job.status === "APPLIED"));
  runState = readJson(join(root, "runs", deliveryRun.run_id, "run.json"));
  assert.equal(runState.status, "done");
  assert.equal(
    readdirSync(join(root, "learning", "receipts"))
      .filter((name) => name.endsWith(".json")).length,
    3
  );
  const appliedReconcile = JSON.parse(run([
    "project", "reconcile", "--project", project
  ]).stdout);
  assert.equal(appliedReconcile.status, "CONSISTENT");
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
    "delivery-verification"
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
    "--carry-forward", "验收 owner 尚未最终确认,安全 owner 尚未最终确认",
    "--carry-severity", "high",
    "--carry-target", "review",
    "--reason", "目标可继续规划，但最终验收需人工确认"
  ]).stdout);
  assert.equal(partial.nodes.find((node) => node.id === "mandate").status, "partial_pass");
  assert.equal(partial.carry_forward.length, 2);
  assert.equal(partial.carry_forward[0].status, "open");
  assert.equal(JSON.parse(run(["risk", "list", "--project", project, "--status", "open"]).stdout).length, 2);

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

  const firstResolved = JSON.parse(run([
    "run", "carry", "resolve", "--project", project, "--run-id", deliveryRun.run_id,
    "--id", paused.carry_forward[0].id, "--evidence", contextArtifact.artifact_id,
    "--reason", "验收 owner 已通过 context evidence 确认"
  ]).stdout);
  assert.equal(firstResolved.carry.status, "resolved");
  assert.equal(firstResolved.run.status, "paused");
  assert.equal(firstResolved.run.nodes.find((node) => node.id === "mandate").status, "partial_pass");
  assert.equal(JSON.parse(run(["risk", "list", "--project", project, "--status", "open"]).stdout).length, 1);

  const resolved = JSON.parse(run([
    "run", "carry", "resolve", "--project", project, "--run-id", deliveryRun.run_id,
    "--id", paused.carry_forward[1].id, "--evidence", contextArtifact.artifact_id,
    "--reason", "安全 owner 已通过 context evidence 确认"
  ]).stdout);
  assert.equal(resolved.carry.status, "resolved");
  assert.equal(resolved.run.status, "done");
  assert.equal(resolved.run.gate.status, "PASS");
  assert.equal(resolved.run.nodes.find((node) => node.id === "mandate").status, "passed");
  assert.equal(resolved.run.nodes.find((node) => node.id === "mandate").gate.status, "PASS");
  assert.equal(JSON.parse(run(["risk", "list", "--project", project, "--status", "mitigated"]).stdout).length, 2);
  assert.deepEqual(readJson(join(root, "project.json")).active_runs, []);
  assert.equal(readJson(join(root, "roadmap", "graph.json")).nodes.find((node) => node.id === roadmapNode.id).status, "done");

  const events = readFileSync(join(root, "events.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  const carryEvents = events.filter((event) => event.type === "run.carry.updated");
  assert.equal(carryEvents[0].payload.source_node_promoted, false);
  assert.deepEqual(carryEvents[0].payload.remaining_open_carry_ids, [paused.carry_forward[1].id]);
  assert.equal(carryEvents[1].payload.source_node_promoted, true);
  assert.deepEqual(carryEvents[1].payload.remaining_open_carry_ids, []);
  assert.ok(events.some((event) =>
    event.type === "run.node.completed"
    && event.payload.node_id === "mandate"
    && event.payload.gate === "PASS"
    && event.payload.via === "carry-forward"
  ));
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

test("HALT 将 run 终止并从 active_runs 移除", () => {
  const project = tempProject();
  const { roadmapNode, deliveryRun } = createAcceptedRun(project);
  const halted = JSON.parse(run([
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
    "HALT",
    "--reason",
    "superseded run"
  ]).stdout);
  assert.equal(halted.status, "halted");
  assert.equal(halted.nodes.find((node) => node.id === "plan_graph").status, "halted");
  const root = join(project, ".apex-v2");
  assert.deepEqual(readJson(join(root, "project.json")).active_runs, []);
  assert.equal(
    readJson(join(root, "roadmap", "graph.json")).nodes
      .find((node) => node.id === roadmapNode.id).status,
    "blocked"
  );
  const reconciled = JSON.parse(run([
    "project", "reconcile", "--project", project, "--dry-run"
  ]).stdout);
  assert.equal(reconciled.status, "CONSISTENT");
  assert.deepEqual(reconciled.inspection.event_replay.active_runs, []);
  assert.match(
    readFileSync(join(root, "events.jsonl"), "utf8"),
    /"type":"run\.halted"/
  );
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
  assert.equal(generated.plan.method_pack.id, "disciplined-tdd");
  assert.equal(generated.plan.method_pack.workflow, "disciplined");
  assert.equal(generated.plan.nodes.length, 4);
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
    "恢复后必须保留最后一个 gate 和 evidence refs。\nPublic acceptance commands: node --test tests/session.test.mjs; node --check src/session.mjs",
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
  assert.equal(generated.plan.profile, "full");
  assert.equal(generated.plan.source_intake_type, "bug");
  assert.equal(generated.plan.source_title, "修复 session 恢复丢失状态");
  assert.match(generated.plan.strategy, /先复现失败/);
  assert.deepEqual(generated.plan.verification_policy.required_commands, [
    "node --test tests/session.test.mjs",
    "node --check src/session.mjs"
  ]);
  assert.equal(generated.plan.verification_policy.schema_check, null);
  assert.ok(generated.plan.planning_basis.some((ref) => ref.includes(intake.id)));
  const implementation = generated.plan.nodes.find((node) => node.id === "delivery-implementation");
  const tests = generated.plan.nodes.find((node) => node.id === "delivery-tests");
  assert.deepEqual(implementation.write_scope, ["src/session.mjs"]);
  assert.deepEqual(tests.write_scope, ["tests/session.test.mjs"]);
  assert.equal(implementation.adapter, undefined);
  assert.equal(implementation.execution_class, "workspace_patch");
  assert.deepEqual(implementation.required_capabilities, ["structured_output", "workspace_write", "tool_use"]);
  assert.equal(implementation.preferred_mode, "interactive");
  assert.equal(implementation.output_contract, "patch");
  assert.equal(tests.adapter, undefined);
  assert.equal(tests.execution_class, "workspace_patch");
  assert.ok(generated.plan.nodes.every((node) => node.objective.includes("修复 session 恢复丢失状态")));
  assert.ok(generated.plan.nodes.every((node) => !node.title.includes("Project Kernel")));
});

test("明确低风险少文件任务使用 quick PlanGraph 单 patch 路由", () => {
  const project = tempProject();
  seedProjectFiles(project);
  writeProjectFile(project, "src/semver.mjs", "export function satisfies() { return true; }\n");
  writeProjectFile(project, "tests/semver.test.mjs", "import test from 'node:test';\n");
  run(["init", "--project", project, "--name", "Quick Plan"]);
  const intake = JSON.parse(run([
    "intake",
    "add",
    "--project",
    project,
    "--type",
    "feature",
    "--title",
    "Add semver boundary",
    "--description",
    "Extend semver behavior and update focused tests. Only the declared files may change.",
    "--area",
    "src/semver.mjs,tests/semver.test.mjs"
  ]).stdout);
  run(["intake", "triage", "--project", project, "--id", intake.id, "--decision", "accepted"]);
  const roadmap = JSON.parse(run([
    "roadmap", "promote", "--project", project, "--intake-id", intake.id
  ]).stdout);
  const deliveryRun = JSON.parse(run([
    "run", "create", "--project", project, "--roadmap-id", roadmap.id
  ]).stdout);
  passNode(project, deliveryRun.run_id, "mandate");
  passNode(project, deliveryRun.run_id, "context");

  const generated = JSON.parse(run([
    "run", "plan", "generate", "--project", project, "--run-id", deliveryRun.run_id
  ]).stdout);
  assert.equal(generated.validation.status, "PASS");
  assert.equal(generated.plan.profile, "quick");
  assert.deepEqual(
    generated.plan.nodes.map((node) => node.id),
    ["delivery-implementation", "delivery-review"]
  );
  const implementation = generated.plan.nodes[0];
  assert.deepEqual(
    implementation.write_scope,
    ["src/semver.mjs", "tests/semver.test.mjs"]
  );
  assert.equal(implementation.execution_hints.estimated_duration_minutes, 8);
  assert.deepEqual(generated.plan.nodes[1].dependencies, ["delivery-implementation"]);
  passNodeWithEvidence(
    project,
    deliveryRun.run_id,
    "plan_graph",
    generated.artifact_id
  );

  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation"
  ]).stdout);
  const route = readJson(join(
    project,
    ".apex-v2",
    "runs",
    deliveryRun.run_id,
    "workers",
    worker.worker_id,
    "execution-route.json"
  ));
  assert.equal(route.method_pack_id, "quick");
  assert.equal(route.budget_status, "within_budget");
  assert.equal(route.cost_budget.max_wall_minutes, 12);
});

test("显式 quick 在 capability 预算不足时自动升级 governed", () => {
  const project = tempProject();
  seedProjectFiles(project);
  run(["init", "--project", project, "--name", "Quick Escalation"]);
  const intake = JSON.parse(run([
    "intake",
    "add",
    "--project",
    project,
    "--type",
    "bug",
    "--title",
    "Fix security credential handling in the current CLI",
    "--description",
    "Diagnose an authentication defect, preserve the public API, and add tests.",
    "--area",
    "src/apex-v2.mjs,tests/apex-v2.test.mjs",
    "--risk",
    "high",
    "--method-pack",
    "quick"
  ]).stdout);
  run([
    "intake",
    "triage",
    "--project",
    project,
    "--id",
    intake.id,
    "--decision",
    "accepted"
  ]);
  const roadmap = JSON.parse(run([
    "roadmap",
    "promote",
    "--project",
    project,
    "--intake-id",
    intake.id
  ]).stdout);
  const deliveryRun = JSON.parse(run([
    "run",
    "create",
    "--project",
    project,
    "--roadmap-id",
    roadmap.id
  ]).stdout);
  passNode(project, deliveryRun.run_id, "mandate");
  passNode(project, deliveryRun.run_id, "context");

  const generated = JSON.parse(run([
    "run",
    "plan",
    "generate",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id
  ]).stdout);
  assert.equal(generated.validation.status, "PASS");
  assert.equal(generated.plan.profile, "full");
  assert.equal(generated.plan.method_pack.id, "governed");
  assert.equal(generated.plan.method_pack.workflow, "governed");
  assert.match(
    generated.plan.method_pack.selection_reason,
    /auto_escalated_from=quick.*context budget exceeded/i
  );
  assert.equal(generated.plan.nodes.length, 7);
  assert.ok(
    generated.plan.nodes.every((node) => node.method_pack_id === "governed")
  );
});

test("governed PlanGraph 用三个 barrier 编排七项职责和模型档位", () => {
  const project = tempProject();
  const { generated } = createRunWithPlanGraph(project);

  assert.equal(generated.plan.execution_model, "barrier-v1");
  assert.deepEqual(
    generated.plan.barriers.map((barrier) => barrier.id),
    ["delivery-plan", "delivery-candidate", "delivery-readiness"]
  );
  assert.deepEqual(
    generated.plan.barriers.map((barrier) => barrier.dependencies),
    [[], ["delivery-plan"], ["delivery-candidate"]]
  );
  const byId = new Map(generated.plan.nodes.map((node) => [node.id, node]));
  for (const id of ["delivery-context", "delivery-risk", "delivery-design"]) {
    assert.equal(byId.get(id).barrier_id, "delivery-plan");
  }
  for (const id of [
    "delivery-implementation",
    "delivery-tests",
    "delivery-verification"
  ]) {
    assert.equal(byId.get(id).barrier_id, "delivery-candidate");
  }
  assert.equal(byId.get("delivery-review").barrier_id, "delivery-readiness");
  assert.equal(byId.get("delivery-context").model_tier, "cheap");
  assert.equal(byId.get("delivery-risk").model_tier, "cheap");
  assert.equal(byId.get("delivery-design").model_tier, "standard");
  assert.equal(byId.get("delivery-implementation").model_tier, "standard");
  assert.equal(byId.get("delivery-tests").model_tier, "cheap");
  assert.equal(byId.get("delivery-verification").model_tier, "deterministic");
  assert.equal(byId.get("delivery-review").model_tier, "strong");
  assert.equal(byId.get("delivery-context").delegation.default, true);
  assert.equal(byId.get("delivery-risk").delegation.parallel, true);
  assert.equal(byId.get("delivery-design").delegation.default, false);
  assert.equal(byId.get("delivery-design").delegation.main_agent_required, true);
  assert.equal(byId.get("delivery-review").delegation.default, false);
  assert.equal(byId.get("delivery-review").delegation.main_agent_required, true);
});

test("显式 phase-context Method Pack 生成五节点阶段上下文路线", () => {
  const project = tempProject();
  seedProjectFiles(project);
  run(["init", "--project", project, "--name", "Phase Context Plan"]);
  const intake = JSON.parse(run([
    "intake",
    "add",
    "--project",
    project,
    "--title",
    "Implement milestone phase",
    "--area",
    "src/apex-v2.mjs,tests/apex-v2.test.mjs",
    "--method-pack",
    "phase-context"
  ]).stdout);
  run(["intake", "triage", "--project", project, "--id", intake.id, "--decision", "accepted"]);
  const roadmap = JSON.parse(run([
    "roadmap", "promote", "--project", project, "--intake-id", intake.id
  ]).stdout);
  const deliveryRun = JSON.parse(run([
    "run", "create", "--project", project, "--roadmap-id", roadmap.id
  ]).stdout);
  passNode(project, deliveryRun.run_id, "mandate");
  passNode(project, deliveryRun.run_id, "context");

  const generated = JSON.parse(run([
    "run", "plan", "generate", "--project", project, "--run-id", deliveryRun.run_id
  ]).stdout);
  assert.equal(generated.plan.method_pack.id, "phase-context");
  assert.equal(generated.plan.method_pack.workflow, "phase_context");
  assert.deepEqual(generated.plan.nodes.map((node) => node.id), [
    "delivery-context",
    "delivery-design",
    "delivery-implementation",
    "delivery-verification",
    "delivery-review"
  ]);
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
  assert.match(initialized.worker.sandbox.checkout_claim_token, /^[a-f0-9-]{36}$/);

  const sandboxAbs = join(project, initialized.worker.sandbox.path);
  assert.ok(existsSync(join(sandboxAbs, ".git")));
  assert.ok(existsSync(join(sandboxAbs, "package.json")));
  assert.equal(
    readCheckoutClaim(sandboxAbs).owner.worker_id,
    initialized.worker.worker_id
  );

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

test("shell 仅执行 deterministic worker，human decision 保持可追踪", () => {
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

  const rejected = run([
    "worker",
    "exec-shell",
    "--project",
    project,
    "--worker-id",
    worker.worker_id,
    "--cmd",
    "node --version"
  ], { expectFailure: true });
  assert.match(rejected.stderr, /只允许 deterministic_check/);

  const shellWorker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    project,
    "--run-id",
    deliveryRun.run_id,
    "--plan-node-id",
    "delivery-verification"
  ]).stdout);
  const shell = JSON.parse(run([
    "worker",
    "exec-shell",
    "--project",
    project,
    "--worker-id",
    shellWorker.worker_id,
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

  const failureProject = tempProject();
  const { deliveryRun: failureRun } = createRunWithPlanGraph(failureProject);
  const failureWorker = JSON.parse(run([
    "worker",
    "create",
    "--project",
    failureProject,
    "--run-id",
    failureRun.run_id,
    "--plan-node-id",
    "delivery-verification"
  ]).stdout);
  const failed = JSON.parse(run([
    "worker",
    "exec-shell",
    "--project",
    failureProject,
    "--worker-id",
    failureWorker.worker_id,
    "--cmd",
    "node -e \"process.exit(7)\""
  ]).stdout);
  assert.equal(failed.result.status, "FAIL");

  const workers = JSON.parse(run([
    "worker", "list", "--project", failureProject, "--run-id", failureRun.run_id
  ]).stdout);
  assert.equal(workers.find((item) => item.worker_id === failureWorker.worker_id).status, "blocked");
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
  assert.equal(worker.initial_model_tier, "standard");
  assert.equal(worker.model_tier, "standard");
  assert.equal(worker.model_id, "gpt-5.6-terra");
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
  assert.equal(executed.result.model_tier, "standard");
  assert.equal(executed.result.requested_model, "gpt-5.6-terra");
  assert.equal(executed.patch.changed_files.length, 1);
  assert.equal(executed.patch.changed_files[0], "src/apex-v2.mjs");
  assert.equal(executed.patch.operations[0].op, "replace_text");
  assert.equal(readFileSync(join(project, "src", "apex-v2.mjs"), "utf8"), "console.log('cli');\n");

  const root = join(project, ".apex-v2");
  const workerState = readJson(join(root, "runs", deliveryRun.run_id, "workers", worker.worker_id, "worker.json"));
  assert.equal(workerState.status, "patch_submitted");
  assert.equal(workerState.last_adapter, "codex");
  assert.equal(workerState.model_tier, "standard");
  assert.equal(workerState.model_id, "gpt-5.6-terra");
  const route = readJson(join(
    root,
    "runs",
    deliveryRun.run_id,
    "workers",
    worker.worker_id,
    "execution-route.json"
  ));
  assert.equal(route.model_tier, "standard");
  assert.equal(route.model_id, "gpt-5.6-terra");
  const summary = JSON.parse(run([
    "worker", "results", "--project", project,
    "--worker-id", worker.worker_id
  ]).stdout);
  assert.equal(summary.final_model_tier, "standard");
  assert.equal(summary.final_model_id, "gpt-5.6-terra");
  assert.deepEqual(summary.models, ["gpt-5.6-terra"]);
  assert.ok(existsSync(join(root, "runs", deliveryRun.run_id, "workers", worker.worker_id, "agent-prompt.md")));
  assert.ok(existsSync(join(root, "runs", deliveryRun.run_id, "workers", worker.worker_id, "agent-result.json")));
});

test("worker exec-agent 拒绝用 CLI model 降低节点最低档位", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const fakeCodex = createFakeCodex(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation"
  ]).stdout);
  run([
    "worker", "sandbox", "init", "--project", project,
    "--worker-id", worker.worker_id, "--type", "scratch"
  ]);

  const rejected = run([
    "worker", "exec-agent", "--project", project,
    "--worker-id", worker.worker_id,
    "--adapter", "codex",
    "--command", fakeCodex,
    "--model", "gpt-5.6-luna",
    "--timeout-ms", "10000"
  ], { expectFailure: true });

  assert.match(rejected.stderr, /不能降低节点最低模型档位/);
});

test("worker contract_error 首次同档重试，第二次失败后晋级 strong", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const invalid = createFakeCodex(project, { invalidResult: true });
  const completed = createFakeCodex(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation"
  ]).stdout);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    run([
      "worker", "sandbox", "init", "--project", project,
      "--worker-id", worker.worker_id, "--type", "scratch"
    ]);
    const failed = JSON.parse(run([
      "worker", "exec-agent", "--project", project,
      "--worker-id", worker.worker_id,
      "--adapter", "codex", "--command", invalid,
      "--timeout-ms", "10000"
    ]).stdout);
    assert.equal(failed.result.failure_kind, "contract_error");
    assert.equal(failed.result.model_tier, "standard");
    run([
      "worker", "retry", "--project", project,
      "--worker-id", worker.worker_id
    ]);
  }

  run([
    "worker", "sandbox", "init", "--project", project,
    "--worker-id", worker.worker_id, "--type", "scratch"
  ]);
  const succeeded = JSON.parse(run([
    "worker", "exec-agent", "--project", project,
    "--worker-id", worker.worker_id,
    "--adapter", "codex", "--command", completed,
    "--timeout-ms", "10000"
  ]).stdout);

  assert.equal(succeeded.result.status, "PASS");
  assert.equal(succeeded.result.model_tier, "strong");
  assert.equal(succeeded.result.requested_model, "gpt-5.6-sol");
});

test("worker no_patch 可重试并在下一次执行晋级一档", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const noPatch = createFakeCodex(project, { noPatch: true });
  const completed = createFakeCodex(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation"
  ]).stdout);
  run([
    "worker", "sandbox", "init", "--project", project,
    "--worker-id", worker.worker_id, "--type", "scratch"
  ]);
  const failed = JSON.parse(run([
    "worker", "exec-agent", "--project", project,
    "--worker-id", worker.worker_id,
    "--adapter", "codex", "--command", noPatch,
    "--timeout-ms", "10000"
  ]).stdout);
  assert.equal(failed.result.failure_kind, "no_patch");
  assert.equal(failed.result.model_tier, "standard");

  const retried = JSON.parse(run([
    "worker", "retry", "--project", project,
    "--worker-id", worker.worker_id
  ]).stdout);
  assert.equal(retried.worker.status, "active");
  run([
    "worker", "sandbox", "init", "--project", project,
    "--worker-id", worker.worker_id, "--type", "scratch"
  ]);
  const succeeded = JSON.parse(run([
    "worker", "exec-agent", "--project", project,
    "--worker-id", worker.worker_id,
    "--adapter", "codex", "--command", completed,
    "--timeout-ms", "10000"
  ]).stdout);
  assert.equal(succeeded.result.model_tier, "strong");
  assert.equal(succeeded.result.requested_model, "gpt-5.6-sol");
});

test("Worker capability shadow 模式注入 protocol 且缺失 evidence 可审计但不阻塞", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation"
  ]).stdout);
  assert.equal(worker.capability_enforcement, "shadow");
  assert.ok(
    worker.capability_bindings.some((item) =>
      item.capability_id === "tdd-negative-control"
    )
  );
  const fakeCodex = createCapabilityFakeCodex(project, {
    expectedPrompt: [
      "## Internal Capability Protocols",
      "### tdd-negative-control@1.0.0",
      "# TDD And Negative Control",
      "Required output: negative-control-evidence",
      "Typed input: negative-control-request",
      "## Capability Invocation Refs"
    ]
  });
  run([
    "worker", "sandbox", "init", "--project", project,
    "--worker-id", worker.worker_id, "--type", "scratch"
  ]);

  const executed = JSON.parse(run([
    "worker", "exec-agent", "--project", project, "--worker-id", worker.worker_id,
    "--adapter", "codex", "--command", fakeCodex, "--timeout-ms", "10000"
  ]).stdout);
  assert.equal(executed.result.status, "PASS");
  assert.deepEqual(executed.result.capability_evidence_status, {
    enforcement: "shadow",
    submitted: [],
    missing: ["tdd-negative-control"],
    error: ""
  });
  assert.ok(executed.patch);

  const dir = join(
    project,
    ".apex-v2",
    "runs",
    deliveryRun.run_id,
    "workers",
    worker.worker_id
  );
  assert.match(
    readFileSync(join(dir, "agent-prompt.md"), "utf8"),
    /# TDD And Negative Control/
  );
  assert.equal(readJson(join(dir, "worker.json")).status, "patch_submitted");
  assert.equal(
    existsSync(join(dir, "capability-evidence-tdd-negative-control.json")),
    false
  );
  const adapterResult = readJson(join(
    dir,
    readdirSync(dir).find((file) => file.startsWith("adapter-result-"))
  ));
  assert.deepEqual(
    adapterResult.capability_evidence_status,
    executed.result.capability_evidence_status
  );
});

test("Worker capability enforce 模式缺失 evidence fail closed，重试提交完整 evidence 可通过", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  setPlanCapabilityEnforcement(project, deliveryRun.run_id, "enforce");
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation"
  ]).stdout);
  assert.equal(worker.capability_enforcement, "enforce");
  const missingFake = createCapabilityFakeCodex(project, {
    expectedPrompt: ["### tdd-negative-control@1.0.0"]
  });
  const capabilityEvidence = capabilityEvidenceForWorker(
    worker,
    "tdd-negative-control"
  );
  const completeFake = createCapabilityFakeCodex(project, {
    evidence: [capabilityEvidence],
    expectedPrompt: [
      "### tdd-negative-control@1.0.0",
      "Required output: negative-control-evidence"
    ]
  });
  run([
    "worker", "sandbox", "init", "--project", project,
    "--worker-id", worker.worker_id, "--type", "scratch"
  ]);
  const missing = JSON.parse(run([
    "worker", "exec-agent", "--project", project, "--worker-id", worker.worker_id,
    "--adapter", "codex", "--command", missingFake, "--timeout-ms", "10000"
  ]).stdout);
  assert.equal(missing.result.status, "FAIL");
  assert.equal(missing.result.failure_kind, "contract_error");
  assert.equal(missing.patch, null);
  assert.equal(missing.result.capability_evidence_status.enforcement, "enforce");
  assert.match(
    missing.result.capability_evidence_status.error,
    /缺少 required capability evidence：tdd-negative-control/
  );

  const dir = join(
    project,
    ".apex-v2",
    "runs",
    deliveryRun.run_id,
    "workers",
    worker.worker_id
  );
  assert.equal(readJson(join(dir, "worker.json")).status, "blocked");
  assert.equal(
    existsSync(join(dir, "capability-evidence-tdd-negative-control.json")),
    false
  );

  const retried = JSON.parse(run([
    "worker", "retry", "--project", project, "--worker-id", worker.worker_id
  ]).stdout);
  assert.equal(retried.worker.status, "active");
  run([
    "worker", "sandbox", "init", "--project", project,
    "--worker-id", worker.worker_id, "--type", "scratch"
  ]);
  const completed = JSON.parse(run([
    "worker", "exec-agent", "--project", project,
    "--worker-id", worker.worker_id,
    "--adapter", "codex", "--command", completeFake, "--timeout-ms", "10000"
  ]).stdout);
  assert.equal(completed.result.status, "PASS");
  assert.deepEqual(completed.result.capability_evidence_status, {
    enforcement: "enforce",
    submitted: ["tdd-negative-control"],
    missing: [],
    error: ""
  });
  assert.ok(completed.patch);
  const evidenceRef = `${worker.namespace}/capability-evidence-tdd-negative-control.json`;
  assert.ok(completed.result.refs.includes(evidenceRef));
  assert.deepEqual(
    readJson(join(dir, "capability-evidence-tdd-negative-control.json")),
    capabilityEvidence
  );
  assert.equal(readJson(join(dir, "worker.json")).status, "patch_submitted");
});

test("worker execution commit failpoint 回滚 authority 并可重试", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const fakeCodex = createFakeCodex(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation"
  ]).stdout);
  run([
    "worker", "sandbox", "init", "--project", project, "--worker-id", worker.worker_id,
    "--type", "scratch"
  ]);
  const args = [
    "worker", "exec-agent", "--project", project, "--worker-id", worker.worker_id,
    "--adapter", "codex", "--command", fakeCodex, "--timeout-ms", "10000"
  ];
  const failed = run(args, {
    expectFailure: true,
    env: { ...process.env, APEX_V2_TRANSACTION_FAILPOINT: "worker-execution-commit" }
  });
  assert.match(failed.stderr, /transaction failpoint/);
  const dir = join(
    project,
    ".apex-v2",
    "runs",
    deliveryRun.run_id,
    "workers",
    worker.worker_id
  );
  assert.equal(readJson(join(dir, "worker.json")).status, "active");
  assert.equal(existsSync(join(dir, "patch-bundle.json")), false);
  assert.equal(readdirSync(dir).some((file) => file.startsWith("adapter-result-")), false);

  const retried = JSON.parse(run(args).stdout);
  assert.equal(retried.result.status, "PASS");
  assert.equal(retried.patch.changed_files[0], "src/apex-v2.mjs");
  assert.equal(readJson(join(dir, "worker.json")).status, "patch_submitted");
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
    "--agent-limit", "1", "--agent-cycles", "1", "--agent-sandbox", "scratch",
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

test("invalid Agent output 保留为非权威 evidence 且 strict contracts 继续通过", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const fakeCodex = createFakeCodex(project, { invalidResult: true });
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation"
  ]).stdout);
  run([
    "worker", "sandbox", "init", "--project", project, "--worker-id", worker.worker_id,
    "--type", "scratch"
  ]);

  const executed = JSON.parse(run([
    "worker", "exec-agent", "--project", project, "--worker-id", worker.worker_id,
    "--adapter", "codex", "--command", fakeCodex, "--timeout-ms", "10000"
  ]).stdout);
  assert.equal(executed.result.status, "FAIL");
  assert.equal(executed.result.failure_kind, "contract_error");
  const dir = join(
    project,
    ".apex-v2",
    "runs",
    deliveryRun.run_id,
    "workers",
    worker.worker_id
  );
  assert.equal(existsSync(join(dir, "agent-result.json")), false);
  assert.equal(existsSync(join(dir, "agent-output-invalid.txt")), true);
  const contracts = JSON.parse(run(["contracts", "validate", "--project", project]).stdout);
  assert.equal(contracts.status, "PASS");
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
  const fakeClaude = createFakeClaudeWorker(project);
  const tick = JSON.parse(run([
    "project", "tick", "--project", project, "--run-agents",
    "--agent-cycles", "1",
    "--agent-command", fakeClaude, "--agent-timeout-ms", "10000"
  ]).stdout);
  assert.equal(tick.agent_runs.length, 1);
  assert.equal(tick.agent_runs[0].status, "PASS");
  assert.ok(tick.agent_runs[0].patch_id);
  const summary = JSON.parse(run([
    "worker", "results", "--project", project, "--worker-id", worker.worker_id, "--record"
  ]).stdout);
  assert.equal(summary.verdict, "pass");
  assert.deepEqual(summary.adapters, ["codex", "claude"]);
  assert.equal(summary.attempts.length, 2);
  assert.deepEqual(summary.failures, ["execution_error"]);
  assert.ok(existsSync(join(project, ".apex-v2", "runs", deliveryRun.run_id, "workers", worker.worker_id, "worker-summary.json")));
});

test("worker retry 遵守 adapter 最大尝试次数并重置 sandbox", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-verification"
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
    "--plan-node-id", "delivery-verification"
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

test("merge enqueue transaction failpoint 回滚 queue 和 worker 后可重试", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation"
  ]).stdout);
  const patch = JSON.parse(run([
    "worker", "submit-patch", "--project", project, "--worker-id", worker.worker_id,
    "--summary", "enqueue failpoint", "--files", "src/apex-v2.mjs",
    "--replace-file", "src/apex-v2.mjs",
    "--old-text", "console.log('cli');",
    "--new-text", "console.log('queued');"
  ]).stdout);
  const args = [
    "merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id,
    "--patch-id", patch.patch.patch_id
  ];
  const failed = run(args, {
    expectFailure: true,
    env: { ...process.env, APEX_V2_TRANSACTION_FAILPOINT: "merge-enqueue" }
  });
  assert.match(failed.stderr, /transaction failpoint/);
  const root = join(project, ".apex-v2");
  const queuePath = join(root, "runs", deliveryRun.run_id, "merge-queue.json");
  assert.equal(existsSync(queuePath), false);
  assert.equal(readJson(join(
    root,
    "runs",
    deliveryRun.run_id,
    "workers",
    worker.worker_id,
    "worker.json"
  )).status, "patch_submitted");

  const queued = JSON.parse(run(args).stdout);
  assert.equal(queued.items.length, 1);
  assert.equal(queued.items[0].status, "queued");
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

test("staged verification preserves Git semantics and linked dependencies", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithQueuedPatches(project);
  const dependencies = mkdtempSync(join(tmpdir(), "apex-v2-verification-deps-"));
  mkdirSync(join(dependencies, "fixture-package"), { recursive: true });
  writeFileSync(
    join(dependencies, "fixture-package", "package.json"),
    `${JSON.stringify({ name: "fixture-package", version: "1.0.0" })}\n`
  );
  symlinkSync(dependencies, join(project, "node_modules"), "dir");
  const planPath = join(
    project,
    ".apex-v2",
    "runs",
    deliveryRun.run_id,
    "plan-graph.json"
  );
  const plan = readJson(planPath);
  plan.verification_policy.required_commands = [
    "git rev-parse --is-inside-work-tree",
    "node -e \"require.resolve('fixture-package/package.json')\"",
    "node -e \"require('node:fs').mkdirSync('node_modules/.vite-temp', { recursive: true }); require('node:fs').writeFileSync('node_modules/.vite-temp/cache.mjs', 'ok')\"",
    "node -e \"if (!process.env.HOME.includes('apex-v2-verify-') || !process.env.TMPDIR.includes('apex-v2-verify-')) process.exit(1)\""
  ];
  plan.verification_policy.schema_check = "";
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  const projectTmp = join(project, ".apex-v2", "tmp");
  mkdirSync(projectTmp, { recursive: true });

  const verified = JSON.parse(run([
    "verify", "run", "--project", project, "--run-id", deliveryRun.run_id
  ], {
    env: {
      ...process.env,
      TMPDIR: projectTmp
    }
  }).stdout);
  assert.equal(verified.report.status, "PASS");
  assert.equal(verified.report.workspace.preparation_error, "");
  assert.ok(verified.report.checks.every((check) => check.status === "PASS"));
  assert.equal(existsSync(join(dependencies, ".vite-temp")), false);
});

test("staged verification reaps escaped daemons and fails closed", async () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithQueuedPatches(project);
  const daemonPidPath = join(project, ".apex-v2", "tmp", "verification-daemon.pid");
  mkdirSync(join(project, ".apex-v2", "tmp"), { recursive: true });
  const planPath = join(
    project,
    ".apex-v2",
    "runs",
    deliveryRun.run_id,
    "plan-graph.json"
  );
  const plan = readJson(planPath);
  plan.verification_policy.required_commands = [
    "node -e \"const {spawn}=require('node:child_process'); const fs=require('node:fs'); const child=spawn(process.execPath,['-e','setInterval(() => {}, 1000)'],{detached:true,stdio:'ignore'}); child.unref(); fs.writeFileSync(process.env.APEX_TEST_DAEMON_PID_PATH,String(child.pid))\""
  ];
  plan.verification_policy.schema_check = "";
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);

  let daemonPid = null;
  try {
    const verified = JSON.parse(run([
      "verify", "run", "--project", project, "--run-id", deliveryRun.run_id
    ], {
      env: {
        ...process.env,
        APEX_TEST_DAEMON_PID_PATH: daemonPidPath
      }
    }).stdout);
    assert.equal(verified.report.status, "FAIL");
    assert.ok(verified.report.checks.some((check) =>
      check.status === "FAIL"
      && /orphan workspace processes reaped/i.test(check.stderr_tail)
    ));
    daemonPid = Number(readFileSync(daemonPidPath, "utf8"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.throws(() => process.kill(daemonPid, 0), /ESRCH/);
  } finally {
    if (daemonPid) {
      try {
        process.kill(-daemonPid, "SIGKILL");
      } catch {}
      try {
        process.kill(daemonPid, "SIGKILL");
      } catch {}
    }
  }
});

test("verification commit failpoint 不留下半完成 authority 并可重试", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithQueuedPatches(project);
  const args = ["verify", "run", "--project", project, "--run-id", deliveryRun.run_id];
  const failed = run(args, {
    expectFailure: true,
    env: { ...process.env, APEX_V2_TRANSACTION_FAILPOINT: "verification-commit" }
  });
  assert.match(failed.stderr, /transaction failpoint/);
  const runDir = join(project, ".apex-v2", "runs", deliveryRun.run_id);
  assert.equal(existsSync(join(runDir, "verification-report.json")), false);
  assert.equal(existsSync(join(runDir, "candidates")), false);

  const verified = JSON.parse(run(args).stdout);
  assert.equal(verified.report.status, "PASS");
  assert.equal(existsSync(join(runDir, "verification-report.json")), true);
  assert.equal(readdirSync(join(runDir, "candidates")).length, 1);
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
  assert.match(verified.report.candidate_digest, /^[a-f0-9]{64}$/);
  assert.equal(review.report.candidate_digest, verified.report.candidate_digest);
  assert.ok(JSON.parse(run(["risk", "list", "--project", project, "--status", "mitigated"]).stdout).some((risk) => risk.source === "review"));
  passNodeWithEvidence(project, deliveryRun.run_id, "review", review.artifact_id);
});

test("patch 内容在 verification 后变化会使 review BLOCKED", () => {
  const project = tempProject();
  const { deliveryRun, workerA, patchA } = createRunWithQueuedPatches(project);
  const verified = JSON.parse(run(["verify", "run", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "verify", verified.artifact_id);

  const patchPath = join(
    project,
    ".apex-v2",
    "runs",
    deliveryRun.run_id,
    "workers",
    workerA.worker_id,
    "patches",
    patchA.patch.patch_id,
    "patch-bundle.json"
  );
  const patch = readJson(patchPath);
  patch.operations[0].new_text = "console.log('mutated after verification');";
  writeFileSync(patchPath, `${JSON.stringify(patch, null, 2)}\n`);

  const review = JSON.parse(run(["review", "generate", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.equal(review.report.status, "BLOCKED");
  assert.ok(review.report.blocking_findings.some((finding) => finding.includes("当前 candidate")));
  assert.notEqual(review.report.candidate_digest, verified.report.candidate_digest);
});

test("review 后 source drift 会使 merge 拒绝旧 candidate", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithQueuedPatches(project);
  const verified = JSON.parse(run(["verify", "run", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "verify", verified.artifact_id);
  const review = JSON.parse(run(["review", "generate", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "review", review.artifact_id);
  writeProjectFile(project, "README.md", "concurrent source drift\n");

  const blocked = run(["merge", "apply", "--project", project, "--run-id", deliveryRun.run_id], {
    expectFailure: true
  });
  assert.match(blocked.stderr, /当前 candidate/);
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
  assert.equal(applied.report.candidate_digest, verified.report.candidate_digest);
  assert.deepEqual(applied.report.merged_patches.sort(), [patchA.patch.patch_id, patchB.patch.patch_id].sort());
  assert.match(applied.artifact_id, /^artifact-/);

  const root = join(project, ".apex-v2");
  const queue = readJson(join(root, "runs", deliveryRun.run_id, "merge-queue.json"));
  assert.ok(queue.items.every((item) => item.status === "merged"));
  const queueAfterStatus = JSON.parse(run(["merge", "status", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.ok(queueAfterStatus.items.every((item) => item.status === "merged"));

  const workers = JSON.parse(run(["worker", "list", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  assert.ok(workers.every((worker) => worker.status === "merged"));

  const frozenVerification = run([
    "verify", "run", "--project", project, "--run-id", deliveryRun.run_id
  ], { expectFailure: true });
  assert.match(frozenVerification.stderr, /verification 已冻结/);
  assert.equal(
    readJson(join(root, "runs", deliveryRun.run_id, "verification-report.json")).candidate_digest,
    verified.report.candidate_digest
  );

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
  assert.equal(approvals[0].candidate_digest, verified.report.candidate_digest);

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

test("merge transaction failpoint 同时回滚源码和 merge queue", () => {
  const project = tempProject();
  seedProjectFiles(project);
  const { deliveryRun, patchA } = createRunWithQueuedPatches(project);
  const verified = JSON.parse(run(["verify", "run", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "verify", verified.artifact_id);
  const review = JSON.parse(run(["review", "generate", "--project", project, "--run-id", deliveryRun.run_id]).stdout);
  passNodeWithEvidence(project, deliveryRun.run_id, "review", review.artifact_id);
  const before = readFileSync(join(project, "src", "apex-v2.mjs"), "utf8");

  const failed = run(["merge", "apply", "--project", project, "--run-id", deliveryRun.run_id], {
    env: { ...process.env, APEX_V2_TRANSACTION_FAILPOINT: "merge-apply" },
    expectFailure: true
  });
  assert.match(failed.stderr, /transaction failpoint/);
  assert.equal(readFileSync(join(project, "src", "apex-v2.mjs"), "utf8"), before);
  const queue = readJson(join(project, ".apex-v2", "runs", deliveryRun.run_id, "merge-queue.json"));
  assert.ok(queue.items.every((item) => item.status === "queued"));
  assert.equal(
    readJson(join(project, ".apex-v2", "runs", deliveryRun.run_id, "workers", patchA.patch.worker_id, "patch-bundle.json")).status,
    "submitted"
  );
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

test("同一 worker 重提 patch 保留不可变历史且 merge queue 可 reconcile", () => {
  const project = tempProject();
  const { deliveryRun } = createRunWithPlanGraph(project);
  writeProjectFile(project, "src/apex-v2.mjs", "const alpha = 1;\n");
  const worker = JSON.parse(run([
    "worker", "create", "--project", project, "--run-id", deliveryRun.run_id,
    "--plan-node-id", "delivery-implementation"
  ]).stdout);
  const first = JSON.parse(run([
    "worker", "submit-patch", "--project", project, "--worker-id", worker.worker_id,
    "--summary", "first alpha patch", "--files", "src/apex-v2.mjs",
    "--replace-file", "src/apex-v2.mjs", "--old-text", "const alpha = 1;", "--new-text", "const alpha = 10;"
  ]).stdout);
  run([
    "merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id,
    "--patch-id", first.patch.patch_id
  ]);
  const second = JSON.parse(run([
    "worker", "submit-patch", "--project", project, "--worker-id", worker.worker_id,
    "--summary", "second alpha patch", "--files", "src/apex-v2.mjs",
    "--replace-file", "src/apex-v2.mjs", "--old-text", "const alpha = 1;", "--new-text", "const alpha = 11;"
  ]).stdout);
  const conflictQueue = JSON.parse(run([
    "merge", "enqueue", "--project", project, "--run-id", deliveryRun.run_id,
    "--patch-id", second.patch.patch_id
  ]).stdout);
  assert.equal(conflictQueue.conflicts.length, 1);

  const workerRoot = join(
    project,
    ".apex-v2",
    "runs",
    deliveryRun.run_id,
    "workers",
    worker.worker_id
  );
  for (const patch of [first.patch, second.patch]) {
    const immutablePath = join(
      workerRoot,
      "patches",
      patch.patch_id,
      "patch-bundle.json"
    );
    assert.equal(readJson(immutablePath).patch_id, patch.patch_id);
  }

  const reconciled = JSON.parse(run([
    "project", "reconcile", "--project", project, "--dry-run"
  ]).stdout);
  assert.equal(reconciled.status, "CONSISTENT", JSON.stringify(reconciled.inspection?.issues));

  const resolved = JSON.parse(run([
    "merge", "resolve", "--project", project, "--run-id", deliveryRun.run_id,
    "--keep-patch-id", second.patch.patch_id,
    "--reason", "保留第二版 patch"
  ]).stdout);
  assert.equal(resolved.queue.conflicts.length, 0);
  assert.deepEqual(resolved.resolution.dropped_patch_ids, [first.patch.patch_id]);
  assert.equal(readJson(join(
    workerRoot,
    "patches",
    first.patch.patch_id,
    "patch-bundle.json"
  )).status, "dropped");
  const reconciledAfterResolve = JSON.parse(run([
    "project", "reconcile", "--project", project, "--dry-run"
  ]).stdout);
  assert.equal(
    reconciledAfterResolve.status,
    "CONSISTENT",
    JSON.stringify(reconciledAfterResolve.inspection?.issues)
  );
});

test("staged verification 拒绝 replace_text old_text 非唯一匹配", () => {
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
  assert.equal(verified.report.status, "FAIL");
  assert.match(verified.report.workspace.preparation_error, /唯一匹配/);
  assert.equal(
    verified.report.checks.find((check) => check.id === "patch-materialization").status,
    "FAIL"
  );
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
  const replayed = JSON.parse(run([
    "learn", "apply", "--project", project, "--id", approved.id
  ]).stdout);
  assert.equal(replayed.apply_receipt_id, applied.apply_receipt_id);

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

test("project reconcile 迁移历史 handled carry 时保持已完成 run 关闭", () => {
  const project = tempProject();
  seedProjectFiles(project);
  const { roadmapNode, deliveryRun } = createAcceptedRun(project);
  run(["run", "node", "start", "--project", project, "--run-id", deliveryRun.run_id, "--node-id", "mandate"]);
  const mandateArtifact = JSON.parse(run([
    "artifact", "submit", "--project", project, "--run-id", deliveryRun.run_id,
    "--node-id", "mandate", "--type", "evidence", "--title", "historical partial mandate"
  ]).stdout);
  const partial = JSON.parse(run([
    "run", "node", "complete", "--project", project, "--run-id", deliveryRun.run_id,
    "--node-id", "mandate", "--gate", "PARTIAL_PASS",
    "--evidence", mandateArtifact.artifact_id,
    "--carry-forward", "预算 policy 进入下一波工作",
    "--carry-severity", "low",
    "--carry-target", "learn",
    "--reason", "当前交付可关闭，但预算 policy 后续补齐"
  ]).stdout);
  for (const nodeId of ["context", "plan_graph", "execute", "verify", "review", "integrate", "learn"]) {
    passNode(project, deliveryRun.run_id, nodeId);
  }
  run([
    "run", "carry", "resolve", "--project", project, "--run-id", deliveryRun.run_id,
    "--id", partial.carry_forward[0].id, "--evidence", mandateArtifact.artifact_id,
    "--reason", "已接受进入下一波预算 policy 工作"
  ]);

  const root = join(project, ".apex-v2");
  const runPath = join(root, "runs", deliveryRun.run_id, "run.json");
  const historicalRun = readJson(runPath);
  const mandate = historicalRun.nodes.find((node) => node.id === "mandate");
  mandate.status = "partial_pass";
  mandate.gate = {
    status: "PARTIAL_PASS",
    reason: "历史版本在 carry 已处理后未提升源节点",
    blocking: [],
    carry_forward_ids: [historicalRun.carry_forward[0].id]
  };
  historicalRun.status = "done";
  historicalRun.gate = {
    status: "PARTIAL_PASS",
    reason: "历史版本允许 handled carry 的 partial node 直接关闭",
    blocking: [],
    carry_forward_ids: [historicalRun.carry_forward[0].id]
  };
  writeFileSync(runPath, `${JSON.stringify(historicalRun, null, 2)}\n`);

  const dryRun = JSON.parse(run([
    "project", "reconcile", "--project", project, "--dry-run"
  ]).stdout);
  assert.equal(dryRun.status, "DRIFT");
  assert.deepEqual(dryRun.inspection.derived.active_runs, []);
  assert.ok(dryRun.inspection.changes.some((change) =>
    change.field === "nodes.mandate.status"
    && change.actual === "partial_pass"
    && change.expected === "passed"
  ));
  assert.equal(dryRun.inspection.changes.some((change) => change.field === "active_runs"), false);
  assert.equal(dryRun.inspection.changes.some((change) =>
    change.path.endsWith(`/runs/${deliveryRun.run_id}/run.json`)
    && change.field === "status"
  ), false);
  assert.equal(dryRun.inspection.changes.some((change) =>
    change.field === `nodes.${roadmapNode.id}.status`
  ), false);

  const repaired = JSON.parse(run([
    "project", "reconcile", "--project", project, "--apply"
  ]).stdout);
  assert.equal(repaired.status, "REPAIRED");
  assert.equal(repaired.post_check.status, "CONSISTENT");
  const migratedRun = readJson(runPath);
  assert.equal(migratedRun.status, "done");
  assert.equal(migratedRun.gate.status, "PASS");
  assert.equal(migratedRun.nodes.find((node) => node.id === "mandate").status, "passed");
  assert.deepEqual(readJson(join(root, "project.json")).active_runs, []);
  assert.equal(
    readJson(join(root, "roadmap", "graph.json")).nodes.find((node) => node.id === roadmapNode.id).status,
    "done"
  );
  assert.equal(
    repaired.post_check.event_replay.operational_state_hash,
    repaired.post_check.operational_state.state_hash
  );
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
