# 模块 05 · 01 · Function Calling 协议 · step-7 混合编排（路由层 hard-code 约束 + 模型自决要不要进）

> 对应小节 MD：[docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md](../../docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md) · 易混点「三种编排方式对比 · 混合」

## 端口

`50023`

## 怎么跑

```bash
cd apps && yarn app:05-01-fc-protocol-step-7
```

浏览器打开 <http://127.0.0.1:50023/>

## 数据流

```
浏览器（/ 总览 + /pages/hybrid.html 混合编排）
  → POST /api/hybrid { query }
    → routes/hybrid.ts
      → path = classifyQuery(query)   ← A 仅天气 / B 带伞 / C 直接打包
      → while (rounds < MAX_ROUNDS=8) {
          ① decision = decideHybridAction(round, query, path, lastResult, weatherCalled, suggestItemsCalled)
          ② 路由层 hard-code 约束 1（拒绝越权）：suggest_items 必须在 get_weather 之后调
             checkChainConstraint(decision.tool, weatherCalled) → 违反返 ok:false 塞回 messages → 模型下一轮退回 weather
          ③ 路由层 hard-code 约束 2（路径 B 硬接）：
             shouldHardcodeSuggestItems(path, weatherCalled, suggestItemsCalled)
             → 模型调完 weather → final → 路由层自动跑 suggest_items（用 weather.rain_prob 派生参数）
          ④ else → executeTool(decision.tool, decision.arguments) → 推进 state → lastResult
        }
      → 返 { path, trace, finalReply, totalMs, rounds, maxRoundsTriggered, weatherCalled, suggestItemsCalled }
  → 浏览器渲染每轮决策轨迹 + 路由层拒绝/硬接徽标 + final reply
```

## 页面与接口 1:1（§5.3.8）

```
public/
├── index.html              ← 总览/导航（hybrid 场景卡片 + Registry 面板 + 关键观察点）
├── pages/
│   └── hybrid.html         ← 混合编排场景 → POST /api/hybrid
├── components/
│   ├── layout.js           ← 共享壳：PageNav / StatusPill / PageIntro / EnvFooter / useEnvInfo
│   └── gantt.js            ← 共享业务组件：GanttChart / ResultCard（palette: get_weather=blue / suggest_items=green）
└── utils/
    └── wait-demo-ui.js     ← 等 components/*.js 转译完再挂载 React

routes/
├── health.ts               ← GET /health
└── hybrid.ts               ← POST /api/hybrid（hybrid 页专用；while + 路由层 hard-code 两条约束）
```

每个独立场景 = 单独 page + 单独 route 文件。hybrid 是 step-7 唯一场景。

## 本子节教学点

- **混合编排定义**：路由层 hard-code 两条约束 + 模型自决要不要进两步链（MD 易混点「三种编排方式对比 · 混合」）
- **路由层 hard-code 约束 1（拒绝越权）**：`suggest_items` 必须在 `get_weather` 之后调；违反 → `ok:false error` 塞回 messages → 模型下一轮决定先 weather
- **路由层 hard-code 约束 2（路径 B 硬接）**：模型调完 weather → final → 路由层自动再调 suggest_items（用 weather.rain_prob 当参数）
- **三条可观察路径**：
  - **路径 A** · weather-only：query 含天气/温度但不涉打包 → 模型仅调 get_weather → final
  - **路径 B** · umbrella：query 含"带伞/雨/打包" → get_weather → final → 路由层硬接 suggest_items → final
  - **路径 C** · packing-direct：query 仅"打包/清单"无天气 → mock LLM 直接 suggest → 路由层拒绝 → 退回 weather → suggest → final
- **mock decideHybridAction**：模拟真实 LLM 在 while 循环里看 path + lastResult + state 决定下一步（生产 = llm.chat({messages, tools})）
- **classifyQuery**：纯函数根据 query 关键词判定教学路径（前端徽标显示）

## 与 step-4 / step-5 的区别

| 维度 | step-4（路由层 hard-code） | step-5（模型自编排） | step-7（混合编排） |
| --- | --- | --- | --- |
| 编排 | `await A; await B(A.result)` 固定链 | `while + decideNextAction` 完全自决 | `while + decideHybridAction` + 路由层两条硬约束 |
| 决策权 | 路由层 hard-code | 模型自决 | **路由层硬约束 + 模型自决**（混合） |
| Tool 数 | 2 | 2 | 2 |
| 链顺序 | 固定 A → B | 模型每轮决定 | **路由层 hard-code**：weather → suggest（拒绝越权 / 路径 B 硬接） |
| 总轮数 | 2 dispatch | 1~MAX_ROUNDS | 1~MAX_ROUNDS（路径 A=2 / B=3 / C=4~5） |
| 终止条件 | chain 跑完 | final 决定 / MAX_ROUNDS 触发 | final 决定 / MAX_ROUNDS 触发（路径 B 硬接后模型再 final） |

## 实验建议

| query | 路径 | 期望结果 |
| --- | --- | --- |
| `"5 月东京平均气温"` | A · weather-only | Round 1 get_weather → Round 2 final（不调 suggest） |
| `"5 月东京带不带伞"` | B · umbrella | Round 1 get_weather → Round 2 模型 final → 路由层硬接 suggest → Round 3 模型综合 final |
| `"我要打包"` | C · packing-direct | Round 1 mock 直接 suggest → 路由层拒绝 → Round 2 weather → Round 3 suggest → Round 4 final |

## 对应学习沉淀

- MD 易混点 · 三种编排方式对比：「三种编排方式」节 + 反向链接本 demo
- MD 易混点 · 「并行调用 ≠ SDK 自动」：「易混点」节
- MD 「链路深度 vs 成本」：「链路深度 vs 成本」节

## 独立性

step-7 是独立 mock demo（不调 LLM）；不复用 step-5 / step-6 的 Tool 与 routes；自建混合编排场景（get_weather + suggest_items）。step-7 的 `lib/`、`routes/` 不被其它 step import（§5.3.12）。