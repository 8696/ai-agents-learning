# Tool Gateway · step-3 · 变体 3 · read_recent_emails 委托授权（调 LLM 协议 B · 已锁定 ✅）

对应学习沉淀：[04-Tool-Gateway-幂等.md](../../../docs/学习模块/05-Tool-Calling/04-Tool-Gateway-幂等.md)

> **状态**：✅ 已锁定（2026-09-08 · 学习者主动锁定 · `node scripts/check-demo.md` 过 · §5.3.2 6 项齐）
> 锁定后冻结；要要改建 step-(N+1)。

## 怎么跑

```bash
cd apps && yarn app:05-04-tool-gateway-step-3
```

- **端口**：`50036`
- **浏览器**：http://127.0.0.1:50036/
- **真调 LLM**（`callsModel: true` · 协议 B · Anthropic Messages API）—— 模型发 read_recent_emails → 走 per-user OAuth 三步

**前置**：在 `apps/.env` 配 `LLM_PROVIDER` + 该家 `*_API_KEY`。没配 Key → 服务能起，但主按钮 disabled。

## 数据流

```text
选 actor userId（alice / bob / platform-god / carol）+ query
  → POST /api/chat { input, actor:{userId,role} }
  → routes/chat.ts
    → Round 1: messages=[user] + tools=[read_recent_emails] + system + max_tokens
      → callProtocolB(req1) → resp1（content blocks 含 tool_use）
    → execute: toolUsesFromLLM → executeTool("read_recent_emails", { max }, tool_use_id, { actor })
      → read_recent_emails handler 三步：
        ① fail-closed（actor.userId === "platform-god" → FORBIDDEN）
        ② 鉴权（oauth_tokens[userId] 不存在 → FORBIDDEN）
        ③ 用该用户自己的 token 调" Gmail API"（mock）
    → Round 2: messages + tool_result blocks 塞回 messages → callProtocolB(req2) → final_reply
  → 返 { user_input, actor, round_1, model_tool_uses, tool_results, round_2, final_reply }
```

## 当前能做什么

- **per-user 资源隔离**：alice token 只返 alice 邮件，bob token 只返 bob 邮件（5 封邮件各不相同）
- **fail-closed**：actor.userId="platform-god" → 立即 FORBIDDEN
- **未 OAuth 拒绝**：actor.userId="carol"（oauth_tokens 表里没记录）→ FORBIDDEN
- **协议 B 物理形态**：content blocks 数组、tool_use.input 是对象、必填 max_tokens、塞回 messages用 role:"user" + tool_result blocks
- **单 Tool Registry**（只 read_recent_emails）；变体 1 / 2 在 step-1 / step-2

## 教学覆盖的需求清单条

- 需求 3 · 拉邮件 Tool：用户委托授权（**全过** · 变体 3）：alice token 只拉 alice 资源；platform-god 拒调（fail-closed）；carol 未 OAuth 拒调

## §5.3.2 6 项全齐

- Happy path ✓ alice / bob 拉 per-user 邮件；platform-god / carol 拒调
- 错误处理 ≥2 类 ✓ HTTP 502 上游失败 + OAuth FORBIDDEN（platform-god / 未 OAuth）+ Key 缺失
- Loading ✓ runChat setStatus → pill 切 🔄 + 按钮 disabled
- 单会话输出 ✓ Round 1/2 数据卡 + read_recent_emails 结果 + final_reply 全在同一 `#output`
- 环境元信息 ✓ /health + 页脚 #env-info（含 provider / model / hasKey / oauthUsers）
- 页面自解释 ✓ #page-intro 3 步 + 每按钮旁说明

## 与 step-1 / step-2 的区别

| 维度 | step-1 | step-2 | step-3 |
| ---- | ------ | ------ | ------ |
| Tools | `[delete_user]` | `[create_order]` | `[read_recent_emails]` |
| 路由 | | `/api/chat` | `/api/chat` |
| 演示内容 | | 同 key 调 3 次幂等 | per-user OAuth + fail-closed |
| callsModel | | true（协议 B 真 LLM） | true（协议 B 真 LLM） |

每个 step 只演示该 step 新增的变体——不重复前一步演示。

## 对应学习沉淀

[docs/学习模块/05-Tool-Calling/04-Tool-Gateway-幂等.md](../../../docs/学习模块/05-Tool-Calling/04-Tool-Gateway-幂等.md)

- 变体 3：read_recent_emails 委托授权（本步 · per-user OAuth + fail-closed + 未 OAuth 拒绝）

## 端口

`50036`