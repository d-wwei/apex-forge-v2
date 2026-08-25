# Danger Zones

## `src/commands/host.mjs`

- **入度**：由 CLI entrypoint 调用，并连接 worker、artifact、integration、store、contracts。（source: `src/commands/host.mjs`）
- **影响范围**：用户主工作区、Host action、patch bundle、merge queue、secret 边界。
- **为什么危险**：错误恢复会删除或覆盖用户文件；全项目 snapshot 会持久化秘密；漏检 binary/symlink 会绕过 scope。
- **改之前做**：`rg -n "claimHostAction|submitHostResult|cancelHostAction|host-baseline|snapshotProjectWorkspace" src tests schemas`
- **必跑检查**：`node --test tests/apex-v2.test.mjs`
- **历史证据**：隔离复现曾得到 secret captured、out-of-scope residual、binary residual、deletion residual。（source: `.product-audit/plugin-direction-2026-08-14/CODE_AND_PLAN_REAUDIT.md`）

## `src/commands/integration.mjs`

- **入度**：Host/worker patch queue、verification、review、approval 和 merge 的集中入口。（source: `src/commands/integration.mjs`）
- **影响范围**：候选代码是否真正经过同一轮验证、评审与批准。
- **为什么危险**：未绑定 candidate digest 时，旧 PASS 可被新 patch 内容复用。
- **改之前做**：`rg -n "runVerificationInternal|generateReviewInternal|applyMergeInternal|readMergeQueue|findPatch" src tests schemas`
- **必跑检查**：`node --test tests/apex-v2.test.mjs tests/approval-v1.test.mjs`
- **历史证据**：早期审计曾发现 verification/review schemas 不包含 candidate binding。（source: `.product-audit/plugin-direction-2026-08-14/CODE_AND_PLAN_REAUDIT.md`）

## `src/core/project-transaction.mjs` 与 `src/core/project-lock.mjs`

- **入度**：run create、merge apply 和并发 state writers 依赖该边界。（source: `src/core/project-transaction.mjs`, `src/core/project-lock.mjs`）
- **影响范围**：崩溃恢复、幂等、项目源码回滚、stale lock。
- **为什么危险**：SIGKILL 不经过 catch；临时备份和空 lock 可能残留；`extraPaths` 若未校验可越出项目根。
- **改之前做**：`rg -n "withProjectTransaction|withProjectLock|extraPaths|APEX_V2_TRANSACTION_FAILPOINT" src tests`
- **必跑检查**：`node --test tests/project-transaction.test.mjs tests/store-atomicity.test.mjs tests/concurrent-worker.test.mjs`
- **历史证据**：当前恢复只覆盖可捕获异常。（source: `src/core/project-transaction.mjs`）

## `src/core/store.mjs` 与 `src/core/reconcile.mjs`

- **入度**：commands/core 广泛调用 `appendEvent()` 和 `updateProject()`；reconcile 是一致性对外结论。（source: import scan, `src/core/store.mjs`, `src/core/reconcile.mjs`）
- **影响范围**：event durability、last_event_id、replay、ProjectState consistency。
- **为什么危险**：event append 与 ProjectState 必须共享锁内顺序；timestamp 若在入锁前生成，并发进程可按相反顺序落盘并让 reconcile `INVALID`。历史 handled carry 若未先规范化，还会把已完成 run 错误重新激活。
- **改之前做**：`rg -n "appendEvent|nextEventTimestamp|updateProject|replayProjectStateFromEvents|inspectProjectConsistency|non-monotonic-event-time" src tests`
- **必跑检查**：`node --test tests/event-replay.test.mjs tests/store-atomicity.test.mjs`
- **历史证据**：正式 CLI benchmark 曾复现逆序 event timestamp；历史 dogfood run 也曾因 accepted carry 的源节点保留 `partial_pass` 而产生 reconcile `DRIFT`。两类问题均有回归覆盖。（source: `src/core/store.mjs`, `src/core/reconcile.mjs`, `tests/store-atomicity.test.mjs`, `tests/apex-v2.test.mjs`）

## `src/core/contracts.mjs`、`schemas/` 与 `src/lib/common.mjs`

- **入度**：`common.mjs` 是最高相对 import 热点；contracts 控制所有权威 JSON。（source: import scan）
- **影响范围**：所有持久对象、migration、write gate、runtime/plugin schema bundle。
- **为什么危险**：schema 与 migration 漂移会使旧状态不可读，或让无效 authority 绕过写入 Gate。
- **改之前做**：`rg -n "validateContract|validatePersistedValue|registerJsonWriteValidator|schema_version" src schemas tests`
- **必跑检查**：`npm run check:schemas && node --test tests/contract-authority.test.mjs tests/project-audit-integrity.test.mjs`
- **历史证据**：Plugin runtime schemas 由 build 复制，源码与分发包必须同步验证。（source: `scripts/build-codex-plugin.mjs`）

## `src/core/scheduler-lock.mjs`、`src/core/worker.mjs` 与 Factory scheduler

- **影响范围**：并发槽位、重复执行、worker lease、fencing、局部重试和孤儿恢复。
- **为什么危险**：缺少原子 claim 会让两个 tick 同时执行同一 worker；陈旧失败结果可能覆盖已成功状态；无上限 refill 会放大 token 成本。
- **改之前做**：`rg -n "runProjectAgentScheduler|claimWorkerExecution|recoverExpiredWorkerExecutions|recordSupervisorFailure" src tests`
- **必跑检查**：`npm run benchmark:throughput && node --test tests/concurrent-worker.test.mjs tests/worker-supervisor.test.mjs`

## Learning Queue 与 Run Closure

- **影响范围**：delivery 是否可关闭、knowledge version、apply 幂等、receipt 和 event replay。
- **为什么危险**：把 knowledge apply 放在交付热路径会阻塞完成；先标记 applied 再写知识会制造假完成；缺少 receipt 会让 reconcile 无法验证。
- **改之前做**：`rg -n "learning.proposed|learning.applied|run.closed|processLearningJobs|recordRunClosure" src tests schemas`
- **必跑检查**：`node --test --test-name-pattern='project tick --learn|learn propose/approve/apply' tests/apex-v2.test.mjs && node --test tests/event-replay.test.mjs tests/operational-state.test.mjs`

## DSH Lifecycle R1

- **影响范围**：Bug Review/Ship、Decision proposal、Event 顺序、Artifact hash 和 operational state。
- **为什么危险**：Shadow/Enforce 读取错误会让缺失 Negative Control 静默通过或错误阻断；Decision Artifact 漂移会破坏审计。
- **改之前做**：`rg -n "Negative Control|decision\\.proposed|dsh_lifecycle|inspectNegativeControlGate" src tests schemas`
- **必跑检查**：`node --test --test-name-pattern='Decision Note proposal|Bug Negative Control shadow' tests/apex-v2.test.mjs && node --test tests/dsh-lifecycle.test.mjs tests/operational-state.test.mjs`

## `src/benchmark/`、`scripts/product-benchmark-controller.mjs`

- **入度**：Product Gate、release verify 和 90-run official records 依赖该边界。（source: `src/benchmark/`, `scripts/product-benchmark-controller.mjs`）
- **影响范围**：任务公平性、hidden acceptance、恢复证据、成本和产品胜出结论。
- **为什么危险**：任务 no-op、hidden 泄漏、重复 attempt、环境漂移、Candidate 错绑或未复验 artifact 都会制造伪 PASS；无 lock/lease 的多 controller 会重复领取或覆盖状态。
- **改之前做**：`rg -n "task_digest|environment_fingerprint|hidden_checks|simple_overhead|durable_value|artifact_refs|result_sha256" src/benchmark scripts tests schemas`
- **必跑检查**：`node --test tests/benchmark-*.test.mjs && npm run benchmark:validate-tasks`
- **历史证据**：除 task/preflight 裁判缺口外，2026-08-17 CLI benchmark 回退到全量 `npm test`，启动 Agent Recall detached worker/MCP/SeekDB，deleted-open 日志增长至约 447 GiB。现要求 typed acceptance、orphan fail-closed、磁盘熔断和并发 lease/fencing。（source: `src/core/process-guard.mjs`, `src/benchmark/controller-coordinator.mjs`, `planning/plugin-upgrade-execution-status.md`）

## `src/release/candidate-bundle.mjs` 与 `scripts/release-verify.mjs`

- **入度**：E1 candidate freeze、native lifecycle、Product Gate 和最终 release 依赖该边界。（source: `src/release/candidate-bundle.mjs`, `scripts/release-verify.mjs`）
- **影响范围**：源码身份、插件 provenance、SBOM/license、benchmark 是否绑定同一产品。
- **为什么危险**：非确定时间、本地路径、生成 evidence 或 build 自身输出进入 source hash 会让 candidate 不可复现。
- **改之前做**：`rg -n "release_candidate_digest|source_manifest_sha256|APEX_BUILD_TIMESTAMP|portableBenchmarkMatrixHash" src scripts tests`
- **必跑检查**：`node --test tests/release-candidate.test.mjs tests/plugin-package.test.mjs tests/plugin-native-lifecycle.test.mjs`
- **历史证据**：首次 freeze 因 `node_modules` symlink 被 Git 识别为 dirty 而 fail closed。（source: `src/release/candidate-bundle.mjs`）

## `src/core/cognitive-evidence.mjs` 与 `src/commands/host.mjs`

- **入度**：所有 Interactive cognitive Host action 在持久化前经过该 Gate。（source: `src/commands/host.mjs`）
- **影响范围**：context、risk、design、review 能否被 generic/copy/contradictory claim 冒充。
- **为什么危险**：只过 JSON Schema 仍可能提交复制 objective、冲突验收状态或带 P0 finding 的 approve review。
- **改之前做**：`rg -n "assertCognitiveEvidenceSemantics|acceptance_mapping|merge_posture" src tests schemas`
- **必跑检查**：`node --test tests/cognitive-evidence.test.mjs && node --test --test-name-pattern='cognitive Host action' tests/apex-v2.test.mjs`
- **历史证据**：原实现只拒绝 summary-only 与空 refs，未检查 semantic contradiction。（source: `planning/plugin-upgrade-execution-status.md`）
