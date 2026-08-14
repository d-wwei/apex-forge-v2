import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { inspectWorkerExecutors } from "../executors/registry.mjs";
import { ensureDir, now, readJson, shortId, writeJson } from "../lib/common.mjs";
import { runAdapterSmoke } from "./adapter-smoke.mjs";
import { enqueueNotification } from "./notifications.mjs";
import { syncAdapterSmokeRisk } from "./risks.mjs";
import { appendEvent, updateProject } from "./store.mjs";

export function recordAdapterSmokeReport(root, report, options = {}) {
  ensureDir(join(root, "adapters"));
  const reportPath = join(root, "adapters", `smoke-${report.smoke_id}.json`);
  const latestPath = join(root, "adapters", report.mode === "live" ? "latest-live-smoke.json" : "latest-static-smoke.json");
  writeJson(reportPath, report);
  writeJson(latestPath, report);
  syncAdapterSmokeRisk(root, report);
  const event = appendEvent(root, "adapter.smoke.completed", "apex-v2", {
    smoke_id: report.smoke_id,
    mode: report.mode,
    status: report.status,
    trigger: options.trigger || "manual",
    failed_adapters: report.results.filter((item) => item.status === "FAIL").map((item) => item.adapter)
  });
  updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });

  const inspections = options.inspections || inspectWorkerExecutors();
  const observation = recordAdapterObservation(root, inspections, {
    source: "smoke",
    smokeReport: report
  });
  let notification = null;
  if (report.mode === "live" && report.status === "FAIL") {
    const failed = report.results.filter((item) => item.status === "FAIL");
    notification = enqueueNotification(root, {
      event_type: "adapter.smoke.failed",
      severity: "critical",
      dedupe_key: `adapter-smoke:${failed.map((item) => item.adapter).sort().join(",")}`,
      title: "Adapter live smoke failed",
      body: failed.map((item) => `${item.adapter}: ${item.errors.join(", ")}`).join("; "),
      evidence_refs: [`.apex-v2/adapters/smoke-${report.smoke_id}.json`],
      payload: {
        smoke_id: report.smoke_id,
        failed_adapters: failed.map((item) => item.adapter)
      }
    });
  }
  return { report, observation, notification };
}

export function refreshStaleAdapterSmoke(root, policy, options = {}) {
  const latest = readJson(join(root, "adapters", "latest-live-smoke.json"), null);
  if (!latest && !options.refreshMissing) {
    return { attempted: false, reason: "missing-live-smoke", status: null, smoke_id: null };
  }
  const ageMs = latest ? Date.now() - Date.parse(latest.generated_at) : Infinity;
  const maxAgeMs = policy.adapter_smoke_max_age_hours * 3600000;
  if (latest && Number.isFinite(ageMs) && ageMs <= maxAgeMs) {
    return { attempted: false, reason: "fresh", status: latest.status, smoke_id: latest.smoke_id };
  }
  if (!policy.adapter_smoke_auto_refresh) {
    return { attempted: false, reason: "policy-disabled", status: latest.status, smoke_id: latest.smoke_id };
  }

  const started = appendEvent(root, "adapter.smoke.refresh.started", "apex-v2", {
    trigger: options.trigger || "project.tick",
    previous_smoke_id: latest?.smoke_id || null,
    previous_age_hours: Number.isFinite(ageMs) ? ageMs / 3600000 : null
  });
  updateProject(root, { last_event_id: started.event_id, updated_at: started.timestamp });
  try {
    const runner = options.runner || runAdapterSmoke;
    const report = runner({
      live: true,
      timeoutMs: policy.adapter_smoke_refresh_timeout_ms
    });
    recordAdapterSmokeReport(root, report, {
      trigger: options.trigger || "project.tick",
      inspections: options.inspections
    });
    return {
      attempted: true,
      reason: latest ? "stale" : "missing",
      status: report.status,
      smoke_id: report.smoke_id
    };
  } catch (error) {
    const failed = appendEvent(root, "adapter.smoke.refresh.failed", "apex-v2", {
      trigger: options.trigger || "project.tick",
      error: error.message
    });
    updateProject(root, { last_event_id: failed.event_id, updated_at: failed.timestamp });
    enqueueNotification(root, {
      event_type: "adapter.smoke.refresh_failed",
      severity: "critical",
      dedupe_key: "adapter-smoke-refresh",
      title: "Adapter smoke refresh failed",
      body: error.message,
      evidence_refs: [".apex-v2/events.jsonl"],
      payload: {
        trigger: options.trigger || "project.tick"
      }
    });
    throw error;
  }
}

export function recordAdapterObservation(root, adapters, options = {}) {
  const smokeResults = new Map((options.smokeReport?.results || []).map((item) => [item.adapter, item]));
  const snapshot = {
    schema_version: "v0",
    snapshot_id: shortId("adapter-observation"),
    generated_at: options.generatedAt || now(),
    source: options.source || "manual",
    smoke_id: options.smokeReport?.smoke_id || null,
    adapters: adapters.map((item) => {
      const smoke = smokeResults.get(item.adapter);
      return {
        adapter: item.adapter,
        available: Boolean(item.available),
        version: smoke?.version || item.version || "",
        capabilities: Array.from(new Set(item.capabilities || [])).sort(),
        smoke_status: smoke?.status || null,
        smoke_duration_ms: smoke?.duration_ms ?? null
      };
    })
  };
  const historyDir = join(root, "adapters", "history");
  ensureDir(historyDir);
  writeJson(join(historyDir, `${snapshot.snapshot_id}.json`), snapshot);
  const trend = buildAdapterTrend(root);
  writeJson(join(root, "adapters", "latest-trend.json"), trend);
  if (options.recordEvent !== false) {
    const event = appendEvent(root, "adapter.observation.recorded", "apex-v2", {
      snapshot_id: snapshot.snapshot_id,
      source: snapshot.source,
      smoke_id: snapshot.smoke_id
    });
    updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  }
  return snapshot;
}

export function backfillAdapterObservations(root, options = {}) {
  const historyDir = join(root, "adapters", "history");
  ensureDir(historyDir);
  const existing = readdirSync(historyDir)
    .filter((name) => name.startsWith("adapter-observation-") && name.endsWith(".json"))
    .map((name) => readJson(join(historyDir, name)));
  const smokeIds = new Set(existing.map((item) => item.smoke_id).filter(Boolean));
  const hasBaseline = existing.some((item) => item.source === "baseline" && item.smoke_id == null);
  const inspections = options.inspections || inspectWorkerExecutors();
  let created = 0;

  const baseline = readJson(join(root, "adapters", "capabilities.json"), null);
  if (baseline && !hasBaseline) {
    recordAdapterObservation(root, baseline.adapters || inspections, {
      source: "baseline",
      generatedAt: baseline.generated_at,
      recordEvent: false
    });
    created += 1;
  }

  const smokeFiles = readdirSync(join(root, "adapters"))
    .filter((name) => name.startsWith("smoke-") && name.endsWith(".json"))
    .sort();
  for (const name of smokeFiles) {
    const report = readJson(join(root, "adapters", name));
    if (!report?.smoke_id || smokeIds.has(report.smoke_id)) continue;
    recordAdapterObservation(root, inspections, {
      source: "smoke",
      smokeReport: report,
      generatedAt: report.generated_at,
      recordEvent: false
    });
    smokeIds.add(report.smoke_id);
    created += 1;
  }

  const trend = buildAdapterTrend(root);
  writeJson(join(root, "adapters", "latest-trend.json"), trend);
  if (created > 0 && existsSync(join(root, "events.jsonl"))) {
    const event = appendEvent(root, "adapter.observation.backfilled", "apex-v2", {
      created,
      snapshot_count: trend.snapshot_count
    });
    updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  }
  return { created, snapshot_count: trend.snapshot_count };
}

export function buildAdapterTrend(root) {
  const historyDir = join(root, "adapters", "history");
  const snapshots = existsSync(historyDir)
    ? readdirSync(historyDir)
      .filter((name) => name.startsWith("adapter-observation-") && name.endsWith(".json"))
      .map((name) => readJson(join(historyDir, name)))
      .sort((left, right) =>
        left.generated_at.localeCompare(right.generated_at)
        || left.snapshot_id.localeCompare(right.snapshot_id)
      )
    : [];
  const names = Array.from(new Set(snapshots.flatMap((snapshot) => snapshot.adapters.map((item) => item.adapter)))).sort();
  return {
    schema_version: "v0",
    generated_at: now(),
    snapshot_count: snapshots.length,
    adapters: names.map((name) => summarizeAdapter(name, snapshots))
  };
}

function summarizeAdapter(name, snapshots) {
  const observations = snapshots
    .map((snapshot) => {
      const adapter = snapshot.adapters.find((item) => item.adapter === name);
      return adapter ? { ...adapter, observed_at: snapshot.generated_at } : null;
    })
    .filter(Boolean);
  const versionChanges = [];
  const capabilityChanges = [];
  const availabilityChanges = [];
  for (let index = 1; index < observations.length; index += 1) {
    const before = observations[index - 1];
    const current = observations[index];
    if (before.version !== current.version) {
      versionChanges.push({ from: before.version, to: current.version, observed_at: current.observed_at });
    }
    const added = current.capabilities.filter((item) => !before.capabilities.includes(item));
    const removed = before.capabilities.filter((item) => !current.capabilities.includes(item));
    if (added.length > 0 || removed.length > 0) {
      capabilityChanges.push({ added, removed, observed_at: current.observed_at });
    }
    if (before.available !== current.available) {
      availabilityChanges.push({ from: before.available, to: current.available, observed_at: current.observed_at });
    }
  }
  const latest = observations.at(-1) || {
    adapter: name,
    available: false,
    version: "",
    capabilities: [],
    smoke_status: null,
    smoke_duration_ms: null,
    observed_at: null
  };
  return {
    adapter: name,
    observations: observations.length,
    latest,
    version_changes: versionChanges,
    capability_changes: capabilityChanges,
    availability_changes: availabilityChanges,
    smoke: {
      pass: observations.filter((item) => item.smoke_status === "PASS").length,
      fail: observations.filter((item) => item.smoke_status === "FAIL").length
    }
  };
}
