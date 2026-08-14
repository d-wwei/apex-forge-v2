#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const [configPath, resultPath] = process.argv.slice(2);
const config = JSON.parse(readFileSync(configPath, "utf8"));
const startedAt = Date.now();
let stdout = "";
let stderr = "";
let timedOut = false;
let settled = false;

const child = spawn(config.executable, config.args, {
  cwd: config.cwd,
  env: config.env,
  detached: true,
  stdio: ["pipe", "pipe", "pipe"]
});

child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });
child.on("error", (error) => finish({
  status: 1,
  signal: null,
  timed_out: false,
  error: error.message
}));
child.on("close", (code, signal) => finish({
  status: code ?? 1,
  signal: signal || null,
  timed_out: timedOut,
  error: timedOut ? "capability process timed out" : ""
}));

if (config.input != null) child.stdin.end(config.input);
else child.stdin.end();

const timeout = setTimeout(() => {
  timedOut = true;
  killProcessGroup("SIGTERM");
  setTimeout(() => killProcessGroup("SIGKILL"), 1000).unref();
}, config.timeoutMs);

function killProcessGroup(signal) {
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") stderr += `\nprocess-group ${signal} failed: ${error.message}`;
  }
}

function finish(result) {
  if (settled) return;
  settled = true;
  clearTimeout(timeout);
  writeFileSync(resultPath, `${JSON.stringify({
    ...result,
    stdout,
    stderr,
    duration_ms: Date.now() - startedAt
  })}\n`);
}
