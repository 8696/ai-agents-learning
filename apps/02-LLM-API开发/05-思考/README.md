# Demo · 思考 / Thinking（§5.3 React + koa）

对应：[模块 02 · 思考 / Thinking](../../../docs/学习模块/02-LLM-API开发/05-思考.md)

**端口**：`50205` · 浏览器打开 `http://127.0.0.1:50205/`（可用 `PORT=` 单次覆盖）。

## 跑入口

```bash
cd apps
yarn install
yarn app:02-05-thinking
```

需要 `apps/.env` 里 MiniMax / 智谱 / DeepSeek / 千问 **各自**分组的 Key。不跟顶层 `LLM_PROVIDER` 走——四家可以同时打。不要把 Key 写进本目录。

## 数据流

```text
页上官方方言表 ← GET /health（四家 × 协议 A/B：怎么开、怎么关、回哪个字段）
人：勾选模型 + 开/关思考 → 点发送
  → 每家并发 POST /api/stream 协议 A 与协议 B
  → 服务端按该家官方方言组请求（不是写死 MiniMax extra_body）
  → SSE：meta（这次开关字段）+ thinking/content 增量 + 实测来源
  → #output 按轮、按模型追加
```

## 当前能做什么

- **Happy path**：对照 MiniMax-M3 / glm-5.3 / deepseek-v4-pro / qwen3.8-max 在协议 A、B 上怎么开思考、怎么关、思考在独立字段还是正文。流式拆开思考区 / 正文区；可追问（A/B 各记历史）。顶层 `LLM_PROVIDER` 不用改。
- **错误处理**：空消息 / 最后一轮不是 user → HTTP 400；该家没 Key → 400；上游错误进该列红字；浏览器 180s abort → `#status-pill` 红色。
- **Loading**：请求中 pill = 🔄请求中，按钮 `disabled`。
- **单会话输出区**：`#output` 按轮追加；「新开会话」才清空。

官方要点（页上也有表）：

| 模型 | 协议 A 开/关 | 协议 A 思考回哪 | 协议 B 开/关 | 协议 B 思考回哪 |
| ---- | ------------ | --------------- | ------------ | --------------- |
| MiniMax-M3 | `extra_body.thinking`：`adaptive` 开 / `disabled` 关（默认开） | `reasoning_split: true` → 官方应走 `reasoning_details` / `reasoning_content`；否则嵌 `content` 的 think 标记。国内站实测这两键都可能不生效，以页上「这次实测」为准 | 默认关；`thinking.type = adaptive` 开 | 独立块 `delta.thinking` |
| glm-5.3 | 强制开；`disabled` 会失败，Demo 关思考时跳过 | `delta.reasoning_content` | 强制开；关思考时跳过 | 独立块 `delta.thinking` |
| deepseek-v4-pro | `extra_body.thinking`：`enabled` / `disabled`（默认开） | `delta.reasoning_content` | 官方 Anthropic 格式没有开关；强度 `output_config.effort` | 独立块 `delta.thinking` |
| qwen3.8-max | `extra_body.enable_thinking`：true / false（默认开） | `delta.reasoning_content` | `thinking.type = enabled` + `budget_tokens` 开；`disabled` 关 | 独立块 `delta.thinking` |

## 对应学习沉淀

[docs/学习模块/02-LLM-API开发/05-思考.md](../../../docs/学习模块/02-LLM-API开发/05-思考.md)
