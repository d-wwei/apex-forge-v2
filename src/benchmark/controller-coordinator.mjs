import { withProjectLock } from "../core/project-lock.mjs";
import {
  claimBenchmarkRun,
  finishBenchmarkRun,
  loadBenchmarkControllerState,
  recoverBenchmarkControllerState,
  saveBenchmarkControllerState,
  selectBenchmarkRuns,
  updateBenchmarkChild
} from "./controller-state.mjs";

export function claimNextBenchmarkRunLocked({
  controllerRoot,
  statePath,
  filters = {},
  controllerPid = process.pid,
  leaseMs
}) {
  return withControllerMutation(controllerRoot, statePath, (state) => {
    const selected = selectBenchmarkRuns(state, filters)
      .filter((run) => !(filters.excludeRunKeys || new Set()).has(run.run_key))
      .find((run) => ["pending", "interrupted"].includes(run.status));
    if (!selected) return null;
    return structuredClone(claimBenchmarkRun(state, {
      runKey: selected.run_key,
      controllerPid,
      leaseMs
    }));
  }).result;
}

export function updateBenchmarkRunLocked({
  controllerRoot,
  statePath,
  runKey,
  leaseId,
  fencingToken,
  childPid = null,
  sessionId = null,
  rawLogRefs = []
}) {
  return withControllerMutation(controllerRoot, statePath, (state) => {
    let updated = updateBenchmarkChild(state, {
      runKey,
      childPid,
      sessionId,
      leaseId,
      fencingToken
    });
    for (const rawLogRef of rawLogRefs) {
      updated = updateBenchmarkChild(state, {
        runKey,
        rawLogRef,
        leaseId,
        fencingToken
      });
    }
    return structuredClone(updated);
  }).result;
}

export function finishBenchmarkRunLocked({
  controllerRoot,
  statePath,
  runKey,
  leaseId,
  fencingToken,
  status,
  resultRef = null,
  resultSha256 = null,
  failure = null
}) {
  return withControllerMutation(controllerRoot, statePath, (state) =>
    structuredClone(finishBenchmarkRun(state, {
      runKey,
      leaseId,
      fencingToken,
      status,
      resultRef,
      resultSha256,
      failure
    }))
  ).result;
}

export function loadBenchmarkControllerSnapshot({ controllerRoot, statePath }) {
  return withProjectLock(controllerRoot, () => {
    const state = loadBenchmarkControllerState(statePath);
    const recovered = recoverBenchmarkControllerState(state);
    if (recovered.recovered > 0) saveBenchmarkControllerState(statePath, state);
    return structuredClone(state);
  }, {
    timeoutMs: 120000,
    retryMs: 10
  });
}

function withControllerMutation(controllerRoot, statePath, mutation) {
  return withProjectLock(controllerRoot, () => {
    const state = loadBenchmarkControllerState(statePath);
    recoverBenchmarkControllerState(state);
    const result = mutation(state);
    saveBenchmarkControllerState(statePath, state);
    return {
      result,
      state: structuredClone(state)
    };
  }, {
    timeoutMs: 120000,
    retryMs: 10
  });
}
