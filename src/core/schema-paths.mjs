import { join } from "node:path";

const DEFAULT_SCHEMA_DIR = new URL("../../schemas/", import.meta.url).pathname;

export function schemaDirectory() {
  return process.env.APEX_V2_SCHEMA_DIR || DEFAULT_SCHEMA_DIR;
}

export function schemaPath(name) {
  return join(schemaDirectory(), name);
}
