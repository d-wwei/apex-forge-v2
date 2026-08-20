import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProjectHeartbeat } from "../src/core/heartbeat.mjs";
import { enqueueNotification, listNotifications } from "../src/core/notifications.mjs";
import { readJson, writeJson } from "../src/lib/common.mjs";

function fixture() {
  const project = mkdtempSync(join(tmpdir(), "apex-heartbeat-"));
  const root = join(project, ".apex-v2");
  for (const dir of ["adapters/history", "metrics", "notifications", "policies", "risks", "runs"]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  writeJson(join(root, "project.json"), {
    schema_version: "v0",
    format_version: 1,
    revision: 0,
    project_id: "heartbeat",
    project_name: "Heartbeat",
    created_at: "2026-08-13T00:00:00.000Z",
    updated_at: "2026-08-13T00:00:00.000Z",
    active_milestone: null,
    knowledge_version: 0,
    last_event_id: null,
    active_runs: [],
    wip_limits: { active_runs: 1, parallel_workers: 1 }
  });
  writeFileSync(join(root, "events.jsonl"), "");
  writeJson(join(root, "risks", "register.json"), []);
  writeJson(join(root, "notifications", "outbox.json"), []);
  writeJson(join(root, "policies", "quality.json"), {
    schema_version: "v0",
    updated_at: new Date().toISOString(),
    block_new_runs_on_failure: true,
    block_new_runs_on_smoke_failure: true,
    adapter_smoke_max_age_hours: 24,
    adapter_smoke_auto_refresh: true,
    adapter_smoke_refresh_timeout_ms: 180000,
    adapter_observation_interval_hours: 24,
    rolling_window_days: 7,
    rolling_run_count: 20,
    thresholds: {
      max_open_risks: 0,
      max_verification_failures: 0,
      max_adapter_failure_rate: 0.25,
      max_cycle_regression_percent: 50
    }
  });
  writeJson(join(root, "policies", "notifications.json"), {
    schema_version: "v0",
    updated_at: new Date().toISOString(),
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
  const smoke = {
    schema_version: "v0",
    smoke_id: "fresh-smoke",
    generated_at: new Date().toISOString(),
    mode: "live",
    status: "PASS",
    results: []
  };
  writeJson(join(root, "adapters", "latest-live-smoke.json"), smoke);
  writeJson(join(root, "adapters", "smoke-fresh-smoke.json"), smoke);
  return { root };
}

test("project heartbeat refreshes metrics, history, and notification delivery without ready work", () => {
  const { root } = fixture();
  const queued = enqueueNotification(root, {
    event_type: "adapter.smoke.failed",
    severity: "critical",
    dedupe_key: "heartbeat-delivery",
    title: "Heartbeat",
    body: "deliver",
    evidence_refs: [],
    payload: {}
  }).notification;
  const heartbeat = runProjectHeartbeat(root, { inspections: [] });
  assert.equal(heartbeat.smoke.attempted, false);
  assert.ok(heartbeat.backfill.snapshot_count >= 1);
  assert.ok(existsSync(join(root, "metrics", "latest.json")));
  assert.equal(readJson(join(root, "metrics", "latest.json")).snapshot_id, heartbeat.metrics_snapshot_id);
  assert.equal(heartbeat.notifications.delivered.length, 1);
  assert.equal(listNotifications(root).find((item) => item.id === queued.id).status, "delivered");
  assert.equal(
    readFileSync(join(root, "events.jsonl"), "utf8").includes("project.heartbeat.completed"),
    true
  );
});
