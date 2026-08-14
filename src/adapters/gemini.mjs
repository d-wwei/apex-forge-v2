import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { tail } from "../lib/common.mjs";
import { spawnCapabilityProcess } from "../core/capability-sandbox.mjs";

export function inspectGeminiAdapter(executable = "gemini") {
  const result = spawnSync(executable, ["--version"], { encoding: "utf8", timeout: 5000 });
  return { adapter: "gemini", executable, available: result.status === 0, version: result.status === 0 ? result.stdout.trim() : "", capabilities: ["json_output", "session_resume", "workspace_write", "sandbox"], error: result.status === 0 ? "" : tail(result.stderr) };
}

export function executeGeminiAdapter(options) {
  const args = buildGeminiArgs(options);
  if (options.sessionId) args.push("--resume", options.sessionId);
  if (options.model) args.push("--model", options.model);
  const isolatedHome = prepareIsolatedGeminiHome(options.workspaceDir);
  const result = spawnCapabilityProcess(options.executable || "gemini", args, {
    workspaceDir: options.workspaceDir,
    timeoutMs: options.timeoutMs,
    adapter: "gemini",
    network: true,
    allowedSecretNames: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "FUTU_LLM_PROXY_API_KEY"],
    env: {
      ...process.env,
      HOME: isolatedHome
    }
  });
  let envelope = null;
  if (result.status === 0) {
    envelope = parseEnvelope(result.stdout);
    if (envelope.structured) writeFileSync(options.outputPath, `${JSON.stringify(envelope.structured)}\n`);
  }
  return { executable: options.executable || "gemini", args, command: `${result.sandbox.executable} ${result.sandbox.args[0]} <profile> ${options.executable || "gemini"} --prompt <prompt> --output-format json`, exit_code: result.status ?? 1, signal: result.signal || "", timed_out: result.error?.code === "ETIMEDOUT", duration_ms: result.duration_ms, stdout_tail: tail(result.stdout), stderr_tail: tail(result.stderr || result.error?.message || ""), session_id: envelope?.session_id || options.sessionId || null };
}

export function buildGeminiArgs(options) {
  return [
    "--prompt",
    options.prompt,
    "--output-format",
    "json",
    "--approval-mode",
    "auto_edit",
    "--skip-trust"
  ];
}

function prepareIsolatedGeminiHome(workspaceDir) {
  const sourceRoot = join(homedir(), ".gemini");
  const isolatedHome = join(workspaceDir, ".apex-agent", "gemini-home");
  const targetRoot = join(isolatedHome, ".gemini");
  mkdirSync(targetRoot, { recursive: true });
  for (const file of [
    "settings.json",
    "google_accounts.json",
    "installation_id",
    "state.json",
    "projects.json",
    "trustedFolders.json",
    ".env"
  ]) {
    const source = join(sourceRoot, file);
    if (!existsSync(source)) continue;
    const target = join(targetRoot, file);
    copyFileSync(source, target);
    chmodSync(target, 0o600);
  }
  return isolatedHome;
}

function parseEnvelope(stdout) {
  try {
    const value = JSON.parse(stdout);
    const text = value.response || value.result || value.output;
    if (typeof text === "object") return { structured: text, session_id: value.session_id };
    if (typeof text === "string") {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return { structured: JSON.parse(match[0]), session_id: value.session_id };
    }
    if (value.verdict) return { structured: value, session_id: value.session_id };
  } catch {}
  return { structured: null, session_id: null };
}
