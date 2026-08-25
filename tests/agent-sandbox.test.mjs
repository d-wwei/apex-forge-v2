import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  sanitizeEnvironment,
  spawnCapabilityProcess
} from "../src/core/capability-sandbox.mjs";
import { terminateGuardTokenProcesses } from "../src/core/process-guard.mjs";
import { buildClaudeArgs } from "../src/adapters/claude.mjs";
import { buildCodexArgs } from "../src/adapters/codex.mjs";
import {
  extractCodexStructuredOutput,
  resolveCodexExecutable
} from "../src/executors/codex-cli.mjs";
import { buildGeminiArgs } from "../src/adapters/gemini.mjs";

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("agent OS sandbox blocks host escape outside workspace", { skip: process.platform !== "darwin" }, () => {
  const workspace = tempDir("apex-agent-workspace-");
  const outside = tempDir("apex-agent-outside-");
  const script = join(workspace, "probe.mjs");
  const inside = join(workspace, "inside.txt");
  const escaped = join(outside, "escaped.txt");
  writeFileSync(script, `
import { writeFileSync } from "node:fs";
const [inside, escaped] = process.argv.slice(2);
const result = { inside: false, escaped: false, secret: process.env.TEST_SECRET || null };
try { writeFileSync(inside, "inside"); result.inside = true; } catch {}
try { writeFileSync(escaped, "escaped"); result.escaped = true; } catch {}
console.log(JSON.stringify(result));
`);
  const execution = spawnCapabilityProcess(process.execPath, [script, inside, escaped], {
    workspaceDir: workspace,
    adapter: "test",
    network: false,
    env: { ...process.env, TEST_SECRET: "must-not-leak" }
  });
  assert.equal(execution.status, 0, execution.stderr);
  assert.deepEqual(JSON.parse(execution.stdout), {
    inside: true,
    escaped: false,
    secret: null
  });
  assert.equal(readFileSync(inside, "utf8"), "inside");
  assert.equal(existsSync(escaped), false);
});

test("agent OS sandbox denies explicitly protected benchmark inputs", {
  skip: process.platform !== "darwin"
}, () => {
  const workspace = tempDir("apex-agent-hidden-workspace-");
  const hidden = tempDir("apex-agent-hidden-controller-");
  const hiddenFile = join(hidden, "task-private.json");
  const script = join(workspace, "probe-read.mjs");
  writeFileSync(hiddenFile, "{\"hidden\":true}\n");
  writeFileSync(script, `
import { readFileSync } from "node:fs";
let readable = false;
try {
  readFileSync(process.argv[2], "utf8");
  readable = true;
} catch {}
console.log(JSON.stringify({ readable }));
`);
  const execution = spawnCapabilityProcess(process.execPath, [script, hiddenFile], {
    workspaceDir: workspace,
    network: false,
    deniedReadPaths: [hidden]
  });
  assert.equal(execution.status, 0, execution.stderr);
  assert.deepEqual(JSON.parse(execution.stdout), { readable: false });
});

test("agent environment strips unapproved secrets", () => {
  const env = sanitizeEnvironment({
    PATH: "/bin",
    TEST_TOKEN: "secret",
    OPENAI_API_KEY: "allowed",
    APEX_PARALLEL_GUARD_TOKEN: "internal",
    NORMAL_VALUE: "visible"
  }, ["OPENAI_API_KEY"]);
  assert.deepEqual(env, {
    PATH: "/bin",
    OPENAI_API_KEY: "allowed",
    APEX_PARALLEL_GUARD_TOKEN: "internal",
    NORMAL_VALUE: "visible"
  });
});

test("agent capability timeout kills the entire process tree", { skip: process.platform !== "darwin" }, async () => {
  const workspace = tempDir("apex-agent-timeout-");
  const script = join(workspace, "tree.mjs");
  const pidPath = join(workspace, "child.pid");
  writeFileSync(script, `
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
  stdio: "ignore"
});
writeFileSync(process.argv[2], String(child.pid));
setInterval(() => {}, 1000);
`);
  const startedAt = Date.now();
  const execution = spawnCapabilityProcess(process.execPath, [script, pidPath], {
    workspaceDir: workspace,
    adapter: "test",
    network: false,
    timeoutMs: 2000
  });
  assert.equal(execution.timed_out, true);
  assert.ok(Date.now() - startedAt < 30000);
  if (existsSync(pidPath)) {
    const childPid = Number(readFileSync(pidPath, "utf8"));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.throws(() => process.kill(childPid, 0), /ESRCH/);
  } else {
    assert.equal(execution.termination_reason, "timeout");
  }
});

test("capability sandbox reaps a detached workspace daemon after successful parent exit", {
  skip: process.platform !== "darwin"
}, async () => {
  const workspace = tempDir("apex-agent-detached-");
  const launcher = join(workspace, "launcher.mjs");
  const pidPath = join(workspace, "daemon.pid");
  writeFileSync(launcher, `
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
  detached: true,
  stdio: "ignore"
});
child.unref();
writeFileSync(process.argv[2], String(child.pid));
console.log("launcher-done");
`);

  let daemonPid = null;
  try {
    const execution = spawnCapabilityProcess(process.execPath, [
      launcher,
      pidPath
    ], {
      workspaceDir: workspace,
      adapter: "test",
      network: false,
      timeoutMs: 5000
    });
    assert.equal(execution.status, 1);
    assert.equal(execution.termination_reason, "orphan-process");
    assert.match(execution.stderr, /orphan workspace processes reaped/i);
    assert.deepEqual(execution.process_cleanup.surviving_pids, []);
    daemonPid = Number(readFileSync(pidPath, "utf8"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.throws(() => process.kill(daemonPid, 0), /ESRCH/);
  } finally {
    if (daemonPid) {
      try {
        process.kill(-daemonPid, "SIGKILL");
      } catch {}
      try {
        process.kill(daemonPid, "SIGKILL");
      } catch {}
    }
  }
});

test("capability sandbox fails closed when disk headroom drops below policy", {
  skip: process.platform !== "darwin"
}, () => {
  const workspace = tempDir("apex-agent-disk-guard-");
  const script = join(workspace, "wait.mjs");
  writeFileSync(script, "setInterval(() => {}, 1000);\n");
  const execution = spawnCapabilityProcess(process.execPath, [script], {
    workspaceDir: workspace,
    adapter: "test",
    network: false,
    timeoutMs: 5000,
    minFreeBytes: Number.MAX_SAFE_INTEGER
  });
  assert.equal(execution.status, 1);
  assert.equal(execution.termination_reason, "disk-pressure");
  assert.match(execution.stderr, /disk headroom/i);
  assert.ok(execution.duration_ms < 5000);
});

test("capability sandbox fails closed when one run grows its workspace excessively", {
  skip: process.platform !== "darwin"
}, () => {
  const workspace = tempDir("apex-agent-disk-growth-");
  const script = join(workspace, "grow.mjs");
  writeFileSync(script, `
import { writeFileSync } from "node:fs";
writeFileSync("growth.bin", Buffer.alloc(8 * 1024 * 1024, 0x61));
setInterval(() => {}, 1000);
`);
  const execution = spawnCapabilityProcess(process.execPath, [script], {
    workspaceDir: workspace,
    adapter: "test",
    network: false,
    timeoutMs: 10000,
    maxWorkspaceGrowthBytes: 1024 * 1024,
    workspaceCheckIntervalMs: 100
  });
  assert.equal(execution.status, 1);
  assert.equal(execution.termination_reason, "workspace-growth");
  assert.match(execution.stderr, /workspace growth exceeded/i);
  assert.ok(execution.duration_ms < 10000);
});

test("capability sandbox tolerates files removed during workspace measurement", {
  skip: process.platform !== "darwin"
}, () => {
  const workspace = tempDir("apex-agent-workspace-churn-");
  const script = join(workspace, "churn.mjs");
  writeFileSync(script, `
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
for (let index = 0; index < 200; index += 1) {
  const directory = \`transient-\${index}\`;
  mkdirSync(directory);
  writeFileSync(\`\${directory}/value.txt\`, "value");
  rmSync(directory, { recursive: true, force: true });
}
console.log("churn-complete");
`);
  const execution = spawnCapabilityProcess(process.execPath, [script], {
    workspaceDir: workspace,
    adapter: "test",
    network: false,
    timeoutMs: 10000,
    maxWorkspaceGrowthBytes: 16 * 1024 * 1024,
    workspaceCheckIntervalMs: 1
  });
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout.trim(), "churn-complete");
  assert.equal(execution.termination_reason, null);
});

test("capability sandbox fails closed when process output exceeds policy", {
  skip: process.platform !== "darwin"
}, () => {
  const workspace = tempDir("apex-agent-output-limit-");
  const script = join(workspace, "output.mjs");
  writeFileSync(script, `
process.stdout.write(Buffer.alloc(2 * 1024 * 1024, 0x61));
setInterval(() => {}, 1000);
`);
  const execution = spawnCapabilityProcess(process.execPath, [script], {
    workspaceDir: workspace,
    adapter: "test",
    network: false,
    timeoutMs: 10000,
    maxOutputBytes: 1024
  });
  assert.equal(execution.status, 1);
  assert.equal(execution.termination_reason, "output-limit");
  assert.match(execution.stderr, /output exceeded policy/i);
  assert.ok(execution.duration_ms < 10000);
});

test("parallel guard token reaps a process that escaped its parent group", async () => {
  const guardToken = `parallel-test-${Date.now()}`;
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      APEX_PARALLEL_GUARD_TOKEN: guardToken
    }
  });
  child.unref();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const cleanup = terminateGuardTokenProcesses(guardToken);
  assert.ok(cleanup.terminated_pids.includes(child.pid));
  assert.deepEqual(cleanup.surviving_pids, []);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.throws(() => process.kill(child.pid, 0), /ESRCH/);
});

test("capability sandbox can launch a nested capability process with denied TMPDIR", {
  skip: process.platform !== "darwin"
}, () => {
  const workspace = tempDir("apex-agent-nested-");
  const deniedTmp = mkdtempSync(join(homedir(), ".apex-denied-tmp-"));
  const script = join(workspace, "nested.mjs");
  const modulePath = new URL("../src/core/capability-sandbox.mjs", import.meta.url).pathname;
  writeFileSync(script, `
import { spawnCapabilityProcess } from ${JSON.stringify(modulePath)};
const nested = spawnCapabilityProcess(process.execPath, ["-e", "console.log('nested-ok')"], {
  workspaceDir: process.cwd(),
  network: false,
  timeoutMs: 5000,
  env: process.env
});
console.log(JSON.stringify({
  status: nested.status,
  stdout: nested.stdout.trim(),
  stderr: nested.stderr,
  sandboxType: nested.sandbox.type
}));
`);
  try {
    const outer = spawnCapabilityProcess(process.execPath, [script], {
      workspaceDir: workspace,
      network: false,
      timeoutMs: 10000,
      env: {
        ...process.env,
        TMPDIR: deniedTmp
      }
    });
    assert.equal(outer.status, 0, outer.stderr);
    assert.deepEqual(JSON.parse(outer.stdout), {
      status: 0,
      stdout: "nested-ok",
      stderr: "",
      sandboxType: "inherited-macos-seatbelt"
    });
  } finally {
    rmSync(deniedTmp, { recursive: true, force: true });
  }
});

test("Claude and Gemini adapters avoid bypass and yolo permission modes", () => {
  const schema = join(tempDir("apex-agent-schema-"), "schema.json");
  writeFileSync(schema, "{}");
  const claude = buildClaudeArgs({
    outputSchemaPath: schema,
    prompt: "test"
  });
  const gemini = buildGeminiArgs({ prompt: "test" });
  assert.ok(claude.includes("acceptEdits"));
  assert.equal(claude.includes("bypassPermissions"), false);
  assert.equal(claude.includes("--dangerously-skip-permissions"), false);
  assert.ok(gemini.includes("auto_edit"));
  assert.equal(gemini.includes("yolo"), false);
});

test("Codex disables its nested sandbox only behind the outer capability sandbox", () => {
  const args = buildCodexArgs({
    workspaceDir: "/workspace",
    outputSchemaPath: "/workspace/schema.json",
    outputPath: "/workspace/result.json"
  });
  assert.ok(args.includes("--dangerously-bypass-approvals-and-sandbox"));
  assert.equal(args.includes("workspace-write"), false);
});

test("Codex executor skips wrapper binaries inside denied configuration roots", () => {
  const root = tempDir("apex-codex-resolution-");
  const hidden = join(root, "hidden");
  const safe = join(root, "safe");
  mkdirSync(hidden, { recursive: true });
  mkdirSync(safe, { recursive: true });
  const hiddenBinary = join(hidden, "codex");
  const safeBinary = join(safe, "codex");
  writeFileSync(hiddenBinary, "#!/bin/sh\nexit 0\n");
  writeFileSync(safeBinary, "#!/bin/sh\nexit 0\n");
  chmodSync(hiddenBinary, 0o755);
  chmodSync(safeBinary, 0o755);

  assert.equal(
    resolveCodexExecutable("codex", {
      ...process.env,
      PATH: `${hidden}:${safe}`
    }, [hidden]),
    safeBinary
  );
});

test("Codex executor avoids the user-local mode-switch wrapper", () => {
  const resolved = resolveCodexExecutable("codex");
  assert.ok(resolved.includes("/"));
  assert.equal(
    resolved.startsWith(join(homedir(), ".local", "bin")),
    false
  );
});

test("Codex executor rejects a mode-switch wrapper regardless of HOME", () => {
  const root = tempDir("apex-codex-wrapper-");
  const wrapperDir = join(root, "wrapper");
  const safeDir = join(root, "safe");
  mkdirSync(wrapperDir, { recursive: true });
  mkdirSync(safeDir, { recursive: true });
  const wrapper = join(wrapperDir, "codex");
  const safeBinary = join(safeDir, "codex");
  writeFileSync(
    wrapper,
    "#!/bin/sh\nCODEX_WRAPPER_PATH=\"$0\" exec \"$HOME/.codex/tools/codex_mode.py\" dispatch-codex -- \"$@\"\n"
  );
  writeFileSync(safeBinary, "#!/bin/sh\nexit 0\n");
  chmodSync(wrapper, 0o755);
  chmodSync(safeBinary, 0o755);

  assert.equal(
    resolveCodexExecutable("codex", {
      ...process.env,
      HOME: join(root, "isolated-home"),
      PATH: `${wrapperDir}:${safeDir}`
    }, []),
    safeBinary
  );
});

test("Codex executor recovers structured output from JSONL when -o is absent", () => {
  const output = [
    JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
    JSON.stringify({
      type: "item.completed",
      item: {
        type: "agent_message",
        text: JSON.stringify({
          verdict: "pass",
          summary: "recovered",
          tests: [],
          risks: [],
          evidence_refs: [],
          semantic_evidence: null,
          capability_evidence: []
        })
      }
    })
  ].join("\n");
  assert.equal(extractCodexStructuredOutput(output)?.summary, "recovered");
});

test("Codex executor recovers a direct structured stdout object", () => {
  const output = JSON.stringify({
    verdict: "pass",
    summary: "direct",
    tests: [],
    risks: [],
    evidence_refs: [],
    semantic_evidence: null,
    capability_evidence: []
  });
  assert.equal(extractCodexStructuredOutput(output)?.summary, "direct");
});
