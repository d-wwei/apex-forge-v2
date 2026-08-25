# Apex Forge V2

Apex Forge V2 是 Node.js ESM 实现的 CLI/Agent orchestration platform，以 `.apex-v2/` durable Kernel、Agent Plugin 和 capability-based WorkerExecutor 组织软件研发流程。（source: `README.md`, `package.json`）

## Module Map（简版）

- `src/commands/`：CLI domain commands，协调 Host、run、worker、integration 和 project workspace。（source: `src/apex-v2.mjs`）
- `src/core/`：ProjectState、PlanGraph、contracts、transactions、reconcile、governance 和 execution runtime。（source: `src/core/`）
- `src/contracts/`、`schemas/`：Host/Executor capability 与持久对象 JSON Schema。（source: `src/contracts/`, `schemas/`）
- `src/hosts/`、`src/executors/`、`src/providers/`：HostAdapter、WorkerExecutor、ModelProvider 边界。（source: `src/hosts/`, `src/executors/`, `src/providers/`）
- `src/benchmark/`、`benchmarks/plugin-vs-v1/`：三模式 Product benchmark、任务定义、独立裁判和 durable controller。（source: `src/benchmark/`, `benchmarks/plugin-vs-v1/`）
- `src/benchmark/environment.mjs`：正式 benchmark 的确定性 Node/Bun/pnpm PATH 与 CI 环境。（source: `src/benchmark/environment.mjs`）
- `src/core/process-guard.mjs`：managed process 的 orphan 回收、磁盘/工作区/输出熔断。（source: `src/core/process-guard.mjs`, `src/core/capability-runner.mjs`）
- `src/benchmark/controller-coordinator.mjs`：benchmark controller 的 lock、revision CAS、lease 和 fencing 短事务。（source: `src/benchmark/controller-coordinator.mjs`）
- `src/release/`：content-addressed release candidate freeze、source provenance 与 bundle verification。（source: `src/release/candidate-bundle.mjs`）
- `plugins/`：Codex 与 Claude Code 分发包。（source: `plugins/`）
- `tests/`：Node test 回归、对抗测试、benchmark controller 与 native lifecycle 入口。（source: `package.json`, `tests/`）

调用方向：CLI/Plugin → commands → core/contracts → store/filesystem；Host/Executor/Provider 不得反向拥有 Kernel state。（source: `planning/plugin-upgrade-plan.md`）

## Must-Know Rules

1. `.apex-v2` 是唯一权威状态源；Plugin、Skill、HostAdapter、WorkerExecutor 不能拥有第二份 ProjectState。（source: `planning/plugin-upgrade-plan.md`）
2. `writeJson()` 是持久 JSON 的原子写入口；直接 `writeFileSync(JSON.stringify(...))` 会绕过 contract validator 和 fsync。（source: `src/lib/common.mjs:39`, `src/core/contracts.mjs`）
3. Patch path 必须先过 `assertSafeRelativePath()` 和 scope 校验，否则可越出项目或污染非目标文件。（source: `src/lib/common.mjs:93`, `src/core/worker.mjs:156`）
4. Verification、review、approval、merge 必须绑定同一 `candidate_digest`；任一 patch、resolution、policy 或 source 变化都会让旧证据失效。（source: `src/core/candidate.mjs`, `src/commands/integration.mjs`）
5. Interactive patch 只能在 action-owned ActionWorkspace 中进行；项目根修改、secret、binary、symlink、delete 和越界变化全部 fail closed。（source: `src/core/action-workspace.mjs`, `src/commands/host.mjs`）
6. Cognitive evidence 除 schema 外还要通过 copied/generic/contradictory claim 与 acceptance mapping 语义 Gate。（source: `src/core/cognitive-evidence.mjs`, `src/commands/host.mjs`）
7. 正式 benchmark 的 hidden checks 不得进入 Agent workspace；90 个 run 必须绑定同一 release candidate、task digest、model/provider 和稳定环境指纹。（source: `src/benchmark/controller-state.mjs`, `src/benchmark/plugin-benchmark.mjs`）
8. Event ID 与 timestamp 必须在 project lock 内生成，timestamp 严格晚于 ProjectState 的上一更新时间；否则并发写入可使落盘日志时间逆序并让 reconcile `INVALID`。（source: `src/core/store.mjs`, `tests/store-atomicity.test.mjs`）
9. Reconcile 必须先把已全部处理 carry 的历史 `partial_pass` 源节点提升为 `passed`；不得把旧 `done` run 重新加入 `active_runs`。（source: `src/core/reconcile.mjs`, `src/core/run-state.mjs`, `tests/apex-v2.test.mjs`）
10. Managed process 正常退出、超时或父进程消失后都必须回收新产生的 daemon；发现 orphan 时 verification 必须 FAIL，不能静默清理后 PASS。（source: `src/core/process-guard.mjs`, `src/core/capability-sandbox.mjs`, `tests/agent-sandbox.test.mjs`）
11. 正式 benchmark 并发只能通过 controller lock + revision CAS + lease/fencing；同一 repository 保持串行，跨 repository 最多 3 个正式 worker。（source: `src/benchmark/controller-coordinator.mjs`, `scripts/product-benchmark-controller.mjs`）
12. Factory scheduler 使用独立 scheduler lock；每个 Agent worker 在运行前取得 execution lease/fencing，陈旧结果不得覆盖新状态。（source: `src/core/scheduler-lock.mjs`, `src/core/worker.mjs`, `src/apex-v2.mjs`）
13. Learning proposal 与 apply job 入队即可关闭 delivery；知识写回必须由独立 job 产生 receipt，且不重新打开已完成 run。（source: `src/apex-v2.mjs`, `src/core/run-state.mjs`, `schemas/learning-apply-*.schema.json`）
14. Bug/Test Failure 的 Negative Control record 默认 shadow；enforce 时 Review 与 Merge 均 fail closed。High/Critical Governed 计划只自动生成 proposed Decision Note，不自动接受或实施。（source: `src/core/negative-control.mjs`, `src/core/decision-notes.mjs`, `src/commands/integration.mjs`）

## Testing

- 全量：`npm test`，当前稳定基线 `637/637 PASS`。（source: `package.json`, `.better-work/shared/progress.md`）
- 吞吐架构：`npm run benchmark:throughput`，当前 `11/11 PASS`。（source: `package.json`, `tests/project-agent-scheduler.test.mjs`, `tests/throughput-benchmark.test.mjs`）
- Contract：`npm run check:schemas`。（source: `package.json`）
- Strict state：`npm run validate`。（source: `package.json`）
- Plugin build/validate：`npm run build:plugin && npm run validate:plugins`。（source: `package.json`）
- Candidate：`npm run release:candidate && npm run release:validate-candidate`。（source: `package.json`）
- Benchmark inputs：`npm run benchmark:validate-tasks && npm run benchmark:preflight`。（source: `package.json`）
- Reconcile：`node src/apex-v2.mjs project reconcile --project . --dry-run`。（source: `README.md`）

## Danger Zones (top 5)

- `src/commands/host.mjs`：直接影响用户工作区、Host action 所有权和 patch capture。
- `src/commands/integration.mjs`：verification/review/merge candidate 一致性边界。
- `src/core/project-transaction.mjs`：崩溃恢复、回滚和项目外路径风险。
- `src/core/store.mjs`：event log 与 ProjectState 持久化顺序。
- `src/core/contracts.mjs`：所有持久 JSON 的 contract authority。

## Gotchas

- Full tests 不能替代 90-run Product Gate；正式进度与阻断结论只读取动态执行状态。（source: `planning/plugin-upgrade-execution-status.md`）
- `.apex-v2/releases/` 是 immutable bundle，由 release candidate validator 管理，不属于 runtime contract scan。（source: `src/release/candidate-bundle.mjs`, `src/core/contracts.mjs`）
- DeepSeek 当前只有 ModelProvider/generic WorkerExecutor fixture conformance；没有 live provider evidence 时不得写成 live PASS。（source: `src/providers/`, `tests/provider-adapters.test.mjs`）

## Quick Locate

| 要做什么 | 第一步看 |
|---|---|
| 修改 Host claim/submit/cancel | `src/commands/host.mjs`, `src/core/action-workspace.mjs`, `tests/action-workspace.test.mjs` |
| 修改 verification/review/merge | `src/commands/integration.mjs`, `src/core/candidate.mjs`, `tests/candidate-integrity.test.mjs` |
| 修改持久事务或锁 | `src/core/project-transaction.mjs`, `src/core/project-lock.mjs`, `tests/project-transaction.test.mjs` |
| 修改 schema/contract | `schemas/`, `src/core/contracts.mjs`, `tests/contract-authority.test.mjs` |
| 修改 WorkerExecutor | `src/contracts/worker-executor.mjs`, `src/executors/`, `tests/extension-boundaries.test.mjs` |
| 修改 Factory scheduler / worker lease | `src/apex-v2.mjs`, `src/core/scheduler-lock.mjs`, `src/core/worker.mjs`, `tests/project-agent-scheduler.test.mjs` |
| 修改异步 Learning | `src/apex-v2.mjs`, `src/core/run-state.mjs`, `src/core/operational-state.mjs`, `schemas/learning-apply-*.schema.json` |
| 修改 DSH lifecycle R1 | `src/core/lifecycle.mjs`, `src/core/negative-control.mjs`, `src/core/decision-notes.mjs`, `src/commands/dsh-lifecycle.mjs` |
| 修改 Product Gate | `src/benchmark/plugin-benchmark.mjs`, `src/benchmark/result-provenance.mjs`, `tests/benchmark-harness.test.mjs`, `tests/benchmark-result-provenance.test.mjs` |
| 修改 benchmark 任务或 controller | `benchmarks/plugin-vs-v1/tasks/`, `src/benchmark/controller-state.mjs`, `scripts/product-benchmark-controller.mjs` |
| 修改 release candidate | `src/release/candidate-bundle.mjs`, `scripts/freeze-release-candidate.mjs`, `tests/release-candidate.test.mjs` |
| 修改插件打包 | `scripts/build-codex-plugin.mjs`, `workflows/skills/`, `tests/plugin-package.test.mjs`, `tests/plugin-native-lifecycle.test.mjs` |

## Deep Docs

- 完整模块地图：@.better-work/shared/map.md
- 编码约定：@.better-work/code/conventions.md
- 危险区域详解：@.better-work/code/danger-zones.md
- 任务进度：@.better-work/shared/progress.md
