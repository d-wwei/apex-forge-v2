import {
  hasExecutionCapabilities
} from "../contracts/execution-capability.mjs";
import {
  assertWorkerExecutor,
  normalizeExecutorInspection
} from "../contracts/worker-executor.mjs";
import { claudeCodeCliExecutor } from "./claude-code-cli.mjs";
import { codexCliExecutor } from "./codex-cli.mjs";
import { geminiCliExecutor } from "./gemini-cli.mjs";
import { createGenericAgentRunner } from "./generic-agent-runner.mjs";
import { createDeepSeekProvider } from "../providers/deepseek.mjs";

const deepSeekRunner = createGenericAgentRunner({
  id: "deepseek-runner",
  provider: createDeepSeekProvider()
});

const BUILTIN_EXECUTORS = [
  codexCliExecutor,
  claudeCodeCliExecutor,
  geminiCliExecutor,
  deepSeekRunner
];

export function createWorkerExecutorRegistry(initialExecutors = []) {
  const executors = new Map();

  function register(executor) {
    const value = assertWorkerExecutor(executor);
    if (executors.has(value.id)) {
      throw new Error(`WorkerExecutor 已注册：${value.id}`);
    }
    executors.set(value.id, value);
    return value;
  }

  function get(id) {
    const executor = executors.get(id);
    if (!executor) throw new Error(`未知 WorkerExecutor：${id}`);
    return executor;
  }

  function inspect(id, executable = id) {
    const executor = get(id);
    return normalizeExecutorInspection(id, executor.inspect(executable));
  }

  function inspectAll() {
    return [...executors.keys()].map((id) => inspect(id));
  }

  function resolve(options = {}) {
    const {
      preferred,
      fallbackOrder = [],
      allowed = [...executors.keys()],
      requiredCapabilities = []
    } = options;
    const candidates = Array.from(new Set([preferred, ...fallbackOrder]))
      .filter(Boolean)
      .filter((id) => allowed.includes(id));
    for (const id of candidates) {
      if (!executors.has(id)) continue;
      const info = inspect(id);
      if (!info.available) continue;
      if (!hasExecutionCapabilities(info.capabilities, requiredCapabilities)) continue;
      return {
        id,
        name: id,
        executor: get(id),
        adapter: get(id),
        info,
        fallback: id !== preferred
      };
    }
    throw new Error(`没有可用 WorkerExecutor：${candidates.join(",")}`);
  }

  for (const executor of initialExecutors) register(executor);

  return {
    get,
    inspect,
    inspectAll,
    register,
    resolve
  };
}

const DEFAULT_REGISTRY = createWorkerExecutorRegistry(BUILTIN_EXECUTORS);

export function inspectWorkerExecutors() {
  return DEFAULT_REGISTRY.inspectAll();
}

export function inspectWorkerExecutor(id, executable = id) {
  return DEFAULT_REGISTRY.inspect(id, executable);
}

export function getWorkerExecutor(id) {
  return DEFAULT_REGISTRY.get(id);
}

export function resolveWorkerExecutor(preferred, fallbackOrder = [], allowed = [], requiredCapabilities = []) {
  return DEFAULT_REGISTRY.resolve({
    preferred,
    fallbackOrder,
    allowed,
    requiredCapabilities
  });
}
