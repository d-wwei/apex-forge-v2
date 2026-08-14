import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { ensureDir, now, readJson, shortId, writeJson, writeTextIfMissing } from "../lib/common.mjs";
import { appendEvent, projectRoot, requireStore, SCHEMA_VERSION, storeRoot, updateProject } from "../core/store.mjs";
import { defaultExecutionPolicy, defaultGatePolicy, defaultQualityPolicy, defaultRetryPolicy } from "../core/policy-defaults.mjs";
import { defaultNotificationPolicy, migrateNotificationState } from "../core/notifications.mjs";
import { migrateApprovalRecords } from "../core/governance.mjs";
import { scanProjectContracts } from "../core/contracts.mjs";
import { KNOWLEDGE_FILES } from "../core/knowledge-constants.mjs";

export function initProject(args) {
  const projectDir = projectRoot(args);
  const root = storeRoot(projectDir);
  const timestamp = now();
  const firstInit = !existsSync(join(root, "project.json"));
  const projectName = String(args.name || basename(projectDir) || "apex-v2-project");

  for (const dir of [
    root,
    join(root, "intake"),
    join(root, "roadmap"),
    join(root, "knowledge"),
    join(root, "risks"),
    join(root, "runs"),
    join(root, "artifacts"),
    join(root, "derived"),
    join(root, "policies"),
    join(root, "learning")
    ,join(root, "approvals"),
    join(root, "metrics"),
    join(root, "adapters"),
    join(root, "adapters", "history"),
    join(root, "notifications")
  ]) {
    ensureDir(dir);
  }

  if (firstInit) {
    writeJson(join(root, "project.json"), {
      schema_version: SCHEMA_VERSION,
      project_id: shortId("project"),
      project_name: projectName,
      created_at: timestamp,
      updated_at: timestamp,
      active_milestone: null,
      knowledge_version: 0,
      last_event_id: null,
      active_runs: [],
      wip_limits: {
        active_runs: 3,
        parallel_workers: 6
      }
    });

    writeJson(join(root, "intake", "items.json"), []);
    writeJson(join(root, "roadmap", "graph.json"), {
      schema_version: SCHEMA_VERSION,
      updated_at: timestamp,
      milestones: [],
      nodes: [],
      edges: [],
      wip_limits: {
        active_nodes: 5
      }
    });
    writeJson(join(root, "risks", "register.json"), []);
    writeJson(join(root, "policies", "gates.json"), defaultGatePolicy(timestamp));
    writeJson(join(root, "policies", "retry.json"), defaultRetryPolicy(timestamp));
    writeJson(join(root, "policies", "execution.json"), defaultExecutionPolicy(timestamp));
    writeJson(join(root, "policies", "quality.json"), defaultQualityPolicy(timestamp));
    writeJson(join(root, "policies", "notifications.json"), defaultNotificationPolicy(timestamp));
    writeJson(join(root, "approvals", "items.json"), []);
    writeJson(join(root, "learning", "proposals.json"), []);
    writeJson(join(root, "notifications", "outbox.json"), []);
  }
  if (!existsSync(join(root, "policies", "retry.json"))) {
    writeJson(join(root, "policies", "retry.json"), defaultRetryPolicy(timestamp));
  } else {
    const retryPolicy = readJson(join(root, "policies", "retry.json"));
    retryPolicy.max_attempts.claude = retryPolicy.max_attempts.claude || 3;
    retryPolicy.max_attempts.gemini = retryPolicy.max_attempts.gemini || 3;
    retryPolicy.max_attempts.host = retryPolicy.max_attempts.host || 1;
    retryPolicy.max_attempts["deepseek-runner"] = retryPolicy.max_attempts["deepseek-runner"] || 3;
    writeJson(join(root, "policies", "retry.json"), retryPolicy);
  }
  if (!existsSync(join(root, "policies", "execution.json"))) {
    writeJson(join(root, "policies", "execution.json"), defaultExecutionPolicy(timestamp));
  } else {
    const executionPolicy = readJson(join(root, "policies", "execution.json"));
    if (!executionPolicy.permissions.adapter_fallback_order) {
      executionPolicy.permissions.allowed_adapters = Array.from(new Set(["host", ...executionPolicy.permissions.allowed_adapters, "claude", "gemini", "deepseek-runner"]));
      executionPolicy.permissions.adapter_fallback_order = ["codex", "claude", "gemini"];
      executionPolicy.updated_at = timestamp;
    }
    if (!executionPolicy.permissions.adapter_fallback_failure_kinds) {
      executionPolicy.permissions.adapter_fallback_failure_kinds = ["timeout", "execution_error", "contract_error", "agent_reported_failure", "no_patch"];
      executionPolicy.updated_at = timestamp;
    }
    if (!executionPolicy.approval) {
      executionPolicy.approval = {
        ttl_minutes: 60,
        required_capabilities: {
          merge: "merge_apply",
          adapter_baseline: "adapter_baseline_update"
        }
      };
      executionPolicy.updated_at = timestamp;
    }
    writeJson(join(root, "policies", "execution.json"), executionPolicy);
  }
  if (!existsSync(join(root, "policies", "quality.json"))) {
    writeJson(join(root, "policies", "quality.json"), defaultQualityPolicy(timestamp));
  } else {
    const qualityPolicy = readJson(join(root, "policies", "quality.json"));
    if (qualityPolicy.block_new_runs_on_smoke_failure == null) {
      qualityPolicy.block_new_runs_on_smoke_failure = true;
      qualityPolicy.updated_at = timestamp;
    }
    if (qualityPolicy.adapter_smoke_max_age_hours == null) {
      qualityPolicy.adapter_smoke_max_age_hours = 24;
      qualityPolicy.updated_at = timestamp;
    }
    if (qualityPolicy.adapter_smoke_auto_refresh == null) {
      qualityPolicy.adapter_smoke_auto_refresh = true;
      qualityPolicy.updated_at = timestamp;
    }
    if (qualityPolicy.adapter_smoke_refresh_timeout_ms == null) {
      qualityPolicy.adapter_smoke_refresh_timeout_ms = 180000;
      qualityPolicy.updated_at = timestamp;
    }
    if (qualityPolicy.adapter_observation_interval_hours == null) {
      qualityPolicy.adapter_observation_interval_hours = 24;
      qualityPolicy.updated_at = timestamp;
    }
    if (qualityPolicy.rolling_window_days == null) {
      qualityPolicy.rolling_window_days = 7;
      qualityPolicy.updated_at = timestamp;
    }
    if (qualityPolicy.rolling_run_count == null) {
      qualityPolicy.rolling_run_count = 20;
      qualityPolicy.updated_at = timestamp;
    }
    writeJson(join(root, "policies", "quality.json"), qualityPolicy);
  }
  if (!existsSync(join(root, "approvals", "items.json"))) writeJson(join(root, "approvals", "items.json"), []);
  migrateApprovalRecords(root);
  if (!existsSync(join(root, "policies", "notifications.json"))) {
    writeJson(join(root, "policies", "notifications.json"), defaultNotificationPolicy(timestamp));
  }
  if (!existsSync(join(root, "notifications", "outbox.json"))) {
    writeJson(join(root, "notifications", "outbox.json"), []);
  }
  migrateNotificationState(root, timestamp);

  writeKnowledgeBase(root, timestamp);
  writeTextIfMissing(join(root, "derived", "README.md"), derivedReadme());
  writeTextIfMissing(join(root, "events.jsonl"), "");

  if (firstInit) {
    const event = appendEvent(root, "project.initialized", "apex-v2", {
      project_name: projectName
    });
    updateProject(root, { last_event_id: event.event_id, updated_at: event.timestamp });
  }

  console.log(`已初始化项目级工作区：${root}`);
}

function writeKnowledgeBase(root, timestamp) {
  const knowledgeDir = join(root, "knowledge");
  const manifestPath = join(knowledgeDir, "manifest.json");
  const existing = readJson(manifestPath, null);
  const staleAfter = new Date(Date.parse(timestamp) + 7 * 86400000).toISOString();
  const files = [];

  for (const [name, purpose] of KNOWLEDGE_FILES) {
    const filePath = join(knowledgeDir, name);
    writeTextIfMissing(filePath, knowledgeTemplate(name, purpose));
    files.push({
      path: `knowledge/${name}`,
      purpose,
      owner: "project-kernel",
      derived: false,
      generated_at: existing?.files?.find((item) => item.path === `knowledge/${name}`)?.generated_at || timestamp,
      stale_after: existing?.files?.find((item) => item.path === `knowledge/${name}`)?.stale_after || staleAfter,
      confidence: existing?.files?.find((item) => item.path === `knowledge/${name}`)?.confidence ?? 0.5,
      source_refs: existing?.files?.find((item) => item.path === `knowledge/${name}`)?.source_refs || existing?.source_refs || []
    });
  }

  writeJson(manifestPath, {
    schema_version: SCHEMA_VERSION,
    version: existing?.version ?? 0,
    updated_at: existing?.updated_at ?? timestamp,
    files,
    source_refs: existing?.source_refs || []
  });
}

function knowledgeTemplate(name, purpose) {
  return `# ${name.replace(".md", "")}

用途：${purpose}

## 已验证事实

- 暂无。

## 未验证线索

- 暂无。

## 来源

- 初始化占位，等待项目级 Context Fabric 更新。
`;
}

function derivedReadme() {
  return `# derived

本目录只存放可从 events、artifacts、intake、roadmap、runs 重建的派生视图。

规则：

- worker 不得直接写 derived view；
- coordinator 可以重建 derived view；
- derived view 不能作为唯一事实来源。
`;
}

export function status(args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const project = readJson(join(root, "project.json"));
  const intake = readJson(join(root, "intake", "items.json"), []);
  const roadmap = readJson(join(root, "roadmap", "graph.json"));
  const risks = readJson(join(root, "risks", "register.json"), []);
  const learning = readJson(join(root, "learning", "proposals.json"), []);

  console.log(JSON.stringify({
    project: project.project_name,
    project_id: project.project_id,
    active_milestone: project.active_milestone,
    knowledge_version: project.knowledge_version,
    intake: {
      total: intake.length,
      new: intake.filter((item) => item.triage.status === "new").length,
      accepted: intake.filter((item) => item.triage.status === "accepted").length
    },
    roadmap: {
      nodes: roadmap.nodes.length,
      active: roadmap.nodes.filter((node) => node.status === "active").length,
      ready: roadmap.nodes.filter((node) => node.status === "ready").length
    },
    risks: risks.length,
    active_runs: project.active_runs,
    learning_proposals: learning.length
  }, null, 2));
}

export function validateProject(args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  const errors = [];

  const requiredFiles = [
    "project.json",
    "events.jsonl",
    "intake/items.json",
    "roadmap/graph.json",
    "knowledge/manifest.json",
    "risks/register.json",
    "policies/gates.json",
    "policies/retry.json",
    "policies/execution.json",
    "policies/quality.json",
    "approvals/items.json",
    "learning/proposals.json"
  ];

  for (const file of requiredFiles) {
    const path = join(root, file);
    if (!existsSync(path)) {
      errors.push(`缺少文件：${file}`);
      continue;
    }
    if (file.endsWith(".json")) {
      try {
        readJson(path);
      } catch (error) {
        errors.push(`JSON 解析失败：${file}：${error.message}`);
      }
    }
  }

  for (const [name] of KNOWLEDGE_FILES) {
    if (!existsSync(join(root, "knowledge", name))) {
      errors.push(`缺少知识文件：knowledge/${name}`);
    }
  }

  const intake = readJson(join(root, "intake", "items.json"), []);
  const roadmap = readJson(join(root, "roadmap", "graph.json"), null);
  const project = readJson(join(root, "project.json"), null);

  if (!Array.isArray(intake)) errors.push("intake/items.json 必须是数组");
  if (!roadmap || !Array.isArray(roadmap.nodes) || !Array.isArray(roadmap.edges)) {
    errors.push("roadmap/graph.json 必须包含 nodes 和 edges 数组");
  }
  if (!project?.project_id) errors.push("project.json 缺少 project_id");
  if (args["strict-knowledge"]) {
    const manifest = readJson(join(root, "knowledge", "manifest.json"), null);
    const index = existsSync(join(root, "knowledge", "index.md"))
      ? readFileSync(join(root, "knowledge", "index.md"), "utf8")
      : "";
    if (!manifest || manifest.version < 1) {
      errors.push("strict-knowledge 要求 knowledge/manifest.json version >= 1");
    }
    if (index.includes("初始化占位") || index.includes("暂无")) {
      errors.push("strict-knowledge 要求 knowledge/index.md 已被真实项目知识刷新");
    }
  }
  const contractReport = scanProjectContracts(projectDir);
  if (contractReport.status !== "PASS") {
    for (const issue of contractReport.errors.slice(0, 10)) {
      const detail = issue.errors
        .map((item) => `${item.instance_path || "/"} ${item.message}`)
        .join("; ");
      errors.push(`contract 校验失败：${issue.path} -> ${issue.schema_name || "JSON"}：${detail}`);
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    throw new Error(`项目校验失败，共 ${errors.length} 个问题`);
  }

  console.log(`项目校验通过：${root}`);
}
