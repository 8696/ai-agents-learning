# 模块 05 · 01 · Function Calling 协议 · step-3 并行调用

> 对应小节 MD：[docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md](../../docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md) · 需求 1 + 需求 2

## 端口

`50019`

## 怎么跑

```bash
cd apps && yarn app:05-01-fc-protocol-step-3
```

浏览器打开 <http://127.0.0.1:50019/>

## 数据流

```
浏览器（页面：/ 总览 · /pages/single.html 单跑 · /pages/compare.html 对比）
  → 单跑页 → POST /api/plan { scenario, mode }     ← routes/plan.ts
    → 决定 tool_calls（mock 3 个：search_flight / get_weather / get_packing_list）
    → mode=parallel: Promise.all(calls.map(executeTool))   ← 关键
    → mode=serial  : for await 顺序执行
    → 每个 tool_call 自己记 startMs / endMs / durationMs
    → ctx.body = { totalMs, results, timeline }
  → 对比页 → POST /api/compare { scenario }         ← routes/compare.ts
    → 服务端并发跑 parallel + serial 两个 sub-dispatch
    → ctx.body = { parallelRun, serialRun, speedup }
  → 浏览器渲染 gantt 时序图 + totalMs + 加速比
```

## 页面与接口 1:1（§5.3.8）

```
public/
├── index.html              ← 总览/导航页（场景卡片 + Registry 面板 + 关键观察点摘要）
├── pages/
│   ├── single.html         ← 单跑场景（mode 切换 parallel|serial）→  POST /api/plan
│   └── compare.html        ← 对比场景（一次拿 parallel + serial 两份）→  POST /api/compare
├── components/
│   ├── layout.js           ← 共享壳：PageNav / StatusPill / PageIntro / EnvFooter / useEnvInfo
│   └── gantt.js            ← 共享业务组件：GanttChart / ResultCard
└── utils/
    └── wait-demo-ui.js     ← 等 components/*.js 转译完再挂载 React（避免 race）

routes/
├── health.ts               ← GET /health
├── plan.ts                 ← POST /api/plan（single 页专用）
└── compare.ts              ← POST /api/compare（compare 页专用；服务端并发两路 sub-dispatch）
```

每个独立场景 = 单独 page + 单独 route 文件。`mode=parallel|serial` 是同一场景的 sub-variant，**不**触发拆分。禁止把两个独立场景塞进同一 route 用 mode 切换（2026-09-04 维护模式起生效，详见 [§5.3.8](../../agents/05-demo.md#538-http-demo-拆分多场景--多接口时强制)）。

## 现在能做什么

- 跑并行：3 个 async handler 同时起步，gantt 上 3 个 bar 的 startMs 几乎相同，总耗时 ≈ max(handler sleeps)
- 跑串行：3 个 handler 顺序执行，gantt 上 bar 顺序堆叠，总耗时 ≈ sum(handler sleeps)
- 串/并行对比：同时发两个 POST 并排展示，验证「串行 ≈ N×单 tool；并行 ≈ max 单 tool」

## 本子节教学点

step-1/2 修了 §5.4 A2 缺真实并行调用的阻塞点。3 个 Tool（`search_flight` 80ms / `get_weather` 50ms / `get_packing_list` 30ms）handler 改 async；路由层用 `Promise.all` 真并发；gantt 时序图把"3 个同时起步"画出来；串/并行对比按钮把"加速比"算出来。

## 对应学习沉淀

- MD 需求 1 · 旅游规划助手 · 演示「含并行调用」：[需求清单 §需求 1](../../docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md#需求清单业务需求--62-item-6-硬性要求)
- MD 需求 2 · 串/并行对比 · 总耗时 + 是否编造：[需求清单 §需求 2](../../docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md#需求清单业务需求--62-item-6-硬性要求)

## 独立性

本 step-3 是独立 mock demo（不调 LLM）；不复用 step-1/2 的 3 个 Tool（get_weather / search / calc），自建旅游规划场景的 3 个 Tool（search_flight / get_weather / get_packing_list）。step-3 的 `lib/`、`routes/` 不被其它 step import（§5.3.12）。
