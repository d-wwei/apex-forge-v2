import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfig } from "../src/config.mjs";

test("readConfig rejects paths outside the configured root", () => {
  const parent = mkdtempSync(join(tmpdir(), "config-parent-"));
  const root = join(parent, "root");
  const secret = join(parent, "secret.txt");
  await import("node:fs").then(({ mkdirSync }) => mkdirSync(root));
  writeFileSync(secret, "secret");
  assert.throws(() => readConfig(root, "../secret.txt"));
});
