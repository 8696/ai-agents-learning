# 查询改写 · 第三步（step-3） · 评测集 + 生成侧

对应学习笔记：[查询改写（Query Rewrite）](../../docs/学习模块/09-RAG进阶/03-Query-Rewrite.md)

## 怎么跑

```bash
cd apps
yarn app:09-03-query-rewrite-step-3
```

浏览器打开 `http://127.0.0.1:50097/`

端口：`50097`（与 `lib/http/runtime-ctx.ts`、`apps/README.md` 占用表一致）

## 数据流

```text
打开页面
  GET /health              → env（provider / model / hasKey）
  GET /api/corpus          → 8 个切块正文（只存在服务端）
  GET /api/eval-set        → 30 题评测集（不含答案，仅预览前 10 题）
跑评测（变体 11）
  POST /api/evaluate       → 服务端逐题按"原句 / 改写"两个 mode 跑检索
                            → 对照 targetIds 判定命中
                            → 返回命中率 + 每题命中详情
跑生成（变体 12）
  POST /api/generate       → 服务端按 retrievalMode 选检索（原句 / 改写）
                            → 拼 prompt：user 侧 = 原句、retrieval = 改写句、top-5 切块
                            → 调模型答（用 [id=xxx] 引用切块）
                            → 返回完整 prompt + 模型答 + 检索名单
两条路径各自独立；评测在 pages/evaluate.html，生成在 pages/generate.html
```

## 当前能做什么

**变体 11（评测集 + 命中率对照）**
- 30 题人工标注，覆盖 8 类问法：日常说法 / 短问句 / 货号 / 条款号 / 库标题照搬 / 子问题 / 残句指代 / 其他
- 一次只切一个变量：原句检索（基线）vs 改写检索（对照）
- top-5 命中：含 targetIds 任一即 hit
- 命中率对照：每题 Δ 百分点；按分类归因改写对哪类题提升最大

**变体 12（生成侧保留原话）**
- retrievalMode：原句 / 改写（radio 选择）
- 拼 prompt 三段：
  - user 侧 = 原句（展示给用户的那部分）
  - 内部检索词 = 改写句 / 原句（不展示给用户）
  - top-5 切块带 id + score
- 调模型答，模型用 `[id=xxx]` 引用切块（每条引用一行）
- 空问句 4xx、演示后端 5xx 两条失败通道

## 和 step-1 / step-2 的差异

| 维度 | step-1（50095）| step-2（50096）| step-3（50097）|
| --- | --- | --- | --- |
| 演示核心 | 10 个 sub-page 覆盖核心变体 | HyDE 假想文档嵌入 | 离线评测对照 + 在线生成 |
| 检索方式 | 词重叠 | 词重叠 + 嵌入余弦 | 词重叠 |
| 是否调嵌入 | 不调 | 调 | 不调 |
| 是否调聊天模型 | 改写时调 1 次 | 假想段生成时调 1 次 | 改写 + 生成各 1 次 |
| 评测入口 | 无 | 无 | POST /api/evaluate（30 题 × 2 mode）|
| 生成入口 | 无 | 无 | POST /api/generate |

## 本步已锁定（2026-09-14 · 学习者主动声明）。