# Module Map

## 项目类型

高风险 CLI tool / Agent orchestration platform。它会修改代码工作区、维护 durable state、执行外部 Agent，并控制 verification/review/merge。（source: `README.md`, `planning/plugin-upgrade-plan.md`）

## 目录结构与职责

```text
src/apex-v2.mjs               CLI entrypoint 与 command routing
src/cli/                      参数解析和帮助
src/commands/                 Host/run/worker/integration/project domain commands
src/core/                     Kernel state、contracts、policy、transaction、reconcile
src/contracts/                HostAdapter/WorkerExecutor/capability code contracts
src/hosts/                    HostAdapter implementations/registry
src/executors/                CLI 与 generic Agent executors
src/providers/                ModelProvider implementations
src/benchmark/                Task plans、三模式 controller、Agent runner、独立 evaluator、结果 provenance
src/benchmark/controller-coordinator.mjs  并发 claim/update/finish 的短锁事务
src/benchmark/environment.mjs      Benchmark Node/Bun/pnpm PATH 与 CI 环境
src/core/process-guard.mjs     orphan process 回收与资源边界
src/release/                  Content-addressed release candidate bundle
schemas/                      JSON Schema authority
plugins/                      Codex/Claude package outputs
scripts/                      Plugin build、validation、benchmark entrypoints
benchmarks/plugin-vs-v1/      五仓任务定义、环境证据、run records 与 Product Gate
tests/                        Node test specifications
.product-audit/               Product audit evidence
planning/                     Architecture and final upgrade plan
```

## 调用关系

```text
Plugin / CLI
  -> src/apex-v2.mjs
    -> src/commands/*
      -> src/core/*
        -> src/lib/common.mjs
        -> schemas/*

src/core/worker-execution.mjs
  -> src/executors/registry.mjs
    -> executors
      -> providers
```

禁止方向：

- Plugin/Host/Executor 不得写第二份 ProjectState。（source: `planning/plugin-upgrade-plan.md`）
- Provider-specific semantics 不得进入持久 Kernel contracts。（source: `src/contracts/`, `planning/plugin-upgrade-plan.md`）
- Worker 不得直接修改 `.apex-v2` authority。（source: `src/core/capability-sandbox.mjs`, `src/core/worker-execution.mjs`）

## 高频修改文件

仓库仅有三次主提交，最近三个月热点计数区分度较低；以下文件在最近两个功能提交中均出现。（source: `git log --since="3 months ago" --name-only`）

| 文件 | 最近三月提交出现次数 | 通常改动原因 |
|---|---:|---|
| `src/apex-v2.mjs` | 2 | CLI orchestration 与 command integration |
| `src/commands/integration.mjs` | 2 | verify/review/merge |
| `src/core/reconcile.mjs` | 2 | replay 与 consistency |
| `src/core/project-lock.mjs` | 2 | 并发写保护 |
| `src/core/plan-graph.mjs` | 2 | task-aware execution graph |
| `tests/apex-v2.test.mjs` | 2 | 端到端 CLI behavior |
| `tests/event-replay.test.mjs` | 2 | replay behavior |

## 高入度模块

| 模块 | 观察到的 import 次数 | 影响 |
|---|---:|---|
| `src/lib/common.mjs` | 33 个相对 import | 原子写、path safety、ID/time helpers |
| `src/core/store.mjs` | 17 个相对 import | event 与 ProjectState 更新 |
| `src/executors/registry.mjs` | 7 个相对 import | executor capability resolution |
| `src/core/run-state.mjs` | 9 个相对 import | run lifecycle |
| `src/core/artifacts.mjs` | 8 个相对 import | evidence authority |

统计来自 `rg` import target 汇总，Node built-ins 已排除解释。（source: `src/`, `tests/`）

## 任务→文件映射

| 要做什么 | 第一步看 | 相关文件 | 测试 |
|---|---|---|---|
| Host workspace isolation | `src/commands/host.mjs` | `schemas/host-action.schema.json`, `src/core/worker.mjs` | `tests/apex-v2.test.mjs` |
| Candidate digest | `src/core/candidate.mjs` | `src/commands/integration.mjs`, candidate/report schemas | `tests/candidate-integrity.test.mjs`, `tests/apex-v2.test.mjs` |
| WAL/CAS/lease | `src/core/project-transaction.mjs` | `project-lock.mjs`, `store.mjs`, ProjectState schema | `tests/project-transaction.test.mjs`, `tests/store-atomicity.test.mjs` |
| Full replay | `src/core/reconcile.mjs` | `event.schema.json`, state aggregates | `tests/event-replay.test.mjs` |
| Cognitive evidence | `src/commands/host.mjs` | host result/evidence schemas, PlanGraph | `tests/apex-v2.test.mjs` |
| WorkerExecutor lifecycle | `src/contracts/worker-executor.mjs` | `src/executors/`, registry | `tests/extension-boundaries.test.mjs`, `tests/provider-adapters.test.mjs` |
| Host overlay/package | `workflows/skills/` | `scripts/build-codex-plugin.mjs`, `plugins/` | `tests/plugin-package.test.mjs`, `tests/plugin-native-lifecycle.test.mjs` |
| Product Gate | `src/benchmark/plugin-benchmark.mjs` | task plans、controller、result evaluator、result provenance | `tests/benchmark-harness.test.mjs`, `tests/benchmark-controller.test.mjs`, `tests/benchmark-result-provenance.test.mjs` |
| Benchmark 并发与资源安全 | `src/benchmark/controller-coordinator.mjs` | `controller-state.mjs`, `process-guard.mjs`, `capability-runner.mjs` | `tests/benchmark-controller.test.mjs`, `tests/agent-sandbox.test.mjs` |
| Benchmark runtime 环境 | `src/benchmark/environment.mjs` | preflight、result evaluator、Codex runner | `tests/benchmark-codex-runner.test.mjs` |
| Release candidate | `src/release/candidate-bundle.mjs` | plugin build、matrix/task digest、provenance | `tests/release-candidate.test.mjs`, `tests/plugin-package.test.mjs` |

## 关键验证链

```text
npm test
npm run validate
npm run check:schemas
node src/apex-v2.mjs project reconcile --project . --dry-run
npm run build:plugin
npm run validate:plugins
npm run benchmark:validate-tasks
npm run benchmark:preflight
npm run release:candidate
npm run release:validate-candidate
```

Product Gate 只有在同一 candidate 的 90/90 official records 完成后才能判定；任务 preflight 和历史 pilot 都不能替代。（source: `planning/plugin-upgrade-plan.md`, `src/benchmark/plugin-benchmark.mjs`）
