import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tail } from "../lib/common.mjs";
import { spawnCapabilityProcess } from "../core/capability-sandbox.mjs";
import { providerSecretPaths } from "./secret-boundaries.mjs";

export function inspectClaudeAdapter(executable = "claude") {
  const result = spawnSync(executable, ["--version"], { encoding: "utf8", timeout: 5000 });
  return { adapter: "claude", executable, available: result.status === 0, version: result.status === 0 ? result.stdout.trim() : "", capabilities: ["structured_output", "session_resume", "workspace_write", "budget_limit"], error: result.status === 0 ? "" : tail(result.stderr) };
}

export function executeClaudeAdapter(options) {
  const args = buildClaudeArgs(options);
  const startedAt = Date.now();
  const result = spawnCapabilityProcess(options.executable || "claude", args, {
    workspaceDir: options.workspaceDir,
    timeoutMs: options.timeoutMs,
    adapter: "claude",
    network: true,
    deniedReadPaths: providerSecretPaths(),
    allowedSecretNames: ["ANTHROPIC_API_KEY"]
  });
  let envelope = null;
  if (result.status === 0) {
    envelope = parseEnvelope(result.stdout);
    if (envelope.structured) writeFileSync(options.outputPath, `${JSON.stringify(envelope.structured)}\n`);
  }
  return {
    ...executionResult(options.executable || "claude", args, result, startedAt),
    session_id: envelope?.session_id || options.sessionId || null
  };
}

export function buildClaudeArgs(options) {
  const schema = readFileSync(options.outputSchemaPath, "utf8");
  const args = [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    schema,
    "--permission-mode",
    "acceptEdits",
    "--allowedTools",
    "Read,Edit,Write,Glob,Grep,Bash(npm test),Bash(node --test *),Bash(node --check *)",
    "--append-system-prompt",
    "Your final response MUST use the provided structured output schema. Do not return a prose-only final answer."
  ];
  if (options.sessionId) args.push("--resume", options.sessionId);
  if (options.model) args.push("--model", options.model);
  args.push(options.prompt);
  return args;
}

function parseEnvelope(stdout) {
  try {
    const value = JSON.parse(stdout);
    if (value.structured_output) return { structured: value.structured_output, session_id: value.session_id };
    if (typeof value.result === "string") {
      try {
        return { structured: JSON.parse(value.result), session_id: value.session_id };
      } catch {
        return { structured: null, session_id: value.session_id };
      }
    }
    if (value.verdict) return { structured: value, session_id: value.session_id };
    return { structured: null, session_id: value.session_id };
  } catch {}
  return { structured: null, session_id: null };
}

function executionResult(executable, args, result, startedAt) {
  return { executable, args, command: [result.sandbox.executable, ...result.sandbox.args.slice(0, -1), "<prompt>"].join(" "), exit_code: result.status ?? 1, signal: result.signal || "", timed_out: result.error?.code === "ETIMEDOUT", duration_ms: result.duration_ms ?? Date.now() - startedAt, stdout_tail: tail(result.stdout), stderr_tail: tail(result.stderr || result.error?.message || "") };
}

export const claudeCodeCliExecutor = {
  id: "claude",
  inspect: inspectClaudeAdapter,
  execute: executeClaudeAdapter
};
