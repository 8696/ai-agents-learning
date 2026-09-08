# Tool Gateway · step-2 · 变体 2 · create_order 幂等（调 LLM 协议 B）

对应学习沉淀：[04-Tool-Gateway-幂等.md](../../../docs/学习模块/05-Tool-Calling/04-Tool-Gateway-幂等.md)

## 怎么跑

```bash
cd apps && yarn app:05-04-tool-gateway-step-2
```

- **端口**：`50035`
- **浏览器**：http://127.0.0.1:50035/
- **真调 LLM**（`callsModel: true` · 协议 B · Anthropic Messages API）—— 模型发 create_order tool_use → 走幂等

**前置**：在 `apps/.env` 配 `LLM_PROVIDER` + 该家 `*_API_KEY`。没配 Key → 服务能起，但主按钮 disabled。

## 数据流

```text
前端填 items + idempotency_key
  → 点「同 key 调 3 次」 → fetch /api/chat × 3（每次都传同 idempotency_key + items）
    → Round 1: messages=[user] + tools=[create_order · 协议 B input_schema] + system + max_tokens
      → callProtocolB(req1) → resp1（content blocks 含 tool_use）
    → execute: toolUsesFromLLM → executeTool("create_order", { items, idempotency_key }, ...)
      → create_order handler: 1. 查 idempotencyCache 2. 未命中写 ordersDb + cache.set
    → Round 2: messages + tool_result blocks 回灌 → callProtocolB(req2) → final_reply
  → 返 { user_input, items, idempotency_key, round_1, model_tool_uses, tool_results, round_2, final_reply }
  → 输出区渲染三次调用对照：每条的 tool_result（cacheHit / dbInserted / order_id）+ summary
```

## 当前能做什么

- **变体 2 · create_order 幂等**：同 idempotency_key 调 3 次 /api/chat → 模型发 create_order → 走幂等 → DB 只插 1 行 + 后两次缓存命中
- **协议 B 物理形态**：content blocks 数组、tool_use.input 是对象、必填 max_tokens、回灌用 role:"user" + tool_result blocks
- **前端演示「同 key 调 3 次」**：浏览器内部 fetch × 3，每次都走完整 LLM 两轮（不是直调 Tool）
- **单 Tool Registry**（只 create_order）；变体 1 / 3 在 step-1 / step-3

## 教学覆盖的需求清单条

- 需求 2 · 下订单 Tool（**全过** · 变体 2）：同 idempotency_key 调 3 次 → DB 只插 1 行 + 后两次缓存命中 + 三次 order_id 一致

## §5.3.2 6 项全齐

- Happy path ✓ 3 次调用对照：call_1 dbInserted / call_2,3 cacheHit · order_id 三次完全相同
- 错误处理 ≥2 类 ✓ HTTP 502 上游 LLM 失败 + items 解析失败 / Key 缺失
- Loading ✓ runThreeTimes setStatus → pill 切 🔄 + 按钮 disabled
- 单会话输出 ✓ 三个 call 卡 + summary 全在同一 `#output`
- 环境元信息 ✓ /health + 页脚 #env-info（含 provider / model / hasKey）
- 页面自解释 ✓ #page-intro 3 步 + 每个按钮旁说明

## 与 step-1 / step-3 的区别

| 维度 | step-1 | step-2 | step-3 |
| ---- | ------ | ------ | ------ |
| Tools | `[delete_user]` | `[create_order]` | `[read_recent_emails]` |
| 路由 | | `/api/chat` | `/api/chat` |
| 演示内容 | | 同 key 调 3 次幂等 | per-user OAuth + fail-closed |
| callsModel | | true（协议 B 真 LLM） | true（协议 B 真 LLM） |

每个 step 只演示该 step 新增的变体——不重复前一步演示。

## 对应学习沉淀

[docs/学习模块/05-Tool-Calling/04-Tool-Gateway-幂等.md](../../../docs/学习模块/05-Tool-Calling/04-Tool-Gateway-幂等.md)

- 变体 2：create_order 幂等（本步 · 同 idempotency_key 重放 DB 只插 1 行）

## 端口

`50035`