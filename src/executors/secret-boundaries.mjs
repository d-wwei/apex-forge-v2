import { homedir } from "node:os";
import { resolve } from "node:path";

export function providerSecretPaths() {
  const home = homedir();
  return [
    resolve(home, ".codex"),
    resolve(home, ".claude"),
    resolve(home, ".gemini")
  ];
}
