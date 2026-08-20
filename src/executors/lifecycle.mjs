export function resumeWithExecute(executorId, execute, input = {}) {
  if (!input.sessionId) {
    throw new Error(`WorkerExecutor ${executorId} resume 要求 sessionId`);
  }
  return execute(input);
}

export function unsupportedResume(executorId) {
  return () => {
    throw new Error(`WorkerExecutor ${executorId} 不支持 session resume`);
  };
}

export function cancelProcessTree(executorId, input = {}) {
  if (typeof input.cancel === "function") {
    input.cancel();
    return { executor_id: executorId, cancelled: true, method: "callback" };
  }
  const processGroupId = Number(input.processGroupId || input.process_group_id || input.pid);
  if (!Number.isInteger(processGroupId) || processGroupId <= 0) {
    return { executor_id: executorId, cancelled: false, method: "not_running" };
  }
  const signal = input.signal || "SIGTERM";
  signalProcessGroup(processGroupId, signal);
  let forceKilled = false;
  if (signal !== "SIGKILL") {
    sleep(Number(input.graceMs || input.grace_ms || 250));
    if (processGroupAlive(processGroupId)) {
      signalProcessGroup(processGroupId, "SIGKILL");
      forceKilled = true;
    }
  }
  return {
    executor_id: executorId,
    cancelled: true,
    method: "process_group",
    signal,
    force_killed: forceKilled
  };
}

export function collectExecutionUsage(execution = {}) {
  return {
    input_tokens: nullableInteger(execution.usage?.input_tokens),
    output_tokens: nullableInteger(execution.usage?.output_tokens),
    tool_calls: nullableInteger(execution.usage?.tool_calls),
    duration_ms: nullableInteger(execution.duration_ms)
  };
}

function nullableInteger(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function signalProcessGroup(processGroupId, signal) {
  try {
    process.kill(-processGroupId, signal);
  } catch (error) {
    if (error.code === "ESRCH") return;
    try {
      process.kill(processGroupId, signal);
    } catch (fallbackError) {
      if (fallbackError.code !== "ESRCH") throw fallbackError;
    }
  }
}

function processGroupAlive(processGroupId) {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch {
    try {
      process.kill(processGroupId, 0);
      return true;
    } catch {
      return false;
    }
  }
}

function sleep(ms) {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, ms);
}
