# 模块 06 · 03 · Token Budget · step-4 · 选择性注入

> step-4 状态：**✅ 已锁定**（2026-09-09）。§5.3.2 6 项齐 + `node scripts/check-demo.cjs` 过。冻结。

## 端口

`50048`

## 跑入口

```bash
cd apps && yarn app:06-03-token-budget-step-4
```

浏览器：[http://127.0.0.1:50048/](http://127.0.0.1:50048/)

## 数据流

```text
浏览器调页面参数（query / keywords / selectN）→ React state
       │
       │  POST /api/selective
       ▼
koa bodyParser → routes/selective.ts Zod 校验
       │
       │  5 段多话题 history(美食/天气/工作/电影/健身 × 10 轮 × 2 角色) = 100 条 messages
       │  算每段命中关键词数 → 排序 → 取 top-N
       │
       ├─ 路径 A 全塞基线: messages = [system, ...全 100 段, query] → 调真模型 #1 → fullReply
       │
       └─ 路径 B 选择性注入: messages = [system, ...top-N 命中段, query] → 调真模型 #2 → selectiveReply
       │
       │  返回 { config, full, selective, topicGroups, 触发说明 }
       ▼
React 5 张卡：① 触发说明 ② 路径 A 全塞基线(完整 messages) ③ 路径 B 选择性(只 top-N,默认展开)
              ④ 对比小结(段数 / 输入 token / 输出 token 三行差) ⑤ 命中明细(5 段 × 10 轮 = 50 段 score 分布)
```

服务端日志（`logs/YYYY-MM-DD.log`）每次请求写：handler 入参（含 query / keywords / 5 段 topicGroups 分数明细）→ 两次调真模型主路径按五条日志写完整 → handler 出参含完整 saved token。

## 当前能做什么

- **3 个页面可调参数**:query（决定"相关"判定）/ keywords（逗号分隔,决定哪些段被命中）/ selectN（取 top-N 命中段,1~20）
- **5 段多话题 history**(共 100 条 messages):美食 1-10 / 天气 11-20 / 工作 21-30 / 电影 31-40 / 健身 41-50
- **关键词匹配** = 段内 substring 命中数(取 top-N) — 本步最简版本;生产用 embedding 余弦(模块 08)
- 默认(query=寿司,keywords=寿司/拉面/日料/餐厅/美食/上海,selectN=3):只命中美食 1-3 段,选择性 6 条 messages vs 全塞 100 条,**省 ~90% 输入 token**
- 改 query="上次那个跑步的" → 命中健身段 → 验证"按内容选,不是按时间选"
- 改 keywords=空 → 不命中任何段 → selective 等于全塞
- 改 selectN=20 → 全塞也命中不了 20 个 topic turn(只有 5 段 × 10 轮 = 50 段) → 实际取 max
- 点「演示后端 5xx」→ 5xx 红字 + #status-pill ❌
- 页脚 `#env-info` 来自 `GET /health`(provider / model / hasKey)

## step-4 教学点

- **「选择性注入」= 按 query 内容相关选段,不是按时间最近选**
- **「不进 messages 才是真省 token」** — 对照全塞基线看差多少(默认参数下省 90%)
- **「关键词匹配 = 最简单的相关判定」**;生产用 embedding 余弦相似度(模块 08 RAG 展开)
- **「极端场景:query 相关的话题在很早以前」** → step-1~3 全丢光,step-4 反而能找回来(因为按内容选,不是按时间)
- **不在 step-4**:embedding 余弦、BM25、混合检索(关键词+向量)、向量库 — 这些是模块 08 RAG 之后

## 对应学习沉淀

[docs/学习模块/06-多轮对话与Context/03-Token-Budget.md](../../../docs/学习模块/06-多轮对话与Context/03-Token-Budget.md)

## 下一步

step-N 由学习者主动决定何时加(§5.3.14)。候选方向:
- step-5:按 token 算窗口变体(滑动窗口 K 从"条数"换成"token 数",对照 02 step-5)
- step-6:失败兜底降级(摘要 LLM throw → fallback trim,对照 02 step-4)
- 走模块复盘
