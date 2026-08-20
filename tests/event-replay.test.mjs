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

test("event replay keeps a partial run active until every carry-forward is handled", () => {
  const beforeFinalCarry = replayProjectStateFromEvents([
    event(1, "run.created", { run_id: "run-partial" }),
    event(2, "run.node.completed", {
      run_id: "run-partial",
      node_id: "execute",
      gate: "PARTIAL_PASS",
      carry_forward_ids: ["carry-1", "carry-2"]
    }),
    event(3, "run.node.completed", { run_id: "run-partial", node_id: "learn", gate: "PASS" }),
    event(4, "run.carry.updated", {
      run_id: "run-partial",
      carry_id: "carry-1",
      status: "resolved"
    })
  ]);
  assert.deepEqual(beforeFinalCarry.active_runs, ["run-partial"]);

  const afterFinalCarry = replayProjectStateFromEvents([
    event(1, "run.created", { run_id: "run-partial" }),
    event(2, "run.node.completed", {
      run_id: "run-partial",
      node_id: "execute",
      gate: "PARTIAL_PASS",
      carry_forward_ids: ["carry-1", "carry-2"]
    }),
    event(3, "run.node.completed", { run_id: "run-partial", node_id: "learn", gate: "PASS" }),
    event(4, "run.carry.updated", {
      run_id: "run-partial",
      carry_id: "carry-1",
      status: "resolved"
    }),
    event(5, "run.carry.updated", {
      run_id: "run-partial",
      carry_id: "carry-2",
      status: "accepted"
    })
  ]);
  assert.deepEqual(afterFinalCarry.active_runs, []);
});

test("project.reconciled event repairs historical knowledge-version replay drift", () => {
  const events = [
    {
      event_id: "event-1",
      type: "run.created",
      payload: { run_id: "run-1" }
    },
    {
      event_id: "event-2",
      type: "project.reconciled",
      payload: {
        active_runs: [],
        knowledge_version: 3
      }
    }
  ];

  const replay = replayProjectStateFromEvents(events);
  assert.deepEqual(replay.active_runs, []);
  assert.equal(replay.knowledge_version, 3);
  assert.equal(replay.last_event_id, "event-2");
});

test("project.reconciled event restores a full operational snapshot", () => {
  const snapshot = {
    schema_version: "v0",
    runs: [{ run_id: "run-1", run_status: "active" }],
    approvals: [],
    transactions: []
  };
  const replay = replayProjectStateFromEvents([
    event(1, "project.reconciled", {
      active_runs: ["run-1"],
      knowledge_version: 4,
      operational_state_hash: "a".repeat(64),
      operational_state: snapshot
    })
  ]);
  assert.deepEqual(replay.operational_state, snapshot);
  assert.equal(replay.operational_state_hash, "a".repeat(64));
  assert.equal(replay.operational_snapshot_event_id, "event-1");
});
