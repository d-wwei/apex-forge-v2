import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ensureDir, normalizeEnum, now, readJson, required, shortId, splitList, writeJson, writeTextIfMissing } from "../lib/common.mjs";
import { appendEvent, projectRoot, requireStore, SCHEMA_VERSION, updateProject } from "../core/store.mjs";
import { closeRunIfComplete, createRunNode, getRunNode, haltRun, loadRun, promoteHandledCarrySource, recordRunClosure, requirePassedNode, runHandoffTemplate, writeRun } from "../core/run-state.mjs";
import { assertArtifact, createArtifact, listArtifactsForRun } from "../core/artifacts.mjs";
import { buildTaskPlanGraph, renderPlanGraphMarkdown, validatePlanGraph } from "../core/plan-graph.mjs";
import { buildProjectInventory } from "./knowledge.mjs";
import { KNOWLEDGE_FILES } from "../core/knowledge-constants.mjs";
import { syncCarryRisk } from "../core/risks.mjs";
import { withProjectTransaction } from "../core/project-transaction.mjs";

export function handleRunCommand(subcommand, args) {
  if (subcommand === "create") {
    createRun(args);
    return;
  }
  if (subcommand === "show") {
    showRun(args);
    return;
  }
  if (subcommand === "node") {
    handleRunNode(args);
    return;
  }
  if (subcommand === "plan") {
    handleRunPlan(args);
    return;
  }
  if (subcommand === "carry") {
    handleRunCarry(args);
    return;
  }
  throw new Error(`未知 run 子命令：${subcommand || "(空)"}`);
}

function handleRunPlan(args) {
  const action = args._[0];
  if (action === "generate") {
    generateRunPlan(args);
    return;
  }
  if (action === "show") {
    showRunPlan(args);
    return;
  }
  if (action === "validate") {
    validateRunPlanCommand(args);
    return;
  }
  throw new Error(`未知 run plan 动作：${action || "(空)"}`);
}

function generateRunPlan(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const generated = generateRunPlanInternal(root, run);
  console.log(JSON.stringify(generated, null, 2));
}

export function generateRunPlanInternal(root, run) {
  requirePassedNode(run, "mandate");
  requirePassedNode(run, "context");
  const timestamp = now();
  const projectDir = resolve(root, "..");
  const inventory = buildProjectInventory(projectDir);
  const plan = buildTaskPlanGraph(root, run, timestamp, inventory);
  const validation = validatePlanGraph(plan);
  if (validation.errors.length > 0) {
    throw new Error(`生成的 plan graph 无效：${validation.errors.join("; ")}`);
  }

  const runDir = join(root, "runs", run.run_id);
  writeJson(join(runDir, "plan-graph.json"), plan);
  writeFileSync(join(runDir, "PLAN_GRAPH.md"), renderPlanGraphMarkdown(plan));

  const artifact = createArtifact(root, run, "plan_graph", {
    type: "plan",
    title: `PlanGraph：${plan.source_title}`,
    body: `已根据 intake ${plan.source_intake_id} 生成 ${plan.nodes.length} 个任务节点、${plan.parallel_lanes.length} 条并行 lane、${plan.edges.length} 条依赖边。`,
    refs: [
      `.apex-v2/runs/${run.run_id}/plan-graph.json`,
      `.apex-v2/runs/${run.run_id}/PLAN_GRAPH.md`,
      ".apex-v2/knowledge/index.md",
      ".apex-v2/knowledge/task-to-file-map.md",
      ".apex-v2/knowledge/danger-zones.md"
    ],
    timestamp
  });

  const event = appendEvent(root, "run.plan.generated", "apex-v2", {
    run_id: run.run_id,
    plan_id: plan.plan_id,
    artifact_id: artifact.artifact_id,
    node_count: plan.nodes.length
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });

  return {
    plan,
    artifact_id: artifact.artifact_id,
    validation
  };
}

function showRunPlan(args) {
  const root = requireStore(projectRoot(args));
  const runId = required(args, "run-id");
  const plan = readJson(join(root, "runs", runId, "plan-graph.json"), null);
  if (!plan) throw new Error(`找不到 plan graph：${runId}`);
  console.log(JSON.stringify(plan, null, 2));
}

function validateRunPlanCommand(args) {
  const root = requireStore(projectRoot(args));
  const runId = required(args, "run-id");
  const plan = readJson(join(root, "runs", runId, "plan-graph.json"), null);
  if (!plan) throw new Error(`找不到 plan graph：${runId}`);
  const validation = validatePlanGraph(plan);
  if (validation.errors.length > 0) {
    for (const error of validation.errors) console.error(`- ${error}`);
    throw new Error(`plan graph 校验失败，共 ${validation.errors.length} 个问题`);
  }
  console.log(JSON.stringify(validation, null, 2));
}


function createRun(args) {
  const root = requireStore(projectRoot(args));
  const roadmapId = required(args, "roadmap-id");
  const run = createRunForRoadmapNode(root, roadmapId, now());
  console.log(JSON.stringify(run, null, 2));
}

export function createRunForRoadmapNode(root, roadmapId, timestamp) {
  return withProjectTransaction(resolve(root, ".."), {
    kind: "run-create",
    idempotencyKey: `run-create:${roadmapId}`
  }, () => createRunForRoadmapNodeTransaction(root, roadmapId, timestamp)).result;
}

function createRunForRoadmapNodeTransaction(root, roadmapId, timestamp) {
  const roadmapPath = join(root, "roadmap", "graph.json");
  const graph = readJson(roadmapPath);
  const node = graph.nodes.find((entry) => entry.id === roadmapId);
  if (!node) throw new Error(`找不到 roadmap node：${roadmapId}`);
  if (!["ready", "active"].includes(node.status)) {
    throw new Error(`roadmap node 当前状态不可创建 run：${node.status}`);
  }

  const projectPath = join(root, "project.json");
  const project = readJson(projectPath);
  if (project.active_runs.length >= project.wip_limits.active_runs) {
    throw new Error(`active run 数量已达到 WIP 限制：${project.wip_limits.active_runs}`);
  }

  const runId = shortId("run");
  const runDir = join(root, "runs", runId);
  ensureDir(runDir);
  ensureDir(join(root, "artifacts", runId));

  const run = {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    roadmap_node_id: roadmapId,
    status: "planned",
    context_snapshot: {
      knowledge_version: project.knowledge_version,
      files: KNOWLEDGE_FILES.map(([name]) => `knowledge/${name}`)
    },
    nodes: [
      createRunNode("mandate"),
      createRunNode("context"),
      createRunNode("plan_graph"),
      createRunNode("execute"),
      createRunNode("verify"),
      createRunNode("review"),
      createRunNode("integrate"),
      createRunNode("learn")
    ],
    carry_forward: [],
    gate: {
      status: "PARTIAL_PASS",
      reason: "run 已创建，等待 mandate node 启动。",
      blocking: []
    },
    created_at: timestamp,
    updated_at: timestamp
  };

  writeJson(join(runDir, "run.json"), run);
  writeTextIfMissing(join(runDir, "HANDOFF.md"), runHandoffTemplate(run));

  node.status = "active";
  node.updated_at = timestamp;
  graph.updated_at = timestamp;
  writeJson(roadmapPath, graph);

  updateProject(root, {
    active_runs: [...project.active_runs, runId],
    updated_at: timestamp
  }, { expectedRevision: project.revision });

  const event = appendEvent(root, "run.created", "apex-v2", { run_id: runId, roadmap_node_id: roadmapId });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return run;
}

function showRun(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  console.log(JSON.stringify(run, null, 2));
}

function handleRunNode(args) {
  const action = args._[0];
  if (action === "start") {
    startRunNode(args);
    return;
  }
  if (action === "complete") {
    completeRunNode(args);
    return;
  }
  if (action === "fail") {
    failRunNode(args);
    return;
  }
  if (action === "escalate") {
    escalateRunNode(args);
    return;
  }
  throw new Error(`未知 run node 动作：${action || "(空)"}`);
}

function startRunNode(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const node = getRunNode(run, required(args, "node-id"));
  if (!["pending", "failed_rework", "failed_replan", "escalated"].includes(node.status)) {
    throw new Error(`节点当前状态不可 start：${node.id}=${node.status}`);
  }

  const timestamp = now();
  node.status = "active";
  node.started_at = node.started_at || timestamp;
  node.completed_at = null;
  node.gate = null;
  run.status = "active";
  run.updated_at = timestamp;
  writeRun(root, run);
  const event = appendEvent(root, "run.node.started", "apex-v2", { run_id: run.run_id, node_id: node.id });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  console.log(JSON.stringify(run, null, 2));
}

function completeRunNode(args) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const node = getRunNode(run, required(args, "node-id"));
  const gateStatus = normalizeEnum(args.gate || "PASS", ["PASS", "PARTIAL_PASS", "FAIL_REWORK", "FAIL_REPLAN", "ESCALATE", "HALT"], "gate");
  const evidenceRefs = splitList(args.evidence);
  const reason = String(args.reason || "");
  const carryDescriptions = splitList(args["carry-forward"]);

  if (!["active", "pending", "failed_rework", "failed_replan", "escalated"].includes(node.status)) {
    throw new Error(`节点当前状态不可 complete：${node.id}=${node.status}`);
  }
  if (["PASS", "PARTIAL_PASS"].includes(gateStatus) && evidenceRefs.length === 0) {
    throw new Error(`${gateStatus} gate 必须提供 --evidence，且 evidence 必须引用已提交 artifact`);
  }
  if (gateStatus === "PARTIAL_PASS" && carryDescriptions.length === 0) {
    throw new Error("PARTIAL_PASS 必须提供 --carry-forward");
  }
  for (const artifactId of evidenceRefs) {
    assertArtifact(root, run.run_id, artifactId, node.id);
  }

  const timestamp = now();
  node.status = gateToNodeStatus(gateStatus);
  node.completed_at = timestamp;
  node.evidence_refs = evidenceRefs;
  const carryForward = gateStatus === "PARTIAL_PASS"
    ? carryDescriptions.map((description) => ({
        id: shortId("carry"),
        source_node_id: node.id,
        description,
        severity: normalizeEnum(args["carry-severity"] || "medium", ["low", "medium", "high", "critical"], "carry-severity"),
        target_node_id: args["carry-target"] ? String(args["carry-target"]) : nextRunNodeId(run, node.id),
        status: "open",
        resolution: "",
        resolved_by: null,
        evidence_refs: evidenceRefs,
        created_at: timestamp,
        updated_at: timestamp
      }))
    : [];
  run.carry_forward = [...(run.carry_forward || []), ...carryForward];
  for (const carry of carryForward) syncCarryRisk(root, run.run_id, carry);
  node.gate = {
    status: gateStatus,
    reason,
    blocking: splitList(args.blocking),
    carry_forward_ids: carryForward.map((item) => item.id)
  };
  run.updated_at = timestamp;
  run.gate = node.gate;
  if (gateStatus === "HALT") haltRun(root, run, timestamp);
  else closeRunIfComplete(root, run);
  writeRun(root, run);
  const nodeEvent = appendEvent(root, "run.node.completed", "apex-v2", {
    run_id: run.run_id,
    node_id: node.id,
    gate: gateStatus,
    evidence_refs: evidenceRefs,
    carry_forward_ids: carryForward.map((item) => item.id)
  });
  const event = gateStatus === "HALT"
    ? appendEvent(root, "run.halted", "apex-v2", {
        run_id: run.run_id,
        roadmap_node_id: run.roadmap_node_id,
        node_id: node.id,
        reason
      })
    : nodeEvent;
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  if (gateStatus !== "HALT") recordRunClosure(root, run, "run.node.complete");
  console.log(JSON.stringify(run, null, 2));
}

function nextRunNodeId(run, nodeId) {
  const index = run.nodes.findIndex((node) => node.id === nodeId);
  return index >= 0 && index < run.nodes.length - 1 ? run.nodes[index + 1].id : null;
}

function handleRunCarry(args) {
  const action = args._[0];
  if (action === "list") {
    const root = requireStore(projectRoot(args));
    const run = loadRun(root, required(args, "run-id"));
    console.log(JSON.stringify(run.carry_forward || [], null, 2));
    return;
  }
  if (action === "resolve" || action === "accept") {
    updateRunCarry(args, action);
    return;
  }
  throw new Error(`未知 run carry 动作：${action || "(空)"}`);
}

function updateRunCarry(args, action) {
  const root = requireStore(projectRoot(args));
  const run = loadRun(root, required(args, "run-id"));
  const carryId = required(args, "id");
  const carry = (run.carry_forward || []).find((item) => item.id === carryId);
  if (!carry) throw new Error(`找不到 carry-forward：${carryId}`);
  if (carry.status !== "open") throw new Error(`carry-forward 已处理：${carryId}=${carry.status}`);
  const evidenceRefs = splitList(args.evidence);
  if (action === "resolve" && evidenceRefs.length === 0) {
    throw new Error("resolve carry-forward 必须提供 --evidence");
  }
  const artifacts = listArtifactsForRun(root, run.run_id);
  for (const artifactId of evidenceRefs) {
    if (!artifacts.some((artifact) => artifact.artifact_id === artifactId)) {
      throw new Error(`carry-forward evidence 不属于当前 run：${artifactId}`);
    }
  }
  carry.status = action === "resolve" ? "resolved" : "accepted";
  carry.resolution = String(args.reason || (action === "resolve" ? "evidence resolved" : "human accepted residual risk"));
  carry.resolved_by = action === "resolve" ? "evidence" : "human";
  carry.evidence_refs = Array.from(new Set([...carry.evidence_refs, ...evidenceRefs]));
  carry.updated_at = now();
  syncCarryRisk(root, run.run_id, carry);
  const promotedNode = promoteHandledCarrySource(run, carry.source_node_id, carry.updated_at);
  const remainingOpenCarryIds = (run.carry_forward || [])
    .filter((item) => item.status === "open")
    .map((item) => item.id);
  run.updated_at = carry.updated_at;
  closeRunIfComplete(root, run);
  writeRun(root, run);
  const carryEvent = appendEvent(root, "run.carry.updated", "apex-v2", {
    run_id: run.run_id,
    carry_id: carry.id,
    status: carry.status,
    evidence_refs: evidenceRefs,
    source_node_id: carry.source_node_id,
    source_node_promoted: Boolean(promotedNode),
    remaining_open_carry_ids: remainingOpenCarryIds
  });
  const event = promotedNode
    ? appendEvent(root, "run.node.completed", "apex-v2", {
        run_id: run.run_id,
        node_id: promotedNode.id,
        gate: "PASS",
        evidence_refs: promotedNode.evidence_refs,
        carry_forward_ids: promotedNode.gate.carry_forward_ids,
        via: "carry-forward"
      })
    : carryEvent;
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  recordRunClosure(root, run, "run.carry");
  console.log(JSON.stringify({ run, carry }, null, 2));
}

function failRunNode(args) {
  const mode = normalizeEnum(args.mode || "rework", ["rework", "replan"], "mode");
  const gate = mode === "replan" ? "FAIL_REPLAN" : "FAIL_REWORK";
  completeRunNode({
    ...args,
    gate,
    reason: args.reason || `节点失败，需要 ${mode}。`
  });
}

function escalateRunNode(args) {
  completeRunNode({
    ...args,
    gate: "ESCALATE",
    reason: args.reason || "节点需要人工决策。"
  });
}

function gateToNodeStatus(gateStatus) {
  return {
    PASS: "passed",
    PARTIAL_PASS: "partial_pass",
    FAIL_REWORK: "failed_rework",
    FAIL_REPLAN: "failed_replan",
    ESCALATE: "escalated",
    HALT: "halted"
  }[gateStatus];
}
