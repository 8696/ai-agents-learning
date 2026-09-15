# 写入策略 · 第七步（去重 · 第 4 关完整版）

对应学习笔记：[docs/学习模块/10-Memory/02-写入策略.md](../../docs/学习模块/10-Memory/02-写入策略.md)

## 现在怎么跑

```bash
cd apps
yarn app:10-02-write-policy-step-7
```

浏览器打开：http://127.0.0.1:50110/

端口：`50110`（yarn 脚本 inline `PORT=50110`；`lib/http/runtime-ctx.ts` `.default(50110)` 兜底）

## 数据流

```text
用户访问总览 / 任一 sub-page（PageNav 跳转）
    → 4-A sub-page:  填 (key, value) → POST /api/dedup            → 调 dedupByKey      → 比对 value，action = new / noop / conflict
    → 4-C sub-page:  填 text + threshold                            → POST /api/dedup-by-embedding → 调嵌入模型（真发网络请求）→ 跟库里所有事实比余弦 → action = new / semantic_dup
    → 4-D sub-page:  填 (key, value) + includeThreshold            → POST /api/dedup-by-inclusion → 调 dedupByInclusion   → 比 value 字符串长度，action = new / more_specific / less_specific / unrelated
    → 所有 sub-page 共享同一事实库：lib/db.ts（§5.3.17 通用 KV 抽象 + SQLite via better-sqlite3）→ data/facts.db
    → GET /api/facts 在所有 sub-page 顶部显示「事实库已有 N 条」+ 展开看完整列表
```

**注意**：本步三个 sub-page **只读不写**——只调 kvGet / kvList，不调 kvSet。避免学完「同义就直接覆盖」「包含关系就直接替换」这种伪知识。真正的「写」留给 confirm [记住] + kvSet 那一刀（变体 4-A 的 NOOP 路径）。

## 当前能做什么

| sub-page | 入口 | 演示什么 |
| --- | --- | --- |
| 总览 | `/` | 三种去重方式对照 + 4-B 为什么留给第 5 关 |
| 变体 4-A 字面去重 | `/pages/dedup-literal.html` | 按 key + value 字面比对；库里已有同 key + 同 value → NOOP；同 key 不同值 → conflict（4-B 留给第 5 关） |
| 变体 4-C 跨 key 嵌入相似度 | `/pages/dedup-semantic.html` | 调嵌入模型算向量，跟库里所有事实比余弦；最高 ≥ threshold 判 semantic_dup；勾选「归并」时把 bestMatch.key 的 value 替换为新候选 |
| 变体 4-D 包含关系 | `/pages/dedup-inclusion.html` | 按 key 查库，比 value 字符串长度；新值更长 → more_specific；新值更短 → less_specific（不替换）；勾选「替换」时仅 more_specific 调 kvSet 替换 |

## 当前未做

- **变体 4-B 同 key 不同值**（冲突更新）—— 按笔记 §4 表格就说明是冲突，交给第 5 关另开 step。当前实现 action="conflict" 但不调 kvSet
- **去重时机**：写入前查重 vs 定期合并 —— 笔记 §4 第二段提到，本步没做
- **嵌入缓存**：4-C 每次都重算所有 fact 的 embedding —— 生产要做按 fact key 缓存
- **批量确认 / 删除 / 编辑已有事实** —— 留到后续
