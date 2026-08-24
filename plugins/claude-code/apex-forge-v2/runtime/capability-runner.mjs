#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  statfsSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";

const [configPath, resultPath] = process.argv.slice(2);
const config = JSON.parse(readFileSync(configPath, "utf8"));
const startedAt = Date.now();
let stdout = "";
let stderr = "";
let timedOut = false;
let settled = false;
let terminationReason = "";
let outputLimitExceeded = false;
let stdoutBytes = 0;
let stderrBytes = 0;
let initialDiskFree = null;
let initialWorkspaceBytes = null;
let lastWorkspaceCheck = 0;

try {
  const stats = statfsSync(config.diskPath || config.cwd);
  initialDiskFree = Number(stats.bavail) * Number(stats.bsize);
} catch {}
try {
  initialWorkspaceBytes = directorySize(config.cwd);
} catch {}

const child = spawn(config.executable, config.args, {
  cwd: config.cwd,
  env: config.env,
  detached: true,
  stdio: ["pipe", "pipe", "pipe"]
});

child.stdout.on("data", (chunk) => {
  stdoutBytes += chunk.length;
  stdout += chunk;
  enforceOutputLimit();
});
child.stderr.on("data", (chunk) => {
  stderrBytes += chunk.length;
  stderr += chunk;
  enforceOutputLimit();
});
child.on("error", (error) => finish({
  status: 1,
  signal: null,
  timed_out: false,
  error: error.message
}));
child.on("close", (code, signal) => finish({
  status: terminationReason ? 1 : code ?? 1,
  signal: signal || null,
  timed_out: timedOut,
  error: terminationReason === "disk-pressure"
    ? "disk headroom below policy"
    : terminationReason === "disk-growth"
      ? "disk growth exceeded policy"
      : terminationReason === "workspace-growth"
        ? "workspace growth exceeded policy"
        : terminationReason === "orphaned-runner"
          ? "managed process parent disappeared"
    : outputLimitExceeded
      ? "capability process output exceeded policy"
      : timedOut
        ? "capability process timed out"
        : ""
}));

if (config.input != null) child.stdin.end(config.input);
else child.stdin.end();

const timeout = setTimeout(() => {
  timedOut = true;
  terminationReason = "timeout";
  killProcessGroup("SIGTERM");
  setTimeout(() => killProcessGroup("SIGKILL"), 1000).unref();
}, config.timeoutMs);
const resourceMonitor = setInterval(checkDiskHeadroom, 250);
checkDiskHeadroom();

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
  clearInterval(resourceMonitor);
  killProcessGroup("SIGTERM");
  writeFileSync(resultPath, `${JSON.stringify({
    ...result,
    termination_reason: terminationReason || null,
    stdout,
    stderr,
    duration_ms: Date.now() - startedAt
  })}\n`);
}

function checkDiskHeadroom() {
  if (
    !terminationReason
    && Number.isInteger(config.parentPid)
    && config.parentPid > 1
    && !isPidAlive(config.parentPid)
  ) {
    terminationReason = "orphaned-runner";
    stderr += `\nmanaged process parent disappeared: ${config.parentPid}`;
  }
  const hasDiskPolicy = (
    Number.isFinite(config.minFreeBytes) && config.minFreeBytes > 0
  ) || (
    Number.isFinite(config.maxDiskGrowthBytes) && config.maxDiskGrowthBytes > 0
  );
  const hasWorkspacePolicy = Number.isFinite(config.maxWorkspaceGrowthBytes)
    && config.maxWorkspaceGrowthBytes > 0;
  if (!terminationReason && !hasDiskPolicy && !hasWorkspacePolicy) return;
  try {
    const stats = statfsSync(config.diskPath || config.cwd);
    const available = Number(stats.bavail) * Number(stats.bsize);
    const now = Date.now();
    if (
      !terminationReason
      && Number.isFinite(config.maxWorkspaceGrowthBytes)
      && config.maxWorkspaceGrowthBytes > 0
      && initialWorkspaceBytes != null
      && now - lastWorkspaceCheck >= (config.workspaceCheckIntervalMs || 2000)
    ) {
      lastWorkspaceCheck = now;
      const workspaceBytes = directorySize(config.cwd);
      if (workspaceBytes - initialWorkspaceBytes > config.maxWorkspaceGrowthBytes) {
        terminationReason = "workspace-growth";
        stderr += `\nworkspace growth exceeded policy: ${workspaceBytes - initialWorkspaceBytes} > ${config.maxWorkspaceGrowthBytes} bytes`;
      }
    }
    if (
      !terminationReason
      && Number.isFinite(config.maxDiskGrowthBytes)
      && config.maxDiskGrowthBytes > 0
      && initialDiskFree != null
      && initialDiskFree - available > config.maxDiskGrowthBytes
    ) {
      terminationReason = "disk-growth";
      stderr += `\ndisk growth exceeded policy: ${initialDiskFree - available} > ${config.maxDiskGrowthBytes} bytes`;
    } else if (
      !terminationReason
      && Number.isFinite(config.minFreeBytes)
      && config.minFreeBytes > 0
      && available < config.minFreeBytes
    ) {
      terminationReason = "disk-pressure";
      stderr += `\ndisk headroom below policy: ${available} < ${config.minFreeBytes} bytes`;
    }
    if (!terminationReason) return;
    killProcessGroup("SIGTERM");
    setTimeout(() => killProcessGroup("SIGKILL"), 1000).unref();
  } catch (error) {
    if (!terminationReason) {
      terminationReason = "disk-check-failed";
      stderr += `\ndisk headroom check failed: ${error.message}`;
      killProcessGroup("SIGTERM");
    }
  }
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function directorySize(root) {
  let total = 0;
  const visit = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      let stat;
      try {
        stat = lstatSync(path);
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) visit(path);
      else if (stat.isFile()) total += stat.size;
    }
  };
  visit(root);
  return total;
}

function enforceOutputLimit() {
  const limit = Number.isFinite(config.maxOutputBytes)
    ? config.maxOutputBytes
    : 16 * 1024 * 1024;
  if (outputLimitExceeded || stdoutBytes + stderrBytes <= limit) return;
  outputLimitExceeded = true;
  terminationReason = "output-limit";
  stderr += `\ncapability process output exceeded policy: ${stdoutBytes + stderrBytes} > ${limit} bytes`;
  killProcessGroup("SIGTERM");
  setTimeout(() => killProcessGroup("SIGKILL"), 1000).unref();
}
