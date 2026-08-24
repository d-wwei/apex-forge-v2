import { join } from "node:path";
import { normalizeEnum, now, readJson, shortId, splitList, writeJson } from "../lib/common.mjs";
import { appendEvent, SCHEMA_VERSION, updateProject } from "./store.mjs";

export function addIntakeItem(root, args) {
  const timestamp = now();
  const item = {
    schema_version: SCHEMA_VERSION,
    id: shortId("intake"),
    source: String(args.source || "user"),
    type: normalizeEnum(args.type || "feature", ["feature", "bug", "test_failure", "review_feedback", "tech_debt", "risk", "idea", "other"], "type"),
    title: String(args.title),
    description: String(args.description || ""),
    priority: normalizeEnum(args.priority || "P2", ["P0", "P1", "P2", "P3"], "priority"),
    risk: normalizeEnum(args.risk || "medium", ["low", "medium", "high", "critical"], "risk"),
    affected_area: String(args.area || "unknown"),
    method_pack_id: args["method-pack"] ? String(args["method-pack"]) : null,
    acceptance_commands: parseAcceptanceCommands(args),
    evidence_refs: splitList(args.evidence),
    source_spec: args.source_spec || null,
    triage: {
      status: "new",
      decision: null,
      target_milestone: null,
      reason: null
    },
    created_at: timestamp,
    updated_at: timestamp
  };

  const path = join(root, "intake", "items.json");
  const items = readJson(path, []);
  items.push(item);
  writeJson(path, items);
  const event = appendEvent(root, "intake.added", "apex-v2", { intake_id: item.id, title: item.title });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return item;
}

function parseAcceptanceCommands(args) {
  if (!args["acceptance-json"]) return [];
  let commands;
  try {
    commands = JSON.parse(String(args["acceptance-json"]));
  } catch (error) {
    throw new Error(`acceptance-json 必须是 JSON 数组：${error.message}`);
  }
  if (
    !Array.isArray(commands)
    || commands.some((command) => typeof command !== "string" || !command.trim())
  ) {
    throw new Error("acceptance-json 必须是非空字符串数组");
  }
  return [...new Set(commands.map((command) => command.trim()))];
}

export function listIntakeItems(root, statusFilter = null) {
  const items = readJson(join(root, "intake", "items.json"), []);
  return statusFilter ? items.filter((item) => item.triage.status === statusFilter) : items;
}

export function triageIntakeItem(root, id, input) {
  const decision = normalizeEnum(input.decision || "accepted", ["accepted", "deferred", "rejected"], "decision");
  const path = join(root, "intake", "items.json");
  const items = readJson(path, []);
  const item = items.find((entry) => entry.id === id);
  if (!item) throw new Error(`找不到 intake：${id}`);

  item.triage = {
    status: decision,
    decision,
    target_milestone: input["target-milestone"] ? String(input["target-milestone"]) : item.triage.target_milestone,
    reason: input.reason ? String(input.reason) : null
  };
  item.updated_at = now();
  writeJson(path, items);
  const event = appendEvent(root, "intake.triaged", "apex-v2", { intake_id: id, decision });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return item;
}

export function promoteRoadmapNode(root, intakeId, input = {}) {
  const intake = readJson(join(root, "intake", "items.json"), []);
  const item = intake.find((entry) => entry.id === intakeId);
  if (!item) throw new Error(`找不到 intake：${intakeId}`);
  if (item.triage.status !== "accepted") {
    throw new Error(`intake 尚未 accepted，不能进入 roadmap：${intakeId}`);
  }

  const roadmapPath = join(root, "roadmap", "graph.json");
  const graph = readJson(roadmapPath);
  const existing = graph.nodes.find((node) => node.source_intake_id === intakeId);
  if (existing) return existing;

  const timestamp = now();
  const node = createRoadmapNodeFromIntake(item, timestamp, input.title);
  graph.nodes.push(node);
  graph.updated_at = timestamp;
  if (item.triage.target_milestone && !graph.milestones.includes(item.triage.target_milestone)) {
    graph.milestones.push(item.triage.target_milestone);
  }
  writeJson(roadmapPath, graph);
  const event = appendEvent(root, "roadmap.promoted", "apex-v2", { roadmap_node_id: node.id, intake_id: intakeId });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return node;
}

export function createRoadmapNodeFromIntake(item, timestamp, title = null) {
  return {
    id: shortId("roadmap"),
    title: String(title || item.title),
    source_intake_id: item.id,
    status: "ready",
    priority: item.priority,
    risk: item.risk,
    created_at: timestamp,
    updated_at: timestamp
  };
}

export function compareRoadmapPriority(a, b) {
  const priorityRank = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const riskRank = { critical: 0, high: 1, medium: 2, low: 3 };
  return (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9)
    || (riskRank[a.risk] ?? 9) - (riskRank[b.risk] ?? 9)
    || a.created_at.localeCompare(b.created_at);
}
