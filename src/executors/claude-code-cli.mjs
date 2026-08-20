import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { tail } from "../lib/common.mjs";
import { spawnCapabilityProcess } from "../core/capability-sandbox.mjs";
import { providerSecretPaths } from "./secret-boundaries.mjs";
import {
  cancelProcessTree,
  collectExecutionUsage,
  resumeWithExecute
} from "./lifecycle.mjs";

export function inspectClaudeAdapter(executable = "claude") {
  const result = spawnSync(executable, ["--version"], { encoding: "utf8", timeout: 5000 });
  return { adapter: "claude", executable, available: result.status === 0, version: result.status === 0 ? result.stdout.trim() : "", capabilities: ["structured_output", "session_resume", "workspace_write", "tool_use", "budget_limit", "process_tree_cancel"], error: result.status === 0 ? "" : tail(result.stderr) };
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
    allowedSecretNames: [
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_AUTH_TOKEN",
      "ANTHROPIC_BASE_URL",
      "ANTHROPIC_MODEL",
      "ANTHROPIC_SMALL_FAST_MODEL"
    ],
    env: {
      ...process.env,
      ...loadClaudeProviderEnvironment()
    }
  });
  let envelope = null;
  if (result.status === 0) {
    envelope = parseEnvelope(result.stdout);
    if (envelope.structured) writeFileSync(options.outputPath, `${JSON.stringify(envelope.structured)}\n`);
  }
  const failedEnvelope = Boolean(envelope?.is_error);
  return {
    ...executionResult(options.executable || "claude", args, result, startedAt, failedEnvelope),
    session_id: envelope?.session_id || options.sessionId || null,
    usage: normalizeClaudeUsage(envelope?.usage)
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
    if (value.structured_output) return {
      structured: value.structured_output,
      session_id: value.session_id,
      usage: value.usage,
      is_error: Boolean(value.is_error)
    };
    if (typeof value.result === "string") {
      try {
        return {
          structured: JSON.parse(value.result),
          session_id: value.session_id,
          usage: value.usage,
          is_error: Boolean(value.is_error)
        };
      } catch {
        return {
          structured: null,
          session_id: value.session_id,
          usage: value.usage,
          is_error: Boolean(value.is_error)
        };
      }
    }
    if (value.verdict) return {
      structured: value,
      session_id: value.session_id,
      usage: value.usage,
      is_error: Boolean(value.is_error)
    };
    return {
      structured: null,
      session_id: value.session_id,
      usage: value.usage,
      is_error: Boolean(value.is_error)
    };
  } catch {}
  return { structured: null, session_id: null, usage: null, is_error: false };
}

function executionResult(executable, args, result, startedAt, failedEnvelope) {
  return { executable, args, command: [result.sandbox.executable, ...result.sandbox.args.slice(0, -1), "<prompt>"].join(" "), exit_code: failedEnvelope ? 1 : result.status ?? 1, signal: result.signal || "", timed_out: result.error?.code === "ETIMEDOUT", duration_ms: result.duration_ms ?? Date.now() - startedAt, stdout_tail: tail(result.stdout), stderr_tail: tail(result.stderr || result.error?.message || "") };
}

function loadClaudeProviderEnvironment() {
  const path = join(homedir(), ".claude", "settings.json");
  if (!existsSync(path)) return {};
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    const allowed = [
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_AUTH_TOKEN",
      "ANTHROPIC_BASE_URL",
      "ANTHROPIC_MODEL",
      "ANTHROPIC_SMALL_FAST_MODEL",
      "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
      "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS"
    ];
    return Object.fromEntries(allowed
      .filter((name) => value.env?.[name] != null)
      .map((name) => [name, String(value.env[name])]));
  } catch {
    return {};
  }
}

function normalizeClaudeUsage(usage = {}) {
  return {
    input_tokens: integerOrNull(usage.input_tokens),
    output_tokens: integerOrNull(usage.output_tokens),
    tool_calls: integerOrNull(usage.server_tool_use?.web_search_requests)
  };
}

function integerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export const claudeCodeCliExecutor = {
  id: "claude",
  inspect: inspectClaudeAdapter,
  execute: executeClaudeAdapter,
  resume: (input) => resumeWithExecute("claude", executeClaudeAdapter, input),
  cancel: (input) => cancelProcessTree("claude", input),
  collectUsage: collectExecutionUsage
};
