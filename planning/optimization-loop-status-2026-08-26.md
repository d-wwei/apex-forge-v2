# Apex Forge 受控优化 Loop 状态

日期：2026-08-26

## 当前结论

- 基础设施状态：`RUNNING`
- Campaign：`governed-quality-cost-r1`
- 当前最佳候选：无
- 当前基线：`QUALITY_REJECTED`
- 已执行实验：1
- 最近实验：`GOV-000-safety-canary`，`discard`
- 下一实验：`GOV-001`

基线来自 Candidate
`5b17dac0a3d919dbff9d3cb13416304da4ca0a1c0b51f8ec046a66d2586c381f`
的 `apex-manager--review-defect` 配对结果：

| 指标 | V1 | V2 Governed |
| --- | ---: | ---: |
| wall time | 73.5 秒 | 994.5 秒 |
| total tokens | 188,968 | 2,709,262 |
| hidden acceptance | 100% | 50% |
| durable closure | 0% | 0% |

该 V2 基线因 hidden acceptance、defect detection 和 durable closure 未通过而不具备
`keep` 资格。

## 首轮 Canary

Candidate：
`3b8fb2d08a287701dda935cdfd8d90d31a60ca69a39ef3be28bb1225c87188bb`

| 指标 | 历史 V2 基线 | Safety canary |
| --- | ---: | ---: |
| wall time | 994.5 秒 | 142.6 秒 |
| reported tokens | 2,709,262 | 192,986 |
| public acceptance | 100% | 100% |
| hidden acceptance | 50% | 50% |
| durable closure | 0% | 0% |
| scope safety | 100% | 100% |

观察到的 wall time 下降 `85.7%`、reported token 下降 `92.9%`，但这不是有效
优化：Agent 没有提交产品 patch，hidden acceptance 和 durable closure 仍失败。
运行因全局磁盘增长超过 5 GiB 被 resource guard 终止，相关孤儿进程已回收。

Loop 按质量优先规则将该实验判定为 `discard`。由于 nested Agent 的用量尚未完整
计入当前 result，reported token 也不能作为真实总成本结论。

## 已完成的安全修复

1. Worktree worker 改为相对自身 Git `HEAD` 计算变更，不再把脏主仓库中的历史
   benchmark 文件误判成 worker 删除。
2. Adapter result 中的 changed/out-of-scope/unsupported 路径列表限制为 200 条，并
   保留完整计数。
3. Agent 结构化输出超过 1 MiB 时拒绝；无效输出最多持久化末尾 64 KiB。
4. Blocked worker 在 retry 和 adapter fallback 均耗尽后，scheduler 自动 HALT
   execute node 和 run，并从 `project.active_runs` 移除。
5. Timing-sensitive benchmark 必须串行运行；并行仅用于不参与计时的分析和验证。

## Loop 规则

- 质量 Gate 先于成本比较。
- 每轮只改变一个变量。
- 使用独立非保护分支和干净 worktree。
- evaluator、任务、hidden checks 与配置在启动时按内容哈希冻结。
- 所有实验写入 append-only `.apex-loop/history.jsonl`。
- 达到实验数、总耗时、Token、连续 crash、连续无改进或磁盘下限时自动停止。
- 不使用无限循环，不使用 `git reset --hard`。

## 目标

| Route | 质量要求 | 时间目标 | Token/相对成本目标 |
| --- | --- | ---: | ---: |
| Quick | 全部硬 Gate 100% | p50 <= 90 秒 | p50 <= 100k |
| Disciplined | 全部硬 Gate 100% | p50 <= 180 秒 | p50 <= 200k |
| Governed | 全部硬 Gate 100% | <= 10 分钟 | <= 600k 且 <= V1 3x |

Governed 必须在至少三个不同任务上连续达标，才允许结束 Campaign。

## 下一实验

`GOV-001`：把 Governed 顶层 Agent 的 CLI 探索和状态编排迁入确定性 controller，
减少重复上下文、重复状态读取和无效模型往返，同时保留独立验证、独立 review、
candidate binding 与 durable closure。
