import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  dispatchNotifications,
  enqueueNotification,
  listNotifications
} from "../src/core/notifications.mjs";
import { writeJson } from "../src/lib/common.mjs";

function fixture() {
  const project = mkdtempSync(join(tmpdir(), "apex-notification-delivery-"));
  const root = join(project, ".apex-v2");
  mkdirSync(join(root, "policies"), { recursive: true });
  mkdirSync(join(root, "notifications"), { recursive: true });
  writeJson(join(root, "project.json"), {
    schema_version: "v0",
    format_version: 1,
    revision: 0,
    project_id: "notification-project",
    project_name: "Notification",
    created_at: "2026-08-13T00:00:00.000Z",
    updated_at: "2026-08-13T00:00:00.000Z",
    active_milestone: null,
    knowledge_version: 0,
    last_event_id: null,
    active_runs: [],
    wip_limits: { active_runs: 1, parallel_workers: 1 }
  });
  writeFileSync(join(root, "events.jsonl"), "");
  writeJson(join(root, "notifications", "outbox.json"), []);
  writeJson(join(root, "policies", "notifications.json"), {
    schema_version: "v0",
    updated_at: "2026-08-13T00:00:00.000Z",
    enabled: true,
    minimum_severity: "high",
    dedupe_window_minutes: 60,
    notify_on: ["adapter.smoke.failed"],
    delivery: {
      mode: "file",
      sink_path: "notifications/delivered.jsonl",
      max_attempts: 3,
      retry_backoff_seconds: 1
    }
  });
  return { root };
}

function enqueue(root, key = "smoke:codex") {
  return enqueueNotification(root, {
    event_type: "adapter.smoke.failed",
    severity: "critical",
    dedupe_key: key,
    title: "Smoke failed",
    body: "codex failed",
    evidence_refs: ["smoke.json"],
    payload: { adapter: "codex" }
  }).notification;
}

test("notification dispatcher writes a delivery receipt and terminal status", () => {
  const { root } = fixture();
  const notification = enqueue(root);
  const result = dispatchNotifications(root);
  assert.equal(result.delivered.length, 1);
  const stored = listNotifications(root).find((item) => item.id === notification.id);
  assert.equal(stored.status, "delivered");
  assert.equal(stored.attempts, 1);
  assert.ok(stored.delivered_at);
  assert.match(stored.delivery_receipt, /^file:/);
  const lines = readFileSync(join(root, "notifications", "delivered.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].notification_id, notification.id);
});

test("notification retry reaches dead_letter after the configured attempts", () => {
  const { root } = fixture();
  const notification = enqueue(root, "smoke:claude");
  const deliverer = () => {
    throw new Error("simulated delivery outage");
  };
  dispatchNotifications(root, { deliverer, force: true });
  dispatchNotifications(root, { deliverer, force: true });
  const result = dispatchNotifications(root, { deliverer, force: true });
  assert.equal(result.dead_letter.length, 1);
  const stored = listNotifications(root).find((item) => item.id === notification.id);
  assert.equal(stored.status, "dead_letter");
  assert.equal(stored.attempts, 3);
  assert.match(stored.last_error, /simulated delivery outage/);
});
