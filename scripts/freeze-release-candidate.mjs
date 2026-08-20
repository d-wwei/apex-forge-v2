import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { freezeReleaseCandidate } from "../src/release/candidate-bundle.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (process.env.APEX_RELEASE_VERIFY === "1" && !process.env.APEX_EXPECT_CANDIDATE_DIGEST) {
  throw new Error("release verification requires APEX_EXPECT_CANDIDATE_DIGEST");
}
const result = freezeReleaseCandidate({
  repoRoot,
  expectedDigest: process.env.APEX_EXPECT_CANDIDATE_DIGEST || null
});
console.log(JSON.stringify({
  status: "PASS",
  release_candidate_digest: result.manifest.release_candidate_digest,
  candidate_path: result.candidateRoot,
  content: result.manifest.content,
  provenance: result.manifest.provenance
}, null, 2));
