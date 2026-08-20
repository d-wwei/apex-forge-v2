import {
  normalizeExecutionCapabilities
} from "./execution-capability.mjs";

export function assertWorkerExecutor(executor) {
  if (!executor || typeof executor !== "object") {
    throw new Error("WorkerExecutor 必须是对象");
  }
  if (!executor.id || typeof executor.id !== "string") {
    throw new Error("WorkerExecutor 必须声明 id");
  }
  for (const method of ["inspect", "execute", "resume", "cancel", "collectUsage"]) {
    if (typeof executor[method] !== "function") {
      throw new Error(`WorkerExecutor ${executor.id} 缺少方法：${method}`);
    }
  }
  return executor;
}

export function normalizeExecutorInspection(executorId, inspection = {}) {
  return {
    ...inspection,
    executor_id: executorId,
    adapter: inspection.adapter || executorId,
    available: Boolean(inspection.available),
    version: String(inspection.version || ""),
    capabilities: normalizeExecutionCapabilities(inspection.capabilities || []),
    error: String(inspection.error || "")
  };
}
