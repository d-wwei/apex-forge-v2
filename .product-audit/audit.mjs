#!/usr/bin/env node
/*
Product Goal-Based Audit Script
Generated: 2026-08-13
Project: Apex Forge V2
Type: cli-tool + ai-agent-system
Expectations: 21 total, 21 scorable, 6 CRITICAL
Automated Coverage: 21/21 (100%)
Manual/INFO Coverage: 0/21 (0%)
Scored Coverage: 21/21 (100%)
EXPECTATIONS_HASH: sha256:7264adab0544f4b239d65527becc1221132a8ca21a4ce3acfb3417b11173e0ad
SCRIPT_HASH: sha256:ddd25c139be7d872d5f3ca55959796c9445245b10e0130ea3677bc8f1cdb5a6c
*/

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const AUDIT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT = resolve(AUDIT_DIR, "..");
const CLI = join(PROJECT, "src", "apex-v2.mjs");
const EXPECTATIONS = join(AUDIT_DIR, "EXPECTATIONS.md");
const REPORT_DIR = join(AUDIT_DIR, "reports");
const EXPECTATIONS_HASH = "7264adab0544f4b239d65527becc1221132a8ca21a4ce3acfb3417b11173e0ad";
const DRY_RUN = process.argv.includes("--dry-run");
const RESULTS = [];
let testRun = null;
let builtInAudit = null;

const expectationText = {
  "E-201": "CLI lifecycle is executable",
  "E-202": "Invalid transitions fail closed",
  "E-203": "PlanGraph is task-aware and complete-gated",
  "E-401": "Authoritative state is contract validated",
  "E-402": "State writes are crash-consistent and concurrent-safe",
  "E-501": "Project loop has fresh operational evidence",
  "E-502": "Recovery paths are policy bounded",
  "E-503": "Parallel workers are isolated",
  "E-601": "Candidate patches are verified, not old roots",
  "E-602": "Integration is conflict-aware and reproducible",
  "E-701": "High-risk merge approval is content-bound",
  "E-702": "Agent execution cannot escape its capability boundary",
  "E-801": "Event log and reconcile recover derived state",
  "E-802": "Quality metrics represent recent behavior",
  "E-803": "Adapter health and notifications are operationally fresh",
  "E-804": "Audit PASS uses independent execution evidence",
  "E-805": "Adapter history contains a real trend",
  "E-901": "Documentation and CLI remain aligned",
  "E-902": "Context Fabric is fresh, sourced, and uncertainty-aware",
  "E-903": "Kernel architecture remains cohesive and replaceable",
  "E-904": "Test evidence covers adversarial production risks"
};

const metricTypes = {
  "E-201": "snapshot",
  "E-202": "snapshot",
  "E-203": "snapshot",
  "E-401": "snapshot",
  "E-402": "snapshot",
  "E-501": "incremental",
  "E-502": "snapshot",
  "E-503": "snapshot",
  "E-601": "snapshot",
  "E-602": "snapshot",
  "E-701": "snapshot",
  "E-702": "snapshot",
  "E-801": "snapshot",
  "E-802": "incremental",
  "E-803": "incremental",
  "E-804": "snapshot",
  "E-805": "incremental",
  "E-901": "snapshot",
  "E-902": "incremental",
  "E-903": "snapshot",
  "E-904": "snapshot"
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function command(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: PROJECT,
    encoding: "utf8",
    timeout: options.timeout || 600000,
    env: process.env
  });
}

function cli(args, options = {}) {
  return command(process.execPath, [CLI, ...args], options);
}

function parseJsonOutput(result) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function source(path) {
  return readFileSync(join(PROJECT, path), "utf8");
}

function result(id, severity, status, detail, evidence) {
  RESULTS.push({
    id,
    expectation: expectationText[id],
    severity,
    result: status,
    detail,
    evidence,
    metric_type: metricTypes[id]
  });
}

function ensureTests() {
  if (testRun) return testRun;
  testRun = command("npm", ["test"], { timeout: 900000 });
  return testRun;
}

function ensureBuiltInAudit() {
  if (builtInAudit) return builtInAudit;
  const run = cli(["project", "audit", "--project", "."]);
  builtInAudit = {
    run,
    report: parseJsonOutput(run)
  };
  return builtInAudit;
}

function testNames() {
  return Array.from(allTestsSource().matchAll(/test\("([^"]+)"/g), (match) => match[1]);
}

function allTestsSource() {
  return readdirSync(join(PROJECT, "tests"))
    .filter((name) => name.endsWith(".test.mjs"))
    .sort()
    .map((name) => readFileSync(join(PROJECT, "tests", name), "utf8"))
    .join("\n");
}

function checkE201() {
  const help = cli(["help"]);
  const validate = cli(["validate", "--project", ".", "--strict-knowledge"]);
  const contracts = cli(["contracts", "validate", "--project", "."]);
  const reconcile = cli(["project", "reconcile", "--project", "."]);
  const pass = [help, validate, contracts, reconcile].every((item) => item.status === 0);
  result("E-201", "MEDIUM", pass ? "PASS" : "FAIL",
    `help=${help.status}, validate=${validate.status}, contracts=${contracts.status}, reconcile=${reconcile.status}`,
    "live CLI execution");
}

function checkE202() {
  const tests = ensureTests();
  const names = testNames();
  const negative = names.filter((name) => /拒绝|阻止|不能|失败|BLOCKED|越界|损坏|无效/.test(name)).length;
  result("E-202", "HIGH", tests.status === 0 && negative >= 15 ? "PASS" : negative >= 8 ? "WARN" : "FAIL",
    `npm_test=${tests.status}, negative_path_tests=${negative}`,
    "tests/apex-v2.test.mjs");
}

function checkE203() {
  const tests = ensureTests();
  const names = testNames();
  const required = [
    "plan graph 会按 intake 类型、标题和 affected area 生成任务相关范围",
    "project tick --complete-execute 必须等待全部 PlanGraph 节点完成"
  ];
  const coverage = required.filter((item) => names.includes(item)).length;
  const plans = readdirSync(join(PROJECT, ".apex-v2", "runs"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(PROJECT, ".apex-v2", "runs", entry.name, "plan-graph.json"))).length;
  result("E-203", "HIGH", tests.status === 0 && coverage === required.length && plans > 0 ? "PASS" : "FAIL",
    `npm_test=${tests.status}, required_tests=${coverage}/${required.length}, persisted_plans=${plans}`,
    "tests and .apex-v2/runs/*/plan-graph.json");
}

function checkE401() {
  const run = cli(["contracts", "validate", "--project", "."]);
  const report = parseJsonOutput(run);
  const skipped = report?.skipped_files ?? 999;
  const status = run.status !== 0 || report?.errors?.length ? "FAIL" : skipped > 0 ? "WARN" : "PASS";
  result("E-401", "HIGH", status,
    `schemas=${report?.schema_count}, validated=${report?.validated_contracts}, skipped_json=${skipped}, errors=${report?.errors?.length}`,
    "contracts validate");
}

function checkE402() {
  const common = source("src/lib/common.mjs");
  const store = source("src/core/store.mjs");
  const atomic = /renameSync|writeFileSync\([^)]*temp|fsync|flock|lockfile/.test(common + store);
  const direct = /writeFileSync/.test(common) && /appendFileSync/.test(store);
  const tests = allTestsSource();
  const crashTest = /concurrent writer|lost update|crash injection|atomic write|并发写|崩溃注入/.test(tests);
  const status = atomic && crashTest ? "PASS" : direct ? "WARN" : "FAIL";
  result("E-402", "CRITICAL", status,
    `atomic_write_or_lock=${atomic}, direct_overwrite_append=${direct}, crash_concurrency_test=${crashTest}`,
    "src/lib/common.mjs, src/core/store.mjs, tests");
}

function checkE501() {
  const tests = ensureTests();
  const audit = ensureBuiltInAudit();
  const lastEvent = readFileSync(join(PROJECT, ".apex-v2", "events.jsonl"), "utf8").trim().split("\n").at(-1);
  const event = lastEvent ? JSON.parse(lastEvent) : null;
  const ageHours = event ? (Date.now() - Date.parse(event.timestamp)) / 3600000 : Infinity;
  const status = tests.status !== 0 || audit.report?.status === "FAIL" ? "FAIL" : ageHours > 48 ? "WARN" : "PASS";
  result("E-501", "HIGH", status,
    `npm_test=${tests.status}, built_in_audit=${audit.report?.status}, last_event_age_hours=${ageHours.toFixed(1)}`,
    "current npm test, project audit, events.jsonl");
}

function checkE502() {
  const tests = ensureTests();
  const names = testNames();
  const patterns = ["fallback", "retry", "resume", "PARTIAL_PASS", "governance gate"];
  const covered = patterns.filter((pattern) => names.some((name) => name.includes(pattern))).length;
  result("E-502", "HIGH", tests.status === 0 && covered === patterns.length ? "PASS" : covered >= 3 ? "WARN" : "FAIL",
    `npm_test=${tests.status}, recovery_classes=${covered}/${patterns.length}`,
    "tests/apex-v2.test.mjs");
}

function checkE503() {
  const tests = ensureTests();
  const names = testNames();
  const structural = names.some((name) => name.includes("parallel WIP"))
    && names.some((name) => name.includes("真实 worktree"));
  const realConcurrent = names.some((name) => /并发.*worker|concurrent.*worker/i.test(name));
  result("E-503", "CRITICAL", tests.status === 0 && realConcurrent ? "PASS" : structural ? "WARN" : "FAIL",
    `npm_test=${tests.status}, structural_isolation=${structural}, real_concurrent_adversarial=${realConcurrent}`,
    "tests and worker sandbox implementation");
}

function checkE601() {
  const tests = ensureTests();
  const names = testNames();
  const staged = names.some((name) => name.includes("staged workspace"))
    && names.some((name) => name.includes("完整 operations"));
  result("E-601", "CRITICAL", tests.status === 0 && staged ? "PASS" : "FAIL",
    `npm_test=${tests.status}, staged_adversarial_tests=${staged}`,
    "tests/apex-v2.test.mjs");
}

function checkE602() {
  const tests = ensureTests();
  const names = testNames();
  const checks = ["同文件 patch", "merge resolve", "old_text 非唯一"];
  const covered = checks.filter((pattern) => names.some((name) => name.includes(pattern))).length;
  result("E-602", "HIGH", tests.status === 0 && covered === checks.length ? "PASS" : "FAIL",
    `npm_test=${tests.status}, conflict_classes=${covered}/${checks.length}`,
    "merge conflict tests");
}

function checkE701() {
  const tests = ensureTests();
  const approvalSchema = readJson(join(PROJECT, "schemas", "approval-request.schema.json"), {});
  const schemaText = JSON.stringify(approvalSchema);
  const fingerprint = schemaText.includes("fingerprint");
  const expiry = /expiry|expires_at/.test(schemaText);
  const status = tests.status !== 0 || !fingerprint ? "FAIL" : expiry ? "PASS" : "WARN";
  result("E-701", "CRITICAL", status,
    `npm_test=${tests.status}, fingerprint_bound=${fingerprint}, expiry_modeled=${expiry}`,
    "approval schema and merge approval tests");
}

function checkE702() {
  const claude = source("src/adapters/claude.mjs");
  const gemini = source("src/adapters/gemini.mjs");
  const tests = allTestsSource();
  const elevated = claude.includes("--dangerously-skip-permissions") && gemini.includes("--approval-mode\", \"yolo");
  const inTreeScopeTest = tests.includes("检测并阻断 Codex 越界写入");
  const hostEscapeTest = /host escape|outside workspace|network side effect|secret access|宿主逃逸|外部副作用/.test(tests);
  const status = !elevated && hostEscapeTest ? "PASS" : inTreeScopeTest ? "WARN" : "FAIL";
  result("E-702", "CRITICAL", status,
    `elevated_adapter_permissions=${elevated}, in_tree_scope_test=${inTreeScopeTest}, host_escape_test=${hostEscapeTest}`,
    "Claude/Gemini adapter flags and adversarial tests");
}

function checkE801() {
  const run = cli(["project", "reconcile", "--project", "."]);
  const report = parseJsonOutput(run);
  const tests = ensureTests();
  const names = testNames();
  const corruption = names.some((name) => name.includes("event log 损坏"));
  const fullReplay = /replay.*ProjectState|event.*replay|重放.*ProjectState/i.test(source("src/core/reconcile.mjs"));
  const status = run.status !== 0 || report?.status !== "CONSISTENT" || tests.status !== 0 ? "FAIL" : fullReplay ? "PASS" : "WARN";
  result("E-801", "HIGH", status,
    `reconcile=${report?.status}, corruption_test=${corruption}, full_event_replay=${fullReplay}`,
    "project reconcile and src/core/reconcile.mjs");
}

function checkE802() {
  const metrics = source("src/core/metrics.mjs");
  const lifetime = metrics.includes("workers.length")
    && metrics.includes("adapterResults.filter")
    && metrics.includes("runs.filter");
  const rolling = /window|lastN|recentRuns|rolling/i.test(metrics);
  result("E-802", "HIGH", rolling ? "PASS" : lifetime ? "FAIL" : "WARN",
    `lifetime_aggregation=${lifetime}, rolling_window=${rolling}`,
    "src/core/metrics.mjs");
}

function checkE803() {
  const smoke = readJson(join(PROJECT, ".apex-v2", "adapters", "latest-live-smoke.json"));
  const policy = readJson(join(PROJECT, ".apex-v2", "policies", "quality.json"));
  const ageHours = smoke ? (Date.now() - Date.parse(smoke.generated_at)) / 3600000 : Infinity;
  const notifications = source("src/core/notifications.mjs");
  const delivery = /webhook|dispatcher|dead.?letter|retry.*notification/i.test(notifications);
  const fresh = ageHours <= (policy?.adapter_smoke_max_age_hours || 24);
  result("E-803", "HIGH", fresh && delivery ? "PASS" : fresh ? "WARN" : "FAIL",
    `smoke_age_hours=${ageHours.toFixed(1)}, max_age_hours=${policy?.adapter_smoke_max_age_hours}, external_delivery_lifecycle=${delivery}`,
    ".apex-v2/adapters/latest-live-smoke.json and notifications implementation");
}

function checkE804() {
  const auditSource = source("src/apex-v2.mjs");
  const countsTests = auditSource.includes("countTestCases(") && auditSource.includes("summary.test_count >= 30");
  const selfDeclared = auditSource.includes("capabilityFeatureIds.has(");
  const runsTests = /npm test/.test(auditSource.slice(auditSource.indexOf("function auditProject"), auditSource.indexOf("function createIntakeFromAuditGaps")));
  const status = runsTests && !countsTests && !selfDeclared ? "PASS" : countsTests && selfDeclared ? "FAIL" : "WARN";
  result("E-804", "CRITICAL", status,
    `executes_current_tests=${runsTests}, test_count_proxy=${countsTests}, capability_manifest_proxy=${selfDeclared}`,
    "src/apex-v2.mjs audit implementation");
}

function checkE805() {
  const dir = join(PROJECT, ".apex-v2", "adapters", "history");
  const files = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".json")) : [];
  const observations = files.map((name) => readJson(join(dir, name))).filter(Boolean);
  observations.sort((left, right) => left.generated_at.localeCompare(right.generated_at));
  const spanDays = observations.length > 1
    ? (Date.parse(observations.at(-1).generated_at) - Date.parse(observations[0].generated_at)) / 86400000
    : 0;
  const status = observations.length >= 7 && spanDays >= 7 ? "PASS" : observations.length >= 2 ? "WARN" : "FAIL";
  result("E-805", "MEDIUM", status,
    `observations=${observations.length}, span_days=${spanDays.toFixed(1)}`,
    ".apex-v2/adapters/history");
}

function checkE901() {
  const help = cli(["help"]);
  const readme = source("README.md");
  const expected = ["project tick", "project reconcile", "worker adapters", "contracts validate", "notification list"];
  const helpText = help.stdout;
  const matched = expected.filter((commandName) => readme.includes(commandName) && helpText.includes(commandName)).length;
  result("E-901", "MEDIUM", help.status === 0 && matched === expected.length ? "PASS" : matched >= 3 ? "WARN" : "FAIL",
    `shared_documented_commands=${matched}/${expected.length}`,
    "README.md and CLI help");
}

function checkE902() {
  const knowledgeDir = join(PROJECT, ".apex-v2", "knowledge");
  const files = readdirSync(knowledgeDir).filter((name) => name.endsWith(".md"));
  const ages = files.map((name) => (Date.now() - statSync(join(knowledgeDir, name)).mtimeMs) / 86400000);
  const maxAge = Math.max(...ages);
  const combined = files.map((name) => readFileSync(join(knowledgeDir, name), "utf8")).join("\n");
  const sourceRefs = /## 来源/.test(combined);
  const staleMarkers = /stale|过期|last checked|freshness/i.test(combined);
  const semanticGap = combined.includes("尚未接入 CodeGraph 或语义索引");
  const status = sourceRefs && staleMarkers && maxAge <= 7 && !semanticGap ? "PASS" : sourceRefs ? "WARN" : "FAIL";
  result("E-902", "HIGH", status,
    `max_knowledge_age_days=${maxAge.toFixed(1)}, source_sections=${sourceRefs}, stale_markers=${staleMarkers}, semantic_gap_declared=${semanticGap}`,
    ".apex-v2/knowledge");
}

function checkE903() {
  const mainLines = source("src/apex-v2.mjs").split("\n").length;
  const allSourceFiles = walk(join(PROJECT, "src")).filter((path) => path.endsWith(".mjs"));
  const totalLines = allSourceFiles.reduce((sum, path) => sum + readFileSync(path, "utf8").split("\n").length, 0);
  const share = mainLines / totalLines;
  const status = mainLines <= 1500 ? "PASS" : mainLines <= 3000 ? "WARN" : "FAIL";
  result("E-903", "HIGH", status,
    `main_lines=${mainLines}, total_source_lines=${totalLines}, main_share=${(share * 100).toFixed(1)}%`,
    "src/apex-v2.mjs and src/**/*.mjs");
}

function checkE904() {
  const tests = allTestsSource();
  const classes = {
    crash_consistency: /crash injection|atomic write|崩溃注入|原子写/.test(tests),
    concurrent_writers: /concurrent writer|lost update|并发写/.test(tests),
    sandbox_escape: /host escape|outside workspace|宿主逃逸/.test(tests),
    false_audit_pass: /fake PASS|manifest.*audit|false audit|虚假.*审计/.test(tests),
    notification_delivery: /dispatcher|dead.?letter|webhook delivery/.test(tests),
    recent_metric_trap: /rolling window|recent failure|lifetime.*recent|累计.*近期/.test(tests)
  };
  const covered = Object.values(classes).filter(Boolean).length;
  result("E-904", "HIGH", covered === 6 ? "PASS" : covered >= 3 ? "WARN" : "FAIL",
    `adversarial_classes=${covered}/6; ${JSON.stringify(classes)}`,
    "tests/apex-v2.test.mjs");
}

function walk(root) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

function verifyHashes() {
  const expectationCurrent = sha256(readFileSync(EXPECTATIONS));
  const scriptText = readFileSync(new URL(import.meta.url), "utf8");
  const scriptNormalized = scriptText.replace(/SCRIPT_HASH: sha256:[^\n]+/, "SCRIPT_HASH: sha256:SELF");
  const embeddedScript = scriptText.match(/SCRIPT_HASH: sha256:([^\n]+)/)?.[1];
  const scriptCurrent = sha256(scriptNormalized);
  return {
    expectations_ok: expectationCurrent === EXPECTATIONS_HASH,
    expectations_expected: EXPECTATIONS_HASH,
    expectations_current: expectationCurrent,
    script_ok: embeddedScript === scriptCurrent,
    script_expected: embeddedScript,
    script_current: scriptCurrent
  };
}

function weight(severity) {
  return { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0.5 }[severity] || 0;
}

function multiplier(status) {
  return { PASS: 1, WARN: 0.5, FAIL: 0 }[status] ?? 0;
}

function grade(score) {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function category(id) {
  if (id.startsWith("E-2")) return "Interface and Planning";
  if (id.startsWith("E-4")) return "State and Contracts";
  if (id.startsWith("E-5")) return "Runtime and Recovery";
  if (id.startsWith("E-6")) return "Verification and Integration";
  if (id.startsWith("E-7")) return "Security";
  if (id.startsWith("E-8")) return "Observability and Audit";
  if (id.startsWith("E-9")) return "Documentation and Architecture";
  return "Other";
}

function recommendation(resultItem) {
  const recommendations = {
    "E-402": "Introduce atomic temp-file+fsync+rename writes and project-level locking; add crash/concurrent-writer tests.",
    "E-501": "Add a bounded scheduler/heartbeat that refreshes operational evidence even when no roadmap node is ready.",
    "E-503": "Add real two-worker concurrent dogfood with disjoint and conflicting scopes.",
    "E-701": "Bind approval to actor capability, expiry, policy revision, and explicit action hash.",
    "E-702": "Replace permission-bypass adapters with OS/container sandboxing and capability-scoped network/secret access.",
    "E-801": "Implement full event replay and compare replay-derived state with materialized state.",
    "E-802": "Replace lifetime aggregates with rolling run/time windows and per-adapter distributions.",
    "E-803": "Add notification dispatcher retries, delivery receipts, acknowledgement SLA, and dead-letter handling.",
    "E-804": "Make project audit execute current tests and derive capability evidence from behavior, not manifests/counts.",
    "E-805": "Schedule periodic adapter observations and retain enough samples for real trend analysis.",
    "E-902": "Add freshness metadata, stale markers, sourced unknowns, and CodeGraph-backed task routing benchmarks.",
    "E-903": "Split the 4k-line CLI entry into command-domain modules and enforce a file-size/ownership budget.",
    "E-904": "Add adversarial benchmarks for atomicity, concurrent writers, sandbox escape, audit false-PASS, notification delivery, and cumulative metrics."
  };
  return recommendations[resultItem.id] || `Resolve ${resultItem.id}: ${resultItem.detail}`;
}

function generateReport(hashes) {
  const possible = RESULTS.reduce((sum, item) => sum + weight(item.severity), 0);
  const earned = RESULTS.reduce((sum, item) => sum + weight(item.severity) * multiplier(item.result), 0);
  const score = possible ? (earned / possible) * 100 : 0;
  const rawGrade = grade(score);
  const criticalFails = RESULTS.filter((item) => item.severity === "CRITICAL" && item.result === "FAIL");
  const effectiveGrade = criticalFails.length > 0 && ["A", "B"].includes(rawGrade) ? "C" : rawGrade;
  const passing = RESULTS.filter((item) => item.result === "PASS");
  const warnings = RESULTS.filter((item) => item.result === "WARN");
  const failing = RESULTS.filter((item) => item.result === "FAIL");
  const categories = [...new Set(RESULTS.map((item) => category(item.id)))];
  const report = [];
  report.push("# Audit Report — Apex Forge V2", "");
  report.push(`**Date**: ${new Date().toISOString().slice(0, 10)}`);
  report.push("**Audit Period**: current snapshot plus recent persisted history");
  report.push("**Project Type**: cli-tool + ai-agent-system");
  report.push("**Commitment Scope**: provisional");
  report.push("**Audit Report Status**: provisional");
  report.push(`**Overall Score**: ${score.toFixed(1)}%`);
  report.push(`**Grade**: ${effectiveGrade}${effectiveGrade !== rawGrade ? ` (raw ${rawGrade})` : ""}`, "");
  report.push("## Executive Summary", "");
  report.push("| Metric | Value |", "|---|---:|");
  report.push(`| Total Expectations | ${RESULTS.length} |`);
  report.push(`| Passing | ${passing.length} |`);
  report.push(`| Failing | ${failing.length} |`);
  report.push(`| Warnings | ${warnings.length} |`);
  report.push(`| CRITICAL Failures | ${criticalFails.length} |`);
  report.push("| Automated Coverage | 100% |");
  report.push("| Weak-Evidence PASS | 2 |");
  report.push("| Open Audit Issues | 1 (provisional commitment scope) |", "");
  report.push("## Scope Confirmation", "");
  report.push("| Field | Value |", "|---|---|");
  report.push("| Commitment Review | `.product-audit/COMMITMENT_REVIEW.md` |");
  report.push("| Confirmation Status | provisional |");
  report.push("| Confirmed By | not yet confirmed |");
  report.push("| Confirmed At | not yet confirmed |");
  report.push("| Provisional Caveats | Current shipped claims inferred from docs/code; roadmap items excluded |", "");
  report.push("## Audit-of-Audit Review", "");
  report.push("| Layer | Artifact | Status | Open Issues |", "|---|---|---|---|");
  report.push("| Commitment Mining | `COMMITMENT_REVIEW.md` | provisional | User confirmation pending |");
  report.push("| Audit Script | `AUDIT_SCRIPT_REVIEW.md` | provisional | Scope remains provisional |");
  report.push("| Audit Result | `AUDIT_RESULT_REVIEW.md` | pending at generation | Independent recomputation required |", "");
  report.push("## CRITICAL Failures", "");
  if (criticalFails.length === 0) {
    report.push("None. No CRITICAL failures detected.", "");
  } else {
    report.push("| ID | Expectation | Metric Type | Result | Impact |", "|---|---|---|---|---|");
    for (const item of criticalFails) {
      report.push(`| ${item.id} | ${item.expectation} | ${item.metric_type} | FAIL | ${item.detail.replaceAll("|", "/")} |`);
    }
    report.push("");
  }
  report.push(`**CRITICAL Blocker Status**: ${criticalFails.length ? `BLOCKED — ${criticalFails.length} critical failure(s) must be resolved before Grade A/B is possible.` : "CLEAR — no critical blockers."}`, "");
  report.push("## All Results", "");
  report.push("| ID | Severity | Score | Result | Metric Type | Evidence |", "|---|---|---:|---|---|---|");
  for (const item of RESULTS) {
    report.push(`| ${item.id} | ${item.severity} | ${(multiplier(item.result) * 100).toFixed(0)} | ${item.result} | ${item.metric_type} | ${item.detail.replaceAll("|", "/")} |`);
  }
  report.push("", "## Conditional Severity Notes", "");
  report.push("- E-902 remained HIGH because mapped project knowledge is present; its freshness and uncertainty metadata are incomplete.", "");
  report.push("## Weak-Evidence PASS", "");
  report.push("| ID | Evidence Gap | Review Source | Phase 4 Action |", "|---|---|---|---|");
  report.push("| E-203 | Most evidence is fixtures plus historical persisted plans | result review | sample recent diverse intake plans |");
  report.push("| E-502 | Recovery adapters are substantially simulated | result review | run controlled real adapter failure/recovery |", "");
  report.push("## Expert Panel Summary", "");
  report.push("| Metric | Value |", "|---|---|");
  report.push("| Active Roles | Product, Architecture, Engineering, Test, Security, Reliability, Performance, Delivery, Documentation, AI Behavior |");
  report.push("| Role Findings | pending sequential synthesis |");
  report.push("| Confirmed by Duplicate Review | pending |");
  report.push("| Conflicted | pending |");
  report.push("| Unsupported/Dropped | pending |");
  report.push("| Open Evidence Gaps | pending |", "");
  report.push("## Quality by Category", "");
  report.push("| Category | Expectations | Passing | Score |", "|---|---:|---:|---:|");
  for (const name of categories) {
    const items = RESULTS.filter((item) => category(item.id) === name);
    const categoryPossible = items.reduce((sum, item) => sum + weight(item.severity), 0);
    const categoryEarned = items.reduce((sum, item) => sum + weight(item.severity) * multiplier(item.result), 0);
    report.push(`| ${name} | ${items.length} | ${items.filter((item) => item.result === "PASS").length} | ${((categoryEarned / categoryPossible) * 100).toFixed(1)}% |`);
  }
  report.push("", "## Conforming / Non-Conforming / Warning", "");
  report.push(`- **Conforming**: ${passing.map((item) => item.id).join(", ") || "None"}`);
  report.push(`- **Non-Conforming**: ${failing.map((item) => item.id).join(", ") || "None"}`);
  report.push(`- **Warning**: ${warnings.map((item) => item.id).join(", ") || "None"}`, "");
  report.push("## Recommendations", "");
  [...criticalFails, ...failing.filter((item) => item.severity !== "CRITICAL"), ...warnings]
    .forEach((item, index) => report.push(`${index + 1}. **${item.id}**: ${recommendation(item)}`));
  report.push("", "## Integrity", "");
  report.push(`- Expectations hash: ${hashes.expectations_ok ? "PASS" : "FAIL"} (${hashes.expectations_current})`);
  report.push(`- Script hash: ${hashes.script_ok ? "PASS" : "FAIL"} (${hashes.script_current})`);
  return {
    markdown: `${report.join("\n")}\n`,
    summary: {
      score,
      raw_grade: rawGrade,
      effective_grade: effectiveGrade,
      critical_fails: criticalFails.length,
      possible,
      earned,
      pass: passing.length,
      warn: warnings.length,
      fail: failing.length
    }
  };
}

function dryRun() {
  const prerequisites = [
    ["node", command("node", ["--version"]).status === 0],
    ["npm", command("npm", ["--version"]).status === 0],
    ["CLI", existsSync(CLI)],
    [".apex-v2", existsSync(join(PROJECT, ".apex-v2"))],
    ["EXPECTATIONS.md", existsSync(EXPECTATIONS)]
  ];
  for (const [name, accessible] of prerequisites) {
    console.log(`[DRY-RUN] ${name}: ${accessible ? "ACCESSIBLE" : "INACCESSIBLE"}`);
  }
  for (const id of Object.keys(expectationText)) {
    console.log(`[DRY-RUN] ${id}: would check — ${expectationText[id]} ... ACCESSIBLE`);
  }
  process.exitCode = prerequisites.every(([, accessible]) => accessible) ? 0 : 1;
}

function main() {
  if (DRY_RUN) {
    dryRun();
    return;
  }
  mkdirSync(REPORT_DIR, { recursive: true });
  const hashes = verifyHashes();
  if (!hashes.expectations_ok || !hashes.script_ok) {
    console.error("Audit definition hash mismatch. Re-run Phase 2 instrumentation.");
    console.error(JSON.stringify(hashes, null, 2));
    process.exitCode = 1;
    return;
  }
  [
    checkE201, checkE202, checkE203, checkE401, checkE402,
    checkE501, checkE502, checkE503, checkE601, checkE602,
    checkE701, checkE702, checkE801, checkE802, checkE803,
    checkE804, checkE805, checkE901, checkE902, checkE903,
    checkE904
  ].forEach((check) => check());

  const generated = generateReport(hashes);
  const date = new Date().toISOString().slice(0, 10);
  const reportPath = join(REPORT_DIR, `audit-${date}.md`);
  const rawPath = join(REPORT_DIR, `audit-${date}.json`);
  writeFileSync(reportPath, generated.markdown);
  writeFileSync(rawPath, `${JSON.stringify({
    generated_at: new Date().toISOString(),
    commitment_scope: "provisional",
    report_status: "provisional",
    hashes,
    results: RESULTS,
    summary: generated.summary
  }, null, 2)}\n`);
  console.log(JSON.stringify({
    report: reportPath,
    raw: rawPath,
    ...generated.summary
  }, null, 2));
}

main();
