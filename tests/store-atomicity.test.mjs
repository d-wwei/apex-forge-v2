import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { appendDurableFile, atomicWriteFile, readJson, writeJson } from "../src/lib/common.mjs";
import { acquireProjectLock } from "../src/core/project-lock.mjs";
import { updateProject } from "../src/core/store.mjs";

const COMMON = new URL("../src/lib/common.mjs", import.meta.url).pathname;
const LOCK = new URL("../src/core/project-lock.mjs", import.meta.url).pathname;
const STORE = new URL("../src/core/store.mjs", import.meta.url).pathname;

function tempDir() {
  return mkdtempSync(join(tmpdir(), "apex-v2-atomic-test-"));
}

function child(script, args = [], env = {}) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(process.execPath, [script, ...args], {
      encoding: "utf8",
      env: { ...globalThis.process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    childProcess.stdout.on("data", (chunk) => { stdout += chunk; });
    childProcess.stderr.on("data", (chunk) => { stderr += chunk; });
    childProcess.on("error", reject);
    childProcess.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function waitForFile(path, timeoutMs = 5000) {
  const started = Date.now();
  while (!existsSync(path)) {
    if (Date.now() - started >= timeoutMs) {
      throw new Error(`timed out waiting for file: ${path}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("atomic write failpoint preserves the previous complete JSON", () => {
  const dir = tempDir();
  const target = join(dir, "state.json");
  writeJson(target, { version: 1 });
  assert.throws(() => {
    const previous = process.env.APEX_V2_ATOMIC_WRITE_FAILPOINT;
    process.env.APEX_V2_ATOMIC_WRITE_FAILPOINT = "before_rename";
    try {
      atomicWriteFile(target, `${JSON.stringify({ version: 2 })}\n`);
    } finally {
      if (previous == null) delete process.env.APEX_V2_ATOMIC_WRITE_FAILPOINT;
      else process.env.APEX_V2_ATOMIC_WRITE_FAILPOINT = previous;
    }
  }, /before_rename/);
  assert.deepEqual(readJson(target), { version: 1 });
  assert.equal(readdirSync(dir).some((name) => name.includes(".tmp-")), false);
});

test("durable append persists complete ordered records", () => {
  const dir = tempDir();
  const target = join(dir, "events.jsonl");
  appendDurableFile(target, "{\"id\":1}\n");
  appendDurableFile(target, "{\"id\":2}\n");
  assert.equal(readFileSync(target, "utf8"), "{\"id\":1}\n{\"id\":2}\n");
});

test("ProjectState update supports revision CAS and monotonic increments", () => {
  const project = tempDir();
  const root = join(project, ".apex-v2");
  writeJson(join(root, "project.json"), {
    schema_version: "v0",
    format_version: 1,
    revision: 0,
    project_id: "project-cas",
    project_name: "CAS",
    created_at: "2026-08-14T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z",
    active_milestone: null,
    knowledge_version: 0,
    last_event_id: null,
    active_runs: [],
    wip_limits: { active_runs: 1, parallel_workers: 1 }
  });
  updateProject(root, { project_name: "CAS 1" }, { expectedRevision: 0 });
  assert.equal(readJson(join(root, "project.json")).revision, 1);
  assert.throws(
    () => updateProject(root, { project_name: "stale" }, { expectedRevision: 0 }),
    /revision 冲突/
  );
  updateProject(root, { project_name: "CAS 2" }, { expectedRevision: 1 });
  assert.equal(readJson(join(root, "project.json")).revision, 2);
});

test("empty stale project lock is recovered after grace period", () => {
  const project = tempDir();
  mkdirSync(join(project, ".apex-v2.lock"));
  const release = acquireProjectLock(project, {
    timeoutMs: 1000,
    retryMs: 5,
    staleGraceMs: 0
  });
  release();
  assert.equal(existsSync(join(project, ".apex-v2.lock")), false);
});

test("concurrent writers preserve every locked increment", async () => {
  const project = tempDir();
  const state = join(project, "counter.json");
  writeJson(state, { count: 0 });
  const writer = join(project, "writer.mjs");
  writeFileSync(writer, `
import { readJson, writeJson } from ${JSON.stringify(`file://${COMMON}`)};
import { withProjectLock } from ${JSON.stringify(`file://${LOCK}`)};
const [project, state, iterations] = process.argv.slice(2);
for (let index = 0; index < Number(iterations); index += 1) {
  withProjectLock(project, () => {
    const value = readJson(state);
    writeJson(state, { count: value.count + 1 });
  }, { timeoutMs: 60000 });
}
`);
  const executions = await Promise.all(
    Array.from({ length: 5 }, () => child(writer, [project, state, "20"]))
  );
  assert.ok(executions.every((item) => item.code === 0), JSON.stringify(executions));
  assert.deepEqual(readJson(state), { count: 100 });
  assert.equal(existsSync(join(project, ".apex-v2.lock")), false);
});

test("concurrent event writers keep JSONL complete and last_event_id monotonic", async () => {
  const project = tempDir();
  const root = join(project, ".apex-v2");
  writeFileSync(join(project, "setup.mjs"), "");
  await import("node:fs").then(({ mkdirSync }) => mkdirSync(root, { recursive: true }));
  writeJson(join(root, "project.json"), {
    schema_version: "v0",
    format_version: 1,
    revision: 0,
    project_id: "project-atomic",
    project_name: "Atomic",
    created_at: "2026-08-13T00:00:00.000Z",
    updated_at: "2026-08-13T00:00:00.000Z",
    active_milestone: null,
    knowledge_version: 0,
    last_event_id: null,
    active_runs: [],
    wip_limits: { active_runs: 1, parallel_workers: 2 }
  });
  writeFileSync(join(root, "events.jsonl"), "");
  const writer = join(project, "event-writer.mjs");
  writeFileSync(writer, `
import { appendEvent } from ${JSON.stringify(`file://${STORE}`)};
const [root, actor, iterations] = process.argv.slice(2);
for (let index = 0; index < Number(iterations); index += 1) {
  appendEvent(root, "atomic.concurrent", actor, { index });
}
`);
  const executions = await Promise.all(
    Array.from({ length: 4 }, (_, index) => child(writer, [root, `writer-${index}`, "15"]))
  );
  assert.ok(executions.every((item) => item.code === 0), JSON.stringify(executions));
  const events = readFileSync(join(root, "events.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(events.length, 60);
  assert.equal(new Set(events.map((event) => event.event_id)).size, 60);
  assert.ok(events.every((event, index) =>
    index === 0 || events[index - 1].timestamp < event.timestamp
  ));
  assert.equal(readJson(join(root, "project.json")).last_event_id, events.at(-1).event_id);
});

test("event timestamps follow locked append order under contention", async () => {
  const project = tempDir();
  const root = join(project, ".apex-v2");
  const ready = join(project, "lock-ready");
  mkdirSync(root, { recursive: true });
  writeJson(join(root, "project.json"), {
    schema_version: "v0",
    format_version: 1,
    revision: 0,
    project_id: "project-event-order",
    project_name: "Event Order",
    created_at: "2026-08-18T00:00:00.000Z",
    updated_at: "2026-08-18T00:00:00.000Z",
    active_milestone: null,
    knowledge_version: 0,
    last_event_id: null,
    active_runs: [],
    wip_limits: { active_runs: 1, parallel_workers: 2 }
  });
  writeFileSync(join(root, "events.jsonl"), "");

  const holder = join(project, "event-lock-holder.mjs");
  writeFileSync(holder, `
import { writeFileSync } from "node:fs";
import { appendEvent } from ${JSON.stringify(`file://${STORE}`)};
import { withProjectLock } from ${JSON.stringify(`file://${LOCK}`)};
const [project, root, ready] = process.argv.slice(2);
withProjectLock(project, () => {
  writeFileSync(ready, "ready\\n");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  appendEvent(root, "atomic.holder", "holder", {});
}, { timeoutMs: 60000 });
`);
  const waiter = join(project, "event-lock-waiter.mjs");
  writeFileSync(waiter, `
import { appendEvent } from ${JSON.stringify(`file://${STORE}`)};
const [root] = process.argv.slice(2);
appendEvent(root, "atomic.waiter", "waiter", {});
`);

  const holderExecution = child(holder, [project, root, ready]);
  await waitForFile(ready);
  const waiterExecution = child(waiter, [root]);
  const executions = await Promise.all([holderExecution, waiterExecution]);
  assert.ok(executions.every((item) => item.code === 0), JSON.stringify(executions));

  const events = readFileSync(join(root, "events.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.deepEqual(events.map((event) => event.actor), ["holder", "waiter"]);
  assert.ok(
    events[0].timestamp <= events[1].timestamp,
    `${events[0].timestamp} > ${events[1].timestamp}`
  );
});
