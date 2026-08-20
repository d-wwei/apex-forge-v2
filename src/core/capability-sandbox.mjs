import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  snapshotProcessIds,
  terminateNewWorkspaceProcesses
} from "./process-guard.mjs";

const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
const CAPABILITY_RUNNER = new URL("./capability-runner.mjs", import.meta.url).pathname;
const SECRET_NAME = /(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|CREDENTIAL|COOKIE|AUTH)/i;
const INTERNAL_ENV_NAMES = new Set(["APEX_PARALLEL_GUARD_TOKEN"]);

export function spawnCapabilityProcess(executable, args, options = {}) {
  const workspaceDir = realpathSync(options.workspaceDir);
  const writablePaths = Array.from(new Set([
    workspaceDir,
    ...(options.writablePaths || []).map(existingRealPath)
  ]));
  const env = sanitizeEnvironment({
    ...(options.env || process.env),
    APEX_CAPABILITY_SANDBOX_ACTIVE: "1"
  }, options.allowedSecretNames || []);
  const sandbox = (options.env || process.env).APEX_CAPABILITY_SANDBOX_ACTIVE === "1"
    ? {
        available: true,
        type: "inherited-macos-seatbelt",
        executable,
        args
      }
    : capabilitySandboxCommand(executable, args, {
        workspaceDir,
        writablePaths,
        network: Boolean(options.network),
        deniedReadPaths: options.deniedReadPaths || []
      });
  if (!sandbox.available) {
    return {
      status: 1,
      signal: null,
      stdout: "",
      stderr: sandbox.error,
      error: new Error(sandbox.error),
      duration_ms: 0,
      sandbox
    };
  }
  return runManagedProcess(sandbox, {
    cwd: workspaceDir,
    input: options.input,
    timeoutMs: options.timeoutMs,
    env,
    minFreeBytes: options.minFreeBytes,
    diskPath: options.diskPath || workspaceDir,
    maxDiskGrowthBytes: options.maxDiskGrowthBytes,
    maxWorkspaceGrowthBytes: options.maxWorkspaceGrowthBytes,
    workspaceCheckIntervalMs: options.workspaceCheckIntervalMs,
    maxOutputBytes: options.maxOutputBytes
  });
}

export function spawnManagedProcess(executable, args, options = {}) {
  const workspaceDir = realpathSync(options.workspaceDir);
  return runManagedProcess({
    available: true,
    type: "managed-process",
    executable,
    args
  }, {
    cwd: workspaceDir,
    input: options.input,
    timeoutMs: options.timeoutMs,
    env: options.env || process.env,
    minFreeBytes: options.minFreeBytes,
    diskPath: options.diskPath || workspaceDir,
    maxDiskGrowthBytes: options.maxDiskGrowthBytes,
    maxWorkspaceGrowthBytes: options.maxWorkspaceGrowthBytes,
    workspaceCheckIntervalMs: options.workspaceCheckIntervalMs,
    maxOutputBytes: options.maxOutputBytes
  });
}

export function capabilitySandboxCommand(executable, args, options) {
  if (process.platform !== "darwin" || !existsSync(SANDBOX_EXEC)) {
    return {
      available: false,
      error: "OS capability sandbox unavailable; refusing unsandboxed agent execution",
      executable,
      args
    };
  }
  const profile = buildMacSandboxProfile(options);
  return {
    available: true,
    type: "macos-seatbelt",
    profile,
    executable: SANDBOX_EXEC,
    args: ["-p", profile, executable, ...args]
  };
}

export function sanitizeEnvironment(environment, allowedSecretNames = []) {
  const allowed = new Set(allowedSecretNames);
  return Object.fromEntries(Object.entries(environment).filter(([name]) =>
    !SECRET_NAME.test(name) || allowed.has(name) || INTERNAL_ENV_NAMES.has(name)
  ));
}

function buildMacSandboxProfile(options) {
  const writableRules = options.writablePaths
    .map((path) => `(subpath ${quote(path)})`)
    .join(" ");
  const deniedSecretPaths = [...defaultSecretPaths(), ...(options.deniedReadPaths || [])]
    .map((path) => `(deny file-read* (subpath ${quote(path)}))`)
    .join(" ");
  return [
    "(version 1)",
    "(allow default)",
    "(deny file-write*)",
    `(allow file-write* ${writableRules} (subpath "/private/tmp") (literal "/dev/null") (literal "/dev/tty"))`,
    options.network ? "" : "(deny network*)",
    deniedSecretPaths
  ].filter(Boolean).join(" ");
}

function defaultSecretPaths() {
  const home = realpathSync(homedir());
  return [
    resolve(home, ".ssh"),
    resolve(home, ".aws"),
    resolve(home, ".kube"),
    resolve(home, ".config", "gcloud")
  ];
}

function existingRealPath(path) {
  const resolved = resolve(path);
  if (existsSync(resolved)) return realpathSync(resolved);
  return realpathSync(dirname(resolved));
}

function quote(value) {
  return JSON.stringify(value);
}

function runManagedProcess(sandbox, options) {
  const baselinePids = snapshotProcessIds();
  const guardToken = randomUUID();
  const guardedEnvironment = {
    ...options.env,
    APEX_PROCESS_GUARD_TOKEN: guardToken
  };
  const exchangeDir = mkdtempSync(join(capabilityExchangeRoot(), "apex-capability-runner-"));
  const configPath = join(exchangeDir, "config.json");
  const resultPath = join(exchangeDir, "result.json");
  let execution;
  let processCleanup = {
    terminated_pids: [],
    force_killed_pids: [],
    surviving_pids: []
  };
  writeFileSync(configPath, `${JSON.stringify({
    executable: sandbox.executable,
    args: sandbox.args,
    cwd: options.cwd,
    input: options.input ?? null,
    timeoutMs: options.timeoutMs || 30 * 60 * 1000,
    env: guardedEnvironment,
    parentPid: process.pid,
    minFreeBytes: options.minFreeBytes || 0,
    diskPath: options.diskPath || options.cwd,
    maxDiskGrowthBytes: options.maxDiskGrowthBytes || 0,
    maxWorkspaceGrowthBytes: options.maxWorkspaceGrowthBytes || 0,
    workspaceCheckIntervalMs: options.workspaceCheckIntervalMs || 2000,
    maxOutputBytes: options.maxOutputBytes || 16 * 1024 * 1024
  })}\n`);
  try {
    const runner = spawnSync(process.execPath, [CAPABILITY_RUNNER, configPath, resultPath], {
      cwd: options.cwd,
      encoding: "utf8",
      timeout: (options.timeoutMs || 30 * 60 * 1000) + 10000,
      env: guardedEnvironment
    });
    if (!existsSync(resultPath)) {
      const message = runner.stderr || runner.error?.message || "capability runner produced no result";
      execution = {
        status: 1,
        signal: runner.signal || null,
        stdout: runner.stdout || "",
        stderr: message,
        error: Object.assign(new Error(message), {
          code: runner.error?.code || "ERUNNER"
        }),
        duration_ms: 0,
        sandbox
      };
    } else {
      const result = JSON.parse(readFileSync(resultPath, "utf8"));
      const error = result.error
        ? Object.assign(new Error(result.error), { code: result.timed_out ? "ETIMEDOUT" : "EEXECUTION" })
        : null;
      execution = {
        status: result.status,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        error,
        timed_out: result.timed_out,
        termination_reason: result.termination_reason,
        duration_ms: result.duration_ms,
        sandbox
      };
    }
  } finally {
    processCleanup = terminateNewWorkspaceProcesses(options.cwd, baselinePids, { guardToken });
    rmSync(exchangeDir, { recursive: true, force: true });
  }
  execution.process_cleanup = processCleanup;
  if (processCleanup.terminated_pids.length > 0) {
    const message = processCleanup.surviving_pids.length > 0
      ? `orphan workspace processes survived cleanup: ${processCleanup.surviving_pids.join(",")}`
      : `orphan workspace processes reaped: ${processCleanup.terminated_pids.join(",")}`;
    execution.status = 1;
    execution.termination_reason = "orphan-process";
    execution.stderr = [execution.stderr, message].filter(Boolean).join("\n");
    execution.error = Object.assign(new Error(message), { code: "EORPHANPROCESS" });
  }
  return execution;
}

function capabilityExchangeRoot() {
  if (process.platform === "darwin" && existsSync("/private/tmp")) {
    return realpathSync("/private/tmp");
  }
  return tmpdir();
}
