import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  evaluateThroughputBenchmark
} from "../src/benchmark/throughput-evaluator.mjs";

const MINUTE = 60_000;
const START = "2026-08-24T00:00:00.000Z";

test("deterministic evaluator computes throughput, latency, utilization, retry, cost, and quality", () => {
  const result = evaluateThroughputBenchmark(validFixture());

  assert.equal(result.gates.status, "PASS");
  assert.equal(result.counts.merged_changes, 2);
  assert.equal(result.metrics.tasks_per_hour, 2);
  assert.deepEqual(result.metrics.lead_time_ms, {
    median: 37.5 * MINUTE,
    p90: 43.5 * MINUTE
  });
  assert.deepEqual(result.metrics.queue_wait_ms, {
    median: 5 * MINUTE,
    p90: 9 * MINUTE
  });
  assert.equal(result.metrics.parallel_utilization, 0.625);
  assert.equal(result.metrics.conflict_rate, 0.333333333333);
  assert.equal(result.metrics.local_retry_rate, 0.333333333333);
  assert.equal(result.metrics.cost_per_merged_change, 20);
  assert.equal(result.metrics.mean_quality_score, 0.85);
  assert.equal(result.metrics.quality_adjusted_throughput, 1.7);
});

test("duplicate task merges fail the duplicate merge gate without inflating throughput", () => {
  const input = validFixture();
  input.run_events.push(runEvent({
    event_id: "run-event-duplicate-merge",
    task_id: "task-1",
    run_id: "run-1",
    type: "merged",
    minute: 35,
    merge_id: "merge-duplicate",
    quality_score: 0.95
  }));

  const result = evaluateThroughputBenchmark(input);

  assert.equal(result.gates.status, "FAIL");
  assert.equal(result.gates.no_duplicate_merge.status, "FAIL");
  assert.equal(result.counts.duplicate_merges, 1);
  assert.equal(result.counts.merged_changes, 2);
  assert.equal(result.metrics.tasks_per_hour, 2);
});

test("unknown task or run references and explicit orphan events fail the orphan gate", () => {
  const input = validFixture();
  input.worker_results.push(workerResult({
    result_id: "worker-result-orphan",
    task_id: "task-missing",
    run_id: "run-missing",
    worker_id: "worker-orphan",
    attempt: 1,
    startMinute: 5,
    endMinute: 6,
    cost: 1
  }));
  input.run_events.push(runEvent({
    event_id: "run-event-orphan",
    task_id: "task-2",
    run_id: "run-2",
    type: "orphan_detected",
    minute: 56
  }));
  input.task_events.push(taskEvent(
    "task-event-orphan-cancel",
    "task-never-queued",
    "cancelled",
    57
  ));

  const result = evaluateThroughputBenchmark(input);

  assert.equal(result.gates.status, "FAIL");
  assert.equal(result.gates.no_orphan.status, "FAIL");
  assert.equal(result.counts.orphans, 3);
  assert.deepEqual(result.gates.no_orphan.violations, [
    "explicit_orphan:run-event-orphan",
    "task_event_without_queue:task-event-orphan-cancel",
    "worker_result_unknown_run:worker-result-orphan",
    "worker_result_unknown_task:worker-result-orphan"
  ]);
});

test("quality gate rejects threshold rollback, missing evidence, and low-quality merges", () => {
  const input = validFixture();
  input.quality.required_threshold = 0.7;
  input.run_events.find((event) =>
    event.type === "merged" && event.task_id === "task-1"
  ).quality_score = 0.65;
  delete input.run_events.find((event) =>
    event.type === "merged" && event.task_id === "task-2"
  ).quality_score;

  const result = evaluateThroughputBenchmark(input);

  assert.equal(result.gates.status, "FAIL");
  assert.equal(
    result.gates.quality_threshold_not_decreased.status,
    "FAIL"
  );
  assert.deepEqual(
    result.gates.quality_threshold_not_decreased.failing_task_ids,
    ["task-1"]
  );
  assert.deepEqual(
    result.gates.quality_threshold_not_decreased.missing_quality_task_ids,
    ["task-2"]
  );
  assert.ok(
    result.gates.quality_threshold_not_decreased.violations.includes(
      "required_threshold_below_baseline"
    )
  );
});

test("evaluation is stable across input ordering and validates against the schema", () => {
  const input = validFixture();
  const reordered = {
    worker_results: [...input.worker_results].reverse(),
    run_events: [...input.run_events].reverse(),
    task_events: [...input.task_events].reverse(),
    quality: { ...input.quality },
    window: { ...input.window },
    benchmark_id: input.benchmark_id,
    schema_version: input.schema_version
  };
  reordered.worker_results[0].started_at =
    reordered.worker_results[0].started_at.replace("Z", "+00:00");
  reordered.run_events[0].timestamp =
    reordered.run_events[0].timestamp.replace("Z", "+00:00");
  const first = evaluateThroughputBenchmark(input);
  const second = evaluateThroughputBenchmark(reordered);

  assert.deepEqual(second, first);

  const schema = JSON.parse(readFileSync(
    new URL("../schemas/throughput-benchmark.schema.json", import.meta.url),
    "utf8"
  ));
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    validateFormats: false
  });
  const validate = ajv.compile(schema);
  assert.equal(validate(first), true, JSON.stringify(validate.errors, null, 2));
});

test("CLI reads JSON, writes deterministic output, and does not invoke a model", () => {
  const root = mkdtempSync(join(tmpdir(), "apex-throughput-benchmark-"));
  const inputPath = join(root, "input.json");
  const outputPath = join(root, "output.json");
  writeFileSync(inputPath, `${JSON.stringify(validFixture(), null, 2)}\n`);

  const run = spawnSync(process.execPath, [
    new URL("../scripts/run-throughput-benchmark.mjs", import.meta.url).pathname,
    "--input",
    inputPath,
    "--output",
    outputPath
  ], {
    encoding: "utf8",
    env: { ...process.env, PATH: "" }
  });

  assert.equal(run.status, 0, run.stderr);
  const stdout = JSON.parse(run.stdout);
  const written = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.deepEqual(written, stdout);
  assert.deepEqual(written, evaluateThroughputBenchmark(validFixture()));
});

test("CLI exits with gate failure without treating it as an evaluator error", () => {
  const root = mkdtempSync(join(tmpdir(), "apex-throughput-gate-"));
  const inputPath = join(root, "input.json");
  const input = validFixture();
  input.run_events.push(runEvent({
    event_id: "run-event-duplicate-merge-cli",
    task_id: "task-1",
    run_id: "run-1",
    type: "merged",
    minute: 35,
    merge_id: "merge-duplicate-cli",
    quality_score: 0.9
  }));
  writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`);

  const run = spawnSync(process.execPath, [
    new URL("../scripts/run-throughput-benchmark.mjs", import.meta.url).pathname,
    "--input",
    inputPath
  ], {
    encoding: "utf8",
    env: { ...process.env, PATH: "" }
  });

  assert.equal(run.status, 1, run.stderr);
  assert.equal(JSON.parse(run.stdout).gates.status, "FAIL");
  assert.doesNotMatch(run.stderr, /throughput benchmark failed/);
});

test("invalid intervals and duplicate event identifiers are rejected", () => {
  const invalidInterval = validFixture();
  invalidInterval.worker_results[0].completed_at =
    invalidInterval.worker_results[0].started_at;
  assert.throws(
    () => evaluateThroughputBenchmark(invalidInterval),
    /completed_at must be after started_at/
  );

  const duplicateEvent = validFixture();
  duplicateEvent.task_events[1].event_id =
    duplicateEvent.task_events[0].event_id;
  assert.throws(
    () => evaluateThroughputBenchmark(duplicateEvent),
    /duplicate event_id/
  );

  const overlappingAttempts = validFixture();
  overlappingAttempts.worker_results.push(workerResult({
    result_id: "worker-result-overlap",
    task_id: "task-1",
    run_id: "run-1",
    worker_id: "worker-1",
    attempt: 2,
    startMinute: 10,
    endMinute: 15,
    cost: 1
  }));
  assert.throws(
    () => evaluateThroughputBenchmark(overlappingAttempts),
    /overlapping attempts/
  );
});

function validFixture() {
  return {
    schema_version: "v1",
    benchmark_id: "throughput-synthetic-v1",
    window: {
      started_at: START,
      ended_at: atMinute(60),
      worker_slots: 2
    },
    quality: {
      required_threshold: 0.8,
      baseline_threshold: 0.8
    },
    task_events: [
      taskEvent("task-event-1", "task-1", "queued", 0),
      taskEvent("task-event-2", "task-2", "queued", 10),
      taskEvent("task-event-3", "task-3", "queued", 20)
    ],
    run_events: [
      runEvent({
        event_id: "run-event-start-1",
        task_id: "task-1",
        run_id: "run-1",
        type: "run_started",
        minute: 5
      }),
      runEvent({
        event_id: "run-event-start-2",
        task_id: "task-2",
        run_id: "run-2",
        type: "run_started",
        minute: 15
      }),
      runEvent({
        event_id: "run-event-start-3",
        task_id: "task-3",
        run_id: "run-3",
        type: "run_started",
        minute: 30
      }),
      runEvent({
        event_id: "run-event-attempt-1",
        task_id: "task-1",
        run_id: "run-1",
        type: "merge_attempted",
        minute: 30,
        merge_id: "merge-1"
      }),
      runEvent({
        event_id: "run-event-merged-1",
        task_id: "task-1",
        run_id: "run-1",
        type: "merged",
        minute: 30,
        merge_id: "merge-1",
        quality_score: 0.9
      }),
      runEvent({
        event_id: "run-event-attempt-2",
        task_id: "task-2",
        run_id: "run-2",
        type: "merge_attempted",
        minute: 50,
        merge_id: "merge-2"
      }),
      runEvent({
        event_id: "run-event-conflict-2",
        task_id: "task-2",
        run_id: "run-2",
        type: "merge_conflict",
        minute: 50,
        merge_id: "merge-2"
      }),
      runEvent({
        event_id: "run-event-attempt-3",
        task_id: "task-2",
        run_id: "run-2",
        type: "merge_attempted",
        minute: 55,
        merge_id: "merge-3"
      }),
      runEvent({
        event_id: "run-event-merged-2",
        task_id: "task-2",
        run_id: "run-2",
        type: "merged",
        minute: 55,
        merge_id: "merge-3",
        quality_score: 0.8
      })
    ],
    worker_results: [
      workerResult({
        result_id: "worker-result-1",
        task_id: "task-1",
        run_id: "run-1",
        worker_id: "worker-1",
        attempt: 1,
        startMinute: 5,
        endMinute: 25,
        cost: 10
      }),
      workerResult({
        result_id: "worker-result-2",
        task_id: "task-2",
        run_id: "run-2",
        worker_id: "worker-2",
        attempt: 1,
        startMinute: 15,
        endMinute: 45,
        cost: 20
      }),
      workerResult({
        result_id: "worker-result-3",
        task_id: "task-3",
        run_id: "run-3",
        worker_id: "worker-3",
        attempt: 1,
        startMinute: 30,
        endMinute: 50,
        cost: 5,
        status: "FAIL"
      }),
      workerResult({
        result_id: "worker-result-4",
        task_id: "task-3",
        run_id: "run-3",
        worker_id: "worker-3",
        attempt: 2,
        startMinute: 50,
        endMinute: 55,
        cost: 5
      })
    ]
  };
}

function taskEvent(event_id, task_id, type, minute) {
  return {
    event_id,
    task_id,
    type,
    timestamp: atMinute(minute)
  };
}

function runEvent({
  event_id,
  task_id,
  run_id,
  type,
  minute,
  merge_id,
  quality_score
}) {
  return {
    event_id,
    task_id,
    run_id,
    type,
    timestamp: atMinute(minute),
    ...(merge_id ? { merge_id } : {}),
    ...(quality_score == null ? {} : { quality_score })
  };
}

function workerResult({
  result_id,
  task_id,
  run_id,
  worker_id,
  attempt,
  startMinute,
  endMinute,
  cost,
  status = "PASS"
}) {
  return {
    result_id,
    task_id,
    run_id,
    worker_id,
    attempt,
    status,
    started_at: atMinute(startMinute),
    completed_at: atMinute(endMinute),
    cost
  };
}

function atMinute(minute) {
  return new Date(Date.parse(START) + minute * MINUTE).toISOString();
}
