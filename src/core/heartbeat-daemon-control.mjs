import { closeSync, openSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { now, readJson, writeJson } from "../lib/common.mjs";

const DAEMON = new URL("./heartbeat-daemon.mjs", import.meta.url).pathname;

export function startHeartbeatDaemon(projectDir, options = {}) {
  const resolvedProject = resolve(projectDir);
  const root = join(resolvedProject, ".apex-v2");
  const statePath = join(root, "heartbeat", "daemon.json");
  const current = readJson(statePath, null);
  if (current && processAlive(current.pid)) return { ...current, already_running: true };
  const intervalMinutes = Number(options.intervalMinutes || 60);
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1) {
    throw new Error("heartbeat daemon intervalMinutes 必须是正整数");
  }
  const stdoutFd = openSync(join(root, "heartbeat", "logs", "daemon-stdout.log"), "a");
  const stderrFd = openSync(join(root, "heartbeat", "logs", "daemon-stderr.log"), "a");
  const child = spawn(process.execPath, [options.daemonPath || DAEMON, resolvedProject, String(intervalMinutes * 60000)], {
    cwd: resolvedProject,
    detached: true,
    env: process.env,
    stdio: ["ignore", stdoutFd, stderrFd]
  });
  child.unref();
  closeSync(stdoutFd);
  closeSync(stderrFd);
  const state = {
    pid: child.pid,
    started_at: now(),
    interval_minutes: intervalMinutes,
    project_dir: resolvedProject
  };
  writeJson(statePath, state);
  return { ...state, already_running: false };
}

export function heartbeatDaemonStatus(projectDir) {
  const state = readJson(join(resolve(projectDir), ".apex-v2", "heartbeat", "daemon.json"), null);
  return {
    configured: Boolean(state),
    running: Boolean(state && processAlive(state.pid)),
    ...state
  };
}

export function stopHeartbeatDaemon(projectDir) {
  const state = readJson(join(resolve(projectDir), ".apex-v2", "heartbeat", "daemon.json"), null);
  if (!state || !processAlive(state.pid)) return { stopped: false, reason: "not-running" };
  signalDaemon(state.pid, "SIGTERM");
  waitForExit(state.pid, 1000);
  let forceKilled = false;
  if (processAlive(state.pid)) {
    signalDaemon(state.pid, "SIGKILL");
    forceKilled = true;
    waitForExit(state.pid, 1000);
  }
  if (processAlive(state.pid)) {
    throw new Error(`heartbeat daemon 未能停止：${state.pid}`);
  }
  return { stopped: true, pid: state.pid, force_killed: forceKilled };
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  const state = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], {
    encoding: "utf8"
  });
  const status = String(state.stdout || "").trim();
  return !status.startsWith("Z");
}

function signalDaemon(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  try {
    process.kill(pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const signal = new Int32Array(new SharedArrayBuffer(4));
  while (processAlive(pid) && Date.now() < deadline) {
    Atomics.wait(signal, 0, 0, 25);
  }
}
