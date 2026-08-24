import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const CLI = new URL("../src/apex-v2.mjs", import.meta.url).pathname;

function run(args, expectStatus = 0) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8"
  });
  assert.equal(result.status, expectStatus, result.stderr || result.stdout);
  return result;
}

test("capability CLI lists, shows, routes, and verifies the bundled registry", () => {
  const list = JSON.parse(run(["capability", "list"]).stdout);
  assert.equal(list.length, 21);
  assert.equal(list[0].capability_id, "engineering-spec");

  const shown = JSON.parse(run([
    "capability", "show", "--id", "systematic-debugging"
  ]).stdout);
  assert.equal(shown.output_contract, "root-cause-evidence");
  assert.match(shown.protocol, /Find and prove the root cause/);

  const routed = JSON.parse(run([
    "capability", "route",
    "--type", "bug",
    "--risk", "high",
    "--title", "Fix authorization race",
    "--description", "Auth token refresh races.",
    "--area", "src/auth.mjs,tests/auth.test.mjs"
  ]).stdout);
  assert.ok(routed.required.some((item) =>
    item.capability_id === "systematic-debugging"
  ));
  assert.ok(routed.required.some((item) =>
    item.capability_id === "security-audit"
  ));

  const verified = JSON.parse(run(["capability", "verify"]).stdout);
  assert.equal(verified.status, "PASS");
  assert.equal(verified.capability_count, 21);
  assert.equal(verified.enforcement_mode, "shadow");
});

test("capability CLI rejects unknown IDs", () => {
  const result = run(["capability", "show", "--id", "missing"], 1);
  assert.match(result.stderr, /找不到 Capability/);
});
