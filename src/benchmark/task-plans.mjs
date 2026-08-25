import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync
} from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { inspectPreparedSource } from "./prepared-source.mjs";

const PLACEHOLDER_COMMAND = /^\s*(?:true|:|exit\s+0|echo(?:\s|$))/i;
const STATIC_ONLY_COMMAND = /^\s*!?\s*(?:rg|grep|find|ls|cat|test)\b/;
const INJECTION_SCENARIOS = new Set(["bug-fix", "review-defect"]);

export function validateBenchmarkTaskPlans({
  matrix,
  schema,
  taskDir,
  workspaceRoot
}) {
  const errors = [];
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const expectedRepositories = matrix.repositories.map((item) => item.id);
  const expectedScenarios = matrix.scenarios.map((item) => item.id);
  const files = existsSync(taskDir)
    ? readdirSync(taskDir).filter((file) => file.endsWith(".json")).sort()
    : [];
  const plans = [];

  for (const file of files) {
    const planPath = join(taskDir, file);
    let plan;
    try {
      plan = JSON.parse(readFileSync(planPath, "utf8"));
    } catch (error) {
      errors.push(issue("invalid_json", file, error.message));
      continue;
    }
    if (!validate(plan)) {
      errors.push(issue("schema", file, validate.errors));
      continue;
    }
    plans.push({ file, plan, planPath });
  }

  const planByRepository = new Map();
  for (const entry of plans) {
    const { file, plan } = entry;
    if (basename(file, ".json") !== plan.repository_id) {
      errors.push(issue(
        "file_identity_mismatch",
        file,
        `filename=${basename(file, ".json")} repository_id=${plan.repository_id}`
      ));
    }
    if (planByRepository.has(plan.repository_id)) {
      errors.push(issue("duplicate_repository_plan", file, plan.repository_id));
    } else {
      planByRepository.set(plan.repository_id, entry);
    }
  }

  for (const repositoryId of expectedRepositories) {
    if (!planByRepository.has(repositoryId)) {
      errors.push(issue("missing_repository_plan", repositoryId, repositoryId));
    }
  }
  for (const repositoryId of planByRepository.keys()) {
    if (!expectedRepositories.includes(repositoryId)) {
      errors.push(issue("extra_repository_plan", repositoryId, repositoryId));
    }
  }

  const tasks = [];
  for (const repository of matrix.repositories) {
    const entry = planByRepository.get(repository.id);
    if (!entry) continue;
    const { file, plan, planPath } = entry;
    const scenarioCounts = new Map();
    const workspace = resolve(workspaceRoot, repository.id);
    const preparedSource = validatePreparedSource({
      repository,
      workspace,
      file,
      errors
    });

    for (const [index, task] of plan.tasks.entries()) {
      const location = `${file}#tasks[${index}]`;
      scenarioCounts.set(task.scenario, (scenarioCounts.get(task.scenario) || 0) + 1);
      validateTask({
        task,
        location,
        workspace,
        errors
      });
      const taskId = `${repository.id}--${task.scenario}`;
      tasks.push({
        task_id: taskId,
        repository: repository.id,
        scenario: task.scenario,
        title: task.title,
        instructions: task.instructions,
        affected_files: task.affected_files,
        acceptance_commands: task.acceptance_commands,
        setup_operations: task.setup_operations,
        hidden_checks: task.hidden_checks,
        source_tree: repository.source_tree,
        source_manifest_sha256: preparedSource?.source_manifest_sha256 || "",
        task_digest: digest({
          repository_id: repository.id,
          source_commit: repository.source_commit,
          source_tree: repository.source_tree,
          source_manifest_sha256: preparedSource?.source_manifest_sha256 || "",
          task
        }),
        task_plan_path: relative(resolve(taskDir, "..", "..", ".."), planPath)
          .split(sep)
          .join("/")
      });
    }

    for (const scenario of expectedScenarios) {
      const count = scenarioCounts.get(scenario) || 0;
      if (count !== 1) {
        errors.push(issue(
          "scenario_cardinality",
          file,
          `${scenario} expected=1 actual=${count}`
        ));
      }
    }
    for (const scenario of scenarioCounts.keys()) {
      if (!expectedScenarios.includes(scenario)) {
        errors.push(issue("extra_scenario", file, scenario));
      }
    }
  }

  return {
    status: errors.length === 0 ? "PASS" : "FAIL",
    repository_count: planByRepository.size,
    task_count: tasks.length,
    tasks,
    task_set_digest: digest(tasks.map((task) => ({
      task_id: task.task_id,
      task_digest: task.task_digest
    }))),
    errors
  };
}

function validatePreparedSource({ repository, workspace, file, errors }) {
  if (!existsSync(workspace)) {
    errors.push(issue("workspace_missing", file, workspace));
    return null;
  }
  const sourcePath = join(workspace, ".benchmark-source.json");
  if (!existsSync(sourcePath)) {
    errors.push(issue("source_manifest_missing", file, sourcePath));
    return null;
  }
  let source;
  try {
    source = JSON.parse(readFileSync(sourcePath, "utf8"));
  } catch (error) {
    errors.push(issue("source_manifest_invalid", file, error.message));
    return null;
  }
  for (const field of ["id", "source_commit", "source_tree"]) {
    if (source[field] !== repository[field]) {
      errors.push(issue(
        "source_manifest_mismatch",
        file,
        `${field} expected=${repository[field]} actual=${source[field]}`
      ));
    }
  }
  let observed;
  try {
    observed = inspectPreparedSource({ repository, workspace });
  } catch (error) {
    errors.push(issue("source_provenance_error", file, error.message));
    return null;
  }
  for (const error of observed.errors) {
    errors.push(issue(error.kind, file, error.detail));
  }
  for (const field of ["source_manifest_sha256", "source_file_count"]) {
    if (source[field] !== observed[field]) {
      errors.push(issue(
        "source_manifest_mismatch",
        file,
        `${field} expected=${observed[field]} actual=${source[field]}`
      ));
    }
  }
  return observed;
}

function validateTask({ task, location, workspace, errors }) {
  const commandSet = [
    ...task.acceptance_commands,
    ...task.hidden_checks.map((check) => check.command)
  ];
  if (commandSet.some((command) => PLACEHOLDER_COMMAND.test(command))) {
    errors.push(issue("placeholder_command", location, commandSet));
  }
  if (!task.hidden_checks.some((check) => !STATIC_ONLY_COMMAND.test(check.command))) {
    errors.push(issue(
      "hidden_checks_static_only",
      location,
      "at least one hidden check must execute behavior"
    ));
  }
  if (INJECTION_SCENARIOS.has(task.scenario) && task.setup_operations.length === 0) {
    errors.push(issue(
      "missing_setup_injection",
      location,
      `${task.scenario} requires a setup mutation`
    ));
  }

  for (const affectedPath of task.affected_files) {
    const target = safeTarget(workspace, affectedPath);
    if (!target) {
      errors.push(issue("unsafe_affected_path", location, affectedPath));
      continue;
    }
    if (!existsSync(target) || !lstatSync(target).isFile()) {
      errors.push(issue("affected_file_missing", location, affectedPath));
      continue;
    }
    if (!isInside(realpathSync(workspace), realpathSync(target))) {
      errors.push(issue("affected_file_escape", location, affectedPath));
    }
  }

  for (const [operationIndex, operation] of task.setup_operations.entries()) {
    const operationLocation = `${location}.setup_operations[${operationIndex}]`;
    if (!task.affected_files.includes(operation.path)) {
      errors.push(issue(
        "setup_outside_affected_files",
        operationLocation,
        operation.path
      ));
    }
    const target = safeTarget(workspace, operation.path);
    if (!target) {
      errors.push(issue("unsafe_setup_path", operationLocation, operation.path));
      continue;
    }
    if (operation.op === "write_text") {
      if (existsSync(target)) {
        errors.push(issue("write_target_exists", operationLocation, operation.path));
      }
      if (operation.content.length === 0) {
        errors.push(issue("empty_write_injection", operationLocation, operation.path));
      }
      continue;
    }
    if (!existsSync(target) || !lstatSync(target).isFile()) {
      errors.push(issue("replace_target_missing", operationLocation, operation.path));
      continue;
    }
    if (operation.old_text === operation.new_text) {
      errors.push(issue("no_op_injection", operationLocation, operation.path));
      continue;
    }
    const content = readFileSync(target, "utf8");
    const occurrences = countOccurrences(content, operation.old_text);
    if (occurrences !== 1) {
      errors.push(issue(
        "replace_source_cardinality",
        operationLocation,
        `expected=1 actual=${occurrences}`
      ));
    }
  }
}

function safeTarget(root, path) {
  if (typeof path !== "string" || path.length === 0 || path.includes("\0")) return null;
  if (path.startsWith("/") || path.split(/[\\/]/).includes("..")) return null;
  const target = resolve(root, path);
  return isInside(root, target) ? target : null;
}

function isInside(root, target) {
  const normalizedRoot = `${resolve(root)}${sep}`;
  const normalizedTarget = resolve(target);
  return normalizedTarget === resolve(root) || normalizedTarget.startsWith(normalizedRoot);
}

function countOccurrences(content, needle) {
  if (needle.length === 0) return 0;
  return content.split(needle).length - 1;
}

function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(sortValue(value)))
    .digest("hex");
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortValue(value[key])])
  );
}

function issue(kind, location, detail) {
  return { kind, location, detail };
}
