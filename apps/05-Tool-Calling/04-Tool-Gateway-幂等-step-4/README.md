# Tool Gateway · step-4 · 变体 4 · Tool 抛错结构化（调 LLM 协议 B · 已锁定 ✅）

对应学习沉淀：[04-Tool-Gateway-幂等.md](../../../docs/学习模块/05-Tool-Calling/04-Tool-Gateway-幂等.md)

> **状态**：✅ 已锁定（2026-09-08 · 学习者主动锁定 · `node scripts/check-demo.cjs` 过 · §5.3.2 6 项齐）
> 锁定后冻结；要改建 step-(N+1)。

## 怎么跑

```bash
cd apps && yarn app:05-04-tool-gateway-step-4
```

- **端口**：`50037`
- **浏览器**：http://127.0.0.1:50037/
- **真调 LLM**（`callsModel: true` · 协议 B · Anthropic Messages API）—— 模型发 tool_use → → handler throw → 中间件捕获 → 结构化错误 → Round 2 模型改输入

**前置**：在 `apps/.env` 配 `LLM_PROVIDER` + 该家 `*_API_KEY`。没配 Key → 服务能起，但主按钮 disabled。

## 数据流

```text
点「10 ÷ 0」按钮 → POST /api/chat { input: \"请帮我算 10 ÷ 0\" }
  → routes/chat.ts
    → Round 1: messages=[user] + tools=[divide · 协议 B input_schema] + system + max_tokens
      → callProtocolB(req1) → resp1（content blocks · model 发送 tool_use 调 divide(10,0)）
    → execute: toolUsesFromLLM → executeTool(\"divide\", { a: 10, b: 0 }, tool_use_id, {})
      → handler: b === 0 → throw new Error(\"divide by zero: b 不能为 0\")
      → registry.executeTool try/catch 捕获 → 包成 {ok:false, code:\"DIVIDE_BY_ZERO\", retryable:true, status:\"error\"}
    → Round 2: messages + tool_result blocks（is_error:true + code + retryable）塞回 messages
      → callProtocolB(req2) → resp2（模型看到错误 → 改 b 重试 → final_reply）
  → 返 { user_input, round_1, model_tool_uses, tool_results, round_2, final_reply }
```

## 当前能做什么

- **3 按钮演示 3 端错误路径**：成功 / 业务错 / 参数错 → 全部走同一结构化路径（不抛 HTTP 500）
- **完整 LLM 两轮可见**：Round 1 看模型发 tool_use → tool_result 结构化错误 → Round 2 看模型看到错误改输入 → final_reply
- **大白话**：`divide` 是数学 · 谁都能看懂 · `10 ÷ \"abc\"` 这种参数错误明显 → 演示 Zod 失败路径
- **retryable 区分**：业务错 / 参数错（true · 可改）vs 资源错（false · 本 demo 不演示，step-3 per-user OAuth 跳过）
- **单 Tool**（divide）；变体 1 / 2 / 3 在 step-1 / step-2 / step-3

## 教学覆盖的需求清单条

- 需求 4 · Tool 业务错误结构化（**全过** · 变体 4）：handler throw → koa 中间件捕获 → 返回结构化 tool_result `{status:\"error\",code,message,retryable}` → 模型下轮能基于此改输入

## §5.3.2 6 项全齐

- Happy path ✓ 3 个按钮演示成功 / 业务错 / 参数错
- 错误处理 ≥2 类 ✓ DIVIDE_BY_ZERO（业务错）+ INVALID_PARAM（参数错） + handler throw
- Loading ✓ 按钮按下 → pill 切 🔄 → 完成切 ✅
- 单会话输出 ✓ Round 1/2 数据卡 + tool_result 结构化 + final_reply 全在同一 `#output`
- 环境元信息 ✓ /health + 页脚 #env-info（含 provider / model / hasKey）
- 页面自解释 ✓ #page-intro 完整 3 场景说明 + 大白话解释

## 关键教学点（合上文件后还能自己讲出来也能讲清）

| 概念 | 演示 |
| ---- | ---- |
| **业务错误 ≠ HTTP 500** | 10/0 按钮 → ok=false · code=DIVIDE_BY_ZERO · **HTTP 仍 200**（不挂整轮）|
| **Zod 参数错同路径** | 10/abc 按钮 → INVALID_PARAM · 结构化字段一致 |
| **retryable 区分** | 参数错/业务错 retryable:true（可改） |
| **模型下轮改输入** | Round 1 模型发 divide(10,0) → 返错 → Round 2 模型看到 → 改 b=2 重试 → 拿到 5 → final_reply \"10÷2=5\" |
| **不要把 throw 顶到 koa** | handler throw 必须被 registry 中间件捕获；不能让 throw 变成 HTTP 500 挂整轮 |

## 与 step-1 / step-2 / step-3 的区别

| 维度 | step-1 | step-2 | step-3 | step-4 |
| ---- | ------ | ------ | ------ | ------ |
| Tools | | `[create_order]` | `[read_recent_emails]` | `[divide]` |
| 路由 | | `/api/chat` | `/api/chat` | `/api/chat` |
| 演示内容 | | 同 key 调 3 次幂等 | per-user OAuth | **3 按钮 throw → 结构化错误 → 模型改输入** |
| callsModel | | true | true | true（协议 B 真 LLM） |

每个 step 只演示该 step 新增的变体——不重复前一步演示。

## 对应学习场景

[docs/学习模块/05-Tool-Calling/04-Tool-Gateway-幂等.md](../../../docs/学习模块/05-Tool-Calling/04-Tool-Gateway-幂等.md)

- 变体 4：Tool 抛错结构化（本步 · 3 按钮演示）

## 端口

`50037`