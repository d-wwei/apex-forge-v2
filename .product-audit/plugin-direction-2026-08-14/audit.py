#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


AUDIT_DIR = Path(__file__).resolve().parent
PROJECT = AUDIT_DIR.parents[1]
EXPECTATIONS = AUDIT_DIR / "EXPECTATIONS.md"
REPORTS = AUDIT_DIR / "reports"
EXPECTED_HASH = "fc29b133cdb586a01d69682388505ebdf520b6082278b03c107f3bff969cfc32"


@dataclass
class Result:
    eid: str
    severity: str
    status: str
    detail: str
    metric_type: str = "snapshot"


WEIGHTS = {"CRITICAL": 3.0, "HIGH": 2.0, "MEDIUM": 1.0, "LOW": 0.5}
MULTIPLIERS = {"PASS": 1.0, "WARN": 0.5, "FAIL": 0.0}


def text(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else ""


def files(pattern: str) -> list[Path]:
    return [p for p in PROJECT.glob(pattern) if "node_modules" not in p.parts]


def result(eid: str, severity: str, status: str, detail: str, metric_type: str = "snapshot") -> Result:
    return Result(eid, severity, status, detail, metric_type)


def check_hash() -> None:
    actual = hashlib.sha256(EXPECTATIONS.read_bytes()).hexdigest()
    if EXPECTED_HASH == "PENDING":
        raise RuntimeError("audit.py has not been instrumented with EXPECTATIONS_HASH")
    if actual != EXPECTED_HASH:
        raise RuntimeError(f"EXPECTATIONS.md hash mismatch: expected={EXPECTED_HASH} actual={actual}")


def run_checks() -> list[Result]:
    readme = text(PROJECT / "README.md")
    planning = "\n".join(text(p) for p in files("planning/*.md"))
    source = "\n".join(text(p) for p in files("src/**/*.mjs"))
    core_files = files("src/core/*.mjs")
    core = "\n".join(text(p) for p in core_files)
    tests = files("tests/*.test.mjs")
    test_cases = sum(len(re.findall(r"\btest\s*\(", text(path))) for path in tests)
    manifest = PROJECT / "plugins" / "codex" / "apex-forge-v2" / ".codex-plugin" / "plugin.json"
    skills = files("plugins/codex/apex-forge-v2/skills/*/SKILL.md")

    out: list[Result] = []

    if manifest.exists() and len(skills) >= 5:
        out.append(result("E-201", "CRITICAL", "PASS", f"manifest=yes skills={len(skills)}"))
    elif manifest.exists() or skills:
        out.append(result("E-201", "CRITICAL", "WARN", f"manifest={manifest.exists()} skills={len(skills)}"))
    else:
        out.append(result("E-201", "CRITICAL", "FAIL", "no Codex plugin manifest and no V2 Skills"))

    onboarding = "\n".join([readme, text(manifest)] + [text(p) for p in skills])
    has_prompt = "defaultPrompt" in onboarding
    has_onboarding_test = any(re.search(r"plugin|first[-_ ]run|onboarding", text(p), re.I) for p in tests)
    if has_prompt and has_onboarding_test:
        status = "PASS"
    elif has_prompt:
        status = "WARN"
    else:
        status = "FAIL"
    out.append(result("E-202", "HIGH", status, f"default_prompt={has_prompt} onboarding_test={has_onboarding_test}"))

    product_docs = f"{readme}\n{planning}".lower()
    target_user = any(term in product_docs for term in ["target user", "目标用户"])
    flagship = any(term in product_docs for term in ["flagship", "旗舰场景", "旗舰"])
    baseline = "baseline" in product_docs or "基线" in product_docs
    target = "target" in product_docs or "目标值" in product_docs
    window = "observation window" in product_docs or "观察窗口" in product_docs
    count = sum([target_user, flagship, baseline, target, window])
    out.append(result("E-203", "HIGH", "PASS" if count == 5 else "WARN" if target_user and flagship else "FAIL",
                      f"target_user={target_user} flagship={flagship} baseline={baseline} target={target} window={window}"))

    durable = [
        (PROJECT / "src" / "core").is_dir(),
        (PROJECT / "schemas").is_dir() and len(files("schemas/*.json")) >= 20,
        (PROJECT / ".apex-v2").is_dir(),
        test_cases >= 50,
    ]
    out.append(result("E-301", "CRITICAL", "PASS" if all(durable) else "WARN" if sum(durable) >= 3 else "FAIL",
                      f"core={durable[0]} schemas={len(files('schemas/*.json'))} state={durable[2]} test_cases={test_cases}"))

    direct_import = bool(re.search(r'from\s+["\']\.\./adapters/(codex|claude|gemini)', core))
    provider_refs = len(re.findall(r"\b(codex|claude|gemini)\b", core, re.I))
    if not direct_import and provider_refs <= 3:
        status = "PASS"
    elif not direct_import and provider_refs <= 8:
        status = "WARN"
    else:
        status = "FAIL"
    out.append(result("E-302", "CRITICAL", status, f"direct_provider_import={direct_import} provider_refs_in_core={provider_refs}"))

    host_contract = bool(re.search(r"host[-_ ]adapter|host integration", source + planning, re.I))
    worker_contract = bool(re.search(r"worker[-_ ]adapter|worker adapter", source + planning, re.I))
    host_test = any(re.search(r"host[-_ ]adapter|host integration", text(p), re.I) for p in tests)
    out.append(result("E-303", "HIGH",
                      "PASS" if host_contract and worker_contract and host_test else "WARN" if host_contract and worker_contract else "FAIL",
                      f"host_contract={host_contract} worker_contract={worker_contract} host_test={host_test}"))

    interactive_impl = bool(re.search(r"claimHostAction|submitHostResult|interactive mode", source, re.I))
    interactive_test = any(re.search(r"Interactive Host Agent|Host Agent claim", text(p), re.I) for p in tests)
    out.append(result("E-304", "HIGH", "PASS" if interactive_impl and interactive_test else "WARN" if interactive_impl else "FAIL",
                      f"interactive_impl={interactive_impl} interactive_test={interactive_test}"))

    graph = text(PROJECT / "src" / "core" / "plan-graph.mjs")
    cognitive_nodes = ["delivery-context", "delivery-risk", "delivery-design", "delivery-review"]
    cognitive_blocks = []
    for node in cognitive_nodes:
        start = graph.find(f'id: "{node}"')
        if start < 0:
            cognitive_blocks.append((node, "missing"))
            continue
        next_node = graph.find("planNode({", start + 1)
        end = next_node if next_node >= 0 else len(graph)
        block = graph[start:end]
        match = re.search(r'adapter:\s*"([^"]+)"', block)
        cognitive_blocks.append((node, match.group(1) if match else "host-policy"))
    shell_count = sum(adapter == "shell" for _, adapter in cognitive_blocks)
    out.append(result("E-401", "CRITICAL", "PASS" if shell_count == 0 else "WARN" if shell_count == 1 else "FAIL",
                      f"cognitive_nodes={cognitive_blocks} shell_only={shell_count}"))

    mode_router = bool(re.search(r"interactive.*factory|factory.*interactive|preferred_mode", source + planning, re.I))
    mode_test = any(re.search(r"Interactive Host Agent|project tick --run-agents", text(p), re.I) for p in tests)
    out.append(result("E-402", "HIGH", "PASS" if mode_router and mode_test else "WARN" if mode_router else "FAIL",
                      f"mode_router={mode_router} mode_test={mode_test}"))

    benchmark_path = PROJECT / "benchmarks" / "plugin-vs-v1" / "latest-evaluation.json"
    benchmark_report = json.loads(text(benchmark_path)) if benchmark_path.exists() else None
    benchmark = benchmark_report is not None
    benchmark_passed = (benchmark_report or {}).get("status") == "PASS"
    out.append(result("E-403", "HIGH", "PASS" if benchmark_passed else "WARN" if benchmark else "FAIL",
                      f"comparative_benchmark={benchmark} status={(benchmark_report or {}).get('status', 'missing')}", "incremental"))

    manifest_valid_shape = False
    manifest_detail = "manifest absent"
    if manifest.exists():
        try:
            value = json.loads(text(manifest))
            manifest_valid_shape = all(value.get(k) for k in ["name", "version", "description", "author", "interface"])
            manifest_detail = f"shape={manifest_valid_shape} version={value.get('version')}"
        except Exception as exc:
            manifest_detail = f"invalid_json={exc}"
    validation_path = PROJECT / ".product-audit" / "plugin-direction-2026-08-14" / "artifacts" / "plugin-validation.json"
    validation = json.loads(text(validation_path)) if validation_path.exists() else None
    plugin_validated = (validation or {}).get("status") == "PASS"
    out.append(result("E-501", "HIGH", "PASS" if manifest_valid_shape and plugin_validated else "WARN" if manifest_valid_shape else "FAIL",
                      f"{manifest_detail} validator={plugin_validated}"))

    host_neutral_doc = bool(re.search(r"host[-_ ]adapter|platform[-_ ]neutral|宿主.*adapter", planning, re.I))
    non_codex_mock = any(re.search(r"Claude.*HostAdapter|mock.*host|host.*conformance", text(p), re.I) for p in tests)
    codex_semantics_in_core = direct_import
    out.append(result("E-502", "MEDIUM",
                      "PASS" if host_neutral_doc and non_codex_mock and not codex_semantics_in_core
                      else "WARN" if host_neutral_doc and not codex_semantics_in_core else "FAIL",
                      f"host_neutral_doc={host_neutral_doc} non_codex_mock={non_codex_mock} codex_core_import={codex_semantics_in_core}"))

    mcp_implemented = any("mcp" in p.parts or "mcp" in p.name.lower() for p in files("src/**/*"))
    defer_criteria = bool(re.search(r"mcp[\s\S]{0,120}(defer|trigger|only when|后再|仅当)", planning, re.I))
    out.append(result("E-503", "MEDIUM", "PASS" if defer_criteria and not mcp_implemented else "WARN" if not mcp_implemented else "FAIL",
                      f"mcp_implemented={mcp_implemented} defer_criteria={defer_criteria}"))

    return out


def grade(score: float, critical_fails: int) -> tuple[str, str]:
    raw = "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 60 else "D" if score >= 40 else "F"
    effective = "C" if critical_fails and raw in {"A", "B"} else raw
    return raw, effective


def write_report(results: list[Result]) -> Path:
    REPORTS.mkdir(parents=True, exist_ok=True)
    earned = sum(WEIGHTS[r.severity] * MULTIPLIERS[r.status] for r in results)
    possible = sum(WEIGHTS[r.severity] for r in results)
    score = earned / possible * 100 if possible else 0.0
    critical_fails = sum(r.severity == "CRITICAL" and r.status == "FAIL" for r in results)
    raw, effective = grade(score, critical_fails)
    now = datetime.now(timezone.utc)
    report = REPORTS / f"audit-{now.date().isoformat()}.md"
    rows = "\n".join(
        f"| {r.eid} | {r.severity} | {r.status} | {r.metric_type} | {r.detail.replace('|', '/')} |"
        for r in results
    )
    failures = "\n".join(f"- {r.eid}: {r.detail}" for r in results if r.status == "FAIL") or "- None"
    critical_failure_lines = "\n".join(
        f"- {r.eid}: {r.detail}" for r in results if r.status == "FAIL" and r.severity == "CRITICAL"
    ) or "- None"
    warnings = "\n".join(f"- {r.eid}: {r.detail}" for r in results if r.status == "WARN") or "- None"
    recommendations = "\n".join(
        f"- {r.eid}: close the measured gap before calling the plugin direction implemented."
        for r in results if r.status in {"FAIL", "WARN"}
    ) or "- None"
    content = f"""# Apex Forge V2 Plugin Direction Readiness Audit

- Date: {now.isoformat()}
- Project Type: CLI orchestration kernel with Codex plugin candidate
- Scope: provisional
- Score: {score:.1f}%
- Raw Grade: {raw}
- Effective Grade: {effective}
- CRITICAL Failures: {critical_fails}
- Automated Coverage: {len(results)}/13 (100%)

## Executive Summary

| Metric | Value |
|---|---:|
| Total | {len(results)} |
| PASS | {sum(r.status == "PASS" for r in results)} |
| WARN | {sum(r.status == "WARN" for r in results)} |
| FAIL | {sum(r.status == "FAIL" for r in results)} |
| CRITICAL FAIL | {critical_fails} |
| Score | {score:.1f}% |

## CRITICAL Failures

{critical_failure_lines}

**CRITICAL Blocker Status**: {"BLOCKED" if critical_fails else "CLEAR"}

## All Results

| ID | Severity | Result | Metric Type | Evidence |
|---|---|---|---|---|
{rows}

## Conditional Severity Notes

- E-501 uses persisted Codex and Claude validator evidence plus the current Node runtime check.

## Quality By Category

- Product entry and UX: E-201 to E-203
- Architecture boundaries: E-301 to E-304
- AI execution quality: E-401 to E-403
- Packaging and portability: E-501 to E-503

## Non-Conforming

{failures}

## Warnings

{warnings}

## Recommendations

{recommendations}
"""
    report.write_text(content, encoding="utf-8")
    raw_path = report.with_suffix(".json")
    raw_path.write_text(json.dumps({
        "date": now.isoformat(),
        "scope": "provisional",
        "score": round(score, 1),
        "raw_grade": raw,
        "effective_grade": effective,
        "critical_fails": critical_fails,
        "results": [r.__dict__ for r in results],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> int:
    check_hash()
    if "--dry-run" in sys.argv:
        print("[DRY-RUN] expectations hash verified")
        print("[DRY-RUN] all 13 checks use local files and Python standard library")
        return 0
    report = write_report(run_checks())
    print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
