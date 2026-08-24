import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import {
  runWorkerJobs,
  WorkerSupervisor
} from "../src/core/worker-supervisor.mjs";

const SUPERVISOR_URL = pathToFileURL(
  new URL("../src/core/worker-supervisor.mjs", import.meta.url).pathname
).href;

function nodeJob(id, source, options = {}) {
  return {
    id,
    command: process.execPath,
    args: ["--input-type=module", "-e", source],
    ...options
  };
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({
      code,
      signal,
      stdout,
      stderr
    }));
  });
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntil(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`condition not met within ${timeoutMs}ms`);
}

test("worker supervisor runs independent sleep jobs concurrently", async () => {
  const startedAt = Date.now();
  const results = await runWorkerJobs([
    nodeJob("left", `
await new Promise((resolve) => setTimeout(resolve, 500));
console.log("left-done");
`),
    nodeJob("right", `
await new Promise((resolve) => setTimeout(resolve, 500));
console.log("right-done");
`)
  ], {
    maxConcurrency: 2
  });
  const wallTimeMs = Date.now() - startedAt;

  assert.ok(
    wallTimeMs < 850,
    `expected parallel wall time below 850ms, got ${wallTimeMs}ms`
  );
  assert.deepEqual(results.map((result) => result.job_id), ["left", "right"]);
  assert.deepEqual(results.map((result) => result.exit_code), [0, 0]);
  assert.deepEqual(
    results.map((result) => result.stdout.trim()),
    ["left-done", "right-done"]
  );
  assert.ok(results.every((result) => result.duration_ms >= 450));
});

test("worker supervisor never exceeds the configured concurrency limit", async () => {
  const directory = mkdtempSync(join(tmpdir(), "apex-worker-supervisor-slots-"));
  const eventPath = join(directory, "events.log");
  const jobs = ["first", "second", "third"].map((id) => nodeJob(id, `
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(eventPath)}, "start:${id}\\n");
await new Promise((resolve) => setTimeout(resolve, 250));
appendFileSync(${JSON.stringify(eventPath)}, "end:${id}\\n");
`));
  const results = await runWorkerJobs(jobs, {
    maxConcurrency: 2
  });
  const events = readFileSync(eventPath, "utf8").trim().split("\n");
  let active = 0;
  let maximumActive = 0;
  for (const event of events) {
    if (event.startsWith("start:")) active += 1;
    else active -= 1;
    maximumActive = Math.max(maximumActive, active);
    assert.ok(active >= 0, `invalid event order: ${events.join(", ")}`);
  }

  assert.equal(maximumActive, 2);
  assert.equal(active, 0);
  assert.deepEqual(results.map((result) => result.exit_code), [0, 0, 0]);
  assert.ok(
    events.findIndex((event) => event === "start:third")
      > events.findIndex((event) => event.startsWith("end:")),
    `third job started before a slot was released: ${events.join(", ")}`
  );
});

test("one failed job does not terminate an unrelated sibling", async () => {
  const results = await runWorkerJobs([
    nodeJob("failed", `
console.error("expected-failure");
process.exit(7);
`),
    nodeJob("sibling", `
await new Promise((resolve) => setTimeout(resolve, 350));
console.log("sibling-complete");
`)
  ], {
    maxConcurrency: 2
  });
  const failed = results.find((result) => result.job_id === "failed");
  const sibling = results.find((result) => result.job_id === "sibling");

  assert.equal(failed.exit_code, 7);
  assert.equal(failed.status, "failed");
  assert.match(failed.stderr, /expected-failure/);
  assert.equal(sibling.exit_code, 0);
  assert.equal(sibling.status, "succeeded");
  assert.equal(sibling.stdout.trim(), "sibling-complete");
  assert.equal(sibling.termination_reason, null);
});

test("worker timeout escalates from TERM to KILL", async () => {
  const [result] = await runWorkerJobs([
    nodeJob("timeout", `
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`, {
      timeoutMs: 150,
      killGraceMs: 100
    })
  ]);

  assert.equal(result.status, "timed_out");
  assert.equal(result.timed_out, true);
  assert.equal(result.termination_reason, "timeout");
  assert.equal(result.signal, "SIGKILL");
  assert.ok(result.duration_ms < 2000);
});

test("worker output is bounded and an overflowing job is terminated", async () => {
  const [result] = await runWorkerJobs([
    nodeJob("output-limit", `
process.stdout.write(Buffer.alloc(128 * 1024, 0x61));
setInterval(() => {}, 1000);
`, {
      maxOutputBytes: 1024,
      killGraceMs: 100
    })
  ]);

  assert.equal(result.status, "output_limit");
  assert.equal(result.output_limit_exceeded, true);
  assert.equal(result.termination_reason, "output-limit");
  assert.ok(result.captured_output_bytes <= 1024);
  assert.ok(Buffer.byteLength(result.stdout) <= 1024);
  assert.ok(result.observed_output_bytes > 1024);
});

test("closing the supervisor cancels queued jobs instead of starting them", async () => {
  const directory = mkdtempSync(join(tmpdir(), "apex-worker-supervisor-close-"));
  const activePath = join(directory, "active.pid");
  const queuedPath = join(directory, "queued.txt");
  const supervisor = new WorkerSupervisor({
    maxConcurrency: 1,
    defaultKillGraceMs: 100
  });
  const run = supervisor.run([
    nodeJob("active", `
import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(activePath)}, String(process.pid));
setInterval(() => {}, 1000);
`),
    nodeJob("queued", `
import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(queuedPath)}, "must-not-run");
`)
  ]);

  await waitUntil(() => existsSync(activePath));
  await supervisor.close();
  const results = await run;

  assert.deepEqual(results.map((result) => result.status), [
    "cancelled",
    "cancelled"
  ]);
  assert.deepEqual(results.map((result) => result.termination_reason), [
    "supervisor-close",
    "supervisor-close"
  ]);
  assert.equal(results[1].pid, null);
  assert.equal(existsSync(queuedPath), false);
});

test("parent process exit cleans up active worker process groups", {
  skip: process.platform === "win32"
}, async () => {
  const directory = mkdtempSync(join(tmpdir(), "apex-worker-supervisor-parent-"));
  const pidPath = join(directory, "worker.pid");
  const workerSource = `
import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));
setInterval(() => {}, 1000);
`;
  const parentSource = `
import { runWorkerJobs } from ${JSON.stringify(SUPERVISOR_URL)};
import { existsSync } from "node:fs";
const run = runWorkerJobs([{
  id: "orphan-check",
  command: process.execPath,
  args: ["--input-type=module", "-e", ${JSON.stringify(workerSource)}]
}], {
  maxConcurrency: 1,
  parentCleanupGraceMs: 50
});
const deadline = Date.now() + 3000;
while (!existsSync(${JSON.stringify(pidPath)}) && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
process.exit(existsSync(${JSON.stringify(pidPath)}) ? 0 : 2);
await run;
`;
  const parent = spawn(process.execPath, [
    "--input-type=module",
    "-e",
    parentSource
  ], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  const parentResult = await waitForExit(parent);

  assert.equal(parentResult.code, 0, parentResult.stderr);
  assert.equal(existsSync(pidPath), true);
  const workerPid = Number(readFileSync(pidPath, "utf8"));
  await waitUntil(() => !pidAlive(workerPid));
  assert.equal(pidAlive(workerPid), false);
});
