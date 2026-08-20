import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { assertWorkerExecutor } from "../src/contracts/worker-executor.mjs";
import { codexCliExecutor } from "../src/executors/codex-cli.mjs";
import { claudeCodeCliExecutor } from "../src/executors/claude-code-cli.mjs";
import { geminiCliExecutor } from "../src/executors/gemini-cli.mjs";
import { createGenericAgentRunner } from "../src/executors/generic-agent-runner.mjs";

test("all built-in WorkerExecutors implement the five-method lifecycle contract", () => {
  const generic = createGenericAgentRunner({
    id: "deepseek-runner",
    provider: {
      inspect: () => ({ available: true, provider_id: "deepseek", model: "fixture" }),
      complete: () => ({ choices: [{ message: { content: "{}" } }], usage: {} })
    }
  });
  for (const executor of [codexCliExecutor, claudeCodeCliExecutor, geminiCliExecutor, generic]) {
    assert.equal(assertWorkerExecutor(executor), executor);
    for (const method of ["inspect", "execute", "resume", "cancel", "collectUsage"]) {
      assert.equal(typeof executor[method], "function", `${executor.id}.${method}`);
    }
  }
});

test("executor resume is capability-specific and requires a session", () => {
  assert.throws(() => codexCliExecutor.resume({ sessionId: "session" }), /不支持 session resume/);
  assert.throws(() => claudeCodeCliExecutor.resume({}), /要求 sessionId/);
  assert.throws(() => geminiCliExecutor.resume({}), /要求 sessionId/);
});

test("executor collectUsage normalizes missing and invalid values", () => {
  assert.deepEqual(codexCliExecutor.collectUsage({
    duration_ms: 12,
    usage: { input_tokens: 10, output_tokens: null, tool_calls: -1 }
  }), {
    input_tokens: 10,
    output_tokens: null,
    tool_calls: null,
    duration_ms: 12
  });
});

test("executor cancel terminates a detached process group", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  const result = codexCliExecutor.cancel({ processGroupId: child.pid });
  assert.equal(result.cancelled, true);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(processAlive(child.pid), false);
});

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
