# 模块 05 · 01 · Function Calling 协议 · step-5 模型自编排链（while + 自纠）

> 对应小节 MD：[docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md](../../docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md) · 例子 5.5 + 错误恢复闭环

## 端口

`50021`

## 怎么跑

```bash
cd apps && yarn app:05-01-fc-protocol-step-5
```

浏览器打开 <http://127.0.0.1:50021/>

## 数据流

```
浏览器（/ 总览 + /pages/self-correct.html 模型自编排）
  → POST /api/self-correct { query }
    → routes/self-correct.ts
      → while (rounds < MAX_ROUNDS=4) {
          ① decision = decideNextAction(round, query, lastResult)   ← mock LLM 看 tool_result 决定下一步
          ② if decision.kind === "final" → break
          ③ result = await executeTool(decision.tool, decision.arguments, decision.tool_call_id)
          ④ trace.push({ round, decision, result, startMs, endMs })
          ⑤ lastResult = result   ← 下一轮模型看到
        }
      → 返 { trace, finalReply, totalMs, rounds, maxRoundsTriggered }
  → 浏览器渲染每轮决策轨迹 + tool_result + final reply
```

## 页面与接口 1:1（§5.3.8）

```
public/
├── index.html              ← 总览/导航（self-correct 场景卡片 + Registry 面板 + 关键观察点）
├── pages/
│   └── self-correct.html   ← 模型自编排场景 → POST /api/self-correct
├── components/
│   ├── layout.js           ← 共享壳：PageNav / StatusPill / PageIntro / EnvFooter / useEnvInfo
│   └── gantt.js            ← 共享业务组件：GanttChart / ResultCard
└── utils/
    └── wait-demo-ui.js     ← 等 components/*.js 转译完再挂载 React

routes/
├── health.ts               ← GET /health
└── self-correct.ts         ← POST /api/self-correct（self-correct 页专用；while + decideNextAction）
```

每个独立场景 = 单独 page + 单独 route 文件。self-correct 是 step-5 唯一场景。

## 本子节教学点

- **while + finish_reason 循环骨架**：`while (rounds < MAX)` + 每轮由 decideNextAction 决定
- **模型自纠**：search_doc 返空 hits → decideNextAction 扩 query → 重试 → 拿到 hits → 继续
- **MAX_ROUNDS 边界**：超 4 轮未收敛 → 业务降级（structured error）
- **mock decideNextAction** 函数：模拟真实 LLM 看 tool_result 决定下一步（生产 = llm.chat({messages, tools})）

## 与 step-3 / step-4 的区别

| 维度 | step-3（并行） | step-4（串行依赖） | step-5（模型自编排 + 自纠） |
| --- | --- | --- | --- |
| 编排 | `Promise.all` 一次并发 | `await A; await B(A.result)` 固定链 | `while + decideNextAction` 多轮 + 自纠 |
| 决策权 | 路由层 hard-code | 路由层 hard-code | **模型自决定**（mock 函数模拟） |
| Tool 数 | 3 | 2 | 2 |
| 总轮数 | 1 dispatch | 2 dispatch | **1~MAX_ROUNDS**（取决于 query） |
| 终止条件 | mode 决定 | chain 跑完 | final 决定 / MAX_ROUNDS 触发 |

## 实验建议

| query | 期望结果 |
| --- | --- |
| `"AI"`（2 字符，< 3） | Round 1 search_doc 空 hits → Round 2 扩 query 重试 → Round 3 summarize → final（**自纠触发**） |
| `"Function Calling"`（长） | Round 1 拿到 hits → Round 2 summarize → final（**2 轮收敛，无自纠**） |
| `"ab"`（极短） | MAX_ROUNDS 触发 → 业务降级 |

## 对应学习沉淀

- MD 例子 5.5 · 模型自己编排链：[例子 5.5 节](../../docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md)
- MD 选型准则 · 三种编排方式对比：[选型准则节](../../docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md)

## 独立性

step-5 是独立 mock demo（不调 LLM）；不复用 step-3 / step-4 的 Tool 与 routes；自建 while + 自纠场景。step-5 的 `lib/`、`routes/` 不被其它 step import（§5.3.12）。