import test from "node:test";
import assert from "node:assert/strict";
import { replayProjectStateFromEvents } from "../src/core/reconcile.mjs";

function event(index, type, payload) {
  return {
    schema_version: "v0",
    event_id: `event-${index}`,
    type,
    timestamp: `2026-08-13T00:00:${String(index).padStart(2, "0")}.000Z`,
    actor: "test",
    payload
  };
}

test("event replay reconstructs ProjectState active runs, knowledge version, and last event", () => {
  const replay = replayProjectStateFromEvents([
    event(1, "project.initialized", {}),
    event(2, "run.created", { run_id: "run-complete" }),
    event(3, "run.node.completed", { run_id: "run-complete", node_id: "learn", gate: "PASS" }),
    event(4, "run.created", { run_id: "run-partial" }),
    event(5, "run.node.completed", { run_id: "run-partial", node_id: "mandate", gate: "PARTIAL_PASS" }),
    event(6, "run.node.completed", { run_id: "run-partial", node_id: "learn", gate: "PASS" }),
    event(7, "knowledge.refreshed", { knowledge_version: 3 }),
    event(8, "learning.applied", {}),
    event(9, "run.carry.updated", { run_id: "run-partial", status: "accepted" }),
    event(10, "run.created", { run_id: "run-active" })
  ]);
  assert.deepEqual(replay, {
    active_runs: ["run-active"],
    knowledge_version: 4,
    last_event_id: "event-10",
    event_count: 10
  });
});
