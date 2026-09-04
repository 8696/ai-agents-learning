# 模块 05 · 01 · Function Calling 协议 · step-4 串行依赖链

> 对应小节 MD：[docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md](../../docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md) · 例子 5（串行依赖）+ 选型准则

## 端口

`50020`

## 怎么跑

```bash
cd apps && yarn app:05-01-fc-protocol-step-4
```

浏览器打开 <http://127.0.0.1:50020/>

## 数据流

```
浏览器（/ 总览 + /pages/chain.html 串行依赖链）
  → POST /api/chain { query, style }
    → routes/chain.ts
      → ① await executeTool(search_doc, {query})     ← 链 A（80ms）
        → 拿 hits
      → ② await executeTool(summarize, {content=A.result, style})  ← 链 B（50ms，依赖 A）
        → 拿 summary
      → ctx.body = { steps: [step1, step2], finalSummary, totalMs }
  → 浏览器渲染链式 gantt 时序图 + 2 tool_result + final summary
```

## 页面与接口 1:1（§5.3.8）

```
public/
├── index.html              ← 总览/导航（chain 场景卡片 + Registry 面板 + 关键观察点摘要）
├── pages/
│   └── chain.html          ← 串行依赖场景 → POST /api/chain
├── components/
│   ├── layout.js           ← 共享壳：PageNav / StatusPill / PageIntro / EnvFooter / useEnvInfo
│   └── gantt.js            ← 共享业务组件：GanttChart / ResultCard
└── utils/
    └── wait-demo-ui.js     ← 等 components/*.js 转译完再挂载 React

routes/
├── health.ts               ← GET /health
└── chain.ts                ← POST /api/chain（chain 页专用；await 串两步 search_doc → summarize）
```

每个独立场景 = 单独 page + 单独 route 文件。chain 是 step-4 唯一场景，**不**复用 step-3 的 routes/plan.ts 或 routes/compare.ts。

## 本子节教学点

- **串行依赖链**：A → B · B 用 A 的输出当参数（详 MD 例子 5）
- **路由层 hard-code 串行**：`await executeTool(A)` → `await executeTool(B.result)`；**不**用 Promise.all
- **依赖关系决定串行还是并行**（详 MD 选型准则）

## 与 step-3 的区别

| 维度 | step-3 | step-4 |
| --- | --- | --- |
| 编排方式 | Promise.all 并发 3 个独立 Tool | await 串 2 个依赖 Tool |
| Tool 数 | 3（search_flight / get_weather / get_packing_list） | 2（search_doc / summarize） |
| B 用 A 的输出？ | 否（独立） | **是**（B.content = A.result） |
| 总耗时 | parallel = max ≈ 80ms；serial = sum ≈ 165ms | sum ≈ 130ms（80+50） |

## 对应学习沉淀

- MD 例子 5 · 串行依赖：[例子 5 节](../../docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md)
- MD 选型准则：[选型准则节](../../docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md)

## 独立性

step-4 是独立 mock demo（不调 LLM）；不复用 step-3 的 3 个 Tool，自建 chain 场景的 2 个 Tool。step-4 的 `lib/`、`routes/` 不被其它 step import（§5.3.12）。