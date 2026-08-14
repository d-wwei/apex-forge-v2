import { assertHostAdapter } from "../contracts/host-adapter.mjs";
import { claudeCodeHostAdapter } from "./claude-code/adapter.mjs";
import { codexHostAdapter } from "./codex/adapter.mjs";

const HOSTS = new Map();

for (const adapter of [codexHostAdapter, claudeCodeHostAdapter]) {
  HOSTS.set(adapter.id, assertHostAdapter(adapter));
}

export function getHostAdapter(id) {
  const adapter = HOSTS.get(id);
  if (!adapter) throw new Error(`未知 HostAdapter：${id}`);
  return adapter;
}

export function inspectHostAdapters() {
  return [...HOSTS.values()].map((adapter) => ({
    host_id: adapter.id,
    ...adapter.describeHost()
  }));
}
