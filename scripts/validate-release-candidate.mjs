import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyReleaseCandidateBundle } from "../src/release/candidate-bundle.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const latestPath = join(repoRoot, ".apex-v2", "releases", "latest-candidate.json");
if (!existsSync(latestPath)) {
  throw new Error("latest release candidate missing");
}
const latest = JSON.parse(readFileSync(latestPath, "utf8"));
const candidateRoot = resolve(repoRoot, latest.candidate_path);
const result = verifyReleaseCandidateBundle({
  repoRoot,
  candidateRoot,
  checkCurrentSource: !process.argv.includes("--bundle-only")
});
console.log(JSON.stringify({
  ...result,
  candidate_path: candidateRoot,
  manifest: undefined
}, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
