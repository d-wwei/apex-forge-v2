import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
  writeFileSync(daemon, `
process.on("SIGTERM", () => process.exit(0));
setInterval(() => {}, 1000);
`);
  const started = startHeartbeatDaemon(project, {
    intervalMinutes: 1,
    daemonPath: daemon
  });
  assert.equal(started.already_running, false);
  assert.equal(heartbeatDaemonStatus(project).running, true);
  assert.equal(startHeartbeatDaemon(project, { daemonPath: daemon }).already_running, true);
  assert.equal(stopHeartbeatDaemon(project).stopped, true);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(heartbeatDaemonStatus(project).running, false);
});
