# Apex Forge V2 DSH 启发能力闭环升级计划
- 日期：2026-08-21
- 状态：`PROPOSED_FOR_IMPLEMENTATION`
- 范围：Apex Forge V2 durable Kernel、CLI、Codex/Claude Plugin shared workflow
- 目标：关闭 6 个已确认能力缺口
- 发布立场：工程实现不等于发布通过；mandatory Gate 未闭合时保持 `BLOCKED`
- 证据边界：DeepSeek Harness 审计仅作为静态设计参考，不运行外部仓代码
- 来源边界：不依赖、不复制、不兼容 DSH `private` / `experimental` Agent Teams
## 1. 执行摘要
本计划关闭：
1. Decision Note 完整生命周期。
2. Postmortem -> Gate 自动路由。
3. 定期 Simplification Queue。
4. Durable Agent Team roster / mailbox。
5. 已采纳人工 Review -> 规则候选。
6. Bug 强制 Negative Control。
统一处理链：
```text
CLI / Plugin intent
  -> typed Kernel command
  -> policy / capability / approval check
  -> project transaction
  -> authoritative Event
  -> immutable Artifact
  -> rebuildable projection
  -> reconcile / gate / notification
```
核心约束：
- `Event` 记录生命周期迁移和因果关系。
- `Artifact` 保存不可变正文、证据和内容 hash。
- `ProjectState` 只保存项目根 revision 和投影摘要。
- `PlanGraph` 是唯一任务 DAG。
- `Worker` 是唯一执行身份、lease、fencing 和 attempt。
- `Approval` 是唯一人工授权记录。
- `Risk` 是唯一未闭合风险登记。
- `Learning` 是唯一规则候选入口。
- `HostAdapter` 只做 Host identity、原生 UX 和能力映射。
- `WorkerExecutor` 只执行任务，不拥有 Project、Team 或 Gate 状态。
## 2. 现状与缺口
### 2.1 可复用基础
| 对象 | 当前能力 | 本计划复用 |
|---|---|---|
| `ProjectState` | revision、active runs、knowledge、last event | 增加 projection 摘要，不塞完整领域对象 |
| `Event` | durable append、actor、payload | 升级 typed envelope、aggregate、causation、idempotency |
| `Artifact` | run/node/type/body/refs | 保存 Decision、Postmortem、Message、控制证据 |
| `PlanGraph` | DAG、lane、scope、evidence、risk | Team assignment 与 Negative Control 引用 node |
| `Worker` | executor、scope、lease、fencing、attempt | roster 成员绑定 Worker，不复制执行状态 |
| `Approval` | capability、hash、policy revision、TTL | 扩展 decision/rule/team/simplification 权限 |
| `Risk` | verification/review/conflict/smoke 风险 | 接入 incident、waiver、authority 风险 |
| `Learning` | proposal、evidence、approval、apply | 统一 Review/Postmortem 到规则候选 |
| `Transaction` | WAL、幂等、恢复 | 包裹所有新增状态迁移 |
| `Reconcile` | Event/状态一致性 | 覆盖六类新增 projection |
### 2.2 缺口表
| ID | 能力 | 当前状态 | 缺口 | 关闭标准 |
|---|---|---|---|---|
| GAP-01 | Decision Note | 有 `decision` Artifact/Worker 输出 | 无 typed lifecycle、supersession、接受与实现绑定 | 状态、权限、归档、replay、UX 完整 |
| GAP-02 | Postmortem -> Gate | 有 Risk/Learning/Gate Policy | 无 incident contract、路由和 verified closure | 每个有效事故有 control 或获批例外 |
| GAP-03 | Simplification | 有 Method Pack/成本原则 | 无周期扫描、typed queue、收益验证 | 定期发现、人工分流、最小删除、回归通过 |
| GAP-04 | Durable Team | 有 PlanGraph/Worker/lease/fencing | 无 roster、mailbox、ack、resume、角色权限 | 重启后可重建，不丢、不重、不越权 |
| GAP-05 | Review -> Rule | 有 Review Report/Learning Proposal | finding 是字符串，无法证明人工且已采纳 | 只从 adopted human finding 生成候选 |
| GAP-06 | Negative Control | 有失败路径要求 | Bug 可只跑 green，不能证明 guard 有效 | Bug 必须有匹配的 RED/GREEN 或有效 waiver |
### 2.3 当前 contract 限制
- `event.schema.json` 的 payload 未按事件族验证。
- `stored-artifact.schema.json` 只有粗粒度 type，不表达生命周期。
- `decision-queue.schema.json` 是 Worker 输出收集，不是 Decision Note 状态。
- `review-report.schema.json` 缺 finding identity、author、adoption、candidate lineage。
- `learning-proposal.schema.json` 缺规则类型、范围、冲突、promotion Gate。
- `risk-register.schema.json` 缺 postmortem、waiver、simplification debt 来源。
- `ProjectState` 若直接加入完整对象数组，会形成镜像状态与写冲突。
## 3. 目标与非目标
### 3.1 目标
- 六项能力都有 JSON Schema 2020-12 typed contract。
- 每项能力都有合法/非法状态迁移测试。
- 所有写操作经过 transaction、revision CAS、idempotency 和 Event。
- 所有高权力动作复用 Approval capability。
- CLI 与 Plugin 调用同一 Kernel operation。
- projection 可从 Event 与 Artifact 重建。
- Reconcile 和 Release Gate 能验证关闭声明。
- 按 Method Pack、风险和真实需要触发，控制治理成本。
- 保持 HostAdapter、WorkerExecutor 平台中立。
### 3.2 非目标
- 不创建第二 ProjectState、第二 Event Log、第二 Task DAG 或第二 Worker 状态机。
- 不创建通用聊天系统或依赖外部消息中间件。
- 不允许 mailbox 绕过 PlanGraph、scope、lease、Approval 或 Gate。
- 不自动接受 Decision、规则、删除建议、Postmortem 结论或 Risk。
- 不要求每个小改动写 Decision Note/Postmortem。
- 不把每个 warning 升级为 blocking Gate。
- 不以规则数、文档数、队列长度或 Agent 数作为成功指标。
- 不把未来 MCP 服务设为前置依赖。
## 4. 统一架构与唯一事实源
### 4.1 Canonical layout
```text
.apex-v2/events.jsonl
  authoritative lifecycle transitions
.apex-v2/artifacts/<run_id>/<artifact_id>.json
  immutable content and evidence
.apex-v2/project.json
  root projection
.apex-v2/decisions/index.json
.apex-v2/postmortems/index.json
.apex-v2/simplification/queue.json
.apex-v2/teams/<team_run_id>/roster.json
.apex-v2/teams/<team_run_id>/mailbox.json
.apex-v2/learning/proposals.json
  rebuildable projections
```
每个 projection 必须有：
```text
projection_revision
projection_hash
last_event_id
```
规则：
- projection 不是独立权威来源。
- projection 损坏可重建；Event/Artifact 损坏则 fail closed。
- CLI/Plugin 禁止直接写 projection。
- Event 保存迁移、hash、refs；正文放 Artifact。
- Artifact 内容不可原地改写；修订创建新 Artifact 并建立 supersession。
### 4.2 Typed command
```text
command_id, command_type, project_revision, actor, host_id,
capabilities, idempotency_key, aggregate_type, aggregate_id,
expected_state, payload
```
固定处理顺序：
1. schema validate。
2. actor/Host identity resolve。
3. capability check。
4. expected state check。
5. project revision CAS。
6. transaction prepare。
7. Artifact write。
8. Event append。
9. projection update。
10. transaction commit。
11. notification enqueue。
### 4.3 Typed Event envelope
```text
schema_version, event_id, sequence, type, timestamp,
actor{actor_id, actor_type}, project_id, run_id,
aggregate_type, aggregate_id, causation_id, correlation_id,
idempotency_key, payload_schema, payload
```
兼容策略：
- v0 Event 保持只读，不改写历史。
- v1 writer 不产生缺 aggregate identity 的领域事件。
- replay 对 v0 使用兼容 reducer，对 v1 使用 typed reducer。
- duplicate idempotency key 返回原结果，不产生第二次迁移。
### 4.4 公共类型
`ActorRef`：
```text
actor_id, actor_type: human|host|worker|kernel,
host_id|null, worker_id|null, capabilities[]
```
`ProvenanceRef`：
```text
source_type, source_id, source_hash|null, source_path|null, observed_at
```
`Waiver`：
```text
waiver_id, capability, scope, scope_id, reason,
risk_id, approval_id, candidate_digest|null, expires_at
```
Waiver 必须绑定 Risk、Approval、scope、candidate 和 expiry，HostAdapter 无权签发。
### 4.5 PlanGraph/Worker/Team 边界
- Team task 只能引用现有 `plan_node_id`。
- 同一 node 同时最多一个 active assignment owner。
- Team 不复制 dependency、scope、verification、risk 或 node status。
- roster 只描述成员、角色、Worker 绑定和 authority。
- mailbox 只传协调消息、Artifact refs、handoff 和 ack。
- node PASS 仍由 Worker result、Gate 与 run closure 决定。
## 5. 能力一：Decision Note 生命周期
### 5.1 触发
以下情况要求 Decision Note：
- public behavior/default、schema/protocol/state/persistence 变化。
- approval、security、release、rollback 边界变化。
- 新增长期 abstraction、registry、hook、compatibility layer。
- Tier 2/3 或 high/critical 风险存在多个合理方案。
- 修改、推翻或收窄 accepted Decision。
typo、纯格式、已被现有 Decision 完整覆盖的低风险机械修改默认不要求。
### 5.2 Typed contract
新增 `decision-note.schema.json`：
```text
schema_version, decision_id, revision, title,
category: product|architecture|protocol|security|process|release,
scope_refs[], source_run_ids[], problem, decision,
alternatives[{id,summary,benefits[],costs[],rejection_reason}],
consequences[], verification_plan[], reversal_conditions[],
status, supersedes_decision_ids[], superseded_by_decision_id|null,
accepted_artifact_id|null, implementation_refs[], verification_refs[],
owner, created_by, created_at, updated_at, last_event_id
```
### 5.3 状态机
```text
draft -> proposed|rejected
proposed -> accepted|rejected|archived
accepted -> implemented|superseded|archived
implemented -> superseded|archived
rejected -> archived
superseded -> archived
archived -> terminal
```
约束：
- `accepted` 需要 `decision_accept`。
- `implemented` 必须引用 candidate、verification 和真实落点。
- `superseded` 必须引用新的 accepted Decision。
- archived 内容冻结。
- 同 scope 创建时执行冲突与 supersession 检查。
### 5.4 Event
`decision.drafted/proposed/accepted/rejected/implemented/superseded/archived`。
payload 至少含：
```text
decision_id, revision, artifact_id, artifact_hash,
from_state, to_state, approval_id|null, supersedes_decision_ids[]
```
### 5.5 CLI/Plugin UX
```text
apex decision create|propose|accept|reject|implement|supersede|archive
apex decision show <id>
apex decision list --status accepted
apex decision conflicts <id>
```
Plugin：
- Plan 检测触发条件并展示“需要 Decision”。
- Host Agent 可 draft/propose，不能代替用户 accept。
- accept/reject 使用 Host 原生 Approval UI。
- Review 显示 candidate 与 accepted Decision 的一致性。
- Ship 阻断 required Decision 缺失或 accepted-not-implemented。
### 5.6 权限
| 动作 | capability |
|---|---|
| draft/propose | `decision_propose` |
| accept/reject | `decision_accept` |
| implemented | verifier + `decision_implement` |
| supersede | `decision_accept` |
| archive | `decision_archive` |
Worker 可提交 Decision Artifact，但不能接受自己的 Decision。
## 6. 能力二：Postmortem -> Gate 自动路由
### 6.1 触发
- 已合并/发布 candidate 出现用户可见逃逸缺陷。
- tests green 但真实入口失败。
- Gate、Approval、scope、candidate binding、replay 被绕过。
- false completion、不可恢复 transaction、迟到 Worker 污染。
- 同类 Review finding 在观察窗口重复达到阈值。
### 6.2 Typed contract
新增 `postmortem.schema.json`：
```text
schema_version, postmortem_id, title, severity, status,
incident_started_at, incident_detected_at, incident_closed_at|null,
affected_scope[], user_impact, detection_gap,
root_causes[], contributing_factors[], failed_controls[],
corrective_actions[], route_decisions[], negative_control_refs[],
risk_ids[], owner, source_run_ids[], artifact_id, last_event_id
```
`route_decisions[]`：
```text
route_id, control_type: test|gate|invariant|review_rule|manual_control|no_action,
target_scope, candidate_id|null, rationale, status,
approval_id|null, verification_refs[]
```
### 6.3 状态机
```text
draft -> investigating|cancelled
investigating -> reviewed|blocked
reviewed -> routed|risk_accepted
routed -> controls_implemented|blocked
controls_implemented -> verified
verified -> closed
risk_accepted -> closed
```
关闭约束：
- `closed` 至少有一个 verified control。
- 无机械 control 时必须有 manual control、Risk 和 Approval。
- `no_action` 仅允许 low severity 且需人工理由。
- high/critical 不允许仅凭文档关闭。
### 6.4 自动路由
| 特征 | 默认 route |
|---|---|
| 原错误可稳定复现 | regression test + Negative Control |
| schema 接受非法状态 | contract test + write Gate |
| 真实入口与单测不一致 | real-entry verification Gate |
| candidate 变化后复用 PASS | candidate integrity invariant |
| 人工权限被绕过 | approval capability Gate |
| replay/projection 不一致 | reconcile invariant |
| Agent 重复犯同类错误 | review rule candidate |
| 无 consumer 抽象致事故 | simplification candidate |
路由器使用确定性规则。模型可建议，但 Kernel 只接受已注册 control type；自动路由只生成 proposal，不直接启用 Gate。
### 6.5 CLI/Plugin UX
```text
apex postmortem create|investigate|route|verify|accept-risk|close
apex postmortem show <id>
apex postmortem pending
```
Plugin：
- Incident 确认后生成 draft。
- 展示影响、failed control、route proposal 和缺失 evidence。
- Promote control 必须打开 Approval。
- high/critical 未关闭时 Ship BLOCK。
### 6.6 权限
- Worker 可提交事实/evidence，不可最终判定 root cause。
- Reviewer 可执行 `investigating -> reviewed`。
- 启用 blocking Gate 需要 `gate_promote`。
- risk accepted 需要 `risk_accept`。
- HostAdapter 不得静默降低 severity。
## 7. 能力三：定期 Simplification Queue
### 7.1 触发
复用 heartbeat/scheduler：
- 默认每 14 天或每完成 10 个 run，任一先到即 due。
- release blocker 期间只扫描，不自动创建执行 run。
- 单轮最多 20 个候选。
- 相同 fingerprint 去重。
### 7.2 Typed contract
新增 `simplification-queue.schema.json`：
```text
schema_version, projection_revision, projection_hash,
schedule_policy{enabled,interval_days,completed_runs_interval,
last_started_at,last_completed_at,next_due_at,max_items_per_round},
items[], last_event_id
```
item：
```text
simplification_id, fingerprint,
kind: unused_api|duplicate_state|duplicate_rule|speculative_config|
obsolete_compat|redundant_skill|replace_with_dependency|dead_entry,
title, scope_refs[], consumer_evidence[], cost_evidence[],
deletion_plan[], verification_plan[], estimated_savings,
actual_savings|null, risk, status, owner, source_run_ids[],
approval_id|null, candidate_digest|null, result_evidence_refs[],
created_at, updated_at, last_event_id
```
### 7.3 状态机
```text
discovered -> triaged|rejected|deferred
triaged -> approved|rejected|deferred
approved -> executing
executing -> verified|blocked
verified -> closed
blocked -> approved|deferred
```
约束：
- Scanner 只创建候选。
- public API/schema/compat 删除需要 `simplification_apply` Approval。
- verified 绑定 candidate digest 和 regression evidence。
- estimated savings 不能冒充 actual；未测量保持 `unknown`。
### 7.4 首批发现器
- schema 字段无 writer/reader。
- public export 无生产 consumer。
- ProjectState 与 projection 重复事实。
- 相同规则在多个 Skill/workflow 手工重复。
- config 只有 default，无 override/consumer。
- compatibility path 超过支持期限。
- Artifact/Event/CLI 长期无调用。
- 连续两个 release 无 consumer 的 experimental capability。
### 7.5 CLI/Plugin UX
```text
apex simplify status|scan|list|triage|execute|verify|close
apex simplify schedule --every-days 14 --every-runs 10
```
Plugin：
- Status 展示 due time、数量、预计维护成本。
- Review/Ship 后仅提示新增复杂度候选。
- 执行时创建独立 run，不在当前功能 run 偷偷扩 scope。
- 默认 `disciplined-tdd`，高风险使用 `governed`。
### 7.6 权限
- Scanner 只读。
- Worker 只在 PlanGraph write scope 内生成 patch。
- public behavior 删除需要 Approval。
- dependency replacement 需 license/provenance 检查。
- scheduler 不得自动 merge、删除 Artifact 或 archive Decision。
## 8. 能力四：Durable Agent Team roster/mailbox
### 8.1 独立性声明
- 只借鉴 roster、mailbox、assignment、recovery、authority 的通用概念。
- 不使用 DSH package、协议、类型、目录、runtime 或 CLI。
- 不宣称兼容 DSH Agent Teams。
- Apex Forge contract 完全由现有 Event、PlanGraph、Worker、Approval 独立定义。
### 8.2 TeamRun contract
新增 `team-run.schema.json`：
```text
schema_version, team_run_id, run_id, plan_id, status,
coordinator_member_id, max_active_workers, budget_ref,
approval_profile_ref, created_at, updated_at, last_event_id
```
状态：
```text
forming -> active|cancelled
active -> paused|draining|cancelled
paused -> active|cancelled
draining -> completed
```
### 8.3 Roster contract
新增 `team-roster.schema.json`：
```text
schema_version, team_run_id, projection_revision,
members[], last_event_id, projection_hash
```
member：
```text
member_id, worker_id,
role: coordinator|implementer|verifier|reviewer|specialist,
status: invited|active|busy|idle|draining|exited|revoked,
capabilities[], assigned_plan_node_ids[], lease_id,
fencing_token, joined_at, last_seen_at, exited_at|null
```
约束：
- worker_id 必须存在。
- 同时仅一个 active coordinator。
- assignment 不得违反 dependency/write-scope/WIP。
- roster status 不替代 Worker status。
- revoke 后旧 fencing token 的消息与结果均拒绝。
### 8.4 Mailbox contract
新增 `team-mailbox.schema.json` 作为 projection。Message 正文使用 immutable Artifact，projection item 只保存：
```text
message_id, thread_id, sequence, sender_member_id,
recipient_member_ids[], kind: assignment|handoff|evidence|review_request|
decision_request|status|cancellation|escalation,
artifact_id, artifact_hash, priority, requires_ack,
ack_member_ids[], status, delivery_attempt,
created_at, expires_at|null, last_event_id
```
状态：
```text
queued -> delivered|cancelled|expired
delivered -> acknowledged|cancelled|expired
```
规则：
- Event append 成功即 queued。
- recipient projection 可见即 delivered。
- required recipients 全部 ack 后 acknowledged。
- 以 `message_id+recipient+delivery_attempt` 幂等。
- 仅保证 thread 内 sequence 单调。
### 8.5 Assignment
assignment 必须引用：
```text
plan_node_id, worker_id, lease_id, fencing_token, objective,
read_scope, write_scope, required_evidence, deadline
```
Worker 接受前 Kernel 检查：
- dependency unlocked。
- Worker active。
- executor capability 满足。
- write scope 无 active conflict。
- team budget/WIP 未超限。
- Approval inheritance 有效。
### 8.6 CLI/Plugin UX
```text
apex team create|add|assign|send|inbox|ack|pause|resume|drain|cancel|status
```
Plugin：
- Factory 模式默认展示 Team 面板。
- 展示成员角色、node、lease、成本、阻塞、未读。
- Coordinator 可请求增员，但不能突破 WIP/budget。
- Decision/Approval 请求进入 Human Host inbox，不由 Worker 代签。
- Resume 从 Event 重建，不依赖旧会话文本。
### 8.7 权限
| 动作 | capability |
|---|---|
| create | `team_create` |
| add/revoke | `team_manage_roster` |
| assign | coordinator + `team_assign` |
| change budget/WIP | `team_budget_update` Approval |
| cancel | coordinator 或 `team_cancel` |
mailbox 不能修改 ProjectState/PlanGraph、扩大 scope、代替 Approval 或标记 node PASS。
## 9. 能力五：已采纳人工 Review -> 规则候选
### 9.1 Typed Review finding
升级 `review-report.schema.json`：
```text
finding_id, severity, category, summary, detail,
author_actor_id, author_type: human|agent, created_at,
status: open|accepted|rejected|fixed|waived,
accepted_by|null, accepted_at|null, resolution,
before_candidate_digest, after_candidate_digest|null,
change_refs[], verification_refs[], reusable_signal
```
兼容期可读 legacy string，新 writer 只写 typed finding。
### 9.2 Adopted 判定
`adopted_human_review` 必须同时满足：
1. `author_type=human`，身份由 HostAdapter 提供。
2. finding 在 merge 前创建。
3. 状态经过 `accepted -> fixed`。
4. before/after candidate digest 不同。
5. change_refs 指向真实 patch/resolution。
6. verification 在 after candidate 上 PASS。
7. integration 消费 after candidate。
8. 没有 waiver 或后续 revert 否定修复。
### 9.3 Rule candidate contract
复用并扩展 `learning-proposal.schema.json`：
```text
proposal_type: review_rule|postmortem_control|general_learning,
source_review_finding_ids[], source_postmortem_ids[],
rule_kind: review_check|test_pattern|gate|invariant|standing_order,
target_scope: project|component|language|host|global,
rule_statement, positive_examples[], negative_examples[],
conflict_refs[], duplication_refs[], estimated_false_positive_risk,
promotion_status, approval_id|null, validation_refs[]
```
### 9.4 状态机
```text
detected -> drafted|rejected
drafted -> independently_reviewed|rejected
independently_reviewed -> approved|rejected|deferred
approved -> applied
applied -> verified|rolled_back
verified -> closed
```
规则：
- 自动化只生成 proposal。
- project rule 至少一个独立 reviewer。
- global/core rule 需要两个独立 reviewer adapter 和人工 Approval。
- 必须做 duplicate/conflict 检查。
- 必须有“错误实现应被抓住”的 negative example。
- 单次风格偏好或项目私有习惯不默认推广 global。
### 9.5 CLI/Plugin UX
```text
apex review finding accept|fix
apex learning mine-reviews --since 30d
apex learning show|review|approve|apply|rollback
```
Plugin：
- Review 区分 Human/Agent finding。
- 展示 before/after candidate lineage。
- Compound 异步提示可复用 finding。
- 审批显示范围、误报风险、重复规则和 negative example。
- applied 后显示命中任务和误报统计。
### 9.6 权限
- Agent 不能把自身 finding 标成 human。
- `rule_promote_project` 与 `rule_promote_global` 分离。
- global rule 不得由单 Worker/单 Review 自动启用。
- rollback 保留 proposal、原因和影响记录。
## 10. 能力六：Bug 强制 Negative Control
### 10.1 强制触发
- `bug`。
- `test_failure`。
- 明确修复 defect 的 `review_feedback`。
- Postmortem corrective action。
- security、authorization、candidate integrity、replay、migration defect。
仅以下情况可申请 waiver：
- 原缺陷不可安全复现。
- 依赖不可获得的外部服务/已销毁数据。
- 复现有不可逆副作用。
- 已有 mutation/invariant evidence 等价覆盖。
“时间不够”或“测试已绿”不是理由。
### 10.2 Typed contract
新增 `negative-control.schema.json`：
```text
schema_version, negative_control_id, run_id, plan_node_id,
bug_intake_id, candidate_digest, method, isolation, fault_model,
expected_failure, observed_failure, red_evidence_refs[],
green_evidence_refs[], restoration_evidence_refs[],
status, waiver|null, created_at, updated_at, last_event_id
```
method：
```text
pre_fix_candidate|targeted_mutation|fixture_replay|
gate_disable_probe|fault_injection|equivalent_invalid_input
```
### 10.3 状态机
```text
required -> prepared|waived
prepared -> red_confirmed|invalid
red_confirmed -> green_confirmed
green_confirmed -> restored
restored -> verified
```
约束：
- RED 必须匹配预注册 failure signature。
- 非零退出但原因不匹配时为 invalid。
- GREEN 在目标 candidate 上运行同一测试入口。
- restored 证明 mutation/fixture/override 已清理。
- verified 才允许 Bug node PASS。
### 10.4 隔离与 PlanGraph
- 只在 ActionWorkspace、staged candidate 或 disposable worktree 执行。
- 禁止在用户主工作区临时回退。
- WorkerExecutor 记录 base、mutation hash、command、exit code、cleanup。
- crash recovery 清理或隔离 mutation workspace。
- Bug Plan 注入 `negative_control_required=true`。
- implementation 交付 regression test，verification 先 RED 后 GREEN。
- quick 可保持 2 nodes，但 review 前必须 verified。
### 10.5 CLI/Plugin UX
```text
apex negative-control prepare|run-red|run-green|verify|waive|show
```
Plugin：
- Bug Plan 显示 mandatory Negative Control。
- Execute 展示隔离方式。
- Verification 并排展示 RED/GREEN。
- waiver 打开高可见 Approval 和残余 Risk。
- missing/invalid/expired record 阻断 Ship。
### 10.6 权限
- Worker 可执行隔离 mutation，不能签发 waiver。
- waiver 需要 `negative_control_waive`。
- high/critical 额外需要 `risk_accept`。
- waiver 绑定 candidate/run/expiry。
- release policy 可完全禁止 critical waiver。
## 11. 分阶段 Work Packages
### WP0：Contract/Event 基础
交付：
- v1 Event/Command envelope。
- Actor/Provenance/Waiver definitions。
- aggregate reducer registry。
- projection revision/hash/rebuild。
- Contract Registry 新 schema 映射。
- v0/v1 compatibility reader。
DoD：
- v0 fixture 可读。
- v1 payload 逐事件验证。
- duplicate idempotency 不重复迁移。
- projection 删除后可重建。
### WP1：Decision
依赖：WP0。
交付：contract、reducer、supersession、Approval、CLI/Plugin。
DoD：
- 合法迁移全 PASS，非法迁移全拒绝。
- implemented 绑定 candidate/verification。
- archived hash 不变。
### WP2：Postmortem
依赖：WP0、Learning extension design。
交付：incident lifecycle、deterministic router、control proposal、Risk sync。
DoD：
- high/critical 无 verified control 不可 close。
- auto route 只生成 proposal。
- promoted Gate 有 Approval、test、rollback。
### WP3：Negative Control
依赖：WP0、ActionWorkspace、Candidate、WorkerExecutor。
交付：contract、PlanGraph trigger、RED/GREEN runner、waiver Gate。
DoD：
- Bug 缺记录时 review/ship BLOCK。
- wrong failure signature 不可过 RED。
- mutation crash 可恢复。
### WP4：Review Learning
依赖：WP0、WP1、WP3。
交付：typed finding、adoption lineage、rule proposal/promotion/rollback。
DoD：
- Agent finding 不可冒充 Human。
- 未改变 candidate 的 finding 不进入候选。
- global rule 有双 reviewer + 人工 Approval。
### WP5：Simplification
依赖：WP0、WP1、WP4。
交付：scheduler、scanner、queue、独立 execution run、收益验证。
DoD：
- trigger 幂等，scanner 无写副作用。
- 删除后质量 Gate 不下降。
- actual savings 未测量时保持 unknown。
### WP6：Durable Team
依赖：WP0、Worker lease/fencing、PlanGraph、Approval、Cost Governor。
交付：TeamRun、roster、mailbox、assignment、ack、resume/cancel。
DoD：
- 重启后可重建。
- stale member 被 fencing 拒绝。
- 不产生第二 DAG。
- cancel/drain 覆盖所有 active Worker。
### WP7：CLI/Plugin/Reconcile
依赖：WP1-WP6。
交付：
- 统一 Kernel operations。
- shared workflows 与 Host overlay。
- status/replay/notification。
- source/plugin schemas 同步。
- 六类 aggregate reconcile。
### WP8：Migration/Release
依赖：WP0-WP7。
交付：
- shadow migration。
- adversarial suite。
- rollback drill。
- release command。
- candidate freeze/validate。
### 11.1 顺序与并行
关键路径：
```text
WP0 -> WP1
WP0 -> WP2
WP0 -> WP3
WP0 -> WP6
WP1 + WP3 -> WP4 -> WP5
WP1 + WP2 + WP3 + WP4 + WP5 + WP6 -> WP7 -> WP8
```
允许：
- WP1/WP2/WP3/WP6 在 WP0 contract/event 基础稳定后并行推进。
- WP3 sandbox tests 可与 WP4 typed review schema 设计重叠，但 WP4 promotion 实现等待 WP1/WP3。
- WP5 scanner 与 WP6 mailbox projection 并行。
禁止：
- 多 Worker 同改 Event envelope/Contract Registry。
- Team roster 和 Worker 各自实现 fencing。
- Postmortem 与 Review 各建规则 promotion 状态机。
- Decision/Learning/Simplification 各建 Approval store。
## 12. 迁移与回滚
### 12.1 迁移
1. 新 binary 同时读取 v0/v1。
2. 新 writer 只写 v1 新领域对象。
3. 新 projection 先 shadow build。
4. 连续比较 replay hash 与现有状态。
5. 生成 migration report。
6. 人工确认后切换 Gate reader。
7. 保留一个 release 的 v0 reader。
Decision：
- 旧 `decision` Artifact 标 `legacy_unclassified`。
- 不自动推导 accepted/implemented。
- 只有 Approval、candidate、verification 证据完整时生成迁移建议。
Review：
- legacy string finding 标 `author_type=unknown`。
- unknown finding 不进入 Learning。
- 新 writer 只写 typed finding。
Team：
- 旧 Worker 不自动入 Team。
- 仅 active Factory run 显式创建 TeamRun。
- roster 引用 Worker，不复制 Worker 文件。
Bug：
- 已关闭历史 Bug 不追溯强制。
- 新建、重开或 migration 后进入 review 的 Bug 强制执行。
### 12.2 回滚
通用：
- writer 受 feature flag 控制。
- rollback 停止新命令，不删除 Event/Artifact。
- projection 可由旧 reader 忽略。
- 不重排、不改写历史 events。
- migration 全部在 project transaction 中执行。
| 能力 | 回滚 |
|---|---|
| Decision | 禁用新迁移，保持 read-only |
| Postmortem | 关闭 auto route，保留手工 route |
| Simplification | 暂停 scheduler |
| Team | 停止 assignment，进入 draining |
| Review Learning | 停止 promotion |
| Negative Control | 仅允许受控 waiver，不静默跳过 |
禁止：
- 删除审计 Event。
- 把 rejected/expired Approval 改 approved。
- 复用旧 candidate PASS。
- 清空 mailbox 当回滚。
- 不留 Decision/Approval 就把 blocking Gate 降为 warning。
## 13. 对抗测试
### 13.1 Event/Projection
| Case | 预期 |
|---|---|
| 重复 idempotency key | 只迁移一次 |
| Event 后 projection 写崩溃 | 重启重建 |
| projection 被篡改 | Reconcile `DRIFT` |
| payload schema 错 | 写入前拒绝 |
| Artifact hash 错 | `INVALID` |
| sequence 重复/回退 | fail closed |
### 13.2 Decision/Postmortem
| Case | 预期 |
|---|---|
| Worker accept 自己 Decision | 拒绝 |
| implemented 无 candidate | 拒绝 |
| archived 后改正文 | 拒绝 |
| high incident 只有总结 | 不可 close |
| auto route 直接启用 Gate | 拒绝 |
| control 在错误实现不失败 | 保持 blocked |
### 13.3 Simplification/Team
| Case | 预期 |
|---|---|
| scanner 发现 unused API | 仅创建候选 |
| scheduler 重复触发 | fingerprint 去重 |
| 删除后 Gate 回退 | candidate 不 merge |
| 两 active coordinator | CAS 拒绝 |
| stale member/result | fencing 拒绝 |
| mailbox replay | assignment 不重复执行 |
| dependency 未解锁 | assignment 拒绝 |
| Team cancel 有子进程 | cancel process tree |
### 13.4 Review Learning/Negative Control
| Case | 预期 |
|---|---|
| Agent finding 标 human | identity 拒绝 |
| human finding 未修复 | 不生成候选 |
| digest 未变化 | 不算 adopted |
| 单次风格意见推 global | promotion 拒绝 |
| RED 非零但原因错误 | invalid |
| RED 在主工作区 | 拒绝 |
| mutation 未清理 | restoration BLOCK |
| GREEN 换测试入口 | 拒绝 |
| waiver 无 Risk/Approval | 拒绝 |
| waiver 跨 candidate | 拒绝 |
## 14. Release Gates
### G0 Contract
- 新 schema 全部通过 AJV 2020-12。
- Contract Registry 覆盖全部持久化对象。
- source/plugin schema hash 一致。
- legacy fixtures PASS。
### G1 Single Source
- 无第二 ProjectState/Event Log/Task DAG/Worker lifecycle。
- mailbox 正文只在 Artifact。
- projection 可重建。
### G2 Lifecycle
- 六项状态机 legal/illegal tests 完整。
- terminal state 不可静默重开。
- 高权力迁移全部绑定 Approval。
- stale revision/lease/fencing 全部 fail closed。
### G3 Decision/Postmortem
- required Decision 缺失时 Ship BLOCK。
- Decision lineage 完整，archive hash 不变。
- high/critical incident 无 verified control 不可 close/release。
- promoted control 有 Approval、negative example、rollback。
### G4 Negative Control/Review Learning
- 新 Bug 100% verified 或有有效 waiver。
- RED failure signature 匹配率 100%。
- 规则候选 provenance 完整率 100%。
- 非人工/未采纳 finding 进入候选数为 0。
- global promotion 有双 reviewer 和人工 Approval。
### G5 Simplification/Team
- scheduler 幂等，scanner 写副作用为 0。
- deletion 有 consumer/regression evidence。
- roster/mailbox recovery matrix 100% PASS。
- stale result、duplicate assignment、orphan member 均为 0。
- Team cancel/resume/process-tree conformance PASS。
### G6 Host/Plugin
- Codex/Claude 调用同一 Kernel operation。
- Host identity 不串用。
- 正常 Plugin 路径无需 raw CLI。
- Approval UI 展示 capability、action/artifact hash、candidate。
- status/replay 可展示六项 lineage。
### G7 Release
- full tests、strict validate、contracts、reconcile `CONSISTENT`。
- plugin build/validate、migration drill、rollback drill。
- adversarial suite、candidate freeze/validate。
- 任一 mandatory Gate 为 `BLOCKED/FAIL` 时 release command 非零退出。
## 15. 成本与简化约束
### 15.1 Method Pack
| 能力 | quick | disciplined | phase-context | governed |
|---|---|---|---|---|
| Decision | 条件触发 | 条件触发 | 条件触发 | 高风险默认 |
| Postmortem | incident only | incident only | incident only | incident only |
| Simplification | 不内联执行 | 产候选 | 产候选 | 产候选 |
| Team | 禁止 | 默认单 Worker | 条件触发 | 并行/恢复触发 |
| Review Learning | 异步 | 异步 | 异步 | 异步 |
| Negative Control | Bug 强制 | Bug 强制 | Bug 强制 | Bug 强制 |
### 15.2 预算
- Decision 正文建议不超过 2,000 字，超出拆 Artifact。
- Postmortem route 默认最多 5 个。
- Simplification 单轮最多 20 个。
- Team 默认 `max_active_workers=3`，取 project WIP 更小值。
- Review mining 每轮最多 100 finding。
- Negative Control 默认只跑最小目标测试，不自动全量跑两次。
- usage 缺失标 `UNKNOWN`，不得宣称成本改善。
### 15.3 新增复杂度问责
每个 WP 必须回答：
- 为什么新增 schema，不能扩展现有 schema？
- 为什么新增 projection，不能从现有数据查询？
- 为什么新增状态，哪个非法行为需要区分？
- 为什么新增 CLI，Plugin 如何复用同一 operation？
- 为什么新增 capability，现有权限为何不适用？
- 删除条件是什么？
禁止：
- 为六项能力分别建 Event Log。
- 为 Team 建第二 DAG。
- 自动 merge simplification。
- 自动把每个 Review 变成 rule。
- 为兼容 DSH private/experimental 接口增加 adapter。
- 用 Gate 数量证明质量。
## 16. 可量化 Definition of Done
### 16.1 工程 DoD
- 每个新增 contract 有 schema、writer、reader、migration、reconcile、tests。
- 所有状态迁移经过 command dispatcher 和 transaction。
- 所有 projection 有 revision/hash/last_event_id。
- Approval 校验 capability、action hash、artifact hash、policy revision、expiry。
- Plugin/source schema 一致。
- 没有第二事实源。
### 16.2 能力 DoD
| 能力 | 指标 |
|---|---|
| Decision | 非法迁移拒绝率 100%；implemented 绑定 candidate/verification 100% |
| Postmortem | high/critical closed item 有 verified control 或获批 risk acceptance 100% |
| Simplification | executed item 有 consumer audit 100%；closed item 有 actual/unknown 100% |
| Team | active member 绑定 Worker 100%；stale result=0；duplicate assignment=0 |
| Review Learning | proposal 来自 adopted human finding 100%；自动 promotion=0 |
| Negative Control | 新 Bug verified 或有效 waiver 100%；wrong-signature RED 通过数=0 |
### 16.3 可靠性/成本 DoD
- 规划 interruption points 恢复率 100%。
- Event replay/projection hash 一致率 100%。
- duplicate command 幂等率 100%。
- stale lease/fencing 拒绝率 100%。
- false completion claim=0。
- orphan Team member/message/mutation workspace=0。
- 非 Bug quick task不增加强制 Worker node。
- 非 Team task 不创建 roster/mailbox。
- simple task median wall-time overhead 目标 `<=15%`。
- Team 只由 isolation/resume/background/parallel 或用户显式要求触发。
### 16.4 产品 DoD
CLI 与 Plugin 必须从同一 Kernel 状态回答：
- 哪些 Decision accepted 但未 implemented；哪个 Postmortem 产生了哪个 Gate？
- 下一轮 simplification 何时 due；当前 Team 谁负责哪个 PlanGraph node？
- 哪条规则来自哪次 adopted human Review；当前 Bug 的 RED/GREEN evidence 在哪里？
## 17. 核心决策
| 决策 | 结论 | 理由 |
|---|---|---|
| 生命周期权威 | Event | replay、审计、幂等、恢复 |
| 正文权威 | immutable Artifact | 避免 Event 膨胀与原地改写 |
| ProjectState | 根 projection | 避免大对象和冲突热点 |
| Team DAG | PlanGraph | 防止任务依赖双写 |
| Team identity | Worker | 防止 lease/fencing 双写 |
| 人工授权 | Approval | 防止各能力自建权限 |
| 规则候选 | Learning | 防止 Review/Postmortem 双管道 |
| 未闭合问题 | Risk | 防止 waiver/incident 风险散落 |
| 自动化 | 只生成 proposal | 防止模型静默升级治理权力 |
| DSH Agent Teams | 不依赖、不复制 | private/experimental，且不属于 Apex Forge 权威边界 |
## 18. 最终验收
只有同时满足以下条件才能声明完成：
1. 六项能力均有 typed contract、状态机、CLI/Plugin UX、权限检查和 replay。
2. 正文/证据由 Artifact 承载，现有 ProjectState/PlanGraph/Worker/Approval/Risk/Learning 未被复制。
3. Durable Team 不依赖或复制 DSH private/experimental Agent Teams。
4. Bug、Postmortem、Review Learning、Simplification 的 mandatory Gate 均按本计划闭合。
5. full tests、contracts、strict validate、reconcile、plugin validate、对抗/迁移/回滚/candidate validation 全部 PASS。
完成前的准确表述：
> 六项能力闭环已规划或部分实现，但 release readiness 仍由未通过的 mandatory Gate 阻断。
