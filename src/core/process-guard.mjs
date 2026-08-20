import { realpathSync, statfsSync } from "node:fs";
import { spawnSync } from "node:child_process";

export function snapshotProcessIds() {
  return new Set(listProcesses().map((entry) => entry.pid));
}

export function terminateNewWorkspaceProcesses(
  workspaceDir,
  baselinePids,
  {
    termWaitMs = 250,
    guardToken = null
  } = {}
) {
  const workspace = realpathSync(workspaceDir);
  const initial = listProcesses({ includeEnvironment: Boolean(guardToken) });
  const targets = new Set(initial
    .filter((entry) =>
      !baselinePids.has(entry.pid)
      && entry.pid !== process.pid
      && (
        commandReferencesWorkspace(entry.command, workspace)
        || (guardToken && entry.command.includes(guardToken))
      )
    )
    .map((entry) => entry.pid));
  expandDescendants(targets, initial);
  return terminateTargets(targets, initial, termWaitMs);
}

export function terminateGuardTokenProcesses(
  guardToken,
  {
    termWaitMs = 250
  } = {}
) {
  if (!guardToken) {
    return {
      terminated_pids: [],
      force_killed_pids: [],
      surviving_pids: []
    };
  }
  const initial = listProcesses({ includeEnvironment: true });
  const targets = new Set(initial
    .filter((entry) =>
      entry.pid !== process.pid
      && entry.command.includes(guardToken)
    )
    .map((entry) => entry.pid));
  expandDescendants(targets, initial);
  return terminateTargets(targets, initial, termWaitMs);
}

function terminateTargets(targets, initial, termWaitMs) {
  signalTargets(targets, initial, "SIGTERM");
  if (targets.size > 0) sleep(termWaitMs);

  const remaining = listProcesses();
  const alive = new Set(remaining
    .filter((entry) => targets.has(entry.pid))
    .map((entry) => entry.pid));
  signalTargets(alive, remaining, "SIGKILL");
  if (alive.size > 0) waitForProcessExit(alive, 2000);
  const survivors = new Set(listProcesses()
    .filter((entry) => alive.has(entry.pid) && !entry.stat.startsWith("Z"))
    .map((entry) => entry.pid));
  return {
    terminated_pids: [...targets].sort((left, right) => left - right),
    force_killed_pids: [...alive].sort((left, right) => left - right),
    surviving_pids: [...survivors].sort((left, right) => left - right)
  };
}

export function availableDiskBytes(path) {
  const stats = statfsSync(path);
  return Number(stats.bavail) * Number(stats.bsize);
}

export function assertDiskHeadroom(path, minFreeBytes) {
  if (!Number.isFinite(minFreeBytes) || minFreeBytes <= 0) return;
  const available = availableDiskBytes(path);
  if (available < minFreeBytes) {
    throw new Error(
      `disk headroom below policy: ${available} < ${minFreeBytes} bytes`
    );
  }
}

function listProcesses({ includeEnvironment = false } = {}) {
  const args = includeEnvironment
    ? ["eww", "-Ao", "pid=,ppid=,pgid=,stat=,command="]
    : ["-Ao", "pid=,ppid=,pgid=,stat=,command="];
  const result = spawnSync("ps", args, {
    encoding: "utf8",
    maxBuffer: includeEnvironment ? 64 * 1024 * 1024 : 16 * 1024 * 1024
  });
  if (result.status !== 0) return [];
  return String(result.stdout || "")
    .split("\n")
    .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/))
    .filter(Boolean)
    .map((match) => ({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      pgid: Number(match[3]),
      stat: match[4],
      command: match[5]
    }));
}

function commandReferencesWorkspace(command, workspace) {
  return command.includes(workspace)
    || command.includes(workspace.replace(/^\/private/, ""));
}

function expandDescendants(targets, processes) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of processes) {
      if (!targets.has(entry.pid) && targets.has(entry.ppid)) {
        targets.add(entry.pid);
        changed = true;
      }
    }
  }
}

function signalTargets(targets, processes, signal) {
  const current = processes.find((entry) => entry.pid === process.pid);
  const currentPgid = current?.pgid || null;
  const groups = new Set(processes
    .filter((entry) => targets.has(entry.pid))
    .map((entry) => entry.pgid)
    .filter((pgid) => pgid > 1 && pgid !== currentPgid));
  for (const pgid of groups) {
    try {
      process.kill(-pgid, signal);
    } catch (error) {
      if (!["ESRCH", "EPERM"].includes(error.code)) throw error;
    }
  }
  for (const pid of targets) {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if (!["ESRCH", "EPERM"].includes(error.code)) throw error;
    }
  }
}

function sleep(ms) {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, ms);
}

function waitForProcessExit(pids, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = listProcesses().some((entry) => pids.has(entry.pid));
    if (!remaining) return;
    sleep(50);
  }
}
