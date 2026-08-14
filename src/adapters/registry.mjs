import {
  getWorkerExecutor,
  inspectWorkerExecutors,
  resolveWorkerExecutor
} from "../executors/registry.mjs";

export function inspectAgentAdapters() {
  return inspectWorkerExecutors();
}

export function getAgentAdapter(name) {
  return getWorkerExecutor(name);
}

export function resolveAgentAdapter(preferred, fallbackOrder, allowed) {
  return resolveWorkerExecutor(preferred, fallbackOrder, allowed);
}
