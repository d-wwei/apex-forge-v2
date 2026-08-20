import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readJson, writeJson } from "../lib/common.mjs";
import { updateProject } from "./store.mjs";
import { inspectOperationalIntegrity } from "./operational-state.mjs";
import { promoteHandledCarrySource } from "./run-state.mjs";

export function inspectProjectConsistency(root) {
  const project = readJson(join(root, "project.json"));
  const roadmap = readJson(join(root, "roadmap", "graph.json"));
  const manifest = readJson(join(root, "knowledge", "manifest.json"));
  const runStates = readRuns(root).map((run) => ({
    actual: run,
    normalized: normalizeRunForReconciliation(run)
  }));
  const runs = runStates.map((entry) => entry.normalized);
  const eventLog = inspectEventLog(join(root, "events.jsonl"));
  const replay = replayProjectStateFromEvents(eventLog.events);
  const operational = inspectOperationalIntegrity(root);
  const changes = [];
  const issues = [...eventLog.issues, ...operational.issues];
  const activeRuns = runs
    .filter((run) => !["done", "halted"].includes(expectedRunStatus(run)))
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .map((run) => run.run_id);
  const lastEvent = eventLog.events.at(-1) || null;

  compare(changes, "project.json", "active_runs", project.active_runs, activeRuns);
  compare(changes, "project.json", "knowledge_version", project.knowledge_version, manifest.version);
  compare(changes, "project.json", "last_event_id", project.last_event_id, lastEvent?.event_id || null);
  compare(changes, "events.jsonl", "replay.active_runs", replay.active_runs, activeRuns);
  compare(changes, "events.jsonl", "replay.knowledge_version", replay.knowledge_version, manifest.version);
  compare(changes, "events.jsonl", "replay.last_event_id", replay.last_event_id, lastEvent?.event_id || null);
  if (
    replay.operational_snapshot_event_id
    && replay.operational_snapshot_event_id === lastEvent?.event_id
  ) {
    compare(
      changes,
      "events.jsonl",
      "replay.operational_state_hash",
      replay.operational_state_hash,
      operational.state_hash
    );
  } else if (replay.operational_snapshot_event_id) {
    operational.warnings.push({
      kind: "operational-snapshot-stale",
      path: ".apex-v2/events.jsonl",
      detail: `${replay.operational_snapshot_event_id} != ${lastEvent?.event_id || "none"}`
    });
  }

  const roadmapById = new Map(roadmap.nodes.map((node) => [node.id, node]));
  const runsByRoadmap = new Map();
  for (const entry of runStates) {
    const { actual, normalized: run } = entry;
    if (!roadmapById.has(run.roadmap_node_id)) {
      issues.push({
        kind: "orphan-run",
        path: `.apex-v2/runs/${run.run_id}/run.json`,
        detail: `roadmap node 不存在：${run.roadmap_node_id}`
      });
      continue;
    }
    const siblings = runsByRoadmap.get(run.roadmap_node_id) || [];
    siblings.push(run);
    runsByRoadmap.set(run.roadmap_node_id, siblings);

    recordRunNormalizationChanges(changes, actual, run);
    const expected = expectedRunStatus(run);
    if (actual.status !== expected) {
      changes.push({
        path: `.apex-v2/runs/${run.run_id}/run.json`,
        field: "status",
        actual: actual.status,
        expected
      });
    }
  }

  for (const [roadmapId, roadmapRuns] of runsByRoadmap) {
    if (roadmapRuns.length > 1) {
      issues.push({
        kind: "duplicate-roadmap-runs",
        path: ".apex-v2/roadmap/graph.json",
        detail: `${roadmapId} 对应多个 run：${roadmapRuns.map((run) => run.run_id).join(",")}`
      });
      continue;
    }
    const run = roadmapRuns[0];
    const runStatus = expectedRunStatus(run);
    const expected = runStatus === "done"
      ? "done"
      : runStatus === "halted"
        ? "blocked"
        : "active";
    const node = roadmapById.get(roadmapId);
    if (node.status !== expected) {
      changes.push({
        path: ".apex-v2/roadmap/graph.json",
        field: `nodes.${roadmapId}.status`,
        actual: node.status,
        expected
      });
    }
  }

  return {
    status: issues.length > 0 ? "INVALID" : changes.length > 0 ? "DRIFT" : "CONSISTENT",
    event_log: {
      event_count: eventLog.events.length,
      last_event_id: lastEvent?.event_id || null,
      last_timestamp: lastEvent?.timestamp || null,
      duplicate_event_ids: eventLog.duplicate_event_ids
    },
    derived: {
      active_runs: activeRuns,
      knowledge_version: manifest.version,
      last_event_id: lastEvent?.event_id || null
    },
    event_replay: replay,
    operational_state: {
      state_hash: operational.state_hash,
      warnings: operational.warnings
    },
    changes,
    issues
  };
}

export function replayProjectStateFromEvents(events) {
  const activeRuns = new Set();
  const partialRuns = new Set();
  const openCarryIdsByRun = new Map();
  const learnedRuns = new Set();
  let knowledgeVersion = 0;
  let lastEventId = null;
  let operationalState = null;
  let operationalStateHash = null;
  let operationalSnapshotEventId = null;
  for (const event of events) {
    lastEventId = event.event_id;
    if (event.type === "run.created" && event.payload?.run_id) {
      activeRuns.add(event.payload.run_id);
    }
    if (event.type === "run.halted" && event.payload?.run_id) {
      activeRuns.delete(event.payload.run_id);
      partialRuns.delete(event.payload.run_id);
      openCarryIdsByRun.delete(event.payload.run_id);
      learnedRuns.delete(event.payload.run_id);
    }
    if (event.type === "run.node.completed" && event.payload?.run_id) {
      if (event.payload.gate === "PARTIAL_PASS") {
        partialRuns.add(event.payload.run_id);
        const carryIds = Array.isArray(event.payload.carry_forward_ids)
          ? event.payload.carry_forward_ids
          : [];
        if (carryIds.length > 0) {
          const openCarryIds = openCarryIdsByRun.get(event.payload.run_id) || new Set();
          for (const carryId of carryIds) openCarryIds.add(carryId);
          openCarryIdsByRun.set(event.payload.run_id, openCarryIds);
        } else {
          openCarryIdsByRun.set(event.payload.run_id, null);
        }
      }
      if (event.payload.node_id === "learn" && ["PASS", "PARTIAL_PASS"].includes(event.payload.gate)) {
        learnedRuns.add(event.payload.run_id);
        if (!partialRuns.has(event.payload.run_id)) activeRuns.delete(event.payload.run_id);
      }
    }
    if (event.type === "run.carry.updated" && event.payload?.run_id && event.payload.status !== "open") {
      const openCarryIds = openCarryIdsByRun.get(event.payload.run_id);
      if (openCarryIds instanceof Set && event.payload.carry_id) {
        openCarryIds.delete(event.payload.carry_id);
        if (openCarryIds.size === 0) {
          openCarryIdsByRun.delete(event.payload.run_id);
          partialRuns.delete(event.payload.run_id);
        }
      } else {
        openCarryIdsByRun.delete(event.payload.run_id);
        partialRuns.delete(event.payload.run_id);
      }
      if (!partialRuns.has(event.payload.run_id) && learnedRuns.has(event.payload.run_id)) {
        activeRuns.delete(event.payload.run_id);
      }
    }
    if (event.type === "knowledge.refreshed" && Number.isInteger(event.payload?.knowledge_version)) {
      knowledgeVersion = event.payload.knowledge_version;
    }
    if (event.type === "learning.applied") {
      knowledgeVersion = Number.isInteger(event.payload?.knowledge_version)
        ? event.payload.knowledge_version
        : knowledgeVersion + 1;
    }
    if (event.type === "project.reconciled") {
      if (Array.isArray(event.payload?.active_runs)) {
        activeRuns.clear();
        for (const runId of event.payload.active_runs) activeRuns.add(runId);
        partialRuns.clear();
        learnedRuns.clear();
      }
      if (Number.isInteger(event.payload?.knowledge_version)) {
        knowledgeVersion = event.payload.knowledge_version;
      }
      if (event.payload?.operational_state && event.payload?.operational_state_hash) {
        operationalState = event.payload.operational_state;
        operationalStateHash = event.payload.operational_state_hash;
        operationalSnapshotEventId = event.event_id;
      }
    }
  }
  const replay = {
    active_runs: [...activeRuns],
    knowledge_version: knowledgeVersion,
    last_event_id: lastEventId,
    event_count: events.length
  };
  if (operationalSnapshotEventId) {
    replay.operational_state = operationalState;
    replay.operational_state_hash = operationalStateHash;
    replay.operational_snapshot_event_id = operationalSnapshotEventId;
  }
  return replay;
}

export function applyProjectReconciliation(root, inspection) {
  if (inspection.issues.length > 0) {
    throw new Error(`event/state integrity 无效，拒绝 reconcile：${inspection.issues.length} 个问题`);
  }

  updateProject(root, {
    active_runs: inspection.derived.active_runs,
    knowledge_version: inspection.derived.knowledge_version,
    last_event_id: inspection.derived.last_event_id
  });

  const roadmapPath = join(root, "roadmap", "graph.json");
  const roadmap = readJson(roadmapPath);
  const runs = readRuns(root).map(normalizeRunForReconciliation);
  for (const run of runs) {
    run.status = expectedRunStatus(run);
    writeJson(join(root, "runs", run.run_id, "run.json"), run);
  }
  const runsByRoadmap = new Map(runs.map((run) => [run.roadmap_node_id, run]));
  for (const node of roadmap.nodes) {
    const run = runsByRoadmap.get(node.id);
    if (!run) continue;
    const runStatus = expectedRunStatus(run);
    node.status = runStatus === "done"
      ? "done"
      : runStatus === "halted"
        ? "blocked"
        : "active";
  }
  writeJson(roadmapPath, roadmap);
}

export function inspectEventLog(path) {
  const issues = [];
  const events = [];
  const ids = new Set();
  const duplicateIds = [];
  if (!existsSync(path)) {
    return {
      events,
      duplicate_event_ids: duplicateIds,
      issues: [{ kind: "missing-event-log", path, detail: "events.jsonl 不存在" }]
    };
  }

  const lines = readFileSync(path, "utf8").split("\n");
  let previousTimestamp = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      issues.push({
        kind: "invalid-event-json",
        path,
        detail: `line ${index + 1}: ${error.message}`
      });
      continue;
    }
    for (const field of ["schema_version", "event_id", "type", "timestamp", "actor", "payload"]) {
      if (!(field in event)) {
        issues.push({
          kind: "invalid-event-contract",
          path,
          detail: `line ${index + 1}: 缺少 ${field}`
        });
      }
    }
    if (ids.has(event.event_id)) {
      duplicateIds.push(event.event_id);
      issues.push({
        kind: "duplicate-event-id",
        path,
        detail: `line ${index + 1}: ${event.event_id}`
      });
    }
    ids.add(event.event_id);
    if (Number.isNaN(Date.parse(event.timestamp))) {
      issues.push({
        kind: "invalid-event-timestamp",
        path,
        detail: `line ${index + 1}: ${event.timestamp}`
      });
    } else if (previousTimestamp && event.timestamp < previousTimestamp) {
      issues.push({
        kind: "non-monotonic-event-time",
        path,
        detail: `line ${index + 1}: ${event.timestamp} < ${previousTimestamp}`
      });
    }
    previousTimestamp = event.timestamp;
    events.push(event);
  }
  return { events, duplicate_event_ids: duplicateIds, issues };
}

function readRuns(root) {
  const runsDir = join(root, "runs");
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readJson(join(runsDir, entry.name, "run.json"), null))
    .filter(Boolean);
}

function expectedRunStatus(run) {
  if (run.nodes.some((node) => node.status === "halted")) return "halted";
  if (run.nodes.every((node) => node.status === "passed")) {
    return "done";
  }
  const terminal = run.nodes.every((node) => ["passed", "partial_pass"].includes(node.status));
  if (terminal) {
    const openCarry = (run.carry_forward || []).some((item) => item.status === "open");
    return openCarry || run.nodes.some((node) => node.status === "partial_pass")
      ? "paused"
      : "done";
  }
  const started = run.nodes.some((node) =>
    node.status !== "pending"
    || node.started_at
    || node.completed_at
  );
  return started ? "active" : "planned";
}

function normalizeRunForReconciliation(run) {
  const normalized = JSON.parse(JSON.stringify(run));
  let latestPromotionTimestamp = null;
  for (const node of normalized.nodes) {
    if (node.status !== "partial_pass") continue;
    const carryForward = (normalized.carry_forward || [])
      .filter((item) => item.source_node_id === node.id);
    const timestamp = carryForward
      .map((item) => item.updated_at)
      .filter(Boolean)
      .sort()
      .at(-1)
      || node.completed_at
      || normalized.updated_at
      || normalized.created_at;
    const promoted = timestamp
      ? promoteHandledCarrySource(normalized, node.id, timestamp)
      : promoteHandledCarrySource(normalized, node.id);
    if (promoted && (!latestPromotionTimestamp || timestamp > latestPromotionTimestamp)) {
      latestPromotionTimestamp = timestamp;
    }
  }

  if (latestPromotionTimestamp && normalized.nodes.every((node) => node.status === "passed")) {
    normalized.status = "done";
    normalized.gate = {
      status: "PASS",
      reason: "所有节点已通过。",
      blocking: [],
      carry_forward_ids: (normalized.carry_forward || []).map((item) => item.id)
    };
    normalized.updated_at = [normalized.updated_at, latestPromotionTimestamp]
      .filter(Boolean)
      .sort()
      .at(-1);
  }
  return normalized;
}

function recordRunNormalizationChanges(changes, actual, normalized) {
  const path = `runs/${actual.run_id}/run.json`;
  const actualNodes = new Map(actual.nodes.map((node) => [node.id, node]));
  for (const node of normalized.nodes) {
    const previous = actualNodes.get(node.id);
    if (!previous) continue;
    for (const field of ["status", "completed_at", "gate", "evidence_refs"]) {
      compare(changes, path, `nodes.${node.id}.${field}`, previous[field], node[field]);
    }
  }
  compare(changes, path, "gate", actual.gate, normalized.gate);
  compare(changes, path, "updated_at", actual.updated_at, normalized.updated_at);
}

function compare(changes, path, field, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return;
  changes.push({ path: `.apex-v2/${path}`, field, actual, expected });
}
