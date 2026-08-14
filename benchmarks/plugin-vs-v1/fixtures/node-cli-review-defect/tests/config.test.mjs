import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfig } from "../src/config.mjs";

test("readConfig reads a named config file", () => {
  const root = mkdtempSync(join(tmpdir(), "config-root-"));
  writeFileSync(join(root, "app.json"), "{\"ok\":true}");
  assert.equal(readConfig(root, "app.json"), "{\"ok\":true}");
});
