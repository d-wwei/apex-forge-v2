# Apex Forge V2 21 项内部原子能力吸收与有效性验证计划

- 日期：2026-08-21
- 状态：`PROPOSED_FOR_IMPLEMENTATION`
- 产品定位：Software Development Loop / Graph
- 分发目标：一个插件、一个公开 Skill、21 项内部原子能力、一键安装
- 核心约束：Apex Kernel 是唯一状态与治理权威
- 完成口径：21 项能力全部被吸收、可被正确路由、能产生 typed evidence，并通过有效性 benchmark

## 1. 目标

将当前分散在本机 Skills、旧版 Apex Forge、Better Test、Product Goal-Based
Audit、Design-to-Code Runner 等来源中的专业研发方法，提炼为 Apex Forge V2
仓库内可版本化、可打包、可测试的 21 项内部原子能力。

用户安装一个 Apex Forge Plugin 后，应具备完整的软件研发能力：

```text
需求澄清
  -> 技术设计
  -> 源码与版本核验
  -> 调试
  -> TDD / Negative Control
  -> 增量实现
  -> Code Review / Security Review
  -> 测试策略
  -> 前端 / Browser / Mobile / Performance / Migration
  -> Release / Deploy
  -> Audit / Postmortem / Simplification
```

## 2. 成功标准

只有同时满足以下条件，才能声明本计划完成：

1. 21 项能力均有仓库内 canonical source。
2. 不依赖 `~/.codex/skills`、绝对路径或 symlink 才能运行。
3. 每项能力均有版本、来源、许可证、输入 Contract 和输出 Contract。
4. 每项能力均可由 PlanGraph 自动路由。
5. 每项能力均通过至少一个正确触发、一个不应触发和一个失败路径测试。
6. 每项能力的输出均能进入 Artifact、Gate、Risk 或 Learning。
7. 缺少、损坏、版本漂移或输出无效时 fail closed。
8. Codex 与 Claude Code 插件安装后行为一致。
9. Agent 默认只发现一个顶层 Skill：`using-apex-forge`。
10. 与当前六 Skill 版本进行回归对比，质量不下降。
11. 通过真实任务 benchmark，证明专业能力不是“存在文件但没有效果”。

## 3. 非目标

- 不恢复 V1 的 43 个顶层 Skill 入口。
- 不为每项能力创建独立状态机、数据库、事件日志或工作目录。
- 不复制 Better Test 的完整测试知识库。
- 不复制 Product Goal-Based Audit 的完整审计状态系统。
- 不复制 Codex Browser Plugin、Computer Use 或其他平台实现。
- 不允许内部能力直接修改 `.apex-v2`。
- 不允许内部能力自行标记节点 PASS、签发 Approval 或执行 Merge。
- 不因打包能力增多而默认增加 PlanGraph 节点。
- 不把文件数量、Skill 数量或 Prompt 长度作为完成指标。

## 3.1 一键安装的准确含义

一键安装保证：

- 21 项 Capability Definition、Protocol、Contract 和 Router 全部随插件安装；
- Core 能力不依赖用户目录下的 Skill；
- 所有能力都能执行 availability detection；
- 所有能力都有 deterministic fixture Provider；
- 缺少平台依赖时给出 typed `UNAVAILABLE/BLOCKED`，不产生 false PASS。

一键安装不代表 Apex 自动安装或提供：

- Xcode、iOS Simulator；
- Android SDK、ADB、Emulator；
- 云平台账号、Token 和生产权限；
- Codex/Chrome Browser Plugin；
- 项目自己的数据库、CI、部署平台或真实设备。

环境相关 Capability 使用以下认证等级：

```text
BUNDLED
  protocol/contract/router 已进入插件包
CONFORMANT
  fixture Provider 和 failure paths 已通过
LIVE_VERIFIED
  至少一个声明的平台/provider 真实运行通过
PORTABLE_VERIFIED
  目标平台矩阵全部通过
```

发布文档必须逐项声明认证等级和平台范围，不能以 `BUNDLED` 冒充
`LIVE_VERIFIED`。

## 4. 设计原则

### 4.1 一个公开入口

对模型默认只暴露：

```text
using-apex-forge
```

现有：

```text
apex-forge-plan
apex-forge-execute
apex-forge-review
apex-forge-ship
apex-forge-status
```

迁移后成为 `using-apex-forge` 下的内部 workflow references，不再作为隐式
可发现 Skill。

### 4.2 Capability 不是 Skill 状态机

原子能力只负责：

```text
读取已声明输入
  -> 执行专业方法
  -> 返回符合 Contract 的结构化产物
```

以下能力继续由 Kernel 提供：

- 状态；
- 依赖；
- 重试；
- lease / fencing；
- 权限；
- 预算；
- Artifact；
- Gate；
- Risk；
- Approval；
- 恢复。

### 4.3 每项能力只有一个 canonical source

吸收完成后，Apex 仓库内的原子协议是唯一维护源。

不再：

- 从本机用户目录读取最新文本；
- 同时维护内置版和外部版；
- 在 Plugin 构建时从其他仓库动态复制；
- 自动跟踪其他仓库 HEAD。

### 4.4 复制方法，不复制旧运行时

从 V1 或外部 Skill 吸收时：

- 保留专业步骤、判断规则和反模式；
- 删除 V1 `.apex/` 状态写入；
- 删除 shell preamble 中的阶段管理；
- 删除外部 Skill 自己的 checkpoint、registry 和 status；
- 删除与 Apex Kernel 重复的 retry、approval、artifact、worker 管理；
- 改为统一 Capability Contract。

## 5. 目标目录结构

```text
v2/
├── capabilities/
│   ├── registry.json
│   ├── capability-lock.json
│   ├── PROVENANCE.md
│   ├── core/
│   │   ├── engineering-spec/
│   │   │   └── PROTOCOL.md
│   │   ├── source-grounding/
│   │   ├── architecture-design/
│   │   ├── systematic-debugging/
│   │   ├── tdd-negative-control/
│   │   ├── incremental-delivery/
│   │   ├── code-review/
│   │   ├── security-audit/
│   │   ├── high-risk-review/
│   │   ├── test-strategy/
│   │   └── documentation-sync/
│   ├── conditional/
│   │   ├── frontend-design/
│   │   ├── design-to-code/
│   │   ├── browser-qa/
│   │   ├── mobile-qa/
│   │   ├── performance-validation/
│   │   ├── migration-safety/
│   │   └── deploy-release/
│   └── evolution/
│       ├── project-audit/
│       ├── postmortem/
│       └── simplification/
├── schemas/
│   ├── capability-definition.schema.json
│   ├── capability-binding.schema.json
│   ├── capability-invocation.schema.json
│   ├── capability-evidence.schema.json
│   └── capability-registry.schema.json
├── src/core/
│   ├── capability-registry.mjs
│   ├── capability-router.mjs
│   ├── capability-evidence.mjs
│   └── capability-provenance.mjs
└── workflows/skills/
    └── using-apex-forge/
        ├── SKILL.md
        ├── references/
        │   └── workflows/
        │       ├── plan.md
        │       ├── execute.md
        │       ├── review.md
        │       ├── ship.md
        │       └── status.md
        └── agents/
            └── openai.yaml
```

Plugin 构建时将 `capabilities/` 复制到 bundled runtime，但不生成额外
`SKILL.md`。

## 6. 统一 Capability Contract

### 6.1 Capability Definition

```json
{
  "schema_version": "v0",
  "capability_id": "systematic-debugging",
  "version": "1.0.0",
  "category": "core",
  "description": "Reproduce, localize, prove root cause, and guard a defect.",
  "protocol_ref": "capabilities/core/systematic-debugging/PROTOCOL.md",
  "input_contract": "debug-request",
  "output_contract": "root-cause-evidence",
  "execution_class": "cognitive",
  "required_host_capabilities": ["structured_output", "tool_use"],
  "allowed_tools": ["read", "search", "shell_test"],
  "forbidden_actions": ["merge", "push", "approval_decide"],
  "default_budget": {
    "max_wall_minutes": 30,
    "max_agent_turns": 12,
    "max_tool_calls": 80
  },
  "provenance": {
    "source": "first-party",
    "source_ref": "dev-debug",
    "source_sha256": "...",
    "license": "MIT",
    "rewrite": "normalized-for-apex-v2"
  }
}
```

### 6.2 Capability Binding

```json
{
  "binding_id": "bug-to-debug",
  "capability_id": "systematic-debugging",
  "priority": 100,
  "conditions": {
    "intake_types": ["bug", "test_failure"],
    "risk_levels": ["low", "medium", "high", "critical"]
  },
  "plan_insertion": {
    "node_id": "delivery-diagnosis",
    "before": ["delivery-design", "delivery-implementation"],
    "required": true
  }
}
```

### 6.3 Capability Invocation

Invocation 不创建新状态机，而是附着于 PlanGraph Node 和 Worker：

```json
{
  "invocation_id": "capinv-...",
  "run_id": "run-...",
  "plan_node_id": "delivery-diagnosis",
  "worker_id": "worker-...",
  "capability_id": "systematic-debugging",
  "capability_version": "1.0.0",
  "definition_sha256": "...",
  "input_artifact_refs": [],
  "output_contract": "root-cause-evidence",
  "required": true
}
```

执行状态继续使用现有 Worker：

```text
active
  -> claimed
  -> evidence_submitted
  -> blocked / cancelled
```

### 6.4 Capability Evidence

```json
{
  "schema_version": "v0",
  "capability_id": "systematic-debugging",
  "capability_version": "1.0.0",
  "invocation_id": "capinv-...",
  "objective": "...",
  "source_refs": [],
  "claims": [],
  "uncertainties": [],
  "findings": [],
  "verification_refs": [],
  "output": {},
  "created_at": "..."
}
```

Capability-specific output 放在 `output`，并由对应 schema 再验证。

## 7. 路由流程

```text
Intake / Plan input
  -> Capability Router
  -> 匹配 registry bindings
  -> 计算 required / optional capabilities
  -> 去重与冲突检查
  -> 检查 Method Pack、风险、预算、Host 能力
  -> 插入或装饰 PlanGraph Node
  -> Host/Worker 按 protocol_ref 执行
  -> 输出 typed Capability Evidence
  -> Kernel semantic validation
  -> Artifact persistence
  -> Gate 解锁后续节点
```

### 7.1 Required 与 Optional

- `required`：缺失或失败时后续节点保持 blocked。
- `optional`：记录 `SKIPPED_WITH_REASON`，不能冒充执行。
- `advisory`：只提供建议，不参与 Gate。

### 7.2 冲突解决

如果多个能力要求不同执行顺序：

```text
security-audit before deploy-release
documentation-sync after implementation
browser-qa after design-to-code
```

由 registry 显式声明依赖，不由 Agent 临时决定。

## 8. 21 项能力总表

### 8.1 P0 Core

| ID | Capability | 主要来源 | Rewrite |
|---|---|---|---|
| CAP-01 | `engineering-spec` | `dev-spec-lite` | 中等 |
| CAP-02 | `source-grounding` | `dev-source-driven` | 低 |
| CAP-03 | `architecture-design` | V1 Design Consultation / Plan Eng Review | 高 |
| CAP-04 | `systematic-debugging` | `dev-debug` + V1 Investigate | 中等 |
| CAP-05 | `tdd-negative-control` | `dev-tdd` + DSH Negative Control | 中等 |
| CAP-06 | `incremental-delivery` | `dev-incremental` | 低 |
| CAP-07 | `code-review` | `dev-review` + V1 Code Review | 中等 |
| CAP-08 | `security-audit` | V1 Security Audit | 高 |
| CAP-09 | `high-risk-review` | `dev-doubt` | 低 |
| CAP-10 | `test-strategy` | Better Test strategy/impact concepts | 高 |
| CAP-11 | `documentation-sync` | V1 Document Release | 高 |

### 8.2 P1 Conditional

| ID | Capability | 主要来源 | Rewrite |
|---|---|---|---|
| CAP-12 | `frontend-design` | Tasteful Frontend / V1 Design Consultation | 高 |
| CAP-13 | `design-to-code` | Design-to-Code Runner | 中等 |
| CAP-14 | `browser-qa` | V1 QA/Design Review + Host Browser Contract | 高 |
| CAP-15 | `mobile-qa` | V1 Mobile Test | 高 |
| CAP-16 | `performance-validation` | 新增第一方协议 | 高 |
| CAP-17 | `migration-safety` | `dev-doubt` + V2 transaction/reconcile | 高 |
| CAP-18 | `deploy-release` | V1 Land and Deploy | 高 |

### 8.3 P2 Evolution

| ID | Capability | 主要来源 | Rewrite |
|---|---|---|---|
| CAP-19 | `project-audit` | Product Goal-Based Audit | 高 |
| CAP-20 | `postmortem` | V1 Retro + DSH Postmortem discipline | 高 |
| CAP-21 | `simplification` | DSH Simplification Round | 高 |

## 9. 逐项 Capability 设计

### CAP-01 Engineering Spec

触发：

- 用户目标存在两种以上合理解释；
- public behavior、API、schema、data model 改动；
- 多模块任务；
- risk 为 high/critical。

输入：

- Intake；
- acceptance criteria；
- affected area；
- existing decisions；
- known constraints。

输出 `engineering-spec-evidence`：

```text
objective
in_scope
out_of_scope
acceptance
assumptions
open_questions
verification_plan
```

Gate：

- required 时，未解决的 blocking question 禁止进入 implementation。

有效性测试：

- 模糊需求 fixture 能生成边界清晰的 spec；
- 明确的小改动不触发；
- 缺 acceptance 时保持 blocked。

### CAP-02 Source Grounding

触发：

- SDK、API、CLI、协议、框架、生成代码；
- 用户要求 current/latest/official；
- 本地 schema/proto 定义行为。

输出 `source-grounding-evidence`：

```text
detected_version
authoritative_sources
verified_claims
conflicts
unverified_assumptions
```

Gate：

- 版本敏感实现必须引用本地或官方权威来源。

有效性测试：

- 旧 API 签名 fixture 被拒绝；
- 本地 schema 与官方文档冲突时优先本地 contract 并报告；
- 普通纯逻辑任务不触发。

### CAP-03 Architecture Design

触发：

- 新模块、公共接口、状态机、持久化、跨进程边界；
- 多于一个系统组件；
- high/critical risk；
- 新增长期抽象。

输出 `architecture-design-evidence`：

```text
problem
constraints
alternatives
selected_design
dependencies
state_ownership
failure_modes
rollback
verification
simplification_conditions
```

Gate：

- 没有 state owner、失败路径或 rollback 的高风险设计不能 implementation。

有效性测试：

- 双事实源方案被识别；
- 只有一个实现选项且无理由时 blocked；
- 低风险局部函数不强制插入设计节点。

### CAP-04 Systematic Debugging

触发：

- bug；
- test failure；
- build/runtime/integration failure；
- flaky 或 race signal。

输出 `root-cause-evidence`：

```text
reproduction
observed_failure
failure_signature
data_flow
hypotheses
experiments
confirmed_root_cause
affected_scope
fix_constraints
regression_target
```

Gate：

- 未复现且无不可复现原因时不能开始修复；
- 没有 confirmed root cause 时只能进入 investigation carry-forward。

有效性测试：

- 症状修补但未解释根因的输出被拒绝；
- 错误失败签名不能冒充复现；
- race/environment fixtures 能正确分类。

### CAP-05 TDD / Negative Control

触发：

- bug、test_failure；
- 行为变化；
- validation/state transition/calculation/error handling；
- high-risk regression。

输出 `negative-control-evidence`：

```text
test_entry
fault_model
red_command
red_signature
green_command
green_result
restoration_result
candidate_digest
```

Gate：

- Bug 必须 `RED_CONFIRMED -> GREEN_CONFIRMED -> RESTORED`；
- waiver 必须绑定 Risk、Approval 和 expiry。

有效性测试：

- 非零退出但错误原因不匹配时 FAIL；
- RED/GREEN 使用不同测试入口时 FAIL；
- mutation 未清理时 FAIL；
- 静态文案修改不触发。

### CAP-06 Incremental Delivery

触发：

- 多文件、多层、跨 UI/API/storage；
- 大型 refactor；
- estimated duration 超过 quick budget。

输出 `incremental-plan-evidence`：

```text
slices
slice_dependencies
write_scopes
verification_per_slice
rollback_per_slice
completion_order
```

Gate：

- 当前 slice 未验证不能扩展下一 slice；
- write scope 重叠必须串行或拆分。

有效性测试：

- 多层 feature 被拆成 coherent slices；
- 单文件机械修改不触发；
- 未验证 slice 继续执行被拒绝。

### CAP-07 Code Review

触发：

- Candidate 已生成；
- Agent 代码；
- public behavior/security/performance/shared state 改动。

输出 `code-review-evidence`：

```text
candidate_digest
requirements_mapping
findings
severity
correctness
error_paths
concurrency
maintainability
security
performance
test_gaps
merge_posture
```

Gate：

- P0/P1 或 blocking finding 禁止 approve；
- Review 必须绑定当前 candidate。

有效性测试：

- injected defect 必须被发现；
- 旧 candidate review 失效；
- 无 findings 时必须给出检查范围。

### CAP-08 Security Audit

触发：

- auth、authorization、secret、identity、user data；
- CI/CD、dependency、network、filesystem permission；
- sensitive paths 或 security flag；
- critical risk。

输出 `security-audit-evidence`：

```text
scope
threat_model
findings{severity,cwe,location,evidence,remediation}
secret_scan
dependency_scan
permission_review
residual_risks
merge_posture
```

Gate：

- critical/high 未关闭或未获批时禁止 Ship。

有效性测试：

- hardcoded secret、path traversal、auth bypass fixture 必须被发现；
- fake token fixture 不应误报；
- Agent summary 不能冒充 scan evidence。

### CAP-09 High-Risk Review

触发：

- migration、delete、production rollout、irreversible effect；
- trading/payment/auth/public API；
- timing/order/idempotency/concurrency invariant。

输出 `high-risk-evidence`：

```text
safety_claim
assumptions
adversarial_cases
blast_radius
rollback
approval_requirement
residual_risks
```

Gate：

- 未验证的一路门假设必须阻断或进入 Approval。

有效性测试：

- irreversible fixture 缺 rollback 时 blocked；
- low-risk mechanical change 不触发；
- accepted risk 必须有 Approval。

### CAP-10 Test Strategy

触发：

- 新 feature；
- shared module；
- release candidate；
- risk 或 coverage gap；
- 用户询问应跑哪些测试。

输出 `test-strategy-evidence`：

```text
test_mode
affected_surfaces
selected_test_groups
excluded_groups
selection_rationale
environment_requirements
known_issues
stop_conditions
```

边界：

- 不建立 Better Test 的第二 history/state；
- TestMap 与 known issues 继续进入 Apex Knowledge/Artifact。

有效性测试：

- 不同变更选择不同 test groups；
- 已知问题不会被重复报成新 Bug；
- release/high-risk 不可只选择 smoke。

### CAP-11 Documentation Sync

触发：

- public behavior、CLI、API、schema、config、architecture；
- release；
- docs drift finding。

输出 `documentation-sync-evidence`：

```text
changed_behavior
affected_docs
updated_docs
intentionally_unchanged
stale_refs
verification
```

Gate：

- public behavior 变化但文档未处理时 Ship BLOCK 或显式 carry-forward。

有效性测试：

- CLI help/README drift fixture 被发现；
- 内部重构不强制更新用户文档；
- stale TODO 不被无理由删除。

### CAP-12 Frontend Design

触发：

- 新页面、组件、设计系统；
- 视觉、布局、动效或交互决策；
- 缺 approved design artifact。

输出 `frontend-design-evidence`：

```text
brief
information_architecture
selected_direction
design_tokens
layout_spec
responsive_rules
interaction_states
acceptance
```

吸收策略：

- 第一阶段提炼核心六阶段方法；
- 品牌库作为独立可选资源；
- 未确认许可证的资源不进入 release bundle。

有效性测试：

- backend 任务不触发；
- 缺目标用户/产品语境时不直接生成视觉方案；
- 输出能被 Design-to-Code 消费。

### CAP-13 Design-to-Code

触发：

- 存在已批准 design spec；
- 用户要求实现设计稿；
- component mapping 明确。

输出 `design-to-code-evidence`：

```text
design_artifact_ref
implementation_spec
component_map
changed_files
acceptance_checklist
fidelity_findings
```

Gate：

- 不允许仅凭截图跳过 implementation spec；
- 无 component map 时不得静默替换。

有效性测试：

- spec-driven fixture 正确实现；
- screenshot-only 输入被要求补 spec；
- acceptance checklist 未完成时 Review BLOCK。

### CAP-14 Browser QA

触发：

- Web UI；
- browser acceptance；
- URL/DOM/console/network 行为；
- frontend Candidate。

输出 `browser-qa-evidence`：

```text
url
browser_provider
viewport
user_flows
screenshots
console_errors
network_errors
accessibility_findings
behavior_results
```

Provider：

- Codex Browser Plugin；
- Chrome Plugin；
- Playwright fallback，仅在已打包依赖可用时。

Gate：

- 替代服务器、错误 URL 或无截图的视觉 PASS 无效。

有效性测试：

- 真实 URL 与替代 URL 混淆被拒绝；
- console error fixture 被发现；
- Browser 不可用时明确 blocked/skip，不冒充 PASS。

### CAP-15 Mobile QA

触发：

- iOS/Android/native/responsive mobile；
- mobile acceptance；
- app bundle/APK/Simulator artifact。

输出 `mobile-qa-evidence`：

```text
platform
device
os_version
app_artifact
flows
screenshots_or_video
crashes
logs
cleanup
```

Gate：

- 未发现模拟器/设备时明确 blocked；
- 不自动安装 Xcode、SDK 或 Emulator。

有效性测试：

- mock simulator fixture 验证命令选择；
- 错误 bundle id 不能 PASS；
- cleanup evidence 缺失时报告 residual risk。

### CAP-16 Performance Validation

触发：

- latency、throughput、memory、CPU、startup；
- performance-sensitive path；
- regression threshold；
- explicit benchmark acceptance。

输出 `performance-evidence`：

```text
metric
baseline
candidate
environment_fingerprint
sample_count
distribution
threshold
regression_percent
verdict
```

Gate：

- 不同环境的结果不可直接比较；
- 单次样本不能宣称改善；
- 缺 baseline 时只能标 `MEASURED_NO_BASELINE`。

有效性测试：

- environment drift 被拒绝；
- cumulative/median trap fixture；
- 明确回退超过阈值时阻断。

### CAP-17 Migration Safety

触发：

- schema、database、state、event、config migration；
- destructive transform；
- compatibility removal。

输出 `migration-safety-evidence`：

```text
source_version
target_version
preconditions
dry_run
backup
forward_steps
rollback_steps
idempotency
replay_or_reconcile
data_diff
```

Gate：

- 无 dry-run、backup/rollback 或 post-check 时禁止执行高风险 migration。

有效性测试：

- failpoint 回滚；
- 重复执行幂等；
- partial migration recovery；
- source/target version mismatch 拒绝。

### CAP-18 Deploy Release

触发：

- Integration PASS；
- 用户要求 deploy/release；
- deployment profile 已配置。

输出 `deployment-receipt`：

```text
candidate_digest
environment
approval
deployment_id
started_at
completed_at
health_checks
canary_results
rollback_token
external_refs
```

Gate：

- 默认不 deploy；
- 必须显式用户意图、Approval、当前 Candidate 和健康检查；
- 失败保留 rollback/incident evidence。

有效性测试：

- fake provider lifecycle；
- stale candidate 拒绝；
- health FAIL 触发 rollback path；
- 无配置时保持 blocked。

### CAP-19 Project Audit

触发：

- 用户请求 audit；
- pre-release；
- high-risk milestone；
- periodic governance。

输出 `project-audit-evidence`：

```text
objective
commitments
checks
findings
coverage
confidence
unverified_items
score
release_posture
```

边界：

- 提炼 Product Goal-Based Audit 的审计循环；
- 使用 Apex Artifact/Run，不复制 `.product-audit` 状态机。

有效性测试：

- fake PASS script、missing evidence、aggregate score trap；
- document-only commitment 不冒充 runtime proof；
- audit 自审能识别覆盖缺口。

### CAP-20 Postmortem

触发：

- escaped defect；
- false completion；
- production/release incident；
- Gate bypass；
- unrecoverable run；
- repeated critical finding。

输出 `postmortem-evidence`：

```text
impact
timeline
detection_gap
root_causes
failed_controls
corrective_actions
control_candidates
negative_controls
owners
verification
```

Gate：

- high/critical 无 verified control 或获批 Risk 时不能 close。

有效性测试：

- 只有总结、没有 control 的 postmortem 保持 blocked；
- control 在错误实现不失败时无效；
- 自动化只能生成 proposal。

### CAP-21 Simplification

触发：

- 大功能/Wave 完成；
- periodic due；
- complexity budget 超标；
- duplicate state/rule/API signal。

输出 `simplification-evidence`：

```text
candidates
consumer_evidence
deletion_plan
risk
verification_plan
estimated_savings
actual_savings
decision
```

Gate：

- scanner 只能提出候选；
- public API/schema 删除需要 Approval；
- 删除后质量 Gate 不得下降。

有效性测试：

- unused/duplicate/speculative fixture；
- false positive 有真实 consumer 时必须保留；
- actual savings 未测量保持 unknown。

## 10. 来源与许可证策略

### 10.1 直接吸收

以下当前安装内容短小，但缺独立 Git/License 元数据：

```text
dev-spec-lite
dev-source-driven
dev-debug
dev-tdd
dev-incremental
dev-review
dev-doubt
```

动作：

1. 确认第一方所有权。
2. 保存原始 SHA256。
3. 在 `PROVENANCE.md` 记录来源。
4. 以 Apex MIT License 重新发布。
5. 改写成 `PROTOCOL.md` 和 typed output。

### 10.2 V1 提炼

旧 Apex Forge 为 MIT，可提炼：

- Investigate；
- Security Audit；
- Design Consultation / Review；
- Mobile Test；
- Land and Deploy；
- Document Release；
- Retro。

禁止复制：

- shell state preamble；
- `.apex/` 写入；
- telemetry helper；
- dashboard；
-旧 hooks。

### 10.3 外部 MIT 项目

- Design-to-Code Runner：允许提炼和打包。
- Better Test：只提炼 Test Strategy/Impact，不复制状态系统。
- Product Goal-Based Audit：只提炼审计方法，不复制状态系统。

### 10.4 待确认来源

Tasteful Frontend 当前安装副本未发现独立 License：

- 在确认 canonical source 与许可证前，不复制资源库；
- 可先独立重写通用六阶段设计方法；
- 品牌 tokens/reference assets 必须逐项确认来源。

### 10.5 平台能力

Browser/Computer Use：

- 只写 Adapter 与 Evidence Contract；
- 不复制 OpenAI bundled plugin；
- availability 由 HostAdapter 检测；
- package/runtime 测试使用 fixture Provider。

## 11. 单公开 Skill 迁移

### Phase S1：隐藏旧入口

为五个非入口 Skill 配置：

```yaml
policy:
  allow_implicit_invocation: false
```

验证：

- 模型默认 context 只有 `using-apex-forge`；
- 用户显式旧命令仍可临时使用；
- using router 能覆盖五条路径。

### Phase S2：内部引用

将五个 Skill 正文迁移到：

```text
using-apex-forge/references/workflows/
```

删除其独立 `SKILL.md` 前：

- 运行路由等价测试；
- 运行 Codex/Claude Plugin lifecycle；
- 保留一个 release 的兼容 aliases。

### Phase S3：单入口发布

最终插件只有一个 Skill manifest：

```text
skills/using-apex-forge/SKILL.md
```

测试：

- package 中 `SKILL.md` 数量为 1；
- 21 项 capability 均被打包；
- 任何内部文件不被当作 Skill discovery root；
- starter prompts 全部进入 using router。

## 12. 实施 Work Packages

### WP0：来源冻结与验收基线

交付：

- 21 项 source inventory；
- SHA256；
- License/Provenance 决策；
- V1 能力 parity baseline；
- 当前六 Skill routing baseline；
- benchmark task set。

DoD：

- 每项 source 状态为 `OWNED`、`MIT`、`REWRITE_ONLY` 或 `BLOCKED_LICENSE`；
- 没有 unknown source 进入 release。

### WP1：Capability Contract 与 Registry

交付：

- 五个 capability schemas；
- registry/lock；
- source/plugin build copy；
- registry validator；
- duplicate/version/path safety。

DoD：

- 21/21 definitions schema PASS；
- duplicate ID、missing protocol、hash mismatch、path escape 全部 fail。

### WP2：Router 与 PlanGraph Integration

交付：

- capability-router；
- PlanGraph fields；
- required/optional/advisory；
- insertion/dependency/conflict；
- Cost Governor integration。

DoD：

- routing fixture matrix 100%；
- 不应触发 fixture 的 false-positive 为 0；
- required capability 不可静默跳过。

### WP3：Core A

吸收：

- CAP-01 Engineering Spec；
- CAP-02 Source Grounding；
- CAP-04 Debug；
- CAP-05 TDD；
- CAP-06 Incremental。

DoD：

- 五项协议和 output schemas；
- focused behavior fixtures；
- Bug RED/GREEN loop PASS。

### WP4：Core B

吸收：

- CAP-03 Architecture；
- CAP-07 Code Review；
- CAP-08 Security；
- CAP-09 High Risk；
- CAP-10 Test Strategy；
- CAP-11 Documentation Sync。

DoD：

- blocking findings 不可降级；
- public behavior docs drift 被 Gate 捕获；
- test strategy 不建立第二状态源。

### WP5：Frontend / QA

吸收：

- CAP-12 Frontend Design；
- CAP-13 Design-to-Code；
- CAP-14 Browser QA；
- CAP-15 Mobile QA。

DoD：

- backend fixture 不触发；
- design -> implementation -> browser evidence 链 PASS；
- Browser/Mobile unavailable 路径不产生 false PASS。

### WP6：Performance / Migration / Deploy

吸收：

- CAP-16 Performance；
- CAP-17 Migration；
- CAP-18 Deploy。

DoD：

- environment drift 被拒绝；
- migration failpoint recovery PASS；
- stale candidate deploy 被拒绝；
- deploy 默认关闭。

### WP7：Evolution

吸收：

- CAP-19 Audit；
- CAP-20 Postmortem；
- CAP-21 Simplification。

DoD：

- audit fake PASS 被发现；
- Postmortem 无 control 不能 close；
- Simplification scanner 只提候选。

### WP8：单入口 Plugin

交付：

- using router；
- internal workflows；
- internal capabilities；
- Codex visibility policy；
- Claude overlay；
- compatibility aliases。

DoD：

- 默认只发现一个 Skill；
- 五个生命周期分支仍可触达；
- plugin package/install/update/rollback/uninstall PASS。

### WP9：Effectiveness Benchmark

交付：

- routing benchmark；
- capability behavior benchmark；
- ablation benchmark；
- context/token benchmark；
- cross-host benchmark。

DoD：

- 21 项全部有有效性证据；
- 不是仅验证文件存在。

### WP10：Release

交付：

- migration；
- docs；
- source/plugin provenance；
- release candidate；
- release verify。

## 13. 实施依赖与并行

```text
WP0 -> WP1 -> WP2

WP2 -> WP3
WP2 -> WP4
WP2 -> WP5
WP2 -> WP6
WP2 -> WP7

WP3 + WP4 + WP5 + WP6 + WP7 -> WP8
WP3 + WP4 + WP5 + WP6 + WP7 -> WP9
WP8 + WP9 -> WP10
```

允许五个能力批次使用独立分支并行，但以下文件必须单 Writer：

- capability registry schema；
- Contract Registry；
- PlanGraph schema；
- plugin build script；
- using router。

## 14. 测试体系

### 14.1 静态完整性

- 21 definitions 存在；
- 21 protocol refs 存在；
- 21 versions 和 hashes 一致；
- 无 `[TODO]`；
- 无绝对路径；
- 无 symlink escape；
- License/Provenance 完整；
- Plugin 包含锁定快照。

### 14.2 Registry Contract

Adversarial cases：

- duplicate capability id；
- unknown category；
- missing output schema；
- protocol path traversal；
- unsupported execution class；
- forbidden tool；
- budget 非法；
- definition hash drift；
- source/plugin registry drift。

### 14.3 Routing Matrix

至少为每项能力提供：

1. 正确触发 fixture；
2. 不应触发 fixture；
3. 与另一能力组合触发 fixture；
4. 缺能力时的 blocked fixture；
5. optional skip fixture。

最低：

```text
21 × 5 = 105 routing cases
```

要求：

- required recall = 100%；
- required false positive = 0；
- 同一 capability 不重复插入；
- dependency order 稳定。

### 14.4 Output Contract

每项至少：

- valid output；
- missing required field；
- generic/copied claim；
- undeclared evidence ref；
- contradiction；
- stale candidate；
- wrong capability version。

最低：

```text
21 × 7 = 147 contract/semantic cases
```

### 14.5 Failure / Interruption

- timeout；
- executor error；
- Host session loss；
- plugin restart；
- invalid output；
- partial Artifact write；
- duplicate submit；
- stale lease/fencing；
- cancel；
- Cost Governor exceeded。

要求：

- 状态可恢复；
- 无 orphan process/workspace；
- 无 false PASS；
- 重试不重复副作用。

### 14.6 Plugin Visibility

Codex：

- 默认上下文只包含 `using-apex-forge`；
- internal protocol 不作为独立 Skill；
- explicit compatibility alias 在迁移期可调用；
- Plugin card 仍只有一个。

Claude：

- 同一 using router；
- 无 Codex host identity 泄漏；
- internal references 可从安装包解析。

### 14.7 行为有效性

每项能力至少两个真实或高保真 fixture：

```text
一个应成功任务
一个带隐藏缺陷任务
```

关键能力额外要求：

- Debug：三个不同错误类型；
- Security：secret/path/auth 三类；
- Browser：DOM/console/network；
- Migration：failpoint/rollback/retry；
- Deploy：success/health fail/stale candidate。

### 14.8 Ablation Benchmark

同一任务执行：

```text
A：Capability enabled
B：Capability disabled
```

比较：

- completion；
- hidden acceptance；
- finding recall；
- false positive；
- rework；
- wall time；
- input/output tokens；
- user actions。

能力只有在以下条件成立时可称为“有效”：

- 目标质量指标改善，或高风险漏检显著下降；
- completion/safety 不回退；
- 新增成本不超过该能力预算；
- 没有靠泄漏 hidden checks 获胜。

### 14.9 最低 Effectiveness Gate

| 类别 | Gate |
|---|---|
| Debug/TDD | 原缺陷捕获率 100%，wrong-signature PASS=0 |
| Review/Security/High Risk | P0/P1 hidden finding recall 100% |
| Spec/Architecture | requirement/scope contradiction 漏检=0 |
| Test Strategy | high-risk 只选 smoke 的次数=0 |
| Frontend/Browser/Mobile | false visual/behavior PASS=0 |
| Performance | environment drift 接受数=0 |
| Migration/Deploy | stale candidate/partial migration 通过数=0 |
| Audit/Postmortem | fake PASS/summary-only close=0 |
| Simplification | 有真实 consumer 的误删数=0 |

### 14.10 环境相关 Capability Live Gate

| Capability | 最低 live evidence |
|---|---|
| Browser QA | 至少一个真实 Chromium/Host Browser flow，包含 screenshot、console、network |
| Mobile QA iOS | macOS + 已声明 Simulator 型号和 iOS 版本的真实运行 |
| Mobile QA Android | 已声明 AVD/设备和 Android API level 的真实运行 |
| Performance | 固定环境指纹下至少 5 次样本和稳定统计 |
| Migration | disposable database/state fixture 上的 forward/rollback/retry |
| Deploy | 非生产 sandbox/staging provider 的 deploy、health、rollback |

如果某个平台未验证：

- capability 只能声明对应平台 `BUNDLED/CONFORMANT`；
- 不得在产品文档中写成该平台已可用；
- 其他已验证平台可以独立发布，不要求所有平台串行阻塞。

## 15. Benchmark Task Set

建议建立：

```text
benchmarks/capability-absorption/
├── matrix.json
├── tasks/
│   ├── core.json
│   ├── frontend.json
│   ├── browser.json
│   ├── mobile.json
│   ├── performance.json
│   ├── migration.json
│   ├── deployment.json
│   └── evolution.json
├── fixtures/
├── hidden/
└── evaluator/
```

每个任务绑定：

- source commit/tree；
- capability definition hash；
- Plugin candidate digest；
- model/provider/effort；
- environment fingerprint；
- public acceptance；
- hidden checks；
- process evidence；
- usage。

正式结果必须满足：

- 同 Candidate；
- 同任务集；
- 同模型和 Provider；
- 同环境；
- 唯一 official attempt；
- raw logs/hash 可复验。

## 16. 成本预算

### 16.1 Prompt Context

- 顶层 Skill metadata：只保留一个。
- using Skill 正文目标：`<=2,500` words。
- 每次最多加载：
  - 一个 workflow reference；
  - 三个 core capabilities；
  - 两个 conditional capabilities。
- 单 Capability protocol 目标：`<=1,200` words。
- 大型 reference assets 不注入模型，按需读取。

### 16.2 PlanGraph

- quick 非 Bug 默认不新增能力节点；
- 多个认知能力允许合并成一个 evidence node，但 output 分区校验；
- Debug/TDD 可形成 diagnosis + implementation，不允许重复 Context Agent；
- frontend-design/design-to-code/browser-qa 按依赖顺序插入；
- evolution 能力默认异步，不阻塞普通任务。

### 16.3 运行成本

- 每项能力有独立 budget；
- optional 能力超过预算时可跳过并报告；
- required 能力超过预算时 replan/block，不自动升级昂贵 Factory；
- usage unknown 不得声称节省。

## 17. 迁移策略

### 17.1 六 Skill 到单入口

1. 保留现有六 Skill。
2. 新 using router shadow 记录实际路由结果。
3. 对比当前 Agent 手动选择与新 router。
4. 隐藏五个非入口 Skill 的 implicit invocation。
5. 保留显式 alias 一个 release。
6. 删除独立 Skill，只保留内部 references。

### 17.2 V1 能力迁移

- 先保存 V1 原文和 SHA256 到 provenance evidence；
- 建立行为 parity checklist；
- 删除旧 runtime/preamble；
- 改写为 protocol；
- 通过 parity fixture 后才标 absorbed。

### 17.3 外部能力迁移

- 只在许可证允许时提炼；
- 未确认来源时采用 clean-room rewrite；
- release bundle 包含 notices；
- 迁移完成后不继续自动同步外部 HEAD。

## 18. 回滚策略

- Capability Router 使用 feature flag。
- Registry 支持 active version 和 previous version。
- 单项 capability 可禁用，不影响 Kernel。
- 单入口失败时可恢复六 Skill plugin package。
- protocol 内容回滚不改历史 Artifact。
- output schema breaking change 需要新 major version。
- Plugin rollback 后已有 run 使用锁定 capability version 继续读取。
- Browser/Mobile/Deploy Provider 不可用时不影响普通开发任务。

## 19. Release Gates

### G0 Source / License

- 21/21 source 决策完成；
- 无 unknown license；
- provenance/hash/notices 完整。

### G1 Registry

- 21/21 schema PASS；
- source/runtime/plugin hash 一致；
- adversarial registry tests PASS。

### G2 Routing

- 105+ routing cases PASS；
- required recall 100%；
- false-positive 0；
- dependency cycle 0。

### G3 Evidence

- 147+ output/semantic cases PASS；
- generic claim、stale candidate、wrong version 全部拒绝。

### G4 Behavior

- 21/21 有 hidden acceptance；
- mandatory effectiveness gates 全部 PASS；
- ablation 结果有效。
- 环境相关 Capability 的认证等级与真实 evidence 匹配。

### G5 Reliability

- retry/resume/cancel/interruption matrix PASS；
- orphan process/workspace=0；
- duplicate side effect=0。

### G6 Single Entry

- 默认 Skill discovery 数量=1；
- using router 覆盖全部工作流；
- Codex/Claude lifecycle PASS。

### G7 Cost

- simple task median overhead `<=15%`；
- capability context 遵守加载上限；
- Cost Governor evidence 完整。

### G8 Full Regression

- `npm test`；
- strict validate；
- contracts；
- reconcile `CONSISTENT`；
- plugin build/validate/lifecycle；
- candidate freeze/validate；
- dependency/license audit。

任一 Gate FAIL/BLOCKED 时，不得声明 21 项能力吸收完成。

## 20. 完成审计矩阵

每项能力最终必须填写：

| 字段 | 说明 |
|---|---|
| Source | 原始来源与 hash |
| License | 许可证 |
| Canonical Path | Apex 内路径 |
| Definition Version | 能力版本 |
| Input Contract | 输入 schema |
| Output Contract | 输出 schema |
| Trigger Tests | 正确/错误触发 |
| Behavior Tests | 成功/缺陷任务 |
| Negative Test | 防线错误时失败 |
| Interruption Test | 中断恢复 |
| Cost Evidence | tokens/wall/tools |
| Plugin Evidence | packaged/installed |
| Status | planned/implemented/verified |

只有 21 行全部 `verified`，总目标才完成。

## 21. 实施顺序建议

### 第一批：证明架构

```text
WP0 -> WP1 -> WP2
CAP-04 Debug
CAP-05 TDD
CAP-07 Review
```

选择这三项的原因：

- 能形成完整 Bug 闭环；
- 可以测试路由、Capability Evidence 和 Gate；
- 有明确 hidden defect；
- 能证明单入口按需加载是否工作。

### 第二批：完成 Core

```text
CAP-01/02/03/06/08/09/10/11
```

### 第三批：Conditional

```text
CAP-12 至 CAP-18
```

### 第四批：Evolution

```text
CAP-19 至 CAP-21
```

### 第五批：单入口与 Release

```text
WP8 -> WP9 -> WP10
```

## 22. 最终产品形态

用户安装：

```text
apex-forge-v2
```

Agent 默认看到：

```text
using-apex-forge
```

Kernel 根据需求选择：

```text
Method Pack
+ Capability Bindings
+ Host/Worker Executor
+ Cost Budget
+ Evidence Contract
```

最终用户不需要知道 21 项能力的名称，但可以在 Status/Plan 中看到：

```text
本次触发了哪些专业能力
为什么触发
使用哪个版本
产出什么证据
哪些被跳过及原因
花费多少成本
```

## 23. 最终结论

本计划不把 21 个专业 Skill 重新暴露给模型，而是把它们吸收为 Apex Forge 内部、
可验证、可预算、可替换的原子能力。

最终结构：

```text
一个公开 Skill
  + 21 项内部 Capability
  + 一个 Capability Registry
  + 一个 Kernel 状态机
  + 一套 Artifact/Gate/Cost 证据
```

这既恢复 V1 的专业能力广度，也保留 V2 的统一事实源、安全边界和低上下文成本。
