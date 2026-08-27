import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { runChecks } from "./result-evaluator.mjs";

export function resolvePluginBenchmarkBootstrap({
  runRoot,
  processAttempt,
  workspace,
  task,
  runtimePath,
  schemaDir
}) {
  if (processAttempt <= 1) {
    return bootstrapPluginBenchmarkProject({
      workspace,
      task,
      runtimePath,
      schemaDir
    });
  }
  const bootstrapPath = join(runRoot, "plugin-bootstrap.json");
  if (!existsSync(bootstrapPath)) {
    throw new Error("plugin resume requires the prior bootstrap artifact");
  }
  const bootstrap = JSON.parse(readFileSync(bootstrapPath, "utf8"));
  if (!bootstrap?.run_id || !bootstrap?.profile) {
    throw new Error("plugin resume bootstrap artifact is incomplete");
  }
  const planPath = join(
    workspace,
    ".apex-v2",
    "runs",
    bootstrap.run_id,
    "plan-graph.json"
  );
  if (!existsSync(planPath)) {
    throw new Error(`plugin resume plan missing for ${bootstrap.run_id}`);
  }
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  if (plan.profile !== bootstrap.profile) {
    throw new Error(`plugin resume profile drift for ${bootstrap.run_id}`);
  }
  return bootstrap;
}

export function resolveCliBenchmarkBootstrap({
  runRoot,
  processAttempt,
  workspace,
  task,
  runtimePath,
  schemaDir
}) {
  if (processAttempt <= 1) {
    return bootstrapCliBenchmarkProject({
      workspace,
      task,
      runtimePath,
      schemaDir
    });
  }
  const bootstrapPath = join(runRoot, "cli-bootstrap.json");
  if (!existsSync(bootstrapPath)) {
    throw new Error("CLI resume requires the prior bootstrap artifact");
  }
  const bootstrap = JSON.parse(readFileSync(bootstrapPath, "utf8"));
  if (!bootstrap?.run_id || !bootstrap?.profile) {
    throw new Error("CLI resume bootstrap artifact is incomplete");
  }
  return bootstrap;
}

export function bootstrapPluginBenchmarkProject(options) {
  return bootstrapBenchmarkProject({ ...options, enableFastPath: true });
}

export function bootstrapCliBenchmarkProject(options) {
  return bootstrapBenchmarkProject({ ...options, enableFastPath: false });
}

function bootstrapBenchmarkProject({
  workspace,
  task,
  runtimePath,
  schemaDir,
  enableFastPath
}) {
  const projectPath = join(workspace, ".apex-v2", "project.json");
  const reused = existsSync(projectPath);
  let intake = null;
  let tick = null;
  if (!reused) {
    runRuntime(runtimePath, schemaDir, [
      "init",
      "--project",
      workspace,
      "--name",
      `Benchmark ${task.task_id}`
    ]);
    const intakeArgs = [
      "intake",
      "add",
      "--project",
      workspace,
      "--type",
      intakeType(task.scenario),
      "--title",
      task.title,
      "--description",
      [
        task.instructions,
        `Allowed source files: ${task.affected_files.join(", ")}.`,
        `Public acceptance commands: ${task.acceptance_commands.join("; ")}`
      ].join("\n"),
      "--acceptance-json",
      JSON.stringify(task.acceptance_commands),
      "--area",
      task.affected_files.join(","),
      "--risk",
      ["multi-step", "review-defect", "parallel", "interrupted"].includes(task.scenario)
        ? "high"
        : "low",
      "--priority",
      "P2"
    ];
    if (task.plugin_method_pack) {
      intakeArgs.push("--method-pack", task.plugin_method_pack);
    }
    intake = runRuntime(runtimePath, schemaDir, intakeArgs);
    runRuntime(runtimePath, schemaDir, [
      "intake",
      "triage",
      "--project",
      workspace,
      "--id",
      intake.id,
      "--decision",
      "accepted",
      "--reason",
      "Benchmark Host Plugin supplied explicit scope and public acceptance commands."
    ]);
    tick = runRuntime(runtimePath, schemaDir, [
      "project",
      "tick",
      "--project",
      workspace,
      "--advance",
      "--dispatch"
    ]);
  }
  const status = runRuntime(runtimePath, schemaDir, [
    "status",
    "--project",
    workspace
  ]);
  if (status.active_runs.length !== 1) {
    throw new Error(`plugin bootstrap expected one active run, got ${status.active_runs.length}`);
  }
  const runId = status.active_runs[0];
  const plan = JSON.parse(readFileSync(
    join(workspace, ".apex-v2", "runs", runId, "plan-graph.json"),
    "utf8"
  ));
  const fastPath = enableFastPath
    ? prepareQuickFastPath({
        workspace,
        runtimePath,
        schemaDir,
        runId,
        plan
      })
    : null;
  const entryAction = enableFastPath && !fastPath
    ? prepareGuidedEntryAction({
        workspace,
        runtimePath,
        schemaDir
      })
    : null;
  return {
    reused,
    intake_id: intake?.id || plan.source_intake_id,
    run_id: runId,
    profile: plan.profile,
    fast_path: fastPath,
    entry_action: entryAction,
    tick,
    status
  };
}

function prepareGuidedEntryAction({ workspace, runtimePath, schemaDir }) {
  const drained = runRuntime(runtimePath, schemaDir, [
    "project",
    "drain",
    "--project",
    workspace,
    "--host-id",
    "codex-host",
    "--compact"
  ]);
  if (drained.status !== "ACTION_REQUIRED" || !drained.next_action?.claim) {
    throw new Error("plugin guided bootstrap expected one claimed Host action");
  }
  const action = drained.next_action;
  return {
    action_type: action.action_type,
    worker_id: action.worker_id,
    run_id: action.run_id,
    objective: action.objective,
    workspace: action.workspace,
    context_refs: action.context_refs,
    candidate_digest: action.candidate_digest,
    verification_ref: action.verification_ref,
    patch_refs: action.patch_refs,
    risk_refs: action.risk_refs,
    claim_token: action.claim.claim_token,
    submission_contract: action.submission_contract
  };
}

export function closePluginBenchmarkProject({
  workspace,
  task,
  runtimePath,
  schemaDir,
  bootstrap,
  agentOutput
}) {
  const fastPath = bootstrap?.fast_path;
  if (!fastPath) return null;
  if (agentOutput?.verdict !== "pass" || !agentOutput.review) {
    throw new Error("plugin quick closeout requires PASS output with typed review");
  }
  const implementation = runRuntime(runtimePath, schemaDir, [
    "host",
    "submit",
    "--project",
    workspace,
    "--host-id",
    "codex-host",
    "--worker-id",
    fastPath.worker_id,
    "--claim-token",
    fastPath.claim_token,
    "--summary",
    agentOutput.summary
  ]);
  if (!implementation.patch_id || implementation.queue_status !== "queued") {
    throw new Error(
      `plugin quick closeout failed to queue implementation patch: `
      + `${implementation.patch_id || "(missing)"}=${implementation.queue_status || "(missing)"}`
    );
  }
  const reviewDrain = runRuntime(runtimePath, schemaDir, [
    "project",
    "drain",
    "--project",
    workspace,
    "--host-id",
    "codex-host"
  ]);
  const reviewAction = reviewDrain.next_action?.action_type === "review"
    ? reviewDrain.next_action
    : null;
  if (!reviewAction?.candidate_digest) {
    throw new Error("plugin quick closeout review action lacks candidate digest");
  }
  const reviewClaim = reviewAction.claim;
  if (!reviewClaim?.claim_token) {
    throw new Error("plugin quick closeout review action lacks claim token");
  }
  const implementationRoot = `.apex-v2/runs/${bootstrap.run_id}/workers/${fastPath.worker_id}`;
  const patchRef = `${implementationRoot}/patches/${implementation.patch_id}/patch-bundle.json`;
  const review = agentOutput.review;
  const evidence = {
    schema_version: "v0",
    evidence_type: "review",
    objective: reviewAction.objective,
    source_refs: [
      `.apex-v2/intake/items.json#${bootstrap.intake_id}`,
      `.apex-v2/runs/${bootstrap.run_id}/plan-graph.json`,
      patchRef,
      `${implementationRoot}/host-result.json`,
      `.apex-v2/runs/${bootstrap.run_id}/merge-queue.json`
    ],
    claims: review.claims,
    uncertainties: review.uncertainties || [],
    acceptance_mapping: review.acceptance_mapping.map((item) => ({
      criterion: item.criterion,
      evidence_ref: patchRef,
      status: item.status
    })),
    candidate_digest: reviewAction.candidate_digest,
    findings: review.findings || [],
    residual_risks: review.residual_risks || [],
    merge_posture: review.merge_posture,
    created_at: new Date().toISOString()
  };
  const reviewSubmission = runRuntime(runtimePath, schemaDir, [
    "host",
    "submit",
    "--project",
    workspace,
    "--host-id",
    "codex-host",
    "--worker-id",
    reviewAction.worker_id,
    "--claim-token", reviewClaim.claim_token,
    "--summary",
    `Quick review: ${agentOutput.summary}`,
    "--evidence-json",
    JSON.stringify(evidence)
  ]);
  const closeout = runRuntime(runtimePath, schemaDir, [
    "project",
    "drain",
    "--project",
    workspace,
    "--host-id",
    "codex-host"
  ], {
    APEX_V2_VERIFY_TMPDIR: "/private/tmp",
    TMPDIR: "/private/tmp"
  });
  const status = runRuntime(runtimePath, schemaDir, [
    "status",
    "--project",
    workspace
  ]);
  if (status.active_runs.length !== 0) {
    throw new Error(`plugin quick closeout left active runs: ${status.active_runs.join(",")}`);
  }
  const landing = assertQuickCloseoutLanded({
    workspace,
    task,
    bootstrap,
    implementation
  });
  return {
    implementation,
    review_submission: reviewSubmission,
    closeout,
    status,
    landing,
    candidate_digest: reviewAction.candidate_digest
  };
}

export function assertQuickCloseoutLanded({
  workspace,
  task,
  bootstrap,
  implementation
}) {
  const runRoot = join(workspace, ".apex-v2", "runs", bootstrap.run_id);
  const queue = JSON.parse(readFileSync(
    join(runRoot, "merge-queue.json"),
    "utf8"
  ));
  const item = queue.items.find((entry) =>
    entry.patch_id === implementation.patch_id
  );
  if (!item || item.status !== "merged") {
    throw new Error(
      `plugin quick closeout patch 未落地：`
      + `${implementation.patch_id}=${item?.status || "missing"}`
    );
  }
  const integration = JSON.parse(readFileSync(
    join(runRoot, "integration-report.json"),
    "utf8"
  ));
  if (
    integration.status !== "MERGED"
    || !integration.merged_patches.includes(implementation.patch_id)
  ) {
    throw new Error(
      `plugin quick closeout integration 未确认 patch：${implementation.patch_id}`
    );
  }
  const patch = JSON.parse(readFileSync(
    join(
      runRoot,
      "workers",
      bootstrap.fast_path.worker_id,
      "patches",
      implementation.patch_id,
      "patch-bundle.json"
    ),
    "utf8"
  ));
  for (const operation of patch.operations || []) {
    const target = join(workspace, operation.path);
    const actual = existsSync(target) ? readFileSync(target, "utf8") : null;
    const expected = operation.op === "replace_text"
      ? operation.new_text
      : operation.op === "write_text"
        ? operation.content
        : null;
    if (expected == null || actual !== expected) {
      throw new Error(
        `plugin quick closeout 文件未落地：${operation.path}`
      );
    }
  }
  const publicChecks = runChecks(workspace, task.acceptance_commands || []);
  const failed = publicChecks.filter((check) => check.status !== "PASS");
  if (failed.length > 0) {
    throw new Error(
      `plugin quick closeout 根目录验收失败：`
      + failed.map((check) => check.command).join("; ")
    );
  }
  return {
    status: "PASS",
    patch_id: implementation.patch_id,
    queue_status: item.status,
    integration_status: integration.status,
    applied_files: integration.applied_files,
    public_checks: publicChecks
  };
}

function prepareQuickFastPath({
  workspace,
  runtimePath,
  schemaDir,
  runId,
  plan
}) {
  if (plan.profile !== "quick") return null;
  const actions = runRuntime(runtimePath, schemaDir, [
    "host",
    "actions",
    "--project",
    workspace,
    "--host-id",
    "codex-host"
  ]);
  const implementation = actions.find((action) =>
    action.run_id === runId
    && action.plan_node_id === "delivery-implementation"
  );
  if (!implementation) {
    throw new Error("plugin quick bootstrap expected implementation action");
  }
  const claim = runRuntime(runtimePath, schemaDir, [
    "host",
    "claim",
    "--project",
    workspace,
    "--host-id",
    "codex-host",
    "--worker-id",
    implementation.worker_id
  ]);
  return {
    stage: "implementation",
    worker_id: implementation.worker_id,
    claim_token: claim.action.claim_token,
    workspace_path: resolve(workspace, claim.workspace.workspace_path),
    write_scope: implementation.write_scope,
    verification_commands: plan.verification_policy.required_commands
  };
}

function runRuntime(runtimePath, schemaDir, args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [runtimePath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      APEX_V2_SCHEMA_DIR: schemaDir,
      APEX_V2_CAPABILITY_DIR: join(dirname(schemaDir), "capabilities"),
      ...extraEnv
    }
  });
  if (result.status !== 0) {
    throw new Error(
      `plugin bootstrap failed: ${args.join(" ")}: ${result.stderr || result.stdout}`
    );
  }
  const output = result.stdout.trim();
  try {
    return JSON.parse(output);
  } catch {
    return { stdout: output };
  }
}

function intakeType(scenario) {
  if (scenario === "bug-fix") return "bug";
  if (scenario === "review-defect") return "review_feedback";
  if (scenario === "interrupted") return "test_failure";
  return "feature";
}
