import { join } from "node:path";
import { now, readJson, writeJson } from "../lib/common.mjs";
import { appendEvent, updateProject } from "./store.mjs";

export function loadRun(root, runId) {
  const path = join(root, "runs", runId, "run.json");
  const run = readJson(path, null);
  if (!run) throw new Error(`找不到 run：${runId}`);
  return run;
}

export function writeRun(root, run) {
  writeJson(join(root, "runs", run.run_id, "run.json"), run);
}

export function getRunNode(run, nodeId) {
  const node = run.nodes.find((entry) => entry.id === nodeId);
  if (!node) throw new Error(`找不到 run node：${nodeId}`);
  return node;
}

export function createRunNode(id) {
  return {
    id,
    status: "pending",
    started_at: null,
    completed_at: null,
    gate: null,
    evidence_refs: []
  };
}

export function requirePassedNode(run, nodeId) {
  const node = getRunNode(run, nodeId);
  if (!["passed", "partial_pass"].includes(node.status)) {
    throw new Error(`生成 plan graph 前必须先 PASS/PARTIAL_PASS ${nodeId} 节点，当前状态：${node.status}`);
  }
}

export function promoteHandledCarrySource(run, sourceNodeId, timestamp = now()) {
  const node = getRunNode(run, sourceNodeId);
  const carryForward = (run.carry_forward || [])
    .filter((item) => item.source_node_id === sourceNodeId);
  if (
    node.status !== "partial_pass"
    || carryForward.length === 0
    || carryForward.some((item) => item.status === "open")
  ) {
    return null;
  }

  node.status = "passed";
  node.completed_at = timestamp;
  node.evidence_refs = Array.from(new Set([
    ...(node.evidence_refs || []),
    ...carryForward.flatMap((item) => item.evidence_refs || [])
  ]));
  node.gate = {
    status: "PASS",
    reason: "PARTIAL_PASS carry-forward 已全部处理，源节点提升为 PASS。",
    blocking: [],
    carry_forward_ids: carryForward.map((item) => item.id)
  };
  return node;
}

export function closeRunIfComplete(root, run) {
  const successful = run.nodes.every((node) => ["passed", "partial_pass"].includes(node.status));
  if (!successful) return;

  const openCarry = (run.carry_forward || []).filter((item) => item.status === "open");
  if (openCarry.length > 0) {
    run.status = "paused";
    run.gate = {
      status: "ESCALATE",
      reason: `所有节点已结束，但仍有 ${openCarry.length} 条 carry-forward 未处理。`,
      blocking: openCarry.map((item) => item.id),
      carry_forward_ids: openCarry.map((item) => item.id)
    };
    return;
  }

  const partialNodes = run.nodes.filter((node) => node.status === "partial_pass");
  if (partialNodes.length > 0) {
    run.status = "paused";
    run.gate = {
      status: "PARTIAL_PASS",
      reason: "所有 carry-forward 已处理，但仍有 partial pass 节点未提升为 PASS。",
      blocking: partialNodes.map((node) => node.id),
      carry_forward_ids: (run.carry_forward || []).map((item) => item.id)
    };
    return;
  }

  run.status = "done";
  run.closed_at = run.closed_at || now();
  run.closure_kind = run.closure_kind || "all_nodes_passed";
  run.gate = {
    status: "PASS",
    reason: "所有节点已通过。",
    blocking: [],
    carry_forward_ids: (run.carry_forward || []).map((item) => item.id)
  };

  const project = readJson(join(root, "project.json"));
  updateProject(root, {
    active_runs: project.active_runs.filter((id) => id !== run.run_id),
    updated_at: now()
  });

  const roadmapPath = join(root, "roadmap", "graph.json");
  const roadmap = readJson(roadmapPath);
  const roadmapNode = roadmap.nodes.find((node) => node.id === run.roadmap_node_id);
  if (roadmapNode) {
    roadmapNode.status = "done";
    roadmapNode.updated_at = now();
    roadmap.updated_at = roadmapNode.updated_at;
    writeJson(roadmapPath, roadmap);
  }
}

export function recordRunClosure(root, run, via = "apex-v2") {
  if (run.status !== "done" || run.closure_event_id) return null;
  const event = appendEvent(root, "run.closed", "apex-v2", {
    run_id: run.run_id,
    roadmap_node_id: run.roadmap_node_id,
    closure_kind: run.closure_kind || "all_nodes_passed",
    closed_at: run.closed_at || now(),
    learning_proposal_ids: run.learning_proposal_ids || [],
    learning_apply_job_ids: run.learning_apply_job_ids || [],
    via
  });
  run.closure_event_id = event.event_id;
  run.closed_at = run.closed_at || event.timestamp;
  writeRun(root, run);
  updateProject(root, {
    last_event_id: event.event_id,
    updated_at: event.timestamp
  });
  return event;
}

export function haltRun(root, run, timestamp = now()) {
  run.status = "halted";
  run.updated_at = timestamp;

  const project = readJson(join(root, "project.json"));
  updateProject(root, {
    active_runs: project.active_runs.filter((id) => id !== run.run_id),
    updated_at: timestamp
  });

  const roadmapPath = join(root, "roadmap", "graph.json");
  const roadmap = readJson(roadmapPath);
  const roadmapNode = roadmap.nodes.find((node) => node.id === run.roadmap_node_id);
  if (roadmapNode) {
    roadmapNode.status = "blocked";
    roadmapNode.updated_at = timestamp;
    roadmap.updated_at = timestamp;
    writeJson(roadmapPath, roadmap);
  }
}

export function runHandoffTemplate(run) {
  return `# Delivery Run Handoff

run_id: ${run.run_id}
roadmap_node_id: ${run.roadmap_node_id}
status: ${run.status}

## 当前状态

- 已创建 delivery run。
- 尚未启动 mandate node。

## Context Snapshot

- knowledge_version: ${run.context_snapshot.knowledge_version}
- files:
${run.context_snapshot.files.map((file) => `  - ${file}`).join("\n")}

## 下一步

1. 补全 mandate artifact。
2. 生成 context snapshot。
3. 进入 plan_graph。
`;
}
