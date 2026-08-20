import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export function benchmarkEnvironment(environment = process.env) {
  const paths = [
    dirname(process.execPath),
    join(homedir(), ".bun", "bin"),
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    ...String(environment.PATH || "").split(":")
  ].filter((path) => path && existsSync(path));
  return {
    ...environment,
    PATH: [...new Set(paths)].join(":"),
    CI: "1"
  };
}
