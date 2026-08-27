import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import {
  assertQuickCloseoutLanded,
  bootstrapCliBenchmarkProject,
  bootstrapPluginBenchmarkProject,
  closePluginBenchmarkProject,
  resolvePluginBenchmarkBootstrap
} from "../src/benchmark/plugin-bootstrap.mjs";
import test from "node:test";
import {
  assertBenchmarkControllerIdentity,
  claimBenchmarkRun,
  createBenchmarkControllerState,
  finishBenchmarkRun,
  loadBenchmarkControllerState,
  prepareBenchmarkWorkspace,
  recoverBenchmarkControllerState,
  resolveBenchmarkLeaseMs,
  saveBenchmarkControllerState,
  shouldRetryBenchmarkValidation
} from "../src/benchmark/controller-state.mjs";
import { claimNextBenchmarkRunLocked } from "../src/benchmark/controller-coordinator.mjs";

const MODES = ["v1-skill", "cli-kernel", "plugin-kernel"];
const SCENARIOS = [
  "simple",
  "multi-step",
  "bug-fix",
  "interrupted",
  "review-defect",
  "parallel"
];

test("controller creates exactly 90 candidate-bound runs", () => {
  const state = createState();
  assert.equal(state.runs.length, 90);
  assert.deepEqual([...new Set(state.runs.map((run) => run.mode))], MODES);
  assert.ok(state.runs.every((run) => run.official_attempt === 1));
  assert.ok(state.runs.every((run) => run.release_candidate_digest == null));
});

test("controller supports an isolated subset without weakening the default matrix", () => {
  const full = createState();
  const subset = createBenchmarkControllerState({
    candidateManifest: {
      release_candidate_digest: "a".repeat(64)
    },
    taskValidation: {
      task_set_digest: "c".repeat(64),
      tasks: full.runs.filter((run) =>
        run.mode === "v1-skill"
      ).slice(0, 3).map((run) => ({
        task_id: run.task_id,
        task_digest: run.task_digest,
        repository: run.repository,
        scenario: run.scenario
      }))
    },
    workspaceRoot: "/tmp/apex-benchmark-subset/runs",
    baseFingerprint: "e".repeat(64),
    modes: ["raw-agent", "v1-skill", "plugin-kernel"],
    now: "2026-08-27T00:00:00.000Z"
  });
  assert.equal(subset.runs.length, 9);
  assert.equal(new Set(subset.runs.map((run) => run.task_id)).size, 3);
});

test("controller rejects candidate or task-set reuse under the same run root", () => {
  const state = createState();
  assert.throws(() => assertBenchmarkControllerIdentity(state, {
    candidateDigest: "c".repeat(64),
    taskSetDigest: state.task_set_digest
  }), /candidate differs/);
  assert.throws(() => assertBenchmarkControllerIdentity(state, {
    candidateDigest: state.release_candidate_digest,
    taskSetDigest: "d".repeat(64)
  }), /task set differs/);
  assert.throws(() => assertBenchmarkControllerIdentity(state, {
    candidateDigest: state.release_candidate_digest,
    taskSetDigest: state.task_set_digest,
    baseFingerprint: "d".repeat(64),
    modes: state.modes
  }), /base differs/);
  assert.throws(() => assertBenchmarkControllerIdentity(state, {
    candidateDigest: state.release_candidate_digest,
    taskSetDigest: state.task_set_digest,
    baseFingerprint: state.identity.base_fingerprint,
    modes: ["raw-agent", "v1-skill", "plugin-kernel"]
  }), /modes differ/);
});

test("controller can create a raw-agent/v1/plugin canary matrix", () => {
  const state = createBenchmarkControllerState({
    candidateManifest: { release_candidate_digest: "a".repeat(64) },
    taskValidation: {
      task_set_digest: "b".repeat(64),
      modes: ["raw-agent", "v1-skill", "plugin-kernel"],
      tasks: [{
        task_id: "repo--simple",
        task_digest: "c".repeat(64),
        repository: "repo",
        scenario: "simple"
      }]
    },
    workspaceRoot: "/tmp/apex-benchmark-canary/runs",
    baseFingerprint: "d".repeat(64)
  });
  assert.deepEqual(state.modes, ["raw-agent", "v1-skill", "plugin-kernel"]);
  assert.deepEqual(
    state.runs.map((run) => run.mode),
    ["raw-agent", "v1-skill", "plugin-kernel"]
  );
  assert.equal(state.identity.base_fingerprint, "d".repeat(64));
});

test("dead running process recovers to interrupted and can be reclaimed", () => {
  const state = createState();
  const run = claimBenchmarkRun(state, {
    runKey: state.runs[0].run_key,
    controllerPid: 99999,
    now: "2026-08-14T00:00:01.000Z"
  });
  run.child_pid = 99998;
  const recovered = recoverBenchmarkControllerState(state, {
    now: "2026-08-14T00:00:02.000Z",
    isPidAlive: () => false
  });
  assert.equal(recovered.recovered, 1);
  assert.equal(run.status, "interrupted");
  assert.equal(run.recovery_count, 1);
  claimBenchmarkRun(state, {
    runKey: run.run_key,
    controllerPid: 123,
    now: "2026-08-14T00:00:03.000Z"
  });
  assert.equal(run.status, "running");
  assert.equal(run.process_attempt, 2);
});

test("expired lease recovers even when recorded PIDs are still alive", () => {
  const state = createState();
  const run = claimBenchmarkRun(state, {
    runKey: state.runs[0].run_key,
    controllerPid: 101,
    leaseId: "expired-lease",
    leaseMs: 1000,
    now: "2026-08-18T00:00:00.000Z"
  });
  const recovered = recoverBenchmarkControllerState(state, {
    now: "2026-08-18T00:00:02.000Z",
    isPidAlive: () => true
  });
  assert.equal(recovered.recovered, 1);
  assert.equal(run.status, "interrupted");
  assert.match(run.failure, /lease expired/i);
});

test("formal benchmark lease covers model timeout plus closeout grace", () => {
  assert.equal(resolveBenchmarkLeaseMs(null, 30 * 60 * 1000), 120 * 60 * 1000);
  assert.equal(resolveBenchmarkLeaseMs(42_000, 30 * 60 * 1000), 42_000);
});

test("expired lease cannot update or finish a running benchmark", () => {
  const state = createState();
  const runKey = state.runs[0].run_key;
  const run = claimBenchmarkRun(state, {
    runKey,
    leaseId: "short-lease",
    leaseMs: 1000,
    now: "2026-08-18T00:00:00.000Z"
  });
  assert.throws(() => finishBenchmarkRun(state, {
    runKey,
    status: "completed",
    resultRef: "results/expired.json",
    resultSha256: "e".repeat(64),
    leaseId: "short-lease",
    fencingToken: run.fencing_token,
    now: "2026-08-18T00:00:02.000Z"
  }), /lease expired/i);
});

test("completed run cannot be claimed twice", () => {
  const state = createState();
  const runKey = state.runs[0].run_key;
  claimBenchmarkRun(state, { runKey });
  finishBenchmarkRun(state, {
    runKey,
    status: "completed",
    resultRef: "results/run.json",
    resultSha256: "c".repeat(64)
  });
  assert.throws(() => claimBenchmarkRun(state, { runKey }), /cannot be claimed/);
});

test("completed run requires and stores an immutable result hash", () => {
  const state = createState();
  const runKey = state.runs[0].run_key;
  claimBenchmarkRun(state, { runKey });
  assert.throws(() => finishBenchmarkRun(state, {
    runKey,
    status: "completed",
    resultRef: "results/run.json"
  }), /result sha256/i);
  const run = state.runs.find((item) => item.run_key === runKey);
  assert.equal(run.status, "running");

  finishBenchmarkRun(state, {
    runKey,
    status: "completed",
    resultRef: "results/run.json",
    resultSha256: "c".repeat(64)
  });
  assert.equal(run.result_sha256, "c".repeat(64));
});

test("planned interruption increments recovery evidence exactly once", () => {
  const state = createState();
  const runKey = state.runs[0].run_key;
  const run = claimBenchmarkRun(state, { runKey });
  finishBenchmarkRun(state, {
    runKey,
    status: "interrupted",
    failure: "planned"
  });
  assert.equal(run.recovery_count, 1);
  claimBenchmarkRun(state, { runKey });
  assert.equal(run.recovery_count, 1);
});

test("stale lease and fencing token cannot finish a reclaimed run", () => {
  const state = createState();
  const runKey = state.runs[0].run_key;
  const first = claimBenchmarkRun(state, {
    runKey,
    controllerPid: 101,
    leaseId: "lease-first",
    attemptId: "attempt-first",
    now: "2026-08-18T00:00:00.000Z"
  });
  const firstFence = first.fencing_token;
  recoverBenchmarkControllerState(state, {
    now: "2026-08-18T00:40:00.000Z",
    isPidAlive: () => false
  });
  const second = claimBenchmarkRun(state, {
    runKey,
    controllerPid: 202,
    leaseId: "lease-second",
    attemptId: "attempt-second",
    now: "2026-08-18T00:40:01.000Z"
  });
  assert.ok(second.fencing_token > firstFence);
  assert.throws(() => finishBenchmarkRun(state, {
    runKey,
    status: "completed",
    resultRef: "results/stale.json",
    resultSha256: "a".repeat(64),
    leaseId: "lease-first",
    fencingToken: firstFence,
    now: "2026-08-18T00:40:02.000Z"
  }), /lease|fencing/i);
  finishBenchmarkRun(state, {
    runKey,
    status: "completed",
    resultRef: "results/current.json",
    resultSha256: "b".repeat(64),
    leaseId: "lease-second",
    fencingToken: second.fencing_token,
    now: "2026-08-18T00:40:02.000Z"
  });
  assert.equal(second.status, "completed");
});

test("controller revision CAS rejects a stale writer", () => {
  const root = mkdtempSync(join(tmpdir(), "apex-controller-cas-"));
  const path = join(root, "controller.json");
  const state = createState();
  saveBenchmarkControllerState(path, state);
  const writerA = loadBenchmarkControllerState(path);
  const writerB = loadBenchmarkControllerState(path);
  writerA.status = "running";
  saveBenchmarkControllerState(path, writerA);
  writerB.status = "blocked";
  assert.throws(
    () => saveBenchmarkControllerState(path, writerB),
    /stale controller revision/i
  );
});

test("usage telemetry gap retries at most twice and other invalid results fail", () => {
  assert.equal(shouldRetryBenchmarkValidation(
    ["Codex usage evidence missing"],
    1
  ), true);
  assert.equal(shouldRetryBenchmarkValidation(
    ["Codex usage evidence missing"],
    2
  ), true);
  assert.equal(shouldRetryBenchmarkValidation(
    ["Codex usage evidence missing"],
    3
  ), false);
  assert.equal(shouldRetryBenchmarkValidation(
    ["hidden acceptance failed"],
    1
  ), false);
});

test("four concurrent coordinators claim distinct runs without lost updates", async () => {
  const root = mkdtempSync(join(tmpdir(), "apex-controller-concurrent-"));
  const controllerRoot = join(root, "controller");
  const statePath = join(controllerRoot, "controller.json");
  mkdirSync(controllerRoot, { recursive: true });
  saveBenchmarkControllerState(statePath, createState());
  const coordinatorPath = new URL(
    "../src/benchmark/controller-coordinator.mjs",
    import.meta.url
  ).href;
  const source = `
import { claimNextBenchmarkRunLocked } from ${JSON.stringify(coordinatorPath)};
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const run = claimNextBenchmarkRunLocked({
  controllerRoot: process.argv[1],
  statePath: process.argv[2],
  controllerPid: process.pid,
  leaseMs: 60000
});
console.log(run.run_key);
writeFileSync(join(process.argv[1], \`ready-\${process.pid}\`), "");
const deadline = Date.now() + 120000;
while (
  readdirSync(process.argv[1]).filter((name) => name.startsWith("ready-")).length < 4
  && Date.now() < deadline
) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}
`;
  const claimed = await Promise.all(Array.from({ length: 4 }, () =>
    runAsync(process.execPath, [
      "--input-type=module",
      "-e",
      source,
      controllerRoot,
      statePath
    ])
  ));
  const claimedKeys = claimed.map((value) => value.trim());
  assert.equal(new Set(claimedKeys).size, 4);
  const finalState = loadBenchmarkControllerState(statePath);
  assert.ok(claimedKeys.every((runKey) => {
    const run = finalState.runs.find((entry) => entry.run_key === runKey);
    return run.process_attempt === 1
      && ["running", "interrupted"].includes(run.status);
  }));
  assert.equal(finalState.revision, 5);
});

test("Plugin resume reuses the prior bootstrap after the Kernel run already closed", () => {
  const root = mkdtempSync(join(tmpdir(), "apex-plugin-resume-bootstrap-"));
  const workspace = join(root, "workspace");
  const runRoot = join(root, "run");
  const runId = "run-closed";
  mkdirSync(join(workspace, ".apex-v2", "runs", runId), { recursive: true });
  mkdirSync(runRoot, { recursive: true });
  writeFileSync(
    join(workspace, ".apex-v2", "runs", runId, "plan-graph.json"),
    JSON.stringify({ profile: "full" })
  );
  const prior = {
    reused: false,
    intake_id: "intake-1",
    run_id: runId,
    profile: "full",
    fast_path: null,
    tick: { advanced: true },
    status: { active_runs: [runId] }
  };
  writeFileSync(
    join(runRoot, "plugin-bootstrap.json"),
    `${JSON.stringify(prior, null, 2)}\n`
  );

  const resolved = resolvePluginBenchmarkBootstrap({
    runRoot,
    processAttempt: 2,
    workspace,
    task: {
      task_id: "repo--parallel",
      scenario: "parallel",
      title: "Parallel task",
      instructions: "Complete the parallel task.",
      affected_files: ["src/value.mjs"],
      acceptance_commands: ["npm test"]
    },
    runtimePath: join(root, "runtime-must-not-run.mjs"),
    schemaDir: join(root, "schemas")
  });

  assert.deepEqual(resolved, prior);
});

test("workspace applies setup before a clean Git baseline and keeps hidden checks outside", () => {
  const root = mkdtempSync(join(tmpdir(), "apex-benchmark-workspace-"));
  const base = join(root, "base");
  const runRoot = join(root, "run");
  mkdirSync(join(base, "src"), { recursive: true });
  mkdirSync(join(base, "node_modules", "fixture"), { recursive: true });
  writeFileSync(join(base, "src", "value.txt"), "GOOD\n");
  writeFileSync(join(base, "node_modules", "fixture", "index.js"), "export {};\n");
  const result = prepareBenchmarkWorkspace({
    baseWorkspace: base,
    runRoot,
    candidateDigest: "a".repeat(64),
    task: {
      repository: "repo",
      scenario: "bug-fix",
      task_digest: "b".repeat(64),
      title: "Repair injected value",
      instructions: "Restore the injected value and verify behavior.",
      affected_files: ["src/value.txt"],
      acceptance_commands: ["test \"$(cat src/value.txt)\" = GOOD"],
      setup_operations: [{
        op: "replace_text",
        path: "src/value.txt",
        content: "",
        old_text: "GOOD",
        new_text: "BAD"
      }],
      hidden_checks: [{
        kind: "behavior",
        description: "Value is restored.",
        command: "test \"$(cat src/value.txt)\" = GOOD"
      }]
    }
  });
  assert.equal(readFileSync(join(result.workspace, "src", "value.txt"), "utf8"), "BAD\n");
  assert.equal(existsSync(join(result.workspace, "node_modules")), true);
  assert.equal(lstatSync(join(result.workspace, "node_modules")).isSymbolicLink(), false);
  assert.equal(existsSync(join(result.workspace, ".benchmark-control")), false);
  const status = git(result.workspace, ["status", "--porcelain"]);
  assert.equal(status, "");
  const publicTask = JSON.parse(readFileSync(join(runRoot, "task.json"), "utf8"));
  assert.equal(publicTask.hidden_checks, undefined);
});

test("Plugin Host fast path preclaims one scoped quick run and closes it deterministically", () => {
  const workspace = mkdtempSync(join(tmpdir(), "apex-plugin-bootstrap-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  mkdirSync(join(workspace, "tests"), { recursive: true });
  writeFileSync(join(workspace, "src", "value.mjs"), "export const value = 1;\n");
  writeFileSync(join(workspace, "tests", "value.test.mjs"), "import test from 'node:test';\n");
  writeFileSync(join(workspace, "package.json"), JSON.stringify({
    type: "module",
    scripts: {
      test: "node --test",
      typecheck: "node --check src/value.mjs"
    }
  }));
  const result = bootstrapPluginBenchmarkProject({
    workspace,
    task: {
      task_id: "repo--simple",
      scenario: "simple",
      title: "Change value",
      instructions: "Update the value and add focused coverage.",
      affected_files: ["src/value.mjs", "tests/value.test.mjs"],
      acceptance_commands: ["npm test", "npm run typecheck"]
    },
    runtimePath: new URL("../src/apex-v2.mjs", import.meta.url).pathname,
    schemaDir: new URL("../schemas/", import.meta.url).pathname
  });
  const intake = JSON.parse(readFileSync(
    join(workspace, ".apex-v2", "intake", "items.json"),
    "utf8"
  )).find((item) => item.id === result.intake_id);
  assert.deepEqual(intake.acceptance_commands, [
    "npm test",
    "npm run typecheck"
  ]);
  assert.equal(result.reused, false);
  const project = JSON.parse(readFileSync(join(workspace, ".apex-v2", "project.json")));
  assert.deepEqual(project.active_runs, [result.run_id]);
  const plan = JSON.parse(readFileSync(join(
    workspace,
    ".apex-v2",
    "runs",
    result.run_id,
    "plan-graph.json"
  )));
  assert.equal(plan.profile, "quick");
  assert.deepEqual(plan.verification_policy.required_commands, [
    "npm test",
    "npm run typecheck"
  ]);
  const workersDir = join(workspace, ".apex-v2", "runs", result.run_id, "workers");
  const workers = readdirSync(workersDir).map((workerId) =>
    JSON.parse(readFileSync(join(workersDir, workerId, "worker.json")))
  );
  assert.equal(workers.length, 1);
  assert.equal(workers[0].preferred_mode, "interactive");
  assert.equal(result.fast_path.worker_id, workers[0].worker_id);
  assert.deepEqual(result.fast_path.write_scope, [
    "src/value.mjs",
    "tests/value.test.mjs"
  ]);
  assert.deepEqual(result.fast_path.verification_commands, [
    "npm test",
    "npm run typecheck"
  ]);
  assert.equal(existsSync(result.fast_path.workspace_path), true);
  const actions = spawnSync(process.execPath, [
    new URL("../src/apex-v2.mjs", import.meta.url).pathname,
    "host",
    "actions",
    "--project",
    workspace,
    "--host-id",
    "codex-host"
  ], { encoding: "utf8" });
  assert.equal(actions.status, 0, actions.stderr);
  assert.equal(JSON.parse(actions.stdout).length, 1);
  assert.equal(JSON.parse(actions.stdout)[0].status, "claimed");

  writeFileSync(
    join(result.fast_path.workspace_path, "src", "value.mjs"),
    "export const value = 2;\n"
  );
  const closeout = closePluginBenchmarkProject({
    workspace,
    task: {
      task_id: "repo--simple",
      scenario: "simple",
      title: "Change value",
      instructions: "Update the value and add focused coverage.",
      affected_files: ["src/value.mjs", "tests/value.test.mjs"],
      acceptance_commands: ["npm test", "npm run typecheck"]
    },
    runtimePath: new URL("../src/apex-v2.mjs", import.meta.url).pathname,
    schemaDir: new URL("../schemas/", import.meta.url).pathname,
    bootstrap: result,
    agentOutput: {
      verdict: "pass",
      summary: "Changed the scoped value export from 1 to 2 and verified the public commands.",
      tests: [],
      risks: [],
      evidence_refs: [],
      review: {
        claims: [
          "src/value.mjs exports value 2 within the declared two-file quick scope.",
          "The public test and typecheck commands cover the submitted value change."
        ],
        uncertainties: [],
        acceptance_mapping: [{
          criterion: "The scoped value export changes from 1 to 2.",
          status: "supported"
        }],
        findings: [],
        residual_risks: [],
        merge_posture: "approve"
      }
    }
  });
  assert.equal(closeout.status.active_runs.length, 0);
  assert.equal(closeout.landing.status, "PASS");
  assert.equal(closeout.landing.queue_status, "merged");
  assert.equal(closeout.landing.integration_status, "MERGED");
  assert.equal(readFileSync(join(workspace, "src", "value.mjs"), "utf8"), "export const value = 2;\n");
  assert.equal(
    JSON.parse(readFileSync(join(
      workspace,
      ".apex-v2",
      "runs",
      result.run_id,
      "verification-report.json"
    ))).status,
    "PASS"
  );
  writeFileSync(join(workspace, "src", "value.mjs"), "export const value = 1;\n");
  assert.throws(
    () => assertQuickCloseoutLanded({
      workspace,
      task: {
        acceptance_commands: ["npm test", "npm run typecheck"]
      },
      bootstrap: result,
      implementation: closeout.implementation
    }),
    /文件未落地/
  );

  const multiWorkspace = mkdtempSync(join(tmpdir(), "apex-plugin-full-route-"));
  mkdirSync(join(multiWorkspace, "src"), { recursive: true });
  mkdirSync(join(multiWorkspace, "tests"), { recursive: true });
  writeFileSync(join(multiWorkspace, "src", "value.mjs"), "export const value = 1;\n");
  writeFileSync(join(multiWorkspace, "tests", "value.test.mjs"), "import test from 'node:test';\n");
  writeFileSync(join(multiWorkspace, "package.json"), JSON.stringify({
    type: "module",
    scripts: { test: "node --test" }
  }));
  const multiStep = bootstrapPluginBenchmarkProject({
    workspace: multiWorkspace,
    task: {
      task_id: "repo--multi-step",
      scenario: "multi-step",
      title: "Change value across layers",
      instructions: "Update the value through a multi-step implementation.",
      affected_files: ["src/value.mjs", "tests/value.test.mjs"],
      acceptance_commands: ["npm test"]
    },
    runtimePath: new URL("../src/apex-v2.mjs", import.meta.url).pathname,
    schemaDir: new URL("../schemas/", import.meta.url).pathname
  });
  assert.equal(multiStep.profile, "full");
  assert.equal(multiStep.fast_path, null);
});

test("Plugin benchmark can force the governed v2 method pack", () => {
  const workspace = mkdtempSync(join(tmpdir(), "apex-plugin-governed-route-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  mkdirSync(join(workspace, "tests"), { recursive: true });
  writeFileSync(join(workspace, "src", "value.mjs"), "export const value = 1;\n");
  writeFileSync(join(workspace, "tests", "value.test.mjs"), "import test from 'node:test';\n");
  writeFileSync(join(workspace, "package.json"), JSON.stringify({
    type: "module",
    scripts: { test: "node --test" }
  }));
  const result = bootstrapPluginBenchmarkProject({
    workspace,
    task: {
      task_id: "repo--simple",
      scenario: "simple",
      title: "Change value",
      instructions: "Update the value and add focused coverage.",
      affected_files: ["src/value.mjs", "tests/value.test.mjs"],
      acceptance_commands: ["npm test"],
      plugin_method_pack: "governed"
    },
    runtimePath: new URL("../src/apex-v2.mjs", import.meta.url).pathname,
    schemaDir: new URL("../schemas/", import.meta.url).pathname
  });
  const plan = JSON.parse(readFileSync(join(
    workspace,
    ".apex-v2",
    "runs",
    result.run_id,
    "plan-graph.json"
  )));
  assert.equal(plan.graph_version, "governed-v2");
  assert.equal(plan.method_pack.id, "governed");
  assert.equal(result.fast_path, null);
  assert.equal(result.entry_action.action_type, "plan");
  assert.match(result.entry_action.claim_token, /^claim-/);
  assert.equal(
    result.entry_action.submission_contract.semantic_evidence.evidence_type,
    "design"
  );
});

test("CLI benchmark bootstrap persists exact public acceptance commands", () => {
  const workspace = mkdtempSync(join(tmpdir(), "apex-cli-bootstrap-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  writeFileSync(join(workspace, "src", "value.mjs"), "export const value = 1;\n");
  writeFileSync(join(workspace, "package.json"), JSON.stringify({
    type: "module",
    scripts: {
      test: "node --test",
      build: "node --check src/value.mjs"
    }
  }));
  const acceptanceCommands = [
    "node --test tests/value.test.mjs",
    "node -e 'const value = 1; if (value !== 1) process.exit(1)'"
  ];
  const bootstrap = bootstrapCliBenchmarkProject({
    workspace,
    task: {
      task_id: "repo--bug-fix",
      scenario: "bug-fix",
      title: "Fix scoped value",
      instructions: "Fix only the declared value behavior.",
      affected_files: ["src/value.mjs"],
      acceptance_commands: acceptanceCommands
    },
    runtimePath: new URL("../src/apex-v2.mjs", import.meta.url).pathname,
    schemaDir: new URL("../schemas/", import.meta.url).pathname
  });
  const intake = JSON.parse(readFileSync(
    join(workspace, ".apex-v2", "intake", "items.json"),
    "utf8"
  )).find((item) => item.id === bootstrap.intake_id);
  const plan = JSON.parse(readFileSync(
    join(workspace, ".apex-v2", "runs", bootstrap.run_id, "plan-graph.json"),
    "utf8"
  ));
  assert.deepEqual(intake.acceptance_commands, acceptanceCommands);
  assert.deepEqual(plan.verification_policy.required_commands, acceptanceCommands);
  assert.equal(bootstrap.fast_path, null);
});

function createState() {
  const tasks = [];
  for (let repositoryIndex = 0; repositoryIndex < 5; repositoryIndex += 1) {
    for (const scenario of SCENARIOS) {
      tasks.push({
        task_id: `repo-${repositoryIndex}--${scenario}`,
        task_digest: `${repositoryIndex}`.padEnd(64, scenario.charCodeAt(0).toString(16)[0]),
        repository: `repo-${repositoryIndex}`,
        scenario
      });
    }
  }
  return createBenchmarkControllerState({
    candidateManifest: {
      release_candidate_digest: "a".repeat(64)
    },
    taskValidation: {
      task_set_digest: "b".repeat(64),
      tasks
    },
    workspaceRoot: "/tmp/apex-benchmark/runs",
    baseFingerprint: "f".repeat(64),
    now: "2026-08-14T00:00:00.000Z"
  });
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function runAsync(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) resolveRun(stdout);
      else rejectRun(new Error(stderr || `child exited ${code}`));
    });
  });
}
