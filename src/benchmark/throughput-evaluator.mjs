import { createHash } from "node:crypto";

const HOUR_MS = 60 * 60 * 1000;
const TASK_EVENT_TYPES = new Set(["queued", "cancelled"]);
const RUN_EVENT_TYPES = new Set([
  "run_started",
  "run_completed",
  "run_blocked",
  "merge_attempted",
  "merge_conflict",
  "merged",
  "orphan_detected"
]);

export function evaluateThroughputBenchmark(rawInput) {
  const input = normalizeAndValidateInput(rawInput);
  const windowStart = timestamp(input.window.started_at, "window.started_at");
  const windowEnd = timestamp(input.window.ended_at, "window.ended_at");
  const durationMs = windowEnd - windowStart;

  const queuedByTask = new Map();
  const cancelledTasks = new Set();
  for (const event of input.task_events) {
    if (event.type === "queued") {
      if (queuedByTask.has(event.task_id)) {
        throw new Error(`task has multiple queued events: ${event.task_id}`);
      }
      queuedByTask.set(event.task_id, event);
    } else {
      cancelledTasks.add(event.task_id);
    }
  }

  const runById = new Map();
  for (const event of input.run_events.filter((item) =>
    item.type === "run_started"
  )) {
    const existing = runById.get(event.run_id);
    if (existing && existing.task_id !== event.task_id) {
      throw new Error(`run_id maps to multiple tasks: ${event.run_id}`);
    }
    runById.set(event.run_id, event);
  }

  const orphanViolations = [];
  const orphanSources = new Set();
  for (const event of input.task_events) {
    if (event.type === "cancelled" && !queuedByTask.has(event.task_id)) {
      orphanSources.add(`task_event:${event.event_id}`);
      orphanViolations.push(`task_event_without_queue:${event.event_id}`);
    }
  }
  for (const event of input.run_events) {
    if (event.type === "orphan_detected") {
      orphanSources.add(`run_event:${event.event_id}`);
      orphanViolations.push(`explicit_orphan:${event.event_id}`);
    }
    if (!queuedByTask.has(event.task_id)) {
      orphanSources.add(`run_event:${event.event_id}`);
      orphanViolations.push(`run_event_unknown_task:${event.event_id}`);
    }
    if (event.type !== "run_started" && !runById.has(event.run_id)) {
      orphanSources.add(`run_event:${event.event_id}`);
      orphanViolations.push(`run_event_unknown_run:${event.event_id}`);
    }
    const mappedRun = runById.get(event.run_id);
    if (mappedRun && mappedRun.task_id !== event.task_id) {
      orphanSources.add(`run_event:${event.event_id}`);
      orphanViolations.push(`run_event_task_mismatch:${event.event_id}`);
    }
  }
  for (const result of input.worker_results) {
    if (!runById.has(result.run_id)) {
      orphanSources.add(`worker_result:${result.result_id}`);
      orphanViolations.push(`worker_result_unknown_run:${result.result_id}`);
    }
    if (!queuedByTask.has(result.task_id)) {
      orphanSources.add(`worker_result:${result.result_id}`);
      orphanViolations.push(`worker_result_unknown_task:${result.result_id}`);
    }
    const mappedRun = runById.get(result.run_id);
    if (mappedRun && mappedRun.task_id !== result.task_id) {
      orphanSources.add(`worker_result:${result.result_id}`);
      orphanViolations.push(`worker_result_task_mismatch:${result.result_id}`);
    }
  }

  const mergedEvents = input.run_events.filter((event) =>
    event.type === "merged"
  );
  const duplicateMerge = duplicateMergeEvidence(mergedEvents);
  const taskResults = Array.from(queuedByTask.keys())
    .sort()
    .map((taskId) => buildTaskResult({
      taskId,
      queuedEvent: queuedByTask.get(taskId),
      cancelled: cancelledTasks.has(taskId),
      runEvents: input.run_events,
      workerResults: input.worker_results
    }));
  const mergedTasks = taskResults.filter((task) => task.status === "MERGED");
  const attemptedTasks = taskResults.filter((task) =>
    task.worker_attempts > 0
  );
  const mergeAttemptIds = new Set(input.run_events
    .filter((event) => [
      "merge_attempted",
      "merge_conflict",
      "merged"
    ].includes(event.type))
    .map((event) => event.merge_id));
  const conflictIds = new Set(input.run_events
    .filter((event) => event.type === "merge_conflict")
    .map((event) => event.merge_id));
  const localRetryAttempts = input.worker_results.filter((result) =>
    result.attempt > 1
  );
  const tasksWithLocalRetry = new Set(localRetryAttempts.map((result) =>
    result.task_id
  ));
  const totalCost = input.worker_results.reduce((sum, result) =>
    sum + result.cost, 0
  );
  const qualityGate = qualityGateResult({
    taskResults: mergedTasks,
    requiredThreshold: input.quality.required_threshold,
    baselineThreshold: input.quality.baseline_threshold
  });
  const qualitySum = mergedTasks.reduce((sum, task) =>
    sum + (task.quality_score ?? 0), 0
  );
  const tasksPerHour = mergedTasks.length / (durationMs / HOUR_MS);
  const gates = {
    status: "PASS",
    no_duplicate_merge: gateResult(duplicateMerge.violations),
    no_orphan: gateResult(orphanViolations),
    quality_threshold_not_decreased: qualityGate
  };
  gates.status = [
    gates.no_duplicate_merge,
    gates.no_orphan,
    gates.quality_threshold_not_decreased
  ].every((gate) => gate.status === "PASS") ? "PASS" : "FAIL";

  return {
    schema_version: "v1",
    benchmark_id: input.benchmark_id,
    evaluator: "deterministic-throughput-v1",
    input_digest: sha256(stableStringify(input)),
    window: {
      started_at: input.window.started_at,
      ended_at: input.window.ended_at,
      duration_ms: durationMs,
      worker_slots: input.window.worker_slots
    },
    counts: {
      tasks_submitted: taskResults.length,
      runs_started: runById.size,
      worker_attempts: input.worker_results.length,
      merge_attempts: mergeAttemptIds.size,
      merged_changes: mergedTasks.length,
      conflicts: conflictIds.size,
      local_retry_attempts: localRetryAttempts.length,
      tasks_with_local_retry: tasksWithLocalRetry.size,
      duplicate_merges: duplicateMerge.count,
      orphans: orphanSources.size
    },
    metrics: {
      tasks_per_hour: round(tasksPerHour),
      lead_time_ms: percentiles(mergedTasks.map((task) => task.lead_time_ms)),
      queue_wait_ms: percentiles(taskResults
        .map((task) => task.queue_wait_ms)
        .filter((value) => value != null)),
      parallel_utilization: round(parallelUtilization({
        workerResults: input.worker_results,
        windowStart,
        windowEnd,
        workerSlots: input.window.worker_slots
      })),
      conflict_rate: ratio(conflictIds.size, mergeAttemptIds.size),
      local_retry_rate: ratio(tasksWithLocalRetry.size, attemptedTasks.length),
      cost_per_merged_change: mergedTasks.length > 0
        ? round(totalCost / mergedTasks.length)
        : null,
      mean_quality_score: mergedTasks.length > 0
        ? round(qualitySum / mergedTasks.length)
        : null,
      quality_adjusted_throughput: round(
        qualitySum / (durationMs / HOUR_MS)
      )
    },
    gates,
    task_results: taskResults
  };
}

function buildTaskResult({
  taskId,
  queuedEvent,
  cancelled,
  runEvents,
  workerResults
}) {
  const taskRunEvents = runEvents
    .filter((event) => event.task_id === taskId)
    .sort(compareTimestampThenId);
  const taskWorkerResults = workerResults
    .filter((result) => result.task_id === taskId)
    .sort((left, right) =>
      left.started_at.localeCompare(right.started_at)
      || left.result_id.localeCompare(right.result_id)
    );
  const merges = taskRunEvents.filter((event) => event.type === "merged");
  const firstMerge = merges[0] || null;
  const firstWorker = taskWorkerResults[0] || null;
  const queuedAt = timestamp(queuedEvent.timestamp, queuedEvent.event_id);
  const firstWorkerAt = firstWorker
    ? timestamp(firstWorker.started_at, firstWorker.result_id)
    : null;
  const mergedAt = firstMerge
    ? timestamp(firstMerge.timestamp, firstMerge.event_id)
    : null;
  if (firstWorkerAt != null && firstWorkerAt < queuedAt) {
    throw new Error(`worker started before task was queued: ${taskId}`);
  }
  if (mergedAt != null && mergedAt < queuedAt) {
    throw new Error(`task merged before it was queued: ${taskId}`);
  }
  return {
    task_id: taskId,
    run_ids: Array.from(new Set(taskRunEvents.map((event) => event.run_id)))
      .sort(),
    queued_at: queuedEvent.timestamp,
    first_worker_started_at: firstWorker?.started_at || null,
    merged_at: firstMerge?.timestamp || null,
    merge_ids: Array.from(new Set(merges.map((event) => event.merge_id))).sort(),
    lead_time_ms: mergedAt == null ? null : mergedAt - queuedAt,
    queue_wait_ms: firstWorkerAt == null ? null : firstWorkerAt - queuedAt,
    quality_score: firstMerge?.quality_score ?? null,
    worker_attempts: taskWorkerResults.length,
    local_retry_attempts: taskWorkerResults.filter((result) =>
      result.attempt > 1
    ).length,
    cost: round(taskWorkerResults.reduce((sum, result) =>
      sum + result.cost, 0
    )),
    status: firstMerge ? "MERGED" : cancelled ? "CANCELLED" : "UNMERGED"
  };
}

function duplicateMergeEvidence(mergedEvents) {
  const byTask = groupBy(mergedEvents, (event) => event.task_id);
  const byMerge = groupBy(mergedEvents, (event) => event.merge_id);
  const violations = [];
  let count = 0;
  for (const [taskId, events] of byTask) {
    if (events.length <= 1) continue;
    count += events.length - 1;
    violations.push(`task_merged_multiple_times:${taskId}`);
  }
  for (const [mergeId, events] of byMerge) {
    const taskIds = new Set(events.map((event) => event.task_id));
    if (taskIds.size <= 1) continue;
    count += taskIds.size - 1;
    violations.push(`merge_id_reused:${mergeId}`);
  }
  return {
    count,
    violations: sortedUnique(violations)
  };
}

function qualityGateResult({
  taskResults,
  requiredThreshold,
  baselineThreshold
}) {
  const failingTaskIds = taskResults
    .filter((task) =>
      task.quality_score != null
      && task.quality_score < requiredThreshold
    )
    .map((task) => task.task_id)
    .sort();
  const missingQualityTaskIds = taskResults
    .filter((task) => task.quality_score == null)
    .map((task) => task.task_id)
    .sort();
  const violations = [];
  if (requiredThreshold < baselineThreshold) {
    violations.push("required_threshold_below_baseline");
  }
  if (taskResults.length === 0) {
    violations.push("no_merged_quality_evidence");
  }
  violations.push(...failingTaskIds.map((taskId) =>
    `quality_below_threshold:${taskId}`
  ));
  violations.push(...missingQualityTaskIds.map((taskId) =>
    `quality_missing:${taskId}`
  ));
  return {
    status: violations.length === 0 ? "PASS" : "FAIL",
    violations: sortedUnique(violations),
    required_threshold: requiredThreshold,
    baseline_threshold: baselineThreshold,
    failing_task_ids: failingTaskIds,
    missing_quality_task_ids: missingQualityTaskIds
  };
}

function parallelUtilization({
  workerResults,
  windowStart,
  windowEnd,
  workerSlots
}) {
  if (workerResults.length === 0) return 0;
  const points = new Map();
  for (const result of workerResults) {
    const start = timestamp(result.started_at, result.result_id);
    const end = timestamp(result.completed_at, result.result_id);
    points.set(start, (points.get(start) || 0) + 1);
    points.set(end, (points.get(end) || 0) - 1);
  }
  let active = 0;
  let activeMs = 0;
  let previous = windowStart;
  for (const [time, delta] of [...points.entries()].sort((left, right) =>
    left[0] - right[0]
  )) {
    activeMs += active * (time - previous);
    active += delta;
    if (active > workerSlots) {
      throw new Error(
        `observed concurrency ${active} exceeds worker_slots ${workerSlots}`
      );
    }
    previous = time;
  }
  activeMs += active * (windowEnd - previous);
  return activeMs / (workerSlots * (windowEnd - windowStart));
}

function normalizeAndValidateInput(rawInput) {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    throw new TypeError("throughput benchmark input must be an object");
  }
  if (rawInput.schema_version !== "v1") {
    throw new Error("schema_version must be v1");
  }
  nonEmptyString(rawInput.benchmark_id, "benchmark_id");
  const window = object(rawInput.window, "window");
  const startedAt = timestamp(window.started_at, "window.started_at");
  const endedAt = timestamp(window.ended_at, "window.ended_at");
  if (endedAt <= startedAt) {
    throw new Error("window.ended_at must be after window.started_at");
  }
  positiveInteger(window.worker_slots, "window.worker_slots");
  const quality = object(rawInput.quality, "quality");
  score(quality.required_threshold, "quality.required_threshold");
  score(quality.baseline_threshold, "quality.baseline_threshold");
  const taskEvents = array(rawInput.task_events, "task_events").map((event) => {
    object(event, "task event");
    nonEmptyString(event.event_id, "task event.event_id");
    nonEmptyString(event.task_id, "task event.task_id");
    enumValue(event.type, TASK_EVENT_TYPES, "task event.type");
    const eventTimestamp = timestampInWindow(
      event.timestamp,
      event.event_id,
      startedAt,
      endedAt
    );
    return {
      ...structuredClone(event),
      timestamp: new Date(eventTimestamp).toISOString()
    };
  });
  const runEvents = array(rawInput.run_events, "run_events").map((event) => {
    object(event, "run event");
    nonEmptyString(event.event_id, "run event.event_id");
    nonEmptyString(event.task_id, "run event.task_id");
    nonEmptyString(event.run_id, "run event.run_id");
    enumValue(event.type, RUN_EVENT_TYPES, "run event.type");
    const eventTimestamp = timestampInWindow(
      event.timestamp,
      event.event_id,
      startedAt,
      endedAt
    );
    if (["merge_attempted", "merge_conflict", "merged"].includes(event.type)) {
      nonEmptyString(event.merge_id, `${event.type}.merge_id`);
    }
    if (event.quality_score != null) {
      score(event.quality_score, `${event.event_id}.quality_score`);
    }
    return {
      ...structuredClone(event),
      timestamp: new Date(eventTimestamp).toISOString()
    };
  });
  uniqueIdentifiers(
    [...taskEvents, ...runEvents].map((event) => event.event_id),
    "event_id"
  );
  const workerResults = array(rawInput.worker_results, "worker_results")
    .map((result) => {
      object(result, "worker result");
      nonEmptyString(result.result_id, "worker result.result_id");
      nonEmptyString(result.task_id, "worker result.task_id");
      nonEmptyString(result.run_id, "worker result.run_id");
      nonEmptyString(result.worker_id, "worker result.worker_id");
      positiveInteger(result.attempt, `${result.result_id}.attempt`);
      if (!["PASS", "FAIL", "BLOCKED", "CANCELLED"].includes(result.status)) {
        throw new Error(`invalid worker result.status: ${result.status}`);
      }
      const start = timestampInWindow(
        result.started_at,
        `${result.result_id}.started_at`,
        startedAt,
        endedAt
      );
      const end = timestampInWindow(
        result.completed_at,
        `${result.result_id}.completed_at`,
        startedAt,
        endedAt
      );
      if (end <= start) {
        throw new Error(
          `completed_at must be after started_at: ${result.result_id}`
        );
      }
      nonNegativeNumber(result.cost, `${result.result_id}.cost`);
      return {
        ...structuredClone(result),
        started_at: new Date(start).toISOString(),
        completed_at: new Date(end).toISOString()
      };
    });
  uniqueIdentifiers(
    workerResults.map((result) => result.result_id),
    "result_id"
  );
  assertWorkerAttemptsDoNotOverlap(workerResults);
  return {
    schema_version: "v1",
    benchmark_id: rawInput.benchmark_id,
    window: {
      started_at: new Date(startedAt).toISOString(),
      ended_at: new Date(endedAt).toISOString(),
      worker_slots: window.worker_slots
    },
    quality: {
      required_threshold: quality.required_threshold,
      baseline_threshold: quality.baseline_threshold
    },
    task_events: taskEvents.sort(compareTimestampThenId),
    run_events: runEvents.sort(compareTimestampThenId),
    worker_results: workerResults.sort((left, right) =>
      left.started_at.localeCompare(right.started_at)
      || left.result_id.localeCompare(right.result_id)
    )
  };
}

function assertWorkerAttemptsDoNotOverlap(workerResults) {
  const byWorker = groupBy(workerResults, (result) => result.worker_id);
  for (const [workerId, results] of byWorker) {
    const ordered = [...results].sort((left, right) =>
      left.started_at.localeCompare(right.started_at)
      || left.completed_at.localeCompare(right.completed_at)
      || left.result_id.localeCompare(right.result_id)
    );
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index].started_at < ordered[index - 1].completed_at) {
        throw new Error(`overlapping attempts for worker: ${workerId}`);
      }
    }
  }
}

function percentiles(values) {
  const sorted = values
    .filter((value) => value != null)
    .sort((left, right) => left - right);
  return {
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9)
  };
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return round(
    sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
  );
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : round(numerator / denominator);
}

function gateResult(violations) {
  const sorted = sortedUnique(violations);
  return {
    status: sorted.length === 0 ? "PASS" : "FAIL",
    violations: sorted
  };
}

function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    groups.set(key, [...(groups.get(key) || []), value]);
  }
  return groups;
}

function compareTimestampThenId(left, right) {
  return left.timestamp.localeCompare(right.timestamp)
    || left.event_id.localeCompare(right.event_id);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function timestamp(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a timestamp string`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`invalid timestamp: ${label}`);
  return parsed;
}

function timestampInWindow(value, label, start, end) {
  const parsed = timestamp(value, label);
  if (parsed < start || parsed > end) {
    throw new Error(`timestamp outside benchmark window: ${label}`);
  }
  return parsed;
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function array(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive integer`);
  }
}

function nonNegativeNumber(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative number`);
  }
}

function score(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${label} must be between 0 and 1`);
  }
}

function enumValue(value, allowed, label) {
  if (!allowed.has(value)) throw new Error(`invalid ${label}: ${value}`);
}

function uniqueIdentifiers(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function round(value) {
  return Number(value.toFixed(12));
}
