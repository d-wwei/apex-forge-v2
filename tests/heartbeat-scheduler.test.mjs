import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  heartbeatJobId,
  installHeartbeatScheduler,
  renderLaunchdPlist
} from "../src/core/heartbeat-scheduler.mjs";
import { writeJson } from "../src/lib/common.mjs";

test("launchd heartbeat installer persists a secret-free scheduled runner", () => {
  const project = mkdtempSync(join(tmpdir(), "apex-heartbeat-project-"));
  const home = mkdtempSync(join(tmpdir(), "apex-heartbeat-home-"));
  writeJson(join(project, ".apex-v2", "project.json"), {
    schema_version: "v0",
    project_id: "scheduler",
    project_name: "Scheduler",
    created_at: "2026-08-13T00:00:00.000Z",
    updated_at: "2026-08-13T00:00:00.000Z",
    active_milestone: null,
    knowledge_version: 0,
    last_event_id: null,
    active_runs: [],
    wip_limits: { active_runs: 1, parallel_workers: 1 }
  });
  const calls = [];
  const result = installHeartbeatScheduler(project, {
    homeDir: home,
    intervalMinutes: 30,
    envFile: "/secure/provider.env",
    activate: true,
    launcher: (command, args) => {
      calls.push([command, args]);
      return { status: 0, stdout: "", stderr: "" };
    }
  });
  assert.equal(result.label, heartbeatJobId(project));
  assert.equal(result.interval_minutes, 30);
  assert.equal(result.activated, true);
  assert.ok(existsSync(result.runner_path));
  assert.ok(existsSync(result.installed_plist_path));
  const runner = readFileSync(result.runner_path, "utf8");
  assert.match(runner, /source '\/secure\/provider\.env'/);
  assert.match(runner, /project heartbeat --project/);
  assert.equal(/API_KEY=|TOKEN=|SECRET=/.test(runner), false);
  assert.deepEqual(calls.map((item) => item[1][0]), ["bootout", "bootstrap", "kickstart"]);
});

test("launchd plist includes stable label, interval, and log paths", () => {
  const plist = renderLaunchdPlist({
    label: "com.example.heartbeat",
    runnerPath: "/tmp/run.zsh",
    projectDir: "/tmp/project",
    intervalSeconds: 3600,
    stdoutPath: "/tmp/stdout.log",
    stderrPath: "/tmp/stderr.log"
  });
  assert.match(plist, /com\.example\.heartbeat/);
  assert.match(plist, /<integer>3600<\/integer>/);
  assert.match(plist, /\/tmp\/stdout\.log/);
  assert.match(plist, /\/tmp\/stderr\.log/);
});
