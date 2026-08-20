# Apex Forge V2 Agent 插件化升级代码与计划复审

- 日期：2026-08-14
- 范围：当前 `v2` 源码、Agent 插件包、Product Gate、`planning/plugin-upgrade-plan.md`
- 方法：全量回归、Contract 校验、运行态 reconcile、源码审查、对抗性 benchmark、隔离 Host Patch 复现
- 审计状态：`BLOCKED_FOR_RELEASE`
- 置信度：高

## 1. 核心结论

插件化方向是成立的，这次升级也不是表面封装。当前仓库已经具备可工作的
durable Kernel、可安装的 Codex/Claude 插件形态、typed contracts、staged
verification 和较完整的回归测试。

但现有证据还不能支持计划中大范围的 `Complete`，更不能支持“已经可安全发布”。

当前有三个发布阻断项：

1. Interactive Host 对真实工作区的修改捕获不安全，可能持久化秘密、留下被拒绝的修改、漏掉二进制修改。
2. Verification、review、merge 没有绑定到同一个不可变 candidate。
3. Product Gate 是 fail-open 的，绝对完成率和安全性都为 0 的数据也可以被构造成 `PASS`。

当前发布姿态：

| 使用方式 | 结论 |
|---|---|
| 继续本地开发和受控 dogfood | 允许 |
| 使用 cognitive Host action 做规划、状态和分析 | 允许，但需人工审查 |
| 将 Interactive `workspace_patch` 作为安全默认能力发布 | 阻断 |
| 宣称 Claude HostAdapter 已完成 | 阻断 |
| 宣称 Plugin + Kernel 已优于 V1 | 阻断 |
| 公开市场或独立分发发布 | 阻断 |

## 2. 已验证基线

2026-08-14 本轮已验证：

| 检查项 | 结果 |
|---|---|
| 全量测试 | `127/127 PASS` |
| Strict project validation | PASS |
| Contract validation | 46 schemas、502 JSON、1226 contracts、0 errors |
| Project reconcile | `CONSISTENT`、673 events、0 active runs |
| 生产依赖审计 | 0 vulnerabilities |
| 已落盘 Codex/Claude 插件校验 | PASS |
| Comparative Product Gate | `BLOCKED`、9/90 runs |
| 现有审计分数 | 96.4/A，但不能解释为 release readiness |

测试全绿只能证明已覆盖的成功路径和失败路径工作，不能覆盖下面这些对抗性缺口。

## 3. P0 发布阻断

### P0-1：Interactive Host Patch 不满足工作区安全要求

证据：

- `src/commands/host.mjs:153-155` 把项目快照写入 `host-baseline.json`。
- `src/commands/host.mjs:334-359` 递归读取除四个硬编码目录外的所有文本文件，不遵循 `.gitignore`、secret patterns、`read_scope` 或 `write_scope`。
- `src/commands/host.mjs:300-314` 在越界修改和删除文件时先抛错，恢复逻辑尚未执行。
- `src/commands/host.mjs:336-339` 直接跳过含 NUL 的文件，二进制修改可以对 patch detector 不可见。
- `src/commands/host.mjs:245-259` 在 cancel 时恢复 claim 后观察到的所有变化，可能覆盖用户或其他进程的并发修改。

隔离临时项目复现：

```json
{
  "secretCaptured": true,
  "outsideRejected": true,
  "outsideResidual": true,
  "binarySubmitSucceeded": true,
  "binaryResidual": true,
  "deletionRejected": true,
  "deletionResidual": true
}
```

影响：

- `.env`、凭据、PII 或私有源码可能被明文复制到 `.apex-v2`。
- submit 虽然报错，用户真实文件仍可能被修改或删除。
- 不支持的 binary 或 symlink 修改可能绕过 governed patch bundle。
- cancel 可能覆盖不属于该 action 的并发用户修改。

必须修复：

1. 在该 Gate 关闭前，默认禁用 Interactive `workspace_patch`。
2. 用 action-owned overlay、scratch workspace 或 git worktree 替代整项目 live snapshot。
3. 如果继续保留 live-workspace capture，只能快照允许的 write scope，排除秘密和 ignored files，并用 `lstat`/`realpath` 检查文件类型与真实路径。
4. 按字节和文件类型记录变化，不能只处理 UTF-8 文本。
5. 把检测与恢复放入保证执行的 `finally` 路径。
6. 只恢复该 action 拥有、且当前 hash 仍符合预期的修改；发现并发变化时必须冲突升级，不能直接覆盖。
7. 同一 action 重复 claim 必须返回原 action 和不可变 baseline，不能生成新 action 覆盖原 baseline。

关闭条件：

- secret、out-of-scope、delete、binary、symlink、concurrent edit、repeated claim、submit crash、cancel crash 对抗测试全部通过。
- 任意 rejected 或 cancelled action 都不能留下 unowned workspace mutation。

### P0-2：Verification、review、merge 没有绑定同一不可变 candidate

证据：

- `src/commands/integration.mjs:289-297` 记录 verification 状态和 workspace metadata，但没有 candidate 内容摘要。
- `src/commands/integration.mjs:319-385` 在 verification 时读取当前 queue 和当前 patch 文件。
- `src/commands/integration.mjs:447-484` 只检查历史 verification report 是否为 PASS，没有证明它覆盖当前 queue 内容。
- `src/commands/integration.mjs:157-215` 只要求 review 节点已 passed，随后读取并应用当前 merge queue。
- `schemas/verification-report.schema.json:6-53` 和 `schemas/review-report.schema.json:6-16` 都没有 candidate binding。

影响：

Patch 可以在 verification 后被新增、替换、resolve、drop 或修改，而旧的
verification/review PASS 仍可复用。Merge 最终可能应用从未验证或评审过的代码。

必须修复：

引入唯一 canonical `candidate_digest`，至少绑定：

- base revision 与 dirty-tree fingerprint；
- 有序 patch IDs 与 patch 内容 hash；
- merge resolution hash；
- PlanGraph hash；
- verification policy 和 command hash；
- 相关 contract/schema version。

Verification 必须输出该 digest；review 必须绑定 verification digest；merge
必须在锁内重新计算并拒绝任何不一致。所有 candidate mutation 都必须自动失效
verify 和 review 节点。

关闭条件：

- verify 后 mutation、review 后 mutation、patch 文件替换、resolution 修改、queue reorder、base workspace drift 都会阻断 merge。

### P0-3：Product Gate 可以批准完成率和安全性均为 0 的产品

证据：

- `src/benchmark/plugin-benchmark.mjs:39-69` 只计算相对指标胜出和相对 safety regression。
- 没有绝对 completion、hidden acceptance、defect detection、false positive 或 safety 下限。
- 构造完整 90-run 对抗数据后，原 evaluator 返回：

```json
{
  "status": "PASS",
  "plugin_metrics_won": 5,
  "scenarios_passed": 6,
  "plugin_completion": 0,
  "plugin_safety": 0
}
```

- `.product-audit/plugin-direction-2026-08-14/audit.py:147-152` 把 `BLOCKED` Product Gate 仅降为一个 HIGH `WARN`。
- 最终报告仍得到 96.4/A，并显示无 CRITICAL blocker。

影响：

当前 Gate 和分数可以为不可用或不安全的产品背书，不能作为 release evidence。

必须修复：

1. 先设置绝对硬门槛，再计算相对优势：completion、hidden acceptance、safety、defect detection、false positive、durable closure、false completion claim。
2. 用 schema 校验 benchmark record 的唯一键、有限数值范围、预期 task membership 和 provenance。
3. 重复记录或额外记录必须拒绝，不能进入平均值。
4. 每条记录绑定 source commit、plugin/runtime digest、model/provider、环境、raw log 和 artifact hash。
5. `BLOCKED` 与 safety gate failure 必须 fail closed。
6. 增加唯一 release 命令，强制 tests、contracts、strict validate、plugin validate、lifecycle validate 和 Product Gate 依次通过。
7. Mandatory Product Gate 阻断时，不能继续展示容易被理解为发布就绪的 A 级分数。

## 4. P1 高优先级缺口

### P1-1：Host 与 Kernel 状态迁移不具备 crash-safe transaction

证据：

- Host claim/submit/cancel 分别写 action、baseline、result、artifact、worker、queue、event 和 ProjectState。
- `src/core/project-transaction.mjs:30-75` 把完整备份放在 `/tmp`，只在可捕获异常的 `catch` 中恢复。
- SIGKILL 可能留下 `started` journal、半应用状态、孤儿 lock 和泄漏的临时备份。
- enqueue、verification、review、approval 和多数 Host transition 没有进入统一 project transaction。

必须修复：

- Durable WAL，使用 `prepare -> commit/abort`。
- 启动时恢复所有 `started` transaction。
- 引入 project revision CAS、action lease、fencing token 和 idempotent transition key。
- 所有权威多文件迁移进入同一个 transaction boundary。

### P1-2：WorkerExecutor 合同弱于升级计划

证据：

- 计划要求 `inspect/execute/resume/cancel/collectUsage`。
- `src/contracts/worker-executor.mjs:5-17` 只强制 `inspect/execute`。
- Workspace patch 节点在 `src/core/plan-graph.mjs:87-103` 要求 `structured_output`、`workspace_write`、`tool_use`。
- Registry 已按 capability resolve，但当前 built-in executors 的声明和真实 conformance 没有证明完整计划合同。

必须修复：

- 把五个生命周期方法纳入 typed contract。
- 明确不同 execution class 下 capability 的必选、可选与降级语义。
- 对真实 built-in executors 跑共享 conformance，不能只验证 mock。
- 独立证明 process-tree cancellation、session resume 和 usage collection。

### P1-3：Cognitive evidence 仍可能只是 summary 形式的断言

证据：

- `schemas/host-result.schema.json:6-18` 允许空 `artifact_refs` 和无约束 summary。
- `src/commands/host.mjs:218-227` 会把该结果包装为 evidence artifact，并把 worker 标为 `evidence_submitted`。
- `src/apex-v2.mjs:1154-1223` 收集匹配 artifact/result 后可以通过 execute 节点。
- Audit E-401 只检查 cognitive node 是否不是 shell，不检查 semantic evidence 的质量。

必须修复：

- 为 context、risk、design、review 分别定义 typed cognitive evidence contract。
- 强制 source refs、claims、uncertainty、acceptance mapping 和角色特定字段。
- 增加 empty refs、generic summary、copied content、contradictory claims、unsupported completion claim 对抗测试。

### P1-4：Claude 插件形态存在，但 Claude Host 行为并未完成

证据：

- `scripts/build-codex-plugin.mjs:33-37` 把 Codex Skills 原样复制到 Claude package。
- Claude Skills 仍写 `current Codex session`，并使用 `codex-host`。
- Package test 明确断言 Claude Skills 与 Codex Skills 字节一致。

必须修复：

- 从 platform-neutral workflow source 生成两个插件包。
- 对 host identity、tool names、approval UX、plugin metadata、action ownership 应用薄 Host-specific overlay。
- 对打包后的 Claude Skills 增加禁止 Codex identity string 的测试。

### P1-5：插件生命周期和 provenance 证据不足

证据：

- Validator 只检查 `plugin list` 输出中是否包含插件名。
- Lifecycle test 只是把同一插件复制到两个版本目录，执行只读 status 后删除目录，没有调用原生 install/update/rollback/uninstall。
- `runtime.json` 只记录生成时间、entrypoint 和 schema directory。
- 插件目录没有 `LICENSE` 或 `THIRD_PARTY_NOTICES`。

必须修复：

- 校验 installed path、release version、runtime hash、schema hash 和 source commit。
- 用两个真实不同的 package，通过 Codex 和 Claude 原生 lifecycle command 测试 active run 与 schema migration。
- 分发包包含 checksums、SBOM/provenance、项目许可证和第三方 notices。

### P1-6：Reconcile 的一致性范围小于产品表达

证据：

- `src/core/reconcile.mjs:20-25` 主要比较 active runs、knowledge version、last event ID。
- `src/core/reconcile.mjs:94-141` 的 event replay 也只重建这些高层字段。
- Merge queue、patches、workers、approvals、transactions、verification、review 和 candidate lineage 都没有被重建。

必须修复：

- 为完整 candidate 和 merge lifecycle 定义 authoritative aggregates 与 replay projection。
- 在完整一致性尚未实现前，把当前结果改名为 `PROJECT_SUMMARY_CONSISTENT`。
- 为所有权威 aggregate 增加 integrity hash 和跨文件引用校验。

## 5. P2 加固项

| 缺口 | 证据 | 建议 |
|---|---|---|
| 空 lock 会一直等待到 timeout | `src/core/project-lock.mjs:43-74` | 增加 owner-write 原子性、lease/grace recovery、token 校验删除 |
| `extraPaths` 可越出项目根 | `src/core/project-transaction.mjs:105-130` | 执行 safe-relative 与 realpath containment 校验 |
| Event append 未 fsync | `src/core/store.mjs:26-49` | event fsync 后再提交 ProjectState，或把 state 改为 WAL projection |
| Core 直接引用具体 executor registry | `src/core/worker-execution.mjs:14-17` | 从 assembly layer 注入 `ExecutorResolver` port |
| 默认 benchmark 读取不存在的 `current.json` | `scripts/run-plugin-benchmark.mjs:13-17` | 使用受控 results manifest，禁止空输入覆盖已有 evaluation |
| 用测试总数替代覆盖证明 | audit script 与 report | 报告 behavior/gate coverage，而不是只报告测试数量 |

## 6. 升级计划状态纠偏

计划明确写了“Gate 未通过不得标记 Complete”，但当前状态表没有遵守自身规则。

建议状态：

| Phase | 当前标记 | 审计后状态 | 原因 |
|---|---|---|---|
| Phase 0 | Complete | `EVIDENCE_PENDING` | 目标用户和 commitment scope 仍为 provisional |
| Phase 1 | Complete | `IMPLEMENTED / BLOCKED` | 边界已实现，但 revision、transaction、candidate、recovery 保证未完成 |
| Phase 2 | Complete | `IMPLEMENTED / BLOCKED` | Host action 已实现，但 workspace safety 和 semantic evidence Gate 失败 |
| Phase 3 | Complete | `IMPLEMENTED / EVIDENCE_PENDING` | Codex package 可用，但自然语言首跑和真实原生 lifecycle 未证明 |
| Phase 4 | Complete | `PARTIAL / BLOCKED` | Factory contract 与十个 interruption points 证据不完整 |
| Phase 5 | Blocked on evidence | `BLOCKED` | 仅 9/90 runs，没有 superiority 结论 |
| Phase 6 | Complete for current scope | `PARTIAL / BLOCKED` | Claude package 仍由 Codex 内容复制，完整 executor conformance 未证明 |
| Phase 7 | Deferred | `DEFERRED` | 延后决策合理 |

状态词必须统一：

- `IMPLEMENTED`：代码路径已经存在。
- `EVIDENCE_PENDING`：成功标准缺少完整证据。
- `BLOCKED`：Mandatory Gate 未通过。
- `COMPLETE`：所有成功标准和 Gate 都有 durable evidence。

## 7. 建议升级顺序

### Wave A：安全冻结与 candidate 完整性

1. 默认禁用 Interactive workspace patch。
2. 实现 action-owned workspace isolation 和对抗性恢复测试。
3. 在 verify/review/merge 全链增加不可变 `candidate_digest`。
4. 为 Product Gate 增加绝对安全与完成率硬门槛，并改为 fail closed。

退出条件：全部 P0 对抗测试通过，任何未验证 candidate 都无法 merge。

### Wave B：Durable state machine

1. 增加 revision CAS、lease、fencing、durable WAL 和启动恢复。
2. 把 Host、queue、verification、review、approval、merge 迁移到事务化 state-machine command。
3. 扩展 event replay 和 reconcile，覆盖 candidate 与 merge aggregates。

退出条件：所有计划 interruption points 的 kill-process 测试都能恢复到唯一有效状态，且无泄漏 lock 或 backup。

### Wave C：真实 Cross-Agent contract

1. 完成 WorkerExecutor lifecycle 和 capability conformance。
2. 分离 shared workflows 与 Codex/Claude Host overlay。
3. 增加 typed cognitive evidence 和 semantic mutation tests。
4. 增加 build provenance、license notices 和真实原生 lifecycle tests。

退出条件：Codex 与 Claude 通过同一组 behavioral fixtures，同时保持正确 Host identity 和 Kernel semantics。

### Wave D：产品价值证明

1. 冻结 content-addressed release candidate。
2. 重新运行修正后的 review-defect 和 interruption pilots。
3. 完成五个仓库、90 条唯一且绑定 provenance 的运行记录。
4. 将 simple-task overhead 与 durable/recovery value 分开评价。
5. 只有绝对 Gate 和相对 superiority Gate 同时通过才允许发布。

退出条件：可复现数据集得到 Product Gate PASS，且没有 false completion claim。

## 8. 把 DSH 研发纪律真正落实到 Apex Forge

真正应借鉴的不是“进一步插件化”，而是让 Agent 研发通过明确 invariant 和 durable
evidence 持续收敛。

| DSH 式研发纪律 | Apex Forge 对应升级 |
|---|---|
| Claim 弱于 artifact | Phase 状态由 Gate artifact 推导，不能由计划文字宣告 |
| 每次转换都有稳定身份 | Candidate、runtime、benchmark、approval 都使用内容摘要 |
| Agent 在受控边界内工作 | Host patch 使用 action-owned isolated workspace |
| 失败路径是一等产品行为 | SIGKILL、stale lock、mutation、secret、symlink、partial write 都成为 release Gate |
| 平台 adapter 保持薄层 | Shared workflow 中立，Codex/Claude overlay 只负责 Host identity |
| Evaluation 必须抗投机 | Product Gate 校验 provenance、唯一性、绝对质量和对抗案例 |

最重要的架构纠偏是：

> Apex Forge 应机械性地让 false completion、unverified mutation 和 ambiguous
> ownership 难以发生，而不只是依赖 Skill 文本提醒 Agent 不要这样做。

## 9. 下一轮复审 Gate

下一次发布审计至少要求：

- P0 Host workspace adversarial matrix：PASS。
- Candidate mutation 与 TOCTOU matrix：PASS。
- Crash recovery 与 stale-lock matrix：PASS。
- WorkerExecutor real conformance：PASS。
- Codex 与 Claude packaged Host conformance：PASS。
- 两个真实版本的 native lifecycle matrix：PASS。
- 修正后 benchmark evaluator adversarial suite：PASS。
- Product benchmark：90/90 唯一有效记录，全部绝对 Gate PASS。
- Full suite、strict validate、contracts、reconcile、provenance、licenses、dependency audit：PASS。

在这些条件满足前，准确描述应为：

> Agent Plugin 架构已经实现，适合受控本地 dogfood；发布安全、跨 Host 行为和
> 产品优越性仍被 P0 修复与证据缺口阻断。
