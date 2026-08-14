import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
const CAPABILITY_RUNNER = new URL("./capability-runner.mjs", import.meta.url).pathname;
const SECRET_NAME = /(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|CREDENTIAL|COOKIE|AUTH)/i;

export function spawnCapabilityProcess(executable, args, options = {}) {
  const workspaceDir = realpathSync(options.workspaceDir);
  const writablePaths = Array.from(new Set([
    workspaceDir,
    ...(options.writablePaths || []).map(existingRealPath)
  ]));
  const env = sanitizeEnvironment(options.env || process.env, options.allowedSecretNames || []);
  const sandbox = capabilitySandboxCommand(executable, args, {
    workspaceDir,
    writablePaths,
    network: Boolean(options.network),
    adapter: options.adapter || "unknown"
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
    env
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
    !SECRET_NAME.test(name) || allowed.has(name)
  ));
}

function buildMacSandboxProfile(options) {
  const writableRules = options.writablePaths
    .map((path) => `(subpath ${quote(path)})`)
    .join(" ");
  const deniedSecretPaths = secretPaths(options.adapter)
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

function secretPaths(adapter) {
  const home = realpathSync(homedir());
  const paths = [
    resolve(home, ".ssh"),
    resolve(home, ".aws"),
    resolve(home, ".kube"),
    resolve(home, ".config", "gcloud")
  ];
  if (adapter !== "codex") paths.push(resolve(home, ".codex"));
  if (adapter !== "claude") paths.push(resolve(home, ".claude"));
  paths.push(resolve(home, ".gemini"));
  return paths;
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
  const exchangeDir = mkdtempSync(join(tmpdir(), "apex-capability-runner-"));
  const configPath = join(exchangeDir, "config.json");
  const resultPath = join(exchangeDir, "result.json");
  writeFileSync(configPath, `${JSON.stringify({
    executable: sandbox.executable,
    args: sandbox.args,
    cwd: options.cwd,
    input: options.input ?? null,
    timeoutMs: options.timeoutMs || 30 * 60 * 1000,
    env: options.env
  })}\n`);
  try {
    const runner = spawnSync(process.execPath, [CAPABILITY_RUNNER, configPath, resultPath], {
      cwd: options.cwd,
      encoding: "utf8",
      timeout: (options.timeoutMs || 30 * 60 * 1000) + 10000,
      env: options.env
    });
    if (!existsSync(resultPath)) {
      const message = runner.stderr || runner.error?.message || "capability runner produced no result";
      return {
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
    }
    const result = JSON.parse(readFileSync(resultPath, "utf8"));
    const error = result.error
      ? Object.assign(new Error(result.error), { code: result.timed_out ? "ETIMEDOUT" : "EEXECUTION" })
      : null;
    return {
      status: result.status,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
      error,
      timed_out: result.timed_out,
      duration_ms: result.duration_ms,
      sandbox
    };
  } finally {
    rmSync(exchangeDir, { recursive: true, force: true });
  }
}
