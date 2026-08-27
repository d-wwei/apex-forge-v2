#!/usr/bin/env node

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packagedCandidate = resolve(scriptDir, "../runtime/apex-v2.mjs");
const sourceCandidate = resolve(scriptDir, "../../../../src/apex-v2.mjs");
const configured = process.env.APEX_FORGE_V2_CLI;
const cli = configured
  || (existsSync(packagedCandidate) ? packagedCandidate : null)
  || (existsSync(sourceCandidate) ? sourceCandidate : null);
const args = process.argv.slice(2).map((arg) =>
  arg === "--project-dir" ? "--project" : arg
);
const schemaDir = cli === packagedCandidate
  ? resolve(scriptDir, "../runtime/schemas")
  : resolve(dirname(cli || ""), "../schemas");
const capabilityDir = cli === packagedCandidate
  ? resolve(scriptDir, "../runtime/capabilities")
  : resolve(dirname(cli || ""), "../capabilities");

const result = cli
  ? spawnSync(process.execPath, [cli, ...args], {
    stdio: "inherit",
    env: {
      ...process.env,
      APEX_V2_SCHEMA_DIR: schemaDir,
      APEX_V2_CAPABILITY_DIR: capabilityDir
    }
  })
  : spawnSync("apex-v2", args, { stdio: "inherit" });

if (result.error) {
  console.error(`Apex Forge runtime unavailable: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
