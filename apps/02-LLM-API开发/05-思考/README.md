# Demo · 思考 / Thinking（§5.3 React + koa）

对应：[模块 02 · 思考 / Thinking](../../../docs/学习模块/02-LLM-API开发/05-思考.md)

**端口**：`50205` · 浏览器打开 `http://127.0.0.1:50205/`（可用 `PORT=` 单次覆盖）。

## 跑入口

```bash
cd apps
yarn install
yarn app:02-05-thinking
```

需要 `apps/.env` 里当前 `LLM_PROVIDER` 的 Key。不要把 Key 写进本目录。

## 数据流

```text
人：第一句 / 追问 → 点发送
  → 浏览器按协议各自拼 messages（A 含上一轮思考，B 只含正文）
  → 并发 POST /api/a-stream 与 POST /api/b-stream
  → SSE：meta + thinking/content 增量 + raw 帧
  → #output 按轮追加，不覆盖上一轮
```

## 当前能做什么

- **Happy path**：同 prompt 流式对照 A/B；每列有「思考怎么开 · 从哪回来」（请求开关字段 + 这次是独立字段还是嵌在正文）；思考区和正文区分开追加；可追问（A/B 各自历史）；原始请求 + 每一帧 JSON 仍可见。
- **错误处理**：空消息 / 最后一轮不是 user → HTTP 400；上游错误进该列红字；浏览器 120s abort → `#status-pill` 红色。
- **Loading**：请求中 pill = 🔄请求中，按钮 `disabled`。
- **单会话输出区**：`#output` 按轮追加；「新开会话」才清空。

协议 A 的思考可能来自 `reasoning_content` / `reasoning_details`，或 content 里的 think 标记。协议 B 来自 `content_block_delta.delta.thinking`。

## 对应学习沉淀

[docs/学习模块/02-LLM-API开发/05-思考.md](../../../docs/学习模块/02-LLM-API开发/05-思考.md)
