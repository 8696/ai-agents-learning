# 05 · 01 · Function Calling 协议 Demo

§5.3 全栈版 · 协议 A · koa + React 18 UMD + Babel Standalone。

## 端口

**50501**（模块 05 + 小节 01，按 §5.3.3 端口公式 `5{模块两位}{小节两位}`）。

## 浏览器访问

```bash
# 从 apps/ 目录起
yarn app:05-01-function-calling-protocol
# → 打开 http://127.0.0.1:50501/
```

可临时 `PORT=50999 yarn app:05-01-function-calling-protocol` 单次覆盖（§5.3.3）。

## 接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/health` | 环境信息（model / provider / hasKey + 注册表 tool 列表） |
| GET | `/tools` | Registry 全貌：每个 tool 的 `name + description + JSON Schema`（Zod 派生） |
| POST | `/api/run` | 完整 Round 1 → Round 2 → 终止（单/并行自动适配） |
| POST | `/api/run-serial` | 串行多轮，最多 5 轮（数据依赖：先查 → 再算） |
| POST | `/api/simulate-zod-error` | 服务端绕过模型，篡改 arguments 成非法值 → Zod ✗ → repair 闭环 → Zod ✓ |

## §5.3.2 四项齐

- **Happy path**：`/api/run` 单 tool / 并行多 tool 都覆盖（用例 ①②）
- **错误处理 ≥2 类**：Zod 校验失败（用例 ④）+ 工具执行失败（用例 ⑤，`lookup_user("u999")` 抛错）
- **Loading 状态**：`#status-pill` 四态（⏸待连接 / 🔄请求中 / ✅完成 / ❌错误）+ 按钮 `disabled`
- **单会话输出区**：`#output` 完整数据流——每轮 `model message → tool_calls → tool_results → 下一轮`，新结果追加或覆盖

## §5.3.4 强制项已遵守

- Tailwind 4 browser CDN（含 integrity，禁止换版本）
- React 18.3.1 UMD
- Babel Standalone **锁定 7.26.4**（8.x 默认 preset-react automatic runtime，与"完全 ESM 禁用"冲突）
- `<script type="text/babel">` 块最后（严格按此序，否则 React 未定义炸）
- 4 个强制 id：`#page-header` / `#page-main`（含 `#controls` + `#output`）/ `#page-footer`
- `#status-pill` 四态
- JSX 文本里 `<` 已 `{"<"}` 转义（本 demo 无 `<` 文本，可忽略）
- 页脚写端口，**未**写死模型名

## 4 个 Tool

| Tool | Zod input | handler 行为 |
| --- | --- | --- |
| `add` | `{ a: number, b: number }` | 返回 `{ sum }` |
| `get_weather` | `{ city: string.min(1) }` | mock 返回 `{ city, temp_c, condition }`（北京 = 25°C） |
| `lookup_user` | `{ user_id: string.regex(/^u\d+$/) }` | mock 返回用户信息；**u999 故意抛错**（演示工具执行失败） |
| `search_wiki` | `{ query: string.min(2) }` | mock 返回 `{ title, summary }` |

> Tool 由 Registry 注册（`Map<name, ToolDef>`），新增 Tool 不需要改核心代码——`defineTool({...})` 一行注册。

## 演示要点

| 用例 | 关键看点 |
| --- | --- |
| ① 单 tool 调用 | Round 1 tool_calls.length === 1 → 执行 → Round 2 stop |
| ② 并行调用 | Round 1 tool_calls.length === 2，Promise.all 同时执行 |
| ③ 串行数据依赖 | Round 1 lookup_user → Round 2 add(level, 7) → Round 3 stop |
| ④ Zod 校验 + repair | 服务端篡改 arguments → Zod ✗ → 错误回灌 → 模型修复 → Zod ✓ |
| ⑤ 工具执行失败 | `lookup_user("u999")` handler 抛错 → tool_result 含"数据库连接超时" → 模型自然回复 |

## 文件结构

```
01-Function-Calling-协议/
├── server.ts          # koa + 4 个端点 + Registry + executeToolCalls
├── README.md
└── public/
    └── index.html     # React 内联 JSX + 5 用例 + 单会话输出区
```

## 入口脚本

`apps/package.json`：

```json
"app:05-01-function-calling-protocol": "tsx 05-Tool-Calling/01-Function-Calling-协议/server.ts"
```

## 概念 / 取舍 / 踩坑

[docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md](../../../docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md)