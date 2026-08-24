import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_KILL_GRACE_MS = 1000;
const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const DEFAULT_PARENT_CLEANUP_GRACE_MS = 250;
const PARENT_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];

const activeSupervisors = new Set();
const parentSignalHandlers = new Map();
let parentExitHandler = null;
let handlingParentSignal = false;

export class WorkerSupervisor {
  constructor(options = {}) {
    this.maxConcurrency = positiveInteger(
      options.maxConcurrency ?? 1,
      "maxConcurrency"
    );
    this.defaultTimeoutMs = positiveInteger(
      options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      "defaultTimeoutMs"
    );
    this.defaultKillGraceMs = nonNegativeInteger(
      options.defaultKillGraceMs ?? DEFAULT_KILL_GRACE_MS,
      "defaultKillGraceMs"
    );
    this.defaultMaxOutputBytes = positiveInteger(
      options.defaultMaxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
      "defaultMaxOutputBytes"
    );
    this.parentCleanupGraceMs = nonNegativeInteger(
      options.parentCleanupGraceMs ?? DEFAULT_PARENT_CLEANUP_GRACE_MS,
      "parentCleanupGraceMs"
    );
    this.cleanupOnParentExit = options.cleanupOnParentExit !== false;
    this.spawnProcess = options.spawnProcess || spawn;
    this.active = new Map();
    this.closed = false;
    this.running = false;
    this.stopReason = null;
  }

  async run(jobs) {
    if (this.closed) throw new Error("WorkerSupervisor is closed");
    if (this.running) throw new Error("WorkerSupervisor already has an active run");
    const normalizedJobs = normalizeJobs(jobs, this);
    if (normalizedJobs.length === 0) return [];

    this.running = true;
    if (this.cleanupOnParentExit) registerSupervisor(this);
    const results = new Array(normalizedJobs.length);
    let nextIndex = 0;
    let completed = 0;

    try {
      return await new Promise((resolve) => {
        const schedule = () => {
          if (this.stopReason != null) {
            while (nextIndex < normalizedJobs.length) {
              results[nextIndex] = cancelledBeforeStart(
                normalizedJobs[nextIndex],
                this.stopReason
              );
              nextIndex += 1;
              completed += 1;
            }
            if (completed === normalizedJobs.length) resolve(results);
            return;
          }
          while (
            nextIndex < normalizedJobs.length
            && this.active.size < this.maxConcurrency
          ) {
            const index = nextIndex;
            nextIndex += 1;
            this.startJob(normalizedJobs[index])
              .then((result) => {
                results[index] = result;
                completed += 1;
                if (completed === normalizedJobs.length) {
                  resolve(results);
                  return;
                }
                schedule();
              });
          }
        };
        schedule();
      });
    } finally {
      this.running = false;
      if (this.cleanupOnParentExit && this.active.size === 0) {
        unregisterSupervisor(this);
      }
    }
  }

  async close({ reason = "supervisor-close" } = {}) {
    this.closed = true;
    this.stopReason ||= reason;
    const active = [...this.active.values()];
    for (const state of active) {
      this.terminate(state, reason, state.killGraceMs);
    }
    await Promise.allSettled(active.map((state) => state.done));
    unregisterSupervisor(this);
  }

  startJob(job) {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const state = {
      job,
      child: null,
      pid: null,
      startedAt,
      startedAtMs,
      stdout: [],
      stderr: [],
      stdoutBytes: 0,
      stderrBytes: 0,
      capturedOutputBytes: 0,
      observedOutputBytes: 0,
      timedOut: false,
      outputLimitExceeded: false,
      terminationReason: null,
      spawnError: null,
      termSent: false,
      forceKilled: false,
      settled: false,
      timeoutTimer: null,
      killTimer: null,
      killGraceMs: job.killGraceMs,
      done: null
    };

    state.done = new Promise((resolve) => {
      state.resolve = resolve;
    });

    let child;
    try {
      child = this.spawnProcess(job.command, job.args, {
        cwd: job.cwd,
        env: job.env,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });
    } catch (error) {
      state.spawnError = error;
      this.finish(state, null, null);
      return state.done;
    }

    state.child = child;
    state.pid = child.pid || null;
    if (state.pid != null) this.active.set(state.pid, state);
    else this.active.set(Symbol(job.id), state);

    child.stdout.on("data", (chunk) => {
      this.captureOutput(state, "stdout", chunk);
    });
    child.stderr.on("data", (chunk) => {
      this.captureOutput(state, "stderr", chunk);
    });
    child.once("error", (error) => {
      state.spawnError = error;
    });
    child.once("close", (code, signal) => {
      this.finish(state, code, signal);
    });

    state.timeoutTimer = setTimeout(() => {
      state.timedOut = true;
      this.terminate(state, "timeout", state.killGraceMs);
    }, job.timeoutMs);
    state.timeoutTimer.unref();

    if (job.input == null) child.stdin.end();
    else child.stdin.end(job.input);
    return state.done;
  }

  captureOutput(state, stream, value) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    state.observedOutputBytes += chunk.length;
    if (stream === "stdout") state.stdoutBytes += chunk.length;
    else state.stderrBytes += chunk.length;

    const remaining = Math.max(
      0,
      state.job.maxOutputBytes - state.capturedOutputBytes
    );
    if (remaining > 0) {
      const captured = chunk.subarray(0, remaining);
      state[stream].push(captured);
      state.capturedOutputBytes += captured.length;
    }

    if (
      !state.outputLimitExceeded
      && state.observedOutputBytes > state.job.maxOutputBytes
    ) {
      state.outputLimitExceeded = true;
      this.terminate(state, "output-limit", state.killGraceMs);
    }
  }

  terminate(state, reason, graceMs) {
    if (state.settled) return;
    if (state.terminationReason == null) state.terminationReason = reason;
    if (!state.termSent) {
      state.termSent = true;
      signalProcessTree(state.child, state.pid, "SIGTERM");
    }
    if (state.killTimer != null) return;
    state.killTimer = setTimeout(() => {
      if (state.settled) return;
      state.forceKilled = true;
      signalProcessTree(state.child, state.pid, "SIGKILL");
    }, graceMs);
    state.killTimer.unref();
  }

  finish(state, code, signal) {
    if (state.settled) return;
    state.settled = true;
    clearTimeout(state.timeoutTimer);
    clearTimeout(state.killTimer);
    for (const [key, activeState] of this.active) {
      if (activeState === state) {
        this.active.delete(key);
        break;
      }
    }
    if (this.cleanupOnParentExit && this.active.size === 0 && !this.running) {
      unregisterSupervisor(this);
    }

    const endedAtMs = Date.now();
    const result = {
      job_id: state.job.id,
      status: resultStatus(state, code, signal),
      command: state.job.command,
      args: [...state.job.args],
      pid: state.pid,
      stdout: Buffer.concat(state.stdout).toString("utf8"),
      stderr: Buffer.concat(state.stderr).toString("utf8"),
      stdout_bytes: state.stdoutBytes,
      stderr_bytes: state.stderrBytes,
      observed_output_bytes: state.observedOutputBytes,
      captured_output_bytes: state.capturedOutputBytes,
      output_limit_bytes: state.job.maxOutputBytes,
      output_limit_exceeded: state.outputLimitExceeded,
      timed_out: state.timedOut,
      termination_reason: state.terminationReason,
      term_sent: state.termSent,
      force_killed: state.forceKilled,
      exit_code: code,
      signal: signal || null,
      spawn_error: state.spawnError?.message || null,
      started_at: state.startedAt,
      ended_at: new Date(endedAtMs).toISOString(),
      duration_ms: endedAtMs - state.startedAtMs
    };
    state.resolve(result);
  }

  async terminateForParentSignal() {
    this.stopReason ||= "parent-exit";
    const active = [...this.active.values()];
    for (const state of active) {
      this.terminate(state, "parent-exit", this.parentCleanupGraceMs);
    }
    await Promise.allSettled(active.map((state) => state.done));
  }

  forceTerminateForParentExit() {
    for (const state of this.active.values()) {
      if (state.settled) continue;
      state.terminationReason ||= "parent-exit";
      signalProcessTree(state.child, state.pid, "SIGTERM");
      signalProcessTree(state.child, state.pid, "SIGKILL");
    }
  }
}

export async function runWorkerJobs(jobs, options = {}) {
  const supervisor = new WorkerSupervisor(options);
  try {
    return await supervisor.run(jobs);
  } finally {
    await supervisor.close();
  }
}

function normalizeJobs(jobs, supervisor) {
  if (!Array.isArray(jobs)) throw new Error("jobs must be an array");
  const ids = new Set();
  return jobs.map((job, index) => {
    if (job == null || typeof job !== "object" || Array.isArray(job)) {
      throw new Error(`jobs[${index}] must be an object`);
    }
    const id = String(job.id || "").trim();
    if (!id) throw new Error(`jobs[${index}].id is required`);
    if (ids.has(id)) throw new Error(`duplicate worker job id: ${id}`);
    ids.add(id);
    const command = String(job.command || "").trim();
    if (!command) throw new Error(`jobs[${index}].command is required`);
    if (job.args != null && !Array.isArray(job.args)) {
      throw new Error(`jobs[${index}].args must be an array`);
    }
    const args = (job.args || []).map((argument) => String(argument));
    const timeoutMs = positiveInteger(
      job.timeoutMs ?? supervisor.defaultTimeoutMs,
      `jobs[${index}].timeoutMs`
    );
    const killGraceMs = nonNegativeInteger(
      job.killGraceMs ?? supervisor.defaultKillGraceMs,
      `jobs[${index}].killGraceMs`
    );
    const maxOutputBytes = positiveInteger(
      job.maxOutputBytes ?? supervisor.defaultMaxOutputBytes,
      `jobs[${index}].maxOutputBytes`
    );
    return {
      id,
      command,
      args,
      cwd: job.cwd,
      env: job.env == null
        ? process.env
        : { ...process.env, ...job.env },
      input: job.input,
      timeoutMs,
      killGraceMs,
      maxOutputBytes
    };
  });
}

function resultStatus(state, code, signal) {
  if (state.spawnError) return "spawn_error";
  if (state.timedOut) return "timed_out";
  if (state.outputLimitExceeded) return "output_limit";
  if (state.terminationReason != null) return "cancelled";
  if (code === 0 && signal == null) return "succeeded";
  return "failed";
}

function cancelledBeforeStart(job, reason) {
  return {
    job_id: job.id,
    status: "cancelled",
    command: job.command,
    args: [...job.args],
    pid: null,
    stdout: "",
    stderr: "",
    stdout_bytes: 0,
    stderr_bytes: 0,
    observed_output_bytes: 0,
    captured_output_bytes: 0,
    output_limit_bytes: job.maxOutputBytes,
    output_limit_exceeded: false,
    timed_out: false,
    termination_reason: reason,
    term_sent: false,
    force_killed: false,
    exit_code: null,
    signal: null,
    spawn_error: null,
    started_at: null,
    ended_at: new Date().toISOString(),
    duration_ms: 0
  };
}

function signalProcessTree(child, pid, signal) {
  if (process.platform !== "win32" && Number.isInteger(pid) && pid > 1) {
    try {
      process.kill(-pid, signal);
      return;
    } catch (error) {
      if (error.code !== "ESRCH") {
        try {
          child?.kill(signal);
        } catch {}
      }
      return;
    }
  }
  try {
    child?.kill(signal);
  } catch {}
}

function registerSupervisor(supervisor) {
  activeSupervisors.add(supervisor);
  if (parentExitHandler != null) return;

  parentExitHandler = () => {
    for (const activeSupervisor of activeSupervisors) {
      activeSupervisor.forceTerminateForParentExit();
    }
  };
  process.on("exit", parentExitHandler);

  for (const signal of PARENT_SIGNALS) {
    const handler = () => {
      handleParentSignal(signal);
    };
    parentSignalHandlers.set(signal, handler);
    process.on(signal, handler);
  }
}

function unregisterSupervisor(supervisor) {
  activeSupervisors.delete(supervisor);
  if (activeSupervisors.size > 0 || parentExitHandler == null) return;
  process.off("exit", parentExitHandler);
  parentExitHandler = null;
  for (const [signal, handler] of parentSignalHandlers) {
    process.off(signal, handler);
  }
  parentSignalHandlers.clear();
}

async function handleParentSignal(signal) {
  if (handlingParentSignal) return;
  handlingParentSignal = true;
  const supervisors = [...activeSupervisors];
  await Promise.allSettled(
    supervisors.map((supervisor) => supervisor.terminateForParentSignal())
  );
  removeAllParentHandlers();
  process.kill(process.pid, signal);
}

function removeAllParentHandlers() {
  activeSupervisors.clear();
  if (parentExitHandler != null) {
    process.off("exit", parentExitHandler);
    parentExitHandler = null;
  }
  for (const [signal, handler] of parentSignalHandlers) {
    process.off(signal, handler);
  }
  parentSignalHandlers.clear();
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return number;
}

function nonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return number;
}
