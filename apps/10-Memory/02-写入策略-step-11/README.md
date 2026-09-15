# 写入策略 · 第十一步（过期变体 6-D · 被新事实挤掉）

对应学习笔记：[docs/学习模块/10-Memory/02-写入策略.md](../../docs/学习模块/10-Memory/02-写入策略.md)

## 现在怎么跑

```bash
cd apps
yarn app:10-02-write-policy-step-11
```

浏览器打开：http://127.0.0.1:50114/

端口：`50114`（yarn 脚本 inline `PORT=50114`；`lib/http/runtime-ctx.ts` `.default(50114)` 兜底）

## 数据流

```text
用户访问总览 / 6-D 被新事实挤掉 sub-page（PageNav 跳转）
  → 总览：笔记 §6 四种过期方式 + 本步覆盖范围
  → 6-D sub-page:
      灌入示例事实（含 school）→ POST /api/seed
      现在查回答时用的库 → GET /api/recall（看到 school 还在候选里）
      点「我 2027 年要从北大毕业」→ POST /api/expire-linked { text }
        → extractFacts(text) 抽候选
        → 写库（每条 candidate）
        → 收集 candidate.value.expires_with = 'school'
        → expireLinkedFacts('demo-session', ['school'], asOf)
        → 把 school 事实写 archived_at = asOf
      再查 recall → school 不在候选里
      查归档 → school 在归档视图里

核心：lib/flow/expire-linked.ts 单独成文件
  expireLinkedFacts(userId, expiresWithKeys, asOf)
    扫库 + 找 value.expires_with 在 expiresWithKeys 列表里的旧事实
    写 archived_at = asOf（同 step-10 scanForExpired 的归档语义）

复用 step-10 的：
  - lib/db.ts（kv 表 + §5.3.17 KV 抽象）
  - lib/flow/extract-facts.ts（调真模型抽候选）
  - routes/recall.ts、routes/archive.ts、routes/seed.ts、routes/score-importance.ts
  - public/components/（layout / page-nav / timeline）
```

## 当前能做什么

| sub-page | 入口 | 演示什么 | 覆盖变体 |
| --- | --- | --- | --- |
| 总览 | `/` | 笔记 §6 四种过期方式 + 本步只做 6-D（6-A/6-B/6-C 在 step-10） | — |
| 6-D 被新事实挤掉（关联键）| `/pages/expire-linked.html` | 点「我 2027 年要从北大毕业」→ 自动挤掉「在读学校」 | 变体 6-D |

## 当前未做

- **变体 6-A / 6-B / 6-C 演示**：本步不复刻 step-10 已有内容；跑 `yarn app:10-02-write-policy-step-10` 看 6-A / 6-B / 6-C（时间快进 + 衰减权重 + 归档视图）
- **需求 7 · 压缩与摘要**：留给 step-(12/13+) 另开 step
- **需求 8 · 审计与安全**（投毒拦截 + 可审计 + 幂等 + 一键撤回）：留给 step-(14/15+)
- **关联键的「自动发现」**：本步演示的是模型判断（第二次模型调用问 expiresWith 列表），不是「让系统自动找哪条事实该被哪条事实挤掉」；模型判断可能错，生产应该有用户确认

## 跑完看什么

页面启动时会在 `apps/10-Memory/02-写入策略-step-11/logs/{YYYY-MM-DD}.log` 写日志。烟雾测试：

```bash
cd apps
PORT=31014 npx tsx 10-Memory/02-写入策略-step-11/server.ts
# 起服务后另开终端:
sleep 4 && ls -lh apps/10-Memory/02-写入策略-step-11/logs/$(date +%Y-%m-%d).log
```