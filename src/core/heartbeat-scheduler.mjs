import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { atomicWriteFile } from "../lib/common.mjs";

export function heartbeatJobId(projectDir) {
  const suffix = createHash("sha256").update(resolve(projectDir)).digest("hex").slice(0, 12);
  return `com.apex-forge-v2.heartbeat.${suffix}`;
}

export function installHeartbeatScheduler(projectDir, options = {}) {
  const resolvedProject = resolve(projectDir);
  const root = join(resolvedProject, ".apex-v2");
  if (!existsSync(join(root, "project.json"))) throw new Error(`项目尚未初始化：${root}`);
  const intervalMinutes = Number(options.intervalMinutes || 60);
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1) {
    throw new Error("heartbeat intervalMinutes 必须是正整数");
  }
  const home = options.homeDir || homedir();
  const stateDir = join(root, "heartbeat");
  const logDir = join(stateDir, "logs");
  mkdirSync(logDir, { recursive: true });
  const label = heartbeatJobId(resolvedProject);
  const runnerPath = join(stateDir, "run.zsh");
  const statePlistPath = join(stateDir, `${label}.plist`);
  const launchAgentsDir = join(home, "Library", "LaunchAgents");
  const installedPlistPath = join(launchAgentsDir, `${label}.plist`);
  mkdirSync(launchAgentsDir, { recursive: true });
  const envFile = options.envFile || defaultEnvFile(home);
  atomicWriteFile(runnerPath, renderHeartbeatRunner({
    projectDir: resolvedProject,
    nodePath: options.nodePath || process.execPath,
    cliPath: options.cliPath || new URL("../apex-v2.mjs", import.meta.url).pathname,
    envFile
  }));
  chmodSync(runnerPath, 0o700);
  const plist = renderLaunchdPlist({
    label,
    runnerPath,
    projectDir: resolvedProject,
    intervalSeconds: intervalMinutes * 60,
    stdoutPath: join(logDir, "stdout.log"),
    stderrPath: join(logDir, "stderr.log")
  });
  atomicWriteFile(statePlistPath, plist);
  atomicWriteFile(installedPlistPath, plist);

  let activation = null;
  if (options.activate) {
    const launcher = options.launcher || spawnSync;
    const domain = `gui/${process.getuid()}`;
    launcher("launchctl", ["bootout", domain, installedPlistPath], { encoding: "utf8" });
    const bootstrap = launcher("launchctl", ["bootstrap", domain, installedPlistPath], { encoding: "utf8" });
    if (bootstrap.status !== 0) {
      throw new Error(`launchctl bootstrap 失败：${bootstrap.stderr || bootstrap.stdout}`);
    }
    const kickstart = launcher("launchctl", ["kickstart", "-k", `${domain}/${label}`], { encoding: "utf8" });
    if (kickstart.status !== 0) {
      throw new Error(`launchctl kickstart 失败：${kickstart.stderr || kickstart.stdout}`);
    }
    activation = { domain, bootstrap: bootstrap.status, kickstart: kickstart.status };
  }
  return {
    label,
    interval_minutes: intervalMinutes,
    runner_path: runnerPath,
    state_plist_path: statePlistPath,
    installed_plist_path: installedPlistPath,
    env_file: envFile,
    activated: Boolean(options.activate),
    activation
  };
}

export function heartbeatSchedulerStatus(projectDir, options = {}) {
  const label = heartbeatJobId(projectDir);
  const launcher = options.launcher || spawnSync;
  const domain = `gui/${process.getuid()}`;
  const status = launcher("launchctl", ["print", `${domain}/${label}`], { encoding: "utf8" });
  const output = `${status.stdout || ""}\n${status.stderr || ""}`;
  return {
    label,
    loaded: status.status === 0,
    runs: numberFrom(output, /\bruns = (\d+)/),
    last_exit_code: numberFrom(output, /\blast exit code = (-?\d+)/),
    state: output.match(/\bstate = ([^\n]+)/)?.[1]?.trim() || "unknown"
  };
}

export function renderLaunchdPlist(options) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(options.label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>${xml(options.runnerPath)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(options.projectDir)}</string>
  <key>StartInterval</key>
  <integer>${options.intervalSeconds}</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(options.stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(options.stderrPath)}</string>
</dict>
</plist>
`;
}

function renderHeartbeatRunner(options) {
  const source = options.envFile
    ? `if [[ -f ${shell(options.envFile)} ]]; then\n  set -a\n  source ${shell(options.envFile)}\n  set +a\nfi\n`
    : "";
  return `#!/bin/zsh
set -euo pipefail
${source}exec ${shell(options.nodePath)} ${shell(options.cliPath)} project heartbeat --project ${shell(options.projectDir)}
`;
}

function defaultEnvFile(home) {
  const candidate = join(home, ".codex", "provider-modes", "third-party.env");
  return existsSync(candidate) ? candidate : null;
}

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shell(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function numberFrom(value, pattern) {
  const match = value.match(pattern);
  return match ? Number(match[1]) : null;
}
