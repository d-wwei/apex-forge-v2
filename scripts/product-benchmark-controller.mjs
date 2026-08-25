import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  createBenchmarkControllerState,
  loadBenchmarkControllerState,
  prepareBenchmarkWorkspace,
  recoverBenchmarkControllerState,
  resolveBenchmarkLeaseMs,
  saveBenchmarkControllerState,
  shouldRetryBenchmarkValidation,
} from "../src/benchmark/controller-state.mjs";
import {
  claimNextBenchmarkRunLocked,
  finishBenchmarkRunLocked,
  loadBenchmarkControllerSnapshot,
  updateBenchmarkRunLocked
} from "../src/benchmark/controller-coordinator.mjs";
import { executeCodexBenchmarkRun } from "../src/benchmark/codex-runner.mjs";
import { evaluateBenchmarkRun } from "../src/benchmark/result-evaluator.mjs";
import {
  collectBenchmarkProcessEvidence,
  fileSha256,
  loadVerifiedBenchmarkResults
} from "../src/benchmark/result-provenance.mjs";
import { validateBenchmarkTaskPlans } from "../src/benchmark/task-plans.mjs";
import {
  closePluginBenchmarkProject,
  resolveCliBenchmarkBootstrap,
  resolvePluginBenchmarkBootstrap
} from "../src/benchmark/plugin-bootstrap.mjs";
import { buildBenchmarkPlan, evaluateBenchmark } from "../src/benchmark/plugin-benchmark.mjs";
import { writeJson } from "../src/lib/common.mjs";
import { portableBenchmarkMatrixHash } from "../src/release/candidate-bundle.mjs";
import {
  assertDiskHeadroom,
  terminateGuardTokenProcesses
} from "../src/core/process-guard.mjs";
import { withProjectLock } from "../src/core/project-lock.mjs";
import { benchmarkEnvironment } from "../src/benchmark/environment.mjs";
import { inspectPreparedSource } from "../src/benchmark/prepared-source.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
Object.assign(process.env, benchmarkEnvironment(process.env));
const benchmarkRoot = join(repoRoot, "benchmarks", "plugin-vs-v1");
const command = process.argv[2] || "status";
const args = parseArgs(process.argv.slice(3));
const context = loadContext(args);

if (command === "init") {
  ensurePreparedDependencies(context);
  if (existsSync(context.statePath) && !args.force) {
    throw new Error(`controller already exists: ${context.statePath}`);
  }
  if (args.force) rmSync(context.controllerRoot, { recursive: true, force: true });
  mkdirSync(context.runWorkspaceRoot, { recursive: true });
  const state = createBenchmarkControllerState({
    candidateManifest: context.candidate,
    taskValidation: context.taskValidation,
    workspaceRoot: context.runWorkspaceRoot
  });
  saveBenchmarkControllerState(context.statePath, state);
  printSummary(state, context);
} else if (command === "status") {
  const state = loadAndRecover(context);
  printSummary(state, context);
} else if (command === "recover") {
  const { state, recovered } = withProjectLock(context.controllerRoot, () => {
    const state = loadBenchmarkControllerState(context.statePath);
    const recovered = recoverBenchmarkControllerState(state);
    if (recovered.recovered > 0) saveBenchmarkControllerState(context.statePath, state);
    return { state, recovered };
  });
  console.log(JSON.stringify({
    status: "PASS",
    recovered: recovered.recovered,
    summary: summarize(state)
  }, null, 2));
} else if (command === "run") {
  await runSelected(context, args);
} else if (command === "parallel") {
  await runParallel(context, args);
} else if (command === "reset") {
  resetRun(context, args);
} else if (command === "finalize") {
  finalize(context);
} else if (command === "preflight") {
  ensurePreparedDependencies(context);
  console.log(JSON.stringify({
    status: "PASS",
    release_candidate_digest: context.candidate.release_candidate_digest,
    task_set_digest: context.taskValidation.task_set_digest,
    repositories: context.matrix.repositories.map((repository) => ({
      id: repository.id,
      source_commit: repository.source_commit,
      dependencies: readJson(
        join(context.baseRoot, repository.id, ".benchmark-dependencies.json"),
        null
      )
    }))
  }, null, 2));
} else {
  throw new Error(`unknown benchmark controller command: ${command}`);
}

async function runSelected(context, args) {
  ensurePreparedDependencies(context);
  const model = args.model || process.env.APEX_BENCHMARK_MODEL;
  if (!model) {
    throw new Error("formal benchmark requires --model or APEX_BENCHMARK_MODEL");
  }
  const filters = {
    mode: args.mode,
    taskId: args.task,
    repository: args.repository,
    scenario: args.scenario
  };
  const maxRuns = integer(args["max-runs"], 1);
  const processedRunKeys = new Set();
  const modelTimeoutMs = integer(
    args["timeout-ms"] || process.env.APEX_BENCHMARK_TIMEOUT_MS,
    30 * 60 * 1000
  );
  const leaseMs = resolveBenchmarkLeaseMs(
    args["lease-ms"] || process.env.APEX_BENCHMARK_LEASE_MS,
    modelTimeoutMs
  );
  let processed = 0;
  while (processed < maxRuns) {
    assertBenchmarkDiskHeadroom(context);
    const run = claimNextBenchmarkRunLocked({
      controllerRoot: context.controllerRoot,
      statePath: context.statePath,
      filters: {
        ...filters,
        excludeRunKeys: processedRunKeys
      },
      controllerPid: process.pid,
      leaseMs
    });
    if (!run) break;
    processed += 1;
    processedRunKeys.add(run.run_key);
    const leaseId = run.lease_id;
    const fencingToken = run.fencing_token;
    const task = context.taskValidation.tasks.find(
      (item) => item.task_id === run.task_id
    );
    const repository = context.matrix.repositories.find(
      (item) => item.id === run.repository
    );
    assertPreparedRepository(context, repository);
    const runRoot = join(context.runWorkspaceRoot, safeName(run.run_key));
    mkdirSync(runRoot, { recursive: true });
    let finished = false;
    try {
      prepareModeInputs(context, runRoot, run.mode);
      const prepared = prepareBenchmarkWorkspace({
        baseWorkspace: join(context.baseRoot, run.repository),
        runRoot,
        task,
        candidateDigest: context.candidate.release_candidate_digest,
        reset: run.process_attempt === 1
      });
      let pluginBootstrap = null;
      if (run.mode === "plugin-kernel") {
        pluginBootstrap = resolvePluginBenchmarkBootstrap({
          runRoot,
          processAttempt: run.process_attempt,
          workspace: prepared.workspace,
          task,
          runtimePath: join(
            context.candidateRoot,
            "plugins",
            "codex",
            "apex-forge-v2",
            "runtime",
            "apex-v2.mjs"
          ),
          schemaDir: join(
            context.candidateRoot,
            "plugins",
            "codex",
            "apex-forge-v2",
            "runtime",
            "schemas"
          )
        });
        writeJson(join(runRoot, "plugin-bootstrap.json"), pluginBootstrap);
      } else if (run.mode === "cli-kernel") {
        pluginBootstrap = resolveCliBenchmarkBootstrap({
          runRoot,
          processAttempt: run.process_attempt,
          workspace: prepared.workspace,
          task,
          runtimePath: join(
            context.candidateRoot,
            "plugins",
            "codex",
            "apex-forge-v2",
            "runtime",
            "apex-v2.mjs"
          ),
          schemaDir: join(
            context.candidateRoot,
            "plugins",
            "codex",
            "apex-forge-v2",
            "runtime",
            "schemas"
          )
        });
        writeJson(join(runRoot, "cli-bootstrap.json"), pluginBootstrap);
      }
      const forcedInterruption = run.scenario === "interrupted"
        && run.process_attempt === 1;
      const executionTimeoutMs = forcedInterruption
        ? integer(
            args["interrupt-ms"] || process.env.APEX_BENCHMARK_INTERRUPT_MS,
            60_000
          )
        : modelTimeoutMs;
      const started = Date.now();
      const execution = executeCodexBenchmarkRun({
        mode: run.mode,
        workspace: prepared.workspace,
        runRoot,
        task,
        candidateRoot: context.candidateRoot,
        sessionId: run.session_id,
        timeoutMs: executionTimeoutMs,
        model,
        reasoningEffort: args["reasoning-effort"]
          || process.env.APEX_BENCHMARK_REASONING_EFFORT
          || null,
        profile: args.profile || process.env.APEX_BENCHMARK_CODEX_PROFILE || null,
        pluginBootstrap,
        benchmarkRoot,
        controllerRoot: context.controllerRoot,
        repositoryRoot: repoRoot
      });
      let pluginCloseout = null;
      if (
        run.mode === "plugin-kernel"
        && pluginBootstrap?.fast_path
        && !execution.timed_out
        && execution.output?.verdict === "pass"
      ) {
        pluginCloseout = closePluginBenchmarkProject({
          workspace: prepared.workspace,
          task,
          runtimePath: join(
            context.candidateRoot,
            "plugins",
            "codex",
            "apex-forge-v2",
            "runtime",
            "apex-v2.mjs"
          ),
          schemaDir: join(
            context.candidateRoot,
            "plugins",
            "codex",
            "apex-forge-v2",
            "runtime",
            "schemas"
          ),
          bootstrap: pluginBootstrap,
          agentOutput: execution.output
        });
        writeJson(join(runRoot, "plugin-closeout.json"), pluginCloseout);
      }
      const processNumber = run.process_attempt;
      const executionPath = join(runRoot, `execution-${processNumber}.json`);
      writeJson(executionPath, {
        schema_version: "v0",
        process_attempt: processNumber,
        mode: run.mode,
        session_id: execution.session_id,
        exit_code: execution.exit_code,
        signal: execution.signal,
        timed_out: execution.timed_out,
        termination_reason: execution.termination_reason || null,
        duration_ms: execution.duration_ms,
        usage: execution.usage,
        usage_source: execution.usage_source || null,
        cohort: execution.cohort,
        process_cleanup: execution.process_cleanup || {
          terminated_pids: [],
          force_killed_pids: []
        },
        plugin_closeout_ref: pluginCloseout
          ? relativePath(join(runRoot, "plugin-closeout.json"))
          : null,
        command: execution.command,
        raw_logs: execution.raw_logs.map((path) => relativePath(path)),
        output_path: relativePath(execution.output_path)
      });
      assertStableProcessCohort(runRoot);
      updateBenchmarkRunLocked({
        controllerRoot: context.controllerRoot,
        statePath: context.statePath,
        runKey: run.run_key,
        sessionId: execution.session_id,
        leaseId,
        fencingToken,
        rawLogRefs: [
          relativePath(executionPath),
          ...execution.raw_logs.map((path) => relativePath(path))
        ]
      });

      if (execution.timed_out) {
        finishBenchmarkRunLocked({
          controllerRoot: context.controllerRoot,
          statePath: context.statePath,
          runKey: run.run_key,
          leaseId,
          fencingToken,
          status: "interrupted",
          failure: forcedInterruption
            ? "planned interruption for recovery benchmark"
            : "agent execution timed out"
        });
        finished = true;
        continue;
      }
      if (isResourceTermination(execution.termination_reason)) {
        finishBenchmarkRunLocked({
          controllerRoot: context.controllerRoot,
          statePath: context.statePath,
          runKey: run.run_key,
          leaseId,
          fencingToken,
          status: "failed",
          failure: `resource guard: ${execution.termination_reason}`
        });
        finished = true;
        throw Object.assign(
          new Error(`benchmark resource guard: ${execution.termination_reason}`),
          { stopController: true }
        );
      }

      assertPreparedRepository(context, repository);
      const totalWallMs = sumProcessMetric(runRoot, "duration_ms")
        + Math.max(0, Date.now() - started - execution.duration_ms);
      const totalUsage = sumUsage(runRoot);
      const processEvidence = collectBenchmarkProcessEvidence({
        repoRoot,
        runRoot
      });
      const evaluated = evaluateBenchmarkRun({
        repoRoot,
        workspace: prepared.workspace,
        task,
        mode: run.mode,
        candidateManifest: context.candidate,
        repositoryManifest: {
          ...repository,
          source_manifest_sha256: task.source_manifest_sha256,
          dependencies: readJson(
            join(context.baseRoot, run.repository, ".benchmark-dependencies.json"),
            null
          )
        },
        execution: {
          ...execution,
          raw_logs: processEvidence.raw_logs,
          artifact_paths: processEvidence.artifact_paths,
          usage: totalUsage
        },
        recoveryCount: run.recovery_count,
        wallMs: totalWallMs,
        model
      });
      const resultPath = join(context.resultRoot, `${safeName(run.run_key)}.json`);
      mkdirSync(dirname(resultPath), { recursive: true });
      writeJson(resultPath, evaluated.result);
      if (shouldRetryBenchmarkValidation(
        evaluated.validation_errors,
        run.process_attempt
      )) {
        finishBenchmarkRunLocked({
          controllerRoot: context.controllerRoot,
          statePath: context.statePath,
          runKey: run.run_key,
          leaseId,
          fencingToken,
          status: "interrupted",
          failure: "retryable telemetry gap: Codex usage evidence missing"
        });
        finished = true;
        continue;
      }
      finishBenchmarkRunLocked({
        controllerRoot: context.controllerRoot,
        statePath: context.statePath,
        runKey: run.run_key,
        leaseId,
        fencingToken,
        status: evaluated.status === "VALID" ? "completed" : "invalid",
        resultRef: relativePath(resultPath),
        resultSha256: fileSha256(resultPath),
        failure: evaluated.validation_errors.length > 0
          ? JSON.stringify(evaluated.validation_errors)
          : null
      });
      finished = true;
      if (evaluated.status !== "VALID") {
        throw Object.assign(
          new Error(`benchmark invalid: ${evaluated.validation_errors.join("; ")}`),
          { stopController: true, runAlreadyFinished: true }
        );
      }
    } catch (error) {
      if (!finished && !error.runAlreadyFinished) {
        try {
          finishBenchmarkRunLocked({
            controllerRoot: context.controllerRoot,
            statePath: context.statePath,
            runKey: run.run_key,
            leaseId,
            fencingToken,
            status: "failed",
            failure: error.stack || error.message
          });
        } catch (finishError) {
          error.message = `${error.message}; finish failed: ${finishError.message}`;
        }
      }
      throw error;
    }
  }
  const state = loadBenchmarkControllerSnapshot({
    controllerRoot: context.controllerRoot,
    statePath: context.statePath
  });
  if (processed === 0) {
    console.log(JSON.stringify({ status: "NOOP", summary: summarize(state) }, null, 2));
    return;
  }
  printSummary(state, context);
}

async function runParallel(context, args) {
  ensurePreparedDependencies(context);
  const model = args.model || process.env.APEX_BENCHMARK_MODEL;
  if (!model) {
    throw new Error("formal benchmark requires --model or APEX_BENCHMARK_MODEL");
  }
  const maxWorkers = Math.max(1, Math.min(integer(args["max-workers"], 3), 3));
  const rounds = integer(args.rounds, 4);
  const repositories = args.repository
    ? [args.repository]
    : context.matrix.repositories.map((repository) => repository.id);
  if (args["dry-run"]) {
    console.log(JSON.stringify({
      status: "PASS",
      scheduler_version: "parallel-v1",
      max_workers: maxWorkers,
      rounds,
      repositories,
      mode: args.mode || "all"
    }, null, 2));
    return;
  }

  for (let round = 1; round <= rounds; round += 1) {
    assertBenchmarkDiskHeadroom(context);
    const snapshot = loadBenchmarkControllerSnapshot({
      controllerRoot: context.controllerRoot,
      statePath: context.statePath
    });
    const eligible = repositories.filter((repository) =>
      snapshot.runs.some((run) =>
        run.repository === repository
        && (!args.mode || run.mode === args.mode)
        && ["pending", "interrupted"].includes(run.status)
      )
    );
    if (eligible.length === 0) break;
    await runWorkerPool(eligible, maxWorkers, (repository, slot, activeChildren) =>
      runRepositoryWorker({
        args,
        repository,
        slot,
        maxWorkers,
        model,
        activeChildren
      })
    );
    const afterRound = loadBenchmarkControllerSnapshot({
      controllerRoot: context.controllerRoot,
      statePath: context.statePath
    });
    const blocked = afterRound.runs.filter((run) =>
      ["failed", "invalid"].includes(run.status)
    );
    if (blocked.length > 0) {
      throw new Error(
        `parallel benchmark blocked after round ${round}: ${blocked.map((run) => run.run_key).join(",")}`
      );
    }
  }

  const state = loadBenchmarkControllerSnapshot({
    controllerRoot: context.controllerRoot,
    statePath: context.statePath
  });
  const remaining = state.runs.filter((run) =>
    repositories.includes(run.repository)
    && (!args.mode || run.mode === args.mode)
    && ["pending", "interrupted", "running"].includes(run.status)
  );
  printSummary(state, context);
  if (remaining.length > 0) {
    throw new Error(
      `parallel benchmark rounds exhausted with ${remaining.length} runs remaining`
    );
  }
}

function assertBenchmarkDiskHeadroom(context) {
  assertDiskHeadroom(
    context.controllerRoot,
    integer(
      process.env.APEX_BENCHMARK_MIN_FREE_BYTES,
      20 * 1024 * 1024 * 1024
    )
  );
}

async function runWorkerPool(values, limit, worker) {
  let cursor = 0;
  const activeChildren = new Set();
  const handleSignal = () => {
    terminateParallelChildren(activeChildren);
    process.exit(143);
  };
  process.once("SIGTERM", handleSignal);
  process.once("SIGINT", handleSignal);
  try {
    const slots = Array.from(
      { length: Math.min(limit, values.length) },
      (_, slot) => (async () => {
        while (cursor < values.length) {
          const index = cursor;
          cursor += 1;
          await worker(values[index], slot + 1, activeChildren);
        }
      })()
    );
    await Promise.all(slots);
  } catch (error) {
    terminateParallelChildren(activeChildren);
    throw error;
  } finally {
    process.removeListener("SIGTERM", handleSignal);
    process.removeListener("SIGINT", handleSignal);
  }
}

function runRepositoryWorker({
  args,
  repository,
  slot,
  maxWorkers,
  model,
  activeChildren
}) {
  return new Promise((resolveWorker, rejectWorker) => {
    const guardToken = randomUUID();
    const workerArgs = [
      fileURLToPath(import.meta.url),
      "run",
      "--repository",
      repository,
      "--max-runs",
      "100",
      "--model",
      model
    ];
    for (const key of [
      "mode",
      "profile",
      "reasoning-effort",
      "timeout-ms",
      "interrupt-ms",
      "lease-ms",
      "candidate"
    ]) {
      if (args[key]) workerArgs.push(`--${key}`, String(args[key]));
    }
    const child = spawn(process.execPath, workerArgs, {
      cwd: repoRoot,
      detached: true,
      env: {
        ...process.env,
        APEX_BENCHMARK_SCHEDULER_VERSION: "parallel-v1",
        APEX_BENCHMARK_MAX_WORKERS: String(maxWorkers),
        APEX_BENCHMARK_WORKER_SLOT: String(slot),
        APEX_PARALLEL_GUARD_TOKEN: guardToken
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const activeEntry = { child, guardToken };
    activeChildren.add(activeEntry);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-16000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-16000);
    });
    child.on("error", (error) => {
      terminateGuardTokenProcesses(guardToken);
      activeChildren.delete(activeEntry);
      rejectWorker(error);
    });
    child.on("close", (code, signal) => {
      if (code === 0) {
        activeChildren.delete(activeEntry);
        resolveWorker();
        return;
      }
      terminateGuardTokenProcesses(guardToken);
      activeChildren.delete(activeEntry);
      rejectWorker(new Error(
        `benchmark worker ${repository} failed code=${code} signal=${signal || "none"}\n${stderr || stdout}`
      ));
    });
  });
}

function terminateParallelChildren(children) {
  for (const { child } of children) {
    if (!Number.isInteger(child.pid)) continue;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
  if (children.size > 0) sleep(500);
  for (const { child, guardToken } of children) {
    if (!Number.isInteger(child.pid)) continue;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
    terminateGuardTokenProcesses(guardToken);
  }
}

function sleep(ms) {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, ms);
}

function isResourceTermination(reason) {
  return [
    "disk-pressure",
    "disk-growth",
    "workspace-growth",
    "output-limit",
    "orphan-process",
    "orphaned-runner",
    "disk-check-failed"
  ].includes(reason);
}

function resetRun(context, args) {
  if (!args["run-key"]) throw new Error("reset requires --run-key");
  const state = withProjectLock(context.controllerRoot, () => {
    const state = loadBenchmarkControllerState(context.statePath);
    const run = state.runs.find((item) => item.run_key === args["run-key"]);
    if (!run) throw new Error(`run not found: ${args["run-key"]}`);
    if (run.status === "completed") throw new Error("completed official run cannot be reset");
    const runRoot = join(context.runWorkspaceRoot, safeName(run.run_key));
    rmSync(runRoot, { recursive: true, force: true });
    Object.assign(run, {
      status: "pending",
      process_attempt: 0,
      recovery_count: 0,
      workspace_path: relative(
        context.controllerRoot,
        join(runRoot, "workspace")
      ).split(sep).join("/"),
      controller_pid: null,
      child_pid: null,
      session_id: null,
      started_at: null,
      completed_at: null,
      raw_log_refs: [],
      result_ref: null,
      result_sha256: null,
      failure: null,
      lease_id: null,
      lease_owner: null,
      lease_expires_at: null,
      heartbeat_at: null,
      attempt_id: null
    });
    state.status = "pending";
    state.updated_at = new Date().toISOString();
    saveBenchmarkControllerState(context.statePath, state);
    return state;
  });
  printSummary(state, context);
}

function finalize(context) {
  const state = loadAndRecover(context);
  const incomplete = state.runs.filter((run) => run.status !== "completed");
  if (incomplete.length > 0) {
    throw new Error(`cannot finalize: ${incomplete.length} official runs incomplete`);
  }
  const resultEntries = state.runs.map((run) => {
    if (!run.result_ref || !run.result_sha256) {
      throw new Error(`cannot finalize: immutable result evidence missing for ${run.run_key}`);
    }
    const resultPath = join(context.resultRoot, `${safeName(run.run_key)}.json`);
    const expectedRef = relativePath(resultPath);
    if (run.result_ref !== expectedRef) {
      throw new Error(`cannot finalize: result path mismatch for ${run.run_key}`);
    }
    return {
      path: relative(benchmarkRoot, resultPath).split(sep).join("/"),
      sha256: run.result_sha256
    };
  });
  const resultsManifest = {
    schema_version: "v0",
    release_candidate_digest: context.candidate.release_candidate_digest,
    task_set_digest: context.taskValidation.task_set_digest,
    results: resultEntries
  };
  const results = loadVerifiedBenchmarkResults({
    repoRoot,
    benchmarkDir: benchmarkRoot,
    manifest: resultsManifest,
    expectedCandidateDigest: context.candidate.release_candidate_digest,
    expectedTaskSetDigest: context.taskValidation.task_set_digest
  });
  const resultsByRun = new Map(results.map((result) => [
    `${result.task_id}--${result.mode}`,
    result
  ]));
  for (const run of state.runs) {
    const result = resultsByRun.get(run.run_key);
    if (!result) throw new Error(`cannot finalize: result missing for ${run.run_key}`);
    const resultLogs = new Set(result.provenance.raw_log_refs);
    if (!run.raw_log_refs.every((ref) => resultLogs.has(ref))) {
      throw new Error(`cannot finalize: incomplete process evidence for ${run.run_key}`);
    }
  }
  const plan = buildBenchmarkPlan(context.matrix, context.taskValidation.tasks);
  const evaluation = evaluateBenchmark(plan.tasks, results);
  writeJson(join(benchmarkRoot, "benchmark-plan.json"), {
    ...plan,
    release_candidate_digest: context.candidate.release_candidate_digest,
    task_set_digest: context.taskValidation.task_set_digest
  });
  writeJson(join(benchmarkRoot, "results-manifest.json"), resultsManifest);
  writeJson(join(benchmarkRoot, "latest-evaluation.json"), evaluation);
  console.log(JSON.stringify(evaluation, null, 2));
  if (evaluation.status !== "PASS") process.exitCode = 1;
}

function loadContext(args) {
  const latest = readJson(
    join(repoRoot, ".apex-v2", "releases", "latest-candidate.json"),
    null
  );
  const manifestPath = args.candidate
    ? resolve(args.candidate)
    : latest
      ? join(repoRoot, latest.candidate_path, "manifest.json")
      : null;
  if (!manifestPath || !existsSync(manifestPath)) {
    throw new Error("release candidate missing; run npm run release:candidate");
  }
  const candidateRoot = dirname(manifestPath);
  const candidate = {
    ...readJson(manifestPath, null),
    __candidate_root: candidateRoot
  };
  const matrix = readJson(join(benchmarkRoot, "matrix.json"), null);
  const taskValidation = validateBenchmarkTaskPlans({
    matrix,
    schema: readJson(join(repoRoot, "schemas", "benchmark-task-plan.schema.json"), null),
    taskDir: join(benchmarkRoot, "tasks"),
    workspaceRoot: join(benchmarkRoot, "workspaces", "base")
  });
  if (taskValidation.status !== "PASS") {
    throw new Error(`benchmark tasks invalid: ${JSON.stringify(taskValidation.errors)}`);
  }
  if (candidate.content.benchmark_task_set_digest !== taskValidation.task_set_digest) {
    throw new Error("candidate task set differs from current benchmark tasks");
  }
  if (candidate.content.benchmark_matrix_sha256 !== portableBenchmarkMatrixHash(matrix)) {
    throw new Error("candidate benchmark matrix differs from current matrix");
  }
  const controllerRoot = join(
    benchmarkRoot,
    "workspaces",
    "runs",
    candidate.release_candidate_digest
  );
  return {
    candidate,
    candidateRoot,
    matrix,
    taskValidation,
    controllerRoot,
    statePath: join(controllerRoot, "controller.json"),
    runWorkspaceRoot: join(controllerRoot, "runs"),
    resultRoot: join(
      benchmarkRoot,
      "results",
      candidate.release_candidate_digest
    ),
    baseRoot: join(benchmarkRoot, "workspaces", "base")
  };
}

function loadAndRecover(context) {
  return loadBenchmarkControllerSnapshot({
    controllerRoot: context.controllerRoot,
    statePath: context.statePath
  });
}

function ensurePreparedDependencies(context) {
  for (const repository of context.matrix.repositories) {
    const root = join(context.baseRoot, repository.id);
    const source = readJson(join(root, ".benchmark-source.json"), null);
    const dependencies = readJson(join(root, ".benchmark-dependencies.json"), null);
    if (
      !source
      || source.source_commit !== repository.source_commit
      || source.source_tree !== repository.source_tree
    ) {
      throw new Error(`prepared source mismatch: ${repository.id}`);
    }
    if (!dependencies || !existsSync(join(root, "node_modules"))) {
      throw new Error(
        `dependencies not prepared for ${repository.id}; run npm run benchmark:prepare -- --with-dependencies`
      );
    }
    if (
      (repository.prepare_command || null) !== (dependencies.prepare?.command || null)
    ) {
      throw new Error(`prepare command mismatch: ${repository.id}`);
    }
    for (const output of repository.prepare_outputs || []) {
      if (!existsSync(join(root, output))) {
        throw new Error(`prepared artifact missing for ${repository.id}: ${output}`);
      }
    }
    const baseline = readJson(join(root, ".benchmark-baseline.json"), null);
    if (
      !baseline
      || baseline.status !== "PASS"
      || baseline.command !== repository.baseline_command
    ) {
      throw new Error(`task baseline not verified: ${repository.id}`);
    }
  }
}

function assertPreparedRepository(context, repository) {
  const root = join(context.baseRoot, repository.id);
  const observed = inspectPreparedSource({ repository, workspace: root });
  if (observed.status !== "PASS") {
    throw Object.assign(
      new Error(
        `prepared source content mismatch: ${repository.id}: `
        + JSON.stringify(observed.errors)
      ),
      { stopController: true }
    );
  }
  const declared = readJson(join(root, ".benchmark-source.json"), null);
  if (
    !declared
    || declared.source_manifest_sha256 !== observed.source_manifest_sha256
    || declared.source_file_count !== observed.source_file_count
  ) {
    throw Object.assign(
      new Error(`prepared source manifest mismatch: ${repository.id}`),
      { stopController: true }
    );
  }
  return observed;
}

function prepareModeInputs(context, runRoot, mode) {
  if (mode !== "v1-skill") return;
  const target = join(runRoot, "apex-forge-v1-SKILL.md");
  if (!existsSync(target)) {
    cpSync(join(context.baseRoot, "apex-forge-v1", "SKILL.md"), target);
  }
}

function sumProcessMetric(runRoot, field) {
  let total = 0;
  for (let processNumber = 1; ; processNumber += 1) {
    const path = join(runRoot, `execution-${processNumber}.json`);
    if (!existsSync(path)) break;
    total += Number(readJson(path, {})[field] || 0);
  }
  return total;
}

function sumUsage(runRoot) {
  const total = {
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    reasoning_tokens: 0
  };
  let found = false;
  let latestRolloutTotal = null;
  for (let processNumber = 1; ; processNumber += 1) {
    const path = join(runRoot, `execution-${processNumber}.json`);
    if (!existsSync(path)) break;
    const usage = readJson(path, {}).usage;
    if (!usage) continue;
    if (readJson(path, {}).usage_source === "codex-rollout-total") {
      latestRolloutTotal = usage;
      continue;
    }
    found = true;
    for (const key of Object.keys(total)) total[key] += Number(usage[key] || 0);
  }
  if (latestRolloutTotal) return latestRolloutTotal;
  return found ? total : null;
}

function assertStableProcessCohort(runRoot) {
  const cohorts = [];
  for (let processNumber = 1; ; processNumber += 1) {
    const path = join(runRoot, `execution-${processNumber}.json`);
    if (!existsSync(path)) break;
    cohorts.push(readJson(path, {}).cohort || null);
  }
  const unique = new Set(cohorts.map((cohort) => JSON.stringify(cohort)));
  if (unique.size !== 1 || cohorts.some((cohort) => !cohort)) {
    throw new Error("benchmark execution cohort drifted across process attempts");
  }
}

function printSummary(state, context) {
  console.log(JSON.stringify({
    status: "PASS",
    controller_path: context.statePath,
    release_candidate_digest: state.release_candidate_digest,
    task_set_digest: state.task_set_digest,
    summary: summarize(state)
  }, null, 2));
}

function summarize(state) {
  return {
    controller_status: state.status,
    total: state.runs.length,
    by_status: countBy(state.runs, "status"),
    by_mode: Object.fromEntries(
      [...new Set(state.runs.map((run) => run.mode))].map((mode) => [
        mode,
        countBy(state.runs.filter((run) => run.mode === mode), "status")
      ])
    )
  };
}

function countBy(values, field) {
  const counts = {};
  for (const value of values) counts[value[field]] = (counts[value[field]] || 0) + 1;
  return counts;
}

function relativePath(path) {
  return relative(repoRoot, path).split(sep).join("/");
}

function safeName(value) {
  return value.replaceAll(/[^A-Za-z0-9._-]/g, "_");
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readJson(path, fallback) {
  if (!path || !existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}
