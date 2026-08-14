import { readFileSync } from "node:fs";
import { join } from "node:path";

export function readConfig(root, name) {
  return readFileSync(join(root, name), "utf8");
}
