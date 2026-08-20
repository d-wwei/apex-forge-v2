import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  heartbeatDaemonStatus,
  startHeartbeatDaemon,
  stopHeartbeatDaemon
} from "../src/core/heartbeat-daemon-control.mjs";

test("heartbeat daemon control starts, reports, and stops a detached process", async () => {
  const project = mkdtempSync(join(tmpdir(), "apex-heartbeat-daemon-"));
  mkdirSync(join(project, ".apex-v2", "heartbeat", "logs"), { recursive: true });
  const daemon = join(project, "fake-daemon.mjs");
  const ready = join(project, ".apex-v2", "heartbeat", "daemon-ready");
  writeFileSync(daemon, `
import { writeFileSync } from "node:fs";
import { join } from "node:path";
process.on("SIGTERM", () => {});
writeFileSync(join(process.argv[2], ".apex-v2", "heartbeat", "daemon-ready"), "ready");
setInterval(() => {}, 1000);
`);
  const started = startHeartbeatDaemon(project, {
    intervalMinutes: 1,
    daemonPath: daemon
  });
  assert.equal(started.already_running, false);
  assert.equal(heartbeatDaemonStatus(project).running, true);
  assert.equal(startHeartbeatDaemon(project, { daemonPath: daemon }).already_running, true);
  const deadline = Date.now() + 5000;
  while (!existsSync(ready) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(existsSync(ready), true);
  const stopped = stopHeartbeatDaemon(project);
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.force_killed, true);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(heartbeatDaemonStatus(project).running, false);
});
