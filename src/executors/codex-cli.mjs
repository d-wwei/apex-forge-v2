import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { tail } from "../lib/common.mjs";
import { spawnCapabilityProcess } from "../core/capability-sandbox.mjs";
import { providerSecretPaths } from "./secret-boundaries.mjs";
import {
  cancelProcessTree,
  collectExecutionUsage,
  unsupportedResume
} from "./lifecycle.mjs";

export function inspectCodexAdapter(executable = "codex") {
  const resolvedExecutable = resolveCodexExecutable(executable);
  const result = spawnSync(resolvedExecutable, ["--version"], {
    encoding: "utf8",
    timeout: 5000
  });
  return {
    adapter: "codex",
    executable: resolvedExecutable,
    available: result.status === 0,
    version: result.status === 0 ? result.stdout.trim() : "",
    capabilities: ["structured_output", "workspace_write", "tool_use", "ephemeral", "process_tree_cancel"],
    error: result.status === 0 ? "" : tail(result.stderr || result.stdout)
  };
}

export function executeCodexAdapter(options) {
  const {
    executable = "codex",
    workspaceDir,
    prompt,
    outputSchemaPath,
    outputPath,
    model,
    profile,
    timeoutMs = 30 * 60 * 1000
  } = options;
  const resolvedExecutable = resolveCodexExecutable(executable);
  const args = buildCodexArgs({
    workspaceDir,
    outputSchemaPath,
    outputPath,
    model,
    profile,
    smoke: options.smoke
  });
  const codexHome = prepareIsolatedCodexHome(workspaceDir, profile);
  const result = spawnCapabilityProcess(resolvedExecutable, args, {
    workspaceDir,
    input: prompt,
    timeoutMs,
    adapter: "codex",
    network: true,
    writablePaths: [dirname(outputPath)],
    deniedReadPaths: providerSecretPaths(),
    allowedSecretNames: ["OPENAI_API_KEY", "FUTU_LLM_PROXY_API_KEY"],
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      APEX_V2_ADAPTER: "codex"
    }
  });
  if (result.status === 0 && !existsSync(outputPath)) {
    const recovered = extractCodexStructuredOutput(result.stdout);
    if (recovered) {
      writeFileSync(outputPath, `${JSON.stringify(recovered)}\n`);
    }
  }

  return {
    executable: resolvedExecutable,
    executable_name: basename(resolvedExecutable),
    args,
    command: [result.sandbox.executable, ...result.sandbox.args].join(" "),
    exit_code: result.status ?? 1,
    signal: result.signal || "",
    timed_out: result.error?.code === "ETIMEDOUT",
    duration_ms: result.duration_ms,
    stdout_tail: tail(result.stdout),
    stderr_tail: tail(result.stderr || result.error?.message || "")
  };
}

export function extractCodexStructuredOutput(output) {
  const text = String(output || "").trim();
  try {
    const direct = JSON.parse(text);
    if (
      direct
      && typeof direct === "object"
      && !Array.isArray(direct)
      && typeof direct.verdict === "string"
    ) {
      return direct;
    }
  } catch {}
  let recovered = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (
        event.type !== "item.completed"
        || event.item?.type !== "agent_message"
        || typeof event.item.text !== "string"
      ) {
        continue;
      }
      const candidate = JSON.parse(event.item.text);
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        recovered = candidate;
      }
    } catch {}
  }
  return recovered;
}

export function resolveCodexExecutable(
  executable = "codex",
  environment = process.env,
  deniedRoots = providerSecretPaths()
) {
  if (String(executable).includes("/")) return resolve(String(executable));
  const result = spawnSync("/usr/bin/which", ["-a", executable], {
    encoding: "utf8",
    env: environment
  });
  if (result.status !== 0) return executable;
  const denied = [...deniedRoots, join(homedir(), ".local", "bin")].map((path) =>
    existsSync(path) ? realpathSync(path) : resolve(path)
  );
  const candidates = result.stdout.split("\n").map((path) => path.trim()).filter(Boolean);
  for (const candidate of candidates) {
    const resolvedCandidate = existsSync(candidate)
      ? realpathSync(candidate)
      : resolve(candidate);
    if (!denied.some((root) =>
      resolvedCandidate === root || resolvedCandidate.startsWith(`${root}${sep}`)
    ) && !isModeSwitchWrapper(candidate)) {
      return candidate;
    }
  }
  return executable;
}

function isModeSwitchWrapper(path) {
  try {
    const content = readFileSync(path, "utf8").slice(0, 16 * 1024);
    return content.includes("codex_mode.py")
      || content.includes("CODEX_WRAPPER_PATH");
  } catch {
    return false;
  }
}

function prepareIsolatedCodexHome(workspaceDir, profile) {
  const sourceHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  const targetHome = join(workspaceDir, ".apex-agent", "codex-home");
  mkdirSync(targetHome, { recursive: true });
  const sourceProviderModes = join(sourceHome, "provider-modes");
  const targetProviderModes = join(targetHome, "provider-modes");
  mkdirSync(targetProviderModes, { recursive: true });
  const files = ["config.toml", "auth.json"];
  if (profile) files.push(`${profile}.config.toml`);
  for (const file of files) {
    const source = join(sourceHome, file);
    if (!existsSync(source)) continue;
    const target = join(targetHome, file);
    if (file.endsWith(".toml")) {
      const content = readFileSync(source, "utf8")
        .replaceAll(sourceProviderModes, targetProviderModes);
      writeFileSync(target, content);
    } else {
      copyFileSync(source, target);
    }
    chmodSync(target, 0o600);
  }
  for (const file of ["state.json", "azure-models.json", "llm-proxy-models.json"]) {
    const source = join(sourceProviderModes, file);
    if (!existsSync(source)) continue;
    const target = join(targetProviderModes, file);
    copyFileSync(source, target);
    chmodSync(target, 0o600);
  }
  return targetHome;
}

export function buildCodexArgs(options) {
  const args = [
    "exec",
    "--dangerously-bypass-approvals-and-sandbox",
    "--ephemeral",
    "--skip-git-repo-check",
    "--color",
    "never",
    "-C",
    options.workspaceDir,
    "--output-schema",
    options.outputSchemaPath,
    "-o",
    options.outputPath
  ];
  if (options.smoke) {
    args.splice(1, 0, "--disable", "plugins", "-c", 'model_reasoning_effort="low"');
  }
  if (options.model) args.push("-m", options.model);
  if (options.profile) args.push("-p", options.profile);
  args.push("-");
  return args;
}

export const codexCliExecutor = {
  id: "codex",
  inspect: inspectCodexAdapter,
  execute: executeCodexAdapter,
  resume: unsupportedResume("codex"),
  cancel: (input) => cancelProcessTree("codex", input),
  collectUsage: collectExecutionUsage
};
