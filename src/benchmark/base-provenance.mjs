import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stableHash } from "../core/candidate.mjs";

const SOURCE_FIELDS = [
  "id",
  "source_commit",
  "source_tree",
  "source_manifest_sha256",
  "source_file_count"
];

export function computeBenchmarkBaseIdentity({ baseRoot, repositories }) {
  const selected = [...repositories]
    .map((repository) => typeof repository === "string"
      ? { id: repository }
      : repository)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((repository) => {
      const root = join(baseRoot, repository.id);
      const source = readRequiredJson(
        join(root, ".benchmark-source.json"),
        `${repository.id} source manifest`
      );
      const dependencies = readRequiredJson(
        join(root, ".benchmark-dependencies.json"),
        `${repository.id} dependency manifest`
      );
      return {
        id: repository.id,
        source: Object.fromEntries(
          SOURCE_FIELDS.map((field) => [field, source[field] ?? null])
        ),
        dependencies: {
          install_command: dependencies.install_command || null,
          dependency_hash: dependencies.dependency_hash || null,
          evidence: dependencies.evidence || [],
          prepare: {
            command: dependencies.prepare?.command || null,
            artifacts: dependencies.prepare?.artifacts || []
          },
          package_manager_versions: dependencies.package_manager_versions || {}
        }
      };
    });
  return {
    schema_version: "v1",
    repositories: selected,
    fingerprint: stableHash(selected)
  };
}

function readRequiredJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} missing: ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} invalid: ${error.message}`);
  }
}
