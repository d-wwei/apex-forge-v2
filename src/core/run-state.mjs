import { join } from "node:path";
import { now, readJson, writeJson } from "../lib/common.mjs";

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

  const hasPartial = run.nodes.some((node) => node.status === "partial_pass");
  run.status = "done";
  run.gate = {
    status: hasPartial ? "PARTIAL_PASS" : "PASS",
    reason: hasPartial ? "所有节点已结束，但存在 partial pass carry-forward。" : "所有节点已通过。",
    blocking: [],
    carry_forward_ids: (run.carry_forward || []).map((item) => item.id)
  };

  const projectPath = join(root, "project.json");
  const project = readJson(projectPath);
  project.active_runs = project.active_runs.filter((id) => id !== run.run_id);
  project.updated_at = now();
  writeJson(projectPath, project);

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
