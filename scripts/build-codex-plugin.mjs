import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = join(repoRoot, "plugins", "codex", "apex-forge-v2");
const claudePluginRoot = join(repoRoot, "plugins", "claude-code", "apex-forge-v2");
const runtimeRoot = join(pluginRoot, "runtime");

rmSync(runtimeRoot, { recursive: true, force: true });
mkdirSync(runtimeRoot, { recursive: true });

await build({
  entryPoints: [join(repoRoot, "src", "apex-v2.mjs")],
  outfile: join(runtimeRoot, "apex-v2.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  legalComments: "none"
});

cpSync(join(repoRoot, "schemas"), join(runtimeRoot, "schemas"), { recursive: true });
writeFileSync(join(runtimeRoot, "runtime.json"), `${JSON.stringify({
  schema_version: "v0",
  generated_at: new Date().toISOString(),
  entrypoint: "apex-v2.mjs",
  schema_dir: "schemas"
}, null, 2)}\n`);

for (const directory of ["skills", "scripts", "runtime"]) {
  const target = join(claudePluginRoot, directory);
  rmSync(target, { recursive: true, force: true });
  cpSync(join(pluginRoot, directory), target, { recursive: true });
}

console.log(`Built Codex plugin runtime: ${runtimeRoot}`);
console.log(`Synchronized Claude Code plugin: ${claudePluginRoot}`);
