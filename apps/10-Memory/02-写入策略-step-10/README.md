# 写入策略 · 第十步（过期 · 第 6 关完整版）

对应学习笔记：[docs/学习模块/10-Memory/02-写入策略.md](../../docs/学习模块/10-Memory/02-写入策略.md)

## 现在怎么跑

```bash
cd apps
yarn app:10-02-write-policy-step-10
```

浏览器打开：http://127.0.0.1:50113/

端口：`50113`（yarn 脚本 inline `PORT=50113`；`lib/http/runtime-ctx.ts` `.default(50113)` 兜底）

## 数据流

```text
用户访问总览 / recall-decay sub-page（PageNav 跳转）
  → 总览：4 种变体覆盖范围 + 笔记 §6 对应关系
  → recall-decay sub-page:
      Seed 灌 6 条事实 → POST /api/seed（直接 raw SQL 写入，自定义 updated_at 让衰减公式产生差异）
      现在查 recall → GET /api/recall → recallWithDecay 排序 + 命中后更新 last_used_at + use_count += 1
      时间快进 N 天 → POST /api/time/skip { days } → scanForExpired 把 validUntil < asOf 的事实写 archived_at
      查已归档 → GET /api/archive → listArchived（满足「过期 ≠ 删除」）

核心：lib/flow/expiration.ts 单独成文件，四件事：
  1. scanForExpired   扫库 + 把过期事实写 archived_at（变体 6-B + 关键区分「过期 ≠ 删除」）
  2. computeDecayWeight 算衰减权重（变体 6-C；weight = (1 + log(use_count + 1)) / (1 + daysSince / 30)）
  3. recallWithDecay   按权重排序 + 命中更新
  4. listArchived      列出 archived_at 非 NULL 的事实（已归档视图）

复用 step-7/9 的 lib/db.ts + 新增三个字段（archived_at / last_used_at / use_count）+ 启动时 ALTER TABLE 兼容 step-9 旧库
```

## 当前能做什么

| sub-page | 入口 | 演示什么 | 覆盖变体 |
| --- | --- | --- | --- |
| 总览 | `/` | 笔记 §6 四种过期方式 + 本步覆盖范围（6-A/6-B/6-C 已做，6-D 留给后续） | — |
| 6-C 衰减权重 + 时间快进 + 归档视图 | `/pages/recall-decay.html` | seed 灌 6 条预设事实 → 现在查 recall（看每条衰减权重 + validUntil + lastUsedAt + useCount）→ 时间快进 N 天 → 再查 recall（看哪些被归档了）→ 查已归档视图 | 变体 6-A + 6-B + 6-C |

## 当前未做

- **变体 6-D 「被新事实挤掉」**：需要给事实加 `expires_with` 关联字段（指明某条事实在「另一条事实写入时自动过期」）；属于 step-11+ 的工作。
- **需求 6 验收 ②**：「我毕业了」挤掉「在读学校」：依赖 6-D，未做。
- **持久化的「系统时间」**：`setTimeOffset` 是 demo 用的内存变量，重启清空；生产应该走真实时间（cron / scheduled job 跑 scanForExpired）。
- **后台 run 队列 + 待结算会话**：本步不演示写入，所以不需要。
- **需求 7 · 压缩与摘要 / 需求 8 · 审计与安全**：留给 step-(11/12+)。

## 跑完看什么

页面启动时会在 `apps/10-Memory/02-写入策略-step-10/logs/{YYYY-MM-DD}.log` 写日志。烟雾测试：

```bash
cd apps
PORT=50113 npx tsx 10-Memory/02-写入策略-step-10/server.ts
# 起服务后另开终端:
sleep 4 && ls -lh apps/10-Memory/02-写入策略-step-10/logs/$(date +%Y-%m-%d).log
```