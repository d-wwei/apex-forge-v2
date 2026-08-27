# Governed Responsibility Refactor 验证结果

日期：2026-08-27

## 结论

本轮完成 Governed Responsibility Refactor 的工程实现：

- 默认 Governed 从旧七节点切换为三个 Agent 判断节点：
  `delivery-design -> delivery-implementation -> delivery-review`。
- 保留 `governed-v1`，历史七节点 run 可继续读取和恢复。
- `execute` 只等待 Plan/Candidate 阶段；Kernel staged verification PASS 后
  才创建只读 Review Agent。
- Review evidence、verification report 和 merge 使用同一 candidate digest。
- 新增 `project drain`，由 Kernel 自动完成 collect、unlock、verify、review、
  integrate、learn 和 closure，只向 Agent 返回一个 `next_action`。
- cognitive Capability 不再允许绑定 deterministic shell；`test-strategy`
  在 Governed V2 中归入 Plan Agent。
- Review 默认使用 standard 模型，critical/security/migration 等能力才升级 strong。
- 自动 Governed 路由不再被普通 `security`、`auth` 或“恢复”字样误触发。
- critical 场景增加独立 Risk Challenger；大型、明确要求并行且写域互斥时
  才拆出 Test Worker。
- Host、Factory Worker 和 Shell Worker 均生成统一 Evidence Artifact；
  Capability Receipt 由 Kernel 派生，旧 evidence 文件继续作为兼容投影。
- Browser/Mobile/Performance/Deploy 等环境能力必须调用真实 provider command；
  仅声明 provider 或普通测试通过不能生成 Capability Receipt。
- blocking Review 生成 durable rework request、淘汰旧 patch，并重新打开
  Candidate/Verification；新 candidate 必须重新 Review。
- 无 `learning:` 明确信号时不再固定生成三条模板 Learning proposal；
  相同规则跨 run 去重。
- Product Benchmark controller 支持独立 `--task-set`、可选 mode、安全
  `--run-root` 和 candidate/base/mode 四重 identity。
- 新 canary 使用 `raw-agent / v1-skill / plugin-kernel`，不再用 CLI Kernel
  冒充裸 Agent。

## 工程验证

- 全量测试：`692/692 PASS`
- 吞吐与 scheduler 回归：`12/12 PASS`
- Provider 结构化输出回归：`6/6 PASS`
- Benchmark controller/evaluator/provenance 回归：`44/44 PASS`
- Plugin package/native lifecycle：`12/12 PASS`
- 新增 Governed V2 durable closure 测试：
  - Review 不会在 verification 前创建
  - execute 不等待 Review
  - verification 与 review candidate digest 一致
  - merge、learning 和 `active_runs=[]` 完整关闭
- Review BLOCK/CONDITIONAL 会生成 durable rework request，旧 patch 标记
  `dropped`，重新验证后的新 reviewer 不复用旧 evidence。
- Unified Evidence 同时覆盖 Host 和 Factory Worker；旧格式仍可读取，新格式由
  Kernel 生成 attempt-specific legacy projection 与 Capability Receipt。
- Benchmark subset/controller identity/isolated artifact path 回归通过。
- 独立复审确认此前发现的 rework、Receipt、Provider schema 和 benchmark
  隔离问题均已关闭。
- Contract 临时项目校验：`PASS`，118 个 schema，12 个持久 contract
- Strict project validate：`PASS`
- Project reconcile：`CONSISTENT`

## 已验证效果

相同 Governed 任务的默认 Agent 调用面从 6 个降为 3 个，减少 50%：

```text
旧：context + risk + design + implementation + tests + review
新：plan + implementation + review
```

PlanGraph 节点从 7 个降为 3 个，减少 57.1%。重复 verification worker 被删除，
权威测试只在 staged candidate 上由 Kernel 执行一次。插件不再要求 Agent 手工编排
多条 lifecycle CLI。

以上证明了调用面和流程往返的确定性下降，并保持现有工程质量门禁。

## 真实 Product Benchmark

正式结果绑定：

- Candidate：`69330f205e4640c59abfc34cd654707008da3d62cd61c6119b6ab65cc206ca6e`
- Runtime SHA-256：
  `e9987398312cdfa1c17ee8f41e3b5857076206dfb7692c7c1a57a00593fe6896`
- Model：`gpt-5.6-luna`
- Reasoning effort：`low`
- Task：Apex Manager 的 simple、bug-fix、review-defect
- Mode：`raw-agent / v1-skill / plugin-kernel`
- 执行方式：9 个 official runs 严格串行，无并发测试或模型任务
- 本地证据：
  `/Users/admin/Documents/AI/Apex-forge/benchmark-runs/adaptive-final-69330f20`

| 指标 | Raw Agent | V1 Skill | Apex Forge V2 |
| --- | ---: | ---: | ---: |
| 成功交付率 | 100% | 100% | 100% |
| Hidden acceptance | 100% | 100% | 100% |
| Scope safety | 100% | 100% | 100% |
| Evidence | 66.7% | 66.7% | 100% |
| Durable closure | 0% | 0% | 100% |
| 平均耗时 | 60.8 秒 | 70.5 秒 | 106.0 秒 |
| 每次成功交付 token | 79,216 | 138,400 | 216,395 |

正式 Product Gate：`PASS`。

- V2 相对 Raw：耗时 `1.74x`，token `2.73x`。
- V2 相对 V1：耗时 `1.50x`，token `1.56x`。
- simple 路径相对 Raw 的耗时增量为 `17.9%`，通过 `<=25%` 门槛。
- 三个 V2 样本全部低于 `10 分钟 / 60 万 tokens`。
- V2 相对 V1 的平均 token 为 `1.56x`，通过 `<=3x` 门槛。

这组小样本没有证明 V2 的功能正确率高于 Raw/V1，因为三组 hidden acceptance
都达到 100%；它证明的是 V2 用可量化的时间与 token 成本，换来了完整 Evidence
和 Durable Closure。该结论适用于本次三个任务，不外推为所有仓库和任务类型。

在正式结果前产生的两组探索样本因候选变化、路由口径错误或与全量测试并发，
仅用于定位热路径，不计入正式结论。
