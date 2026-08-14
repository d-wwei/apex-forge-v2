import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  sanitizeEnvironment,
  spawnCapabilityProcess
} from "../src/core/capability-sandbox.mjs";
import { buildClaudeArgs } from "../src/adapters/claude.mjs";
import { buildCodexArgs } from "../src/adapters/codex.mjs";
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

test("agent environment strips unapproved secrets", () => {
  const env = sanitizeEnvironment({
    PATH: "/bin",
    TEST_TOKEN: "secret",
    OPENAI_API_KEY: "allowed",
    NORMAL_VALUE: "visible"
  }, ["OPENAI_API_KEY"]);
  assert.deepEqual(env, {
    PATH: "/bin",
    OPENAI_API_KEY: "allowed",
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
    timeoutMs: 300
  });
  assert.equal(execution.timed_out, true);
  assert.ok(Date.now() - startedAt < 5000);
  const childPid = Number(readFileSync(pidPath, "utf8"));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.throws(() => process.kill(childPid, 0), /ESRCH/);
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
