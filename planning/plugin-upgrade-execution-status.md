# Apex Forge V2 插件化升级最终执行状态

## 2026-08-24 后续吞吐升级

`planning/throughput-architecture-v1.md` 的 P0 实现已完成并通过：

- Governed 三 Barrier；
- 默认 cheap/Luna subagent 路由；
- 有界持续补位 scheduler；
- worker execution lease/fencing 与 sibling failure isolation；
- 异步 Learning apply job/receipt；
- throughput architecture release gate；
- `npm test` 630/630 PASS。

本节不改写 2026-08-20 的历史发布证据。下方 90-run Product Benchmark 和 Release
Candidate 仍属于旧候选；本次版本需要在提交后重新冻结 Candidate，正式重跑后才能
声称真实 token 或 wall-time 改善。

后续 DSH 能力分批计划见：
`planning/dsh-capability-followup-plan-v1.md`。该计划明确把 Negative Control、
Decision、Postmortem、Review Learning、Simplification 和 Durable Team 与当前
吞吐架构、成本 Gate 及单一事实源边界对齐。

2026-08-25：R1 Shadow 已实现，包括 Shared Lifecycle、Bug Negative Control
record/Review/Merge Gate，以及 High/Critical Governed Decision proposal/read
path；完整回归 `637/637 PASS`。后续状态迁移和其余四项能力继续按分批计划推进。

- 日期：2026-08-20
- 计划：`planning/plugin-upgrade-plan.md`
- 总体状态：`COMPLETE`
- 发布状态：`RELEASE_GATES_PASS`
- Release version：`0.2.0-rc.1+codex.20260819173000`
- Release Candidate：`45c1d36d2ca1225725d97f93c33a68819845b756d7083ac14fa9ac82e1abc9c6`
- Task-set digest：`30591f062179be28924d20945d1457e68bddde98bd8bc93913e45cf4d5c20e6f`

## 最终结论

Apex Forge V2 插件化升级的 mandatory G0-G9 Gate 已全部通过。
G10 MCP 保持 `DEFERRED`，不属于首发必要条件。

最终发布证据：

- `263/263` tests PASS。
- 55 schemas、516 JSON files、1256 contracts、0 errors。
- strict validate PASS。
- reconcile `CONSISTENT`，688 events，0 issues，replay hash 等于 operational hash。
- production dependency audit：0 vulnerabilities。
- Codex/Claude Candidate validator PASS。
- Codex/Claude native install/update/rollback/uninstall lifecycle PASS。
- Release Candidate 连续两次 freeze digest 相同，303 source files，snapshot clean。
- Product benchmark：90/90 completed，三种 mode 各 30/30。
- Absolute Gate、relative Gate、durable-value Gate 全部 PASS。
- `release:verify` 16/16 steps PASS。

## Work Packages

| Work Package | 状态 | 最终证据 |
|---|---|---|
| A0-A3 Safety/Candidate/Evaluator | `COMPLETE` | ActionWorkspace、immutable candidate、fail-closed evaluator、hidden acceptance PASS |
| B1-B4 Durable Kernel | `COMPLETE` | WAL、CAS、lease/fencing、recovery、replay、reconcile PASS |
| C1-C3 Semantic Execution | `COMPLETE` | typed cognitive evidence、WorkerExecutor、Execution Router PASS |
| D1 Shared Workflow | `COMPLETE` | shared workflow + Codex/Claude Host overlays PASS |
| D2-D3 Lifecycle/Provenance | `COMPLETE` | Candidate validators、SBOM、license、checksums、native lifecycle PASS |
| E1 Release Candidate | `COMPLETE` | `45c1d36d...abc9c6` 双重冻结与 current-source/bundle validation PASS |
| E2 Benchmark Matrix | `COMPLETE` | 90/90 official runs，V1/CLI/Plugin 各 30 |
| E3 Value Evaluation | `COMPLETE` | absolute/relative/simple-overhead/durable-value PASS |
| F1-F3 Release/Governance | `COMPLETE` | 16-step `release:verify` PASS |
| G MCP | `DEFERRED` | 非首发 Gate，继续遵守触发条件 |

## Gate Status

| Gate | 状态 | 说明 |
|---|---|---|
| G0 Baseline | `PASS` | 263 tests、55 schemas、1256 contracts、strict、reconcile、audit |
| G1 Host Workspace Safety | `PASS` | secret/binary/symlink/delete/concurrency/orphan 对抗矩阵 |
| G2 Candidate Integrity | `PASS` | content-addressed candidate、mutation/TOCTOU/CAS |
| G3 Product Evaluator Safety | `PASS` | provenance、唯一性、hidden acceptance、fail-closed |
| G4 Durable Kernel | `PASS` | WAL、revision CAS、lease/fencing、crash recovery、replay |
| G5 Semantic Execution | `PASS` | typed evidence、executor lifecycle、capability routing |
| G6 Plugin UX | `PASS` | natural-language workflow、quick/full route、durable closeout |
| G7 Lifecycle/Provenance | `PASS` | validators、native lifecycle、SBOM、license、checksums |
| G8 Portability | `PASS_WITH_DECLARED_SCOPE` | Codex/Claude Host；Codex/Claude/Gemini executor；DeepSeek generic provider fixture |
| G9 Product | `PASS` | 90/90、absolute/relative/durable-value Gate |
| G10 MCP | `DEFERRED` | 非首发必要条件 |

## 验证中关闭的关键缺口

- deleted-open SeekDB 日志事故：typed acceptance、进程树回收、磁盘/输出/workspace 熔断。
- process guard 性能：逐 PID `ps eww` 改为单次环境快照。
- parallel controller：max workers 硬限制 3、CAS/lease/fencing、失败立即终止全池。
- lease 误回收：默认 lease 覆盖模型 timeout 加 90 分钟 closeout grace。
- typed acceptance：存在结构化 commands 时不再从 description 按分号误拆 shell。
- telemetry：Codex durable rollout `token_count` 作为 session-bound usage evidence。
- workspace churn：资源扫描忽略并发删除导致的 `ENOENT`，其他 I/O 错误继续 fail-closed。
- Release Gate：Candidate-root Codex/Claude validators 与每步 30 分钟总超时。

## Product Gate 结果

- Plugin completion：1.0。
- Plugin recovery：1.0。
- Plugin safety：1.0。
- Plugin hidden acceptance：1.0。
- Plugin defect detection：1.0。
- Plugin false positive：0。
- Plugin durable closure：1.0。
- Plugin evidence：1.0，高于 V1 的 0.7333。
- Simple overhead ratio：-0.1601，PASS。
- Interrupted、review-defect、parallel durable-value：全部 PASS。

非阻断代价：

- multi-step、interrupted、review-defect、parallel 的 wall time 与 token cost 高于 V1。
- Plugin 的核心质量、证据和 durability 达标，但复杂任务仍需继续优化成本与时延。
- DeepSeek 只有 generic ModelProvider/WorkerExecutor fixture conformance，没有 live endpoint evidence。

## Evidence

- `.apex-v2/releases/latest-candidate.json`
- `.apex-v2/releases/latest-verification.json`
- `benchmarks/plugin-vs-v1/results-manifest.json`
- `benchmarks/plugin-vs-v1/latest-evaluation.json`
- `.apex-v2/releases/evidence/45c1d36d2ca1225725d97f93c33a68819845b756d7083ac14fa9ac82e1abc9c6/FINAL_ACCEPTANCE_AUDIT.md`
