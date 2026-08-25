# Apex Forge V2

[![GitHub Release](https://img.shields.io/github/v/release/d-wwei/apex-forge-v2?include_prereleases&sort=semver)](https://github.com/d-wwei/apex-forge-v2/releases)
[![Product Benchmark](https://img.shields.io/badge/product%20benchmark-historical%2090%2F90-64748b)](./benchmarks/plugin-vs-v1/latest-evaluation.json)
[![License](https://img.shields.io/badge/license-MIT-1f2937)](./LICENSE)

**Agent Plugin 负责自然语言协作，Durable Kernel 负责状态、证据和交付真相。**

> Agent 天生会遗忘、误判和过早宣布完成，所以研发系统必须把规则、事实、
> 证据、权限和恢复机制做成不可绕过的工程结构。

Apex Forge V2 是一个面向 coding Agent 的软件研发交付系统。它把需求、实现、
验证、评审、审批、恢复和发布组织成可持久化、可审计、可恢复的项目级工作流，
而不是一次性的 prompt 或固定流水线。

当前版本以 Codex Agent Plugin 为主要入口，同时提供 Claude Code 插件包、
platform-neutral Kernel、capability-based WorkerExecutor 和可选 Factory Mode。

> Latest prerelease: [`v0.2.0-rc.1`](https://github.com/d-wwei/apex-forge-v2/releases/tag/v0.2.0-rc.1)

## 为什么需要 Apex Forge

普通 Agent coding 容易遇到这些问题：

- Agent 说“完成了”，但测试、review、learn 或 durable run 仍未关闭；
- 验证跑在旧工作区，实际 patch 没有被物化；
- 多个 Agent 并发写同一仓库，状态和证据互相覆盖；
- 进程异常退出后留下 daemon、锁、临时工作区或半写状态；
- verification、approval 和 merge 绑定的不是同一份代码；
- README、聊天记录或 exit code 被误当成发布证据；
- 长任务中断后只能重新开始，无法基于同一 objective 恢复。

Apex Forge 的基本立场是：

> Claim 弱于 Artifact。
>
> 测试通过弱于 Candidate-bound Verification。
>
> Agent 最终消息弱于 Durable Kernel Closure。

## 核心架构

```mermaid
flowchart TD
    U["User"] --> P["Codex / Claude Agent Plugin"]
    P --> W["Shared Workflows"]
    W --> H["HostAdapter"]
    H --> C["Typed Cognitive Evidence"]
    H --> A["Action-Owned Workspace"]

    C --> K["Durable Kernel"]
    A --> B["Patch Bundle"]
    B --> S["CandidateSet + candidate_digest"]
    S --> K

    K --> V["Deterministic Verification"]
    V --> R["Semantic Review"]
    R --> AP["Approval"]
    AP --> M["Merge CAS"]

    K --> E["Execution Router"]
    E --> X["WorkerExecutor"]
    X --> I["Isolated Sandbox / Worktree"]
    I --> B

    K --> D["ProjectState / PlanGraph / Risk / Audit / Usage"]
    K --> MP["Method Pack + Cost Governor"]
    K --> GD["Git Delivery + Checkout Owner"]
```

### 系统不变量

| 不变量 | 约束 |
|---|---|
| Kernel 是唯一事实源 | Plugin、Skill、HostAdapter、WorkerExecutor 不拥有第二份 ProjectState |
| Claim 弱于 Artifact | 文本声明不能直接证明完成 |
| 修改必须有所有权 | Interactive patch 只能发生在 action-owned workspace |
| Candidate 不可变 | verification、review、approval、merge 必须绑定同一 digest |
| 状态迁移 crash-safe | WAL、revision CAS、lease、fencing、idempotency 共同工作 |
| Gate fail closed | 缺证据、证据漂移、candidate 变化、provenance 缺失都阻断发布 |
| 平台适配是薄层 | Host identity 和 UX 不进入 Kernel semantics |

## 产品模式

| Mode | 适用场景 | 执行位置 |
|---|---|---|
| Interactive Cognitive | design、高风险 review、status | 当前 Host Agent |
| Interactive Patch | 普通低风险实现 | ActionWorkspace |
| Factory | context、risk、implementation、tests 等默认可委派节点 | Isolated sandbox/worktree |
| Operator | reconcile、诊断、迁移、发布 | 显式 CLI |

正常用户路径不要求输入原始 Kernel CLI。CLI 是 operator/debug surface，不是主要
产品入口。

## 已实现能力

### 项目级研发循环

- `.apex-v2/` durable project state、events、artifacts、knowledge 和 risks；
- intake、triage、roadmap、task-aware PlanGraph；
- 可插拔 `quick`、`disciplined-tdd`、`phase-context`、`governed` Method Pack；
- native/OpenSpec/Spec Kit 输入归一化，原 Spec checksum 可追溯；
- per-route Cost Governor，预算超限不自动升级为更昂贵的 Factory；
- Repo/Branch/Component/PR typed model 与 checkout ownership；
- context、risk、design、implementation、tests、verification、review、integrate、learn；
- quick route 与 full route；
- Governed 以 `delivery-plan -> delivery-candidate -> delivery-readiness`
  三个 Barrier 组织七类研发职责，而不是七次全局串行等待；
- Factory scheduler 按 `dispatch -> run -> collect -> unlock -> refill`
  持续补位，并用 scheduler/worker lease 与 fencing 防止重复执行；
- context、risk、tests 默认使用 cheap tier（Codex 映射为 Luna），implementation
  默认 standard tier，关键风险才升级 strong tier；
- Learning proposal 入队后即可关闭 delivery，知识写回由后台 job 和 receipt
  独立完成；
- partial pass、carry-forward、human acceptance 和 Risk Register；
- project metrics、quality policy、notifications 和 adapter history。

### 工作区与 Candidate 安全

- ActionWorkspace 基线、scope 和并发修改检测；
- secret、binary、symlink、delete、out-of-scope 变化阻断；
- ordered patch operations 与 operation-level conflict detection；
- immutable CandidateSet 和 content-addressed `candidate_digest`；
- candidate mutation、TOCTOU 和 merge CAS 防护。

### Durable Kernel

- transaction journal、原子 JSON 和 event append；
- project lock、revision CAS、lease、fencing、idempotency；
- SIGKILL、stale lock、orphan workspace 和 started transaction recovery；
- event replay、operational state hash 和 reconcile；
- schema migration 与 contract authority。

### Agent 与执行器

- typed cognitive evidence 和 semantic claim checks；
- HostAdapter / WorkerExecutor / ModelProvider 分层；
- Codex、Claude、Gemini 和 generic OpenAI-compatible runner；
- capability-based routing、retry、resume、fallback 和 cancellation；
- session-bound usage、wall time、attempt 和 tool evidence。

### 内部原子能力

Plugin 默认只公开 `using-apex-forge`。Kernel 根据任务信号把 21 个原子能力绑定到
现有 PlanGraph 节点，不为每个能力创建第二套状态机：

- Core：engineering spec、source grounding、architecture、debug、TDD negative
  control、incremental delivery、code review、security、high-risk review、test
  strategy、documentation sync；
- Conditional：frontend design、design-to-code、browser QA、mobile QA、
  performance、migration safety、deploy/release；
- Evolution：project audit、postmortem、simplification。

每项能力都有版本、触发条件、typed input/output schema、持久化 invocation、
protocol、预算、provenance、四重 lock 和 Capability Evidence。默认 rollout 是
`shadow`，缺证据会被持久化但不阻塞；验证或迁移环境可设置
`APEX_CAPABILITY_ENFORCEMENT_MODE=enforce`，required evidence 缺失时 fail closed。

Browser、Mobile、Performance、Deploy 只声明为 `bundled`，默认不会创建执行 worker。
提供方完成独立认证后，才可通过 `APEX_CAPABILITY_PROVIDERS` 显式启用，例如：

```bash
APEX_CAPABILITY_PROVIDERS=browser-qa,performance-validation
```

这不是 provider 安装命令，也不会把未验证平台升级成 `live_verified`。

### DSH Lifecycle R1

当前版本把两项 DSH 原子能力接入了真实 Kernel 生命周期：

- Bug/Test Failure 在生成 PlanGraph 时创建 durable
  `negative-control.json`。默认 `shadow` 只记录缺口；切换为 `enforce` 后，
  Review 与 Merge 都要求匹配的 RED failure signature、GREEN evidence 和
  restoration evidence。
- High/Critical Governed 计划自动生成幂等的 proposed Decision Note。
  Decision 正文存入 immutable Artifact，`decisions/index.json` 只保存状态与引用。

Operator CLI：

```bash
apex-v2 decision list --project .
apex-v2 decision show --project . --id <decision-id>
apex-v2 decision propose --project . --run-id <run-id> \
  --title "..." --rationale "..." --options "A,B"

apex-v2 negative-control show --project . --run-id <run-id>
apex-v2 negative-control record-red --project . --run-id <run-id> \
  --command "..." --expected-signature "..." \
  --observed-signature "..." --evidence <artifact-id>
apex-v2 negative-control record-green --project . --run-id <run-id> \
  --command "..." --evidence <artifact-id>
apex-v2 negative-control restore --project . --run-id <run-id> \
  --evidence <artifact-id>
```

Decision accept/implement/supersede、Postmortem routing、Review Learning、
Simplification Queue 和 Durable Team 仍属于后续批次。

### 资源保护

- TERM 到 KILL 的完整进程树回收；
- detached daemon 和 guard-token orphan 检测；
- 磁盘低水位、磁盘增长、workspace 增长和输出上限熔断；
- 父进程消失和 runner orphan fail-closed；
- workspace 并发文件 churn 不会误触发 `ENOENT` 磁盘故障。

## 快速开始

### 环境要求

- Node.js 22 或更高版本；
- npm；
- Codex CLI 或 Claude Code；
- Git。

### 从源码安装 Codex Plugin

```bash
git clone https://github.com/d-wwei/apex-forge-v2.git
cd apex-forge-v2

npm ci
npm run build:plugin

codex plugin marketplace add .
codex plugin add apex-forge-v2@apex-forge-local
```

安装后新建一个 Codex 任务，使最新版 Skills 被重新加载。

### 从 Release 资产安装

从
[`v0.2.0-rc.1`](https://github.com/d-wwei/apex-forge-v2/releases/tag/v0.2.0-rc.1)
下载：

- `apex-forge-v2-codex-0.2.0-rc.1.tar.gz`
- `SHA256SUMS`

校验：

```bash
shasum -a 256 -c SHA256SUMS
```

将插件包解压到本地 marketplace 后，通过 `codex plugin add` 安装。

### 安装 Claude Code Plugin

```bash
git clone https://github.com/d-wwei/apex-forge-v2.git
cd apex-forge-v2

npm ci
npm run build:plugin

claude plugin marketplace add ./plugins/claude-code
claude plugin install apex-forge-v2@apex-forge-local --scope user
```

## 如何使用

直接用自然语言描述目标：

```text
用 Apex Forge 实现这个需求：
给导入 worker 增加有上限的重试，并补充回归测试。
```

```text
继续上次中断的 Apex Forge 任务。
```

```text
审查当前 Candidate，重点检查安全、回滚和残余风险。
```

```text
告诉我当前 Apex Forge 状态、阻塞项和待审批事项。
```

Plugin 默认只暴露一个 Skill：

| Skill | 用途 |
|---|---|
| `using-apex-forge` | 根据 durable state 路由 plan、execute、review、ship、status |

五个生命周期工作流作为 package-private references 随插件打包，不进入默认 Skill
discovery。迁移或回滚时可运行
`APEX_PLUGIN_COMPAT_ALIASES=1 npm run build:plugin` 临时恢复旧六入口。

## Capability 验证边界

`npm run benchmark:capabilities` 当前执行 105 个 routing cases、168 个
evidence/contract cases、21 个 domain hidden cases，并做 enabled/disabled
deterministic ablation。它证明路由、证据 Gate 和隐藏缺陷拒绝逻辑有效，但不替代
同 candidate、同模型、同 provider、同环境的真实 Agent token/wall-time benchmark。
仓库中的历史 90/90 Product Benchmark 绑定旧 candidate，不能用于声称本次能力吸收
降低了 token 或耗时。

## Operator CLI

CLI 用于管理、诊断和发布：

```bash
# 初始化或查看项目
node src/apex-v2.mjs init --project . --name "My Project"
node src/apex-v2.mjs status --project .

# 导入既有 Spec
node src/apex-v2.mjs intake import-spec --project . --format openspec --path openspec/changes/example

# 校验和 reconcile
npm run validate
npm run check:schemas
node src/apex-v2.mjs capability verify
npm run capability:lock
node src/apex-v2.mjs project reconcile --project . --apply

# 查看 Host actions
node src/apex-v2.mjs host actions --project . --host-id codex-host

# 生成和验证 Release Candidate
npm run release:candidate
npm run release:validate-candidate
npm run benchmark:capabilities

# 执行完整发布 Gate
npm run release:verify
```

## 历史发布证据

下列数字属于已发布的历史 `v0.2.0-rc.1`，不代表当前工作树或尚未冻结的新
candidate：

| Gate | 结果 |
|---|---:|
| Automated tests | `263/263 PASS` |
| Schemas | `55` |
| Contract validations | `1,256 PASS` |
| Project reconcile | `CONSISTENT` |
| Dependency audit | `0 vulnerabilities` |
| Product Benchmark | `90/90 completed` |
| Release verification | `16/16 PASS` |
| Candidate validators | Codex + Claude PASS |
| Native lifecycle | install/update/rollback/uninstall PASS |

Product Benchmark 包含：

- 5 个真实仓库；
- 6 类场景：simple、multi-step、bug-fix、interrupted、review-defect、parallel；
- 3 种模式：Apex Forge V1、CLI Kernel、Agent Plugin；
- 每种模式 30 条 official runs；
- hidden acceptance、provenance、唯一性和环境一致性 Gate。

### Benchmark 结果

| Metric | V1 Skill | CLI Kernel | Plugin Kernel |
|---|---:|---:|---:|
| Completion | 1.000 | 1.000 | 1.000 |
| Recovery | 1.000 | 1.000 | 1.000 |
| Safety | 0.967 | 1.000 | 1.000 |
| Hidden acceptance | 1.000 | 1.000 | 1.000 |
| Evidence | 0.733 | 0.850 | **1.000** |
| Durable closure | 0.000 | 0.700 | **1.000** |
| False completion | 0 | 0 | 0 |

Product Gate 的 absolute、relative 和 durable-value Gate 全部通过。

完整证据：

- [`planning/plugin-upgrade-execution-status.md`](./planning/plugin-upgrade-execution-status.md)
- [`benchmarks/plugin-vs-v1/latest-evaluation.json`](./benchmarks/plugin-vs-v1/latest-evaluation.json)
- [`benchmarks/plugin-vs-v1/results-manifest.json`](./benchmarks/plugin-vs-v1/results-manifest.json)
- [`docs/releases/v0.2.0-rc.1.md`](./docs/releases/v0.2.0-rc.1.md)

## 仓库结构

```text
src/
  commands/       CLI domain commands
  core/           Kernel、state、transactions、candidate、policy
  benchmark/      controller、runner、evaluator、provenance
  executors/      WorkerExecutor implementations
  hosts/          HostAdapter implementations
  providers/      ModelProvider boundary
  release/        Candidate bundle and verification

schemas/          JSON Schema contracts
workflows/        Platform-neutral shared Skills
plugins/          Codex and Claude Code packages
benchmarks/       Product Benchmark tasks and official evidence
planning/         Architecture and upgrade plan
tests/            Unit, integration, adversarial and lifecycle tests
```

## 开发与验证

```bash
npm ci

# 全量测试
npm test

# Kernel 和 contracts
npm run validate
npm run check:schemas

# 插件
npm run build:plugin
npm run validate:plugins

# Benchmark 输入
npm run benchmark:validate-tasks
npm run benchmark:preflight

# Product Gate
npm run benchmark:plugin

# Release Gate
npm run release:verify
```

## 发布完整性

Release 资产包含：

- Codex 和 Claude Code 插件包；
- verified Candidate source archive；
- Candidate manifest；
- 90-run benchmark result archive 和 manifest；
- Product evaluation；
- Release verification；
- final acceptance audit；
- SHA-256 checksums。

Plugin 包内包含 runtime hash、schema hash、source tree hash、SBOM、LICENSE、
THIRD_PARTY_NOTICES 和 provenance。

## 当前边界

- `v0.2.0-rc.1` 是 prerelease，不是长期支持版本；
- 复杂 multi-step、interrupted、review-defect 和 parallel 场景的 wall time 与
  token cost 高于 V1；
- DeepSeek 当前只验证 generic ModelProvider / WorkerExecutor fixture，不宣称
  live endpoint 已验证；
- MCP 保持 deferred，直到出现真实的 remote control 或跨机器协调需求；
- CLI 是 operator surface，普通用户优先使用 Agent Plugin。

## Contributing

提交变更前至少运行：

```bash
npm test
npm run validate
npm run check:schemas
```

涉及 workspace、candidate、transaction、benchmark evaluator 或 release 的变更，
必须增加 failure-path 或 adversarial regression，不能只覆盖 happy path。

## Security

如果发现 secret 泄漏、path escape、权限绕过、candidate drift、错误 merge、
orphan process 或 release provenance 问题，请不要公开利用细节，优先通过 GitHub
Security Advisory 或私下渠道报告。

## License

[MIT](./LICENSE)

第三方依赖与许可证见
[`THIRD_PARTY_NOTICES`](./THIRD_PARTY_NOTICES)。
