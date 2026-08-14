import { executeCodexAdapter, inspectCodexAdapter } from "./codex.mjs";
import { executeClaudeAdapter, inspectClaudeAdapter } from "./claude.mjs";
import { executeGeminiAdapter, inspectGeminiAdapter } from "./gemini.mjs";

const ADAPTERS = {
  codex: { inspect: inspectCodexAdapter, execute: executeCodexAdapter },
  claude: { inspect: inspectClaudeAdapter, execute: executeClaudeAdapter },
  gemini: { inspect: inspectGeminiAdapter, execute: executeGeminiAdapter }
};

export function inspectAgentAdapters() {
  return Object.entries(ADAPTERS).map(([name, adapter]) => adapter.inspect(name));
}

export function getAgentAdapter(name) {
  const adapter = ADAPTERS[name];
  if (!adapter) throw new Error(`未知 agent adapter：${name}`);
  return adapter;
}

export function resolveAgentAdapter(preferred, fallbackOrder, allowed) {
  const candidates = Array.from(new Set([preferred, ...fallbackOrder])).filter((name) => allowed.includes(name));
  for (const name of candidates) {
    const adapter = ADAPTERS[name];
    if (!adapter) continue;
    const info = adapter.inspect(name);
    if (info.available) return { name, adapter, info, fallback: name !== preferred };
  }
  throw new Error(`没有可用 coding-agent adapter：${candidates.join(",")}`);
}
