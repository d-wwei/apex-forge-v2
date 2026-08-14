#!/usr/bin/env node

import { appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const [projectArg, intervalArg] = process.argv.slice(2);
const projectDir = resolve(projectArg);
const intervalMs = Math.max(60000, Number(intervalArg || 3600000));
const cli = new URL("../apex-v2.mjs", import.meta.url).pathname;
const logPath = join(projectDir, ".apex-v2", "heartbeat", "daemon-runs.jsonl");
let stopping = false;

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

do {
  const startedAt = new Date().toISOString();
  const run = spawnSync(process.execPath, [cli, "project", "heartbeat", "--project", projectDir], {
    cwd: projectDir,
    encoding: "utf8",
    timeout: 20 * 60 * 1000,
    env: process.env
  });
  appendFileSync(logPath, `${JSON.stringify({
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    exit_code: run.status ?? 1,
    signal: run.signal || null,
    stdout_tail: tail(run.stdout),
    stderr_tail: tail(run.stderr || run.error?.message || "")
  })}\n`);
  if (!stopping) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, intervalMs);
} while (!stopping);

function tail(value, max = 4000) {
  const text = String(value || "");
  return text.length > max ? text.slice(-max) : text;
}
