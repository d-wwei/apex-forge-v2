import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readJson, writeJson } from "../lib/common.mjs";

export function inspectProjectConsistency(root) {
  const project = readJson(join(root, "project.json"));
  const roadmap = readJson(join(root, "roadmap", "graph.json"));
  const manifest = readJson(join(root, "knowledge", "manifest.json"));
  const runs = readRuns(root);
  const eventLog = inspectEventLog(join(root, "events.jsonl"));
  const replay = replayProjectStateFromEvents(eventLog.events);
  const changes = [];
  const issues = [...eventLog.issues];
  const activeRuns = runs
    .filter((run) => expectedRunStatus(run) !== "done")
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .map((run) => run.run_id);
  const lastEvent = eventLog.events.at(-1) || null;

  compare(changes, "project.json", "active_runs", project.active_runs, activeRuns);
  compare(changes, "project.json", "knowledge_version", project.knowledge_version, manifest.version);
  compare(changes, "project.json", "last_event_id", project.last_event_id, lastEvent?.event_id || null);
  compare(changes, "events.jsonl", "replay.active_runs", replay.active_runs, activeRuns);
  compare(changes, "events.jsonl", "replay.knowledge_version", replay.knowledge_version, manifest.version);
  compare(changes, "events.jsonl", "replay.last_event_id", replay.last_event_id, lastEvent?.event_id || null);

  const roadmapById = new Map(roadmap.nodes.map((node) => [node.id, node]));
  const runsByRoadmap = new Map();
  for (const run of runs) {
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

    const expected = expectedRunStatus(run);
    if (run.status !== expected) {
      changes.push({
        path: `.apex-v2/runs/${run.run_id}/run.json`,
        field: "status",
        actual: run.status,
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
    const expected = expectedRunStatus(run) === "done" ? "done" : "active";
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
    changes,
    issues
  };
}

export function replayProjectStateFromEvents(events) {
  const activeRuns = new Set();
  const partialRuns = new Set();
  const learnedRuns = new Set();
  let knowledgeVersion = 0;
  let lastEventId = null;
  for (const event of events) {
    lastEventId = event.event_id;
    if (event.type === "run.created" && event.payload?.run_id) {
      activeRuns.add(event.payload.run_id);
    }
    if (event.type === "run.node.completed" && event.payload?.run_id) {
      if (event.payload.gate === "PARTIAL_PASS") partialRuns.add(event.payload.run_id);
      if (event.payload.node_id === "learn" && ["PASS", "PARTIAL_PASS"].includes(event.payload.gate)) {
        learnedRuns.add(event.payload.run_id);
        if (!partialRuns.has(event.payload.run_id)) activeRuns.delete(event.payload.run_id);
      }
    }
    if (event.type === "run.carry.updated" && event.payload?.run_id && event.payload.status !== "open") {
      partialRuns.delete(event.payload.run_id);
      if (learnedRuns.has(event.payload.run_id)) activeRuns.delete(event.payload.run_id);
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
    }
  }
  return {
    active_runs: [...activeRuns],
    knowledge_version: knowledgeVersion,
    last_event_id: lastEventId,
    event_count: events.length
  };
}

export function applyProjectReconciliation(root, inspection) {
  if (inspection.issues.length > 0) {
    throw new Error(`event/state integrity 无效，拒绝 reconcile：${inspection.issues.length} 个问题`);
  }

  const projectPath = join(root, "project.json");
  const project = readJson(projectPath);
  project.active_runs = inspection.derived.active_runs;
  project.knowledge_version = inspection.derived.knowledge_version;
  project.last_event_id = inspection.derived.last_event_id;
  writeJson(projectPath, project);

  const roadmapPath = join(root, "roadmap", "graph.json");
  const roadmap = readJson(roadmapPath);
  const runs = readRuns(root);
  const runsByRoadmap = new Map(runs.map((run) => [run.roadmap_node_id, run]));
  for (const node of roadmap.nodes) {
    const run = runsByRoadmap.get(node.id);
    if (!run) continue;
    node.status = expectedRunStatus(run) === "done" ? "done" : "active";
  }
  writeJson(roadmapPath, roadmap);

  for (const run of runs) {
    const expected = expectedRunStatus(run);
    if (run.status === expected) continue;
    run.status = expected;
    writeJson(join(root, "runs", run.run_id, "run.json"), run);
  }
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
  const complete = run.nodes.every((node) => ["passed", "partial_pass"].includes(node.status));
  if (complete) {
    const openCarry = (run.carry_forward || []).some((item) => item.status === "open");
    return openCarry ? "paused" : "done";
  }
  const started = run.nodes.some((node) =>
    node.status !== "pending"
    || node.started_at
    || node.completed_at
  );
  return started ? "active" : "planned";
}

function compare(changes, path, field, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return;
  changes.push({ path: `.apex-v2/${path}`, field, actual, expected });
}
