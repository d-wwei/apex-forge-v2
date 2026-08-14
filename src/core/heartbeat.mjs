import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { inspectWorkerExecutors } from "../executors/registry.mjs";
import { ensureDir, now, readJson, shortId, writeJson } from "../lib/common.mjs";
import {
  backfillAdapterObservations,
  recordAdapterObservation,
  refreshStaleAdapterSmoke
} from "./adapter-observability.mjs";
import { buildProjectMetrics } from "./metrics.mjs";
import { dispatchNotifications } from "./notifications.mjs";
import { appendEvent, updateProject } from "./store.mjs";

export function runProjectHeartbeat(root, options = {}) {
  const policy = readJson(join(root, "policies", "quality.json"));
  const inspections = options.inspections || inspectWorkerExecutors();
  const backfill = backfillAdapterObservations(root, { inspections });
  const smoke = refreshStaleAdapterSmoke(root, policy, {
    trigger: "project.heartbeat",
    refreshMissing: true,
    runner: options.smokeRunner,
    inspections
  });
  let observation = null;
  if (!smoke.attempted && observationDue(root, policy.adapter_observation_interval_hours)) {
    observation = recordAdapterObservation(root, inspections, {
      source: "manual"
    });
  }
  const metrics = buildProjectMetrics(root);
  ensureDir(join(root, "metrics"));
  writeJson(join(root, "metrics", `${metrics.snapshot_id}.json`), metrics);
  writeJson(join(root, "metrics", "latest.json"), metrics);
  const notifications = dispatchNotifications(root, {
    force: Boolean(options.forceNotifications),
    deliverer: options.deliverer
  });
  const heartbeat = {
    heartbeat_id: shortId("heartbeat"),
    generated_at: now(),
    backfill,
    smoke,
    observation_id: observation?.snapshot_id || null,
    metrics_snapshot_id: metrics.snapshot_id,
    metrics_status: metrics.evaluation.status,
    notifications
  };
  const event = appendEvent(root, "project.heartbeat.completed", "apex-v2", heartbeat);
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  return heartbeat;
}

function observationDue(root, intervalHours) {
  const historyDir = join(root, "adapters", "history");
  if (!existsSync(historyDir)) return true;
  const latest = readdirSync(historyDir)
    .filter((name) => name.startsWith("adapter-observation-") && name.endsWith(".json"))
    .map((name) => readJson(join(historyDir, name)))
    .sort((left, right) => right.generated_at.localeCompare(left.generated_at))[0];
  if (!latest) return true;
  return Date.now() - Date.parse(latest.generated_at) >= intervalHours * 3600000;
}
