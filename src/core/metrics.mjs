import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { now, readJson, shortId } from "../lib/common.mjs";

export function buildProjectMetrics(root) {
  const runs = readRunFiles(root);
  const workers = findJson(root, (name) => name === "worker.json");
  const adapterResults = findJson(root, (name) => name.startsWith("adapter-result-"));
  const verification = findJson(root, (name) => name === "verification-report.json");
  const integration = findJson(root, (name) => name === "integration-report.json");
  const events = readFileSync(join(root, "events.jsonl"), "utf8").split("\n").filter(Boolean).map(JSON.parse);
  const risks = readJson(join(root, "risks", "register.json"), []);
  const durations = runs.filter((run) => run.status === "done").map((run) => Date.parse(run.updated_at) - Date.parse(run.created_at));
  const previous = readJson(join(root, "metrics", "latest.json"), null);
  const policy = readJson(join(root, "policies", "quality.json"), null);
  const rollingWindowDays = policy?.rolling_window_days || 7;
  const rollingRunCount = policy?.rolling_run_count || 20;
  const windowSince = Date.now() - rollingWindowDays * 86400000;
  const windowRuns = runs
    .filter((run) => Date.parse(run.updated_at || run.created_at) >= windowSince)
    .sort((left, right) => Date.parse(left.updated_at) - Date.parse(right.updated_at))
    .slice(-rollingRunCount);
  const windowRunIds = new Set(windowRuns.map((run) => run.run_id));
  const windowAdapterResults = adapterResults.filter((item) =>
    windowRunIds.has(item.run_id) && Date.parse(item.created_at) >= windowSince
  );
  const windowVerification = verification.filter((item) =>
    windowRunIds.has(item.run_id) && Date.parse(item.created_at) >= windowSince
  );
  const windowIntegration = integration.filter((item) =>
    windowRunIds.has(item.run_id) && Date.parse(item.created_at) >= windowSince
  );
  const windowDurations = windowRuns
    .filter((run) => run.status === "done")
    .map((run) => Date.parse(run.updated_at) - Date.parse(run.created_at));
  const windowAdapterTotal = windowAdapterResults.length;
  const snapshot = {
    schema_version: "v0",
    snapshot_id: shortId("metrics"),
    generated_at: now(),
    delivery: {
      runs_total: runs.length,
      runs_done: runs.filter((run) => run.status === "done").length,
      runs_active: runs.filter((run) => ["planned", "active", "paused"].includes(run.status)).length,
      average_cycle_ms: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0
    },
    execution: {
      workers_total: workers.length,
      adapter_pass: adapterResults.filter((item) => item.status === "PASS").length,
      adapter_fail: adapterResults.filter((item) => item.status === "FAIL").length,
      retry_events: events.filter((event) => event.type === "worker.retry.requested").length
    },
    quality: {
      verification_pass: verification.filter((item) => item.status === "PASS").length,
      verification_fail: verification.filter((item) => item.status === "FAIL").length,
      integrations_merged: integration.filter((item) => item.status === "MERGED").length,
      integrations_noop: integration.filter((item) => item.status === "NOOP").length
    },
    risk: {
      total: risks.length,
      open: risks.filter((item) => item.status === "open").length,
      mitigated: risks.filter((item) => item.status === "mitigated").length,
      accepted: risks.filter((item) => item.status === "accepted").length
    },
    window: {
      days: rollingWindowDays,
      max_runs: rollingRunCount,
      since: new Date(windowSince).toISOString(),
      run_ids: [...windowRunIds],
      delivery: {
        runs_total: windowRuns.length,
        runs_done: windowRuns.filter((run) => run.status === "done").length,
        average_cycle_ms: windowDurations.length
          ? Math.round(windowDurations.reduce((sum, value) => sum + value, 0) / windowDurations.length)
          : 0
      },
      execution: {
        adapter_pass: windowAdapterResults.filter((item) => item.status === "PASS").length,
        adapter_fail: windowAdapterResults.filter((item) => item.status === "FAIL").length,
        adapter_failure_rate: windowAdapterTotal
          ? windowAdapterResults.filter((item) => item.status === "FAIL").length / windowAdapterTotal
          : 0
      },
      quality: {
        verification_pass: windowVerification.filter((item) => item.status === "PASS").length,
        verification_fail: windowVerification.filter((item) => item.status === "FAIL").length,
        integrations_merged: windowIntegration.filter((item) => item.status === "MERGED").length,
        integrations_noop: windowIntegration.filter((item) => item.status === "NOOP").length
      }
    }
  };
  snapshot.baseline = previous ? {
    snapshot_id: previous.snapshot_id,
    average_cycle_ms: previous.window?.delivery?.average_cycle_ms ?? previous.delivery.average_cycle_ms
  } : null;
  snapshot.evaluation = evaluateMetrics(snapshot, previous, policy);
  return snapshot;
}

function evaluateMetrics(snapshot, previous, policy) {
  if (!policy) return { status: "PASS", failures: [], checks: [] };
  const adapterFailureRate = snapshot.window.execution.adapter_failure_rate;
  const previousCycle = previous?.window?.delivery?.average_cycle_ms ?? previous?.delivery?.average_cycle_ms;
  const currentCycle = snapshot.window.delivery.average_cycle_ms;
  const cycleRegression = previousCycle > 0 && currentCycle > 0
    ? ((currentCycle - previousCycle) / previousCycle) * 100
    : 0;
  const checks = [
    check("open-risks", snapshot.risk.open <= policy.thresholds.max_open_risks, snapshot.risk.open, policy.thresholds.max_open_risks),
    check("verification-failures", snapshot.window.quality.verification_fail <= policy.thresholds.max_verification_failures, snapshot.window.quality.verification_fail, policy.thresholds.max_verification_failures),
    check("adapter-failure-rate", adapterFailureRate <= policy.thresholds.max_adapter_failure_rate, adapterFailureRate, policy.thresholds.max_adapter_failure_rate),
    check("cycle-regression-percent", cycleRegression <= policy.thresholds.max_cycle_regression_percent, cycleRegression, policy.thresholds.max_cycle_regression_percent)
  ];
  return {
    status: checks.every((item) => item.status === "PASS") ? "PASS" : "FAIL",
    failures: checks.filter((item) => item.status === "FAIL").map((item) => item.id),
    checks
  };
}

function check(id, pass, actual, limit) {
  return { id, status: pass ? "PASS" : "FAIL", actual, limit };
}

function readRunFiles(root) {
  const dir = join(root, "runs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readJson(join(dir, entry.name, "run.json"), null))
    .filter(Boolean);
}

function findJson(root, predicate) {
  const values = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith(".json") && predicate(entry.name)) values.push(readJson(path));
    }
  }
  walk(join(root, "runs"));
  return values;
}
