# Demo · API Key / 计费（§5.3 React + koa）

对应：[模块 00 · API Key / 计费](../../../docs/学习模块/00-环境准备/01-API-Key-计费.md)

本条必须看见的：一次请求里 `prompt_tokens`（输入）和 `completion_tokens`（输出）是分开的，**输出 Token 单价通常比输入贵 3~5 倍**。订阅 Key ≠ 按量 Key 仍靠笔记和控制台，Demo 不覆盖。

## 端口

`50001`（§5.3.3 `5{MM}{SS}`）。可用 `PORT=50001 yarn app:00-01-api-key-billing` 覆盖。

## 数据流

```text
浏览器 GET  /                          → koa-static(public/) → index.html（Tailwind + React 18 UMD + Babel Standalone）
                                          type="text/babel" 内联 JSX → ReactDOM.createRoot(#root).render(<App />)
浏览器 POST /api/billing {prompt}      → koa router → openai SDK → chat.completions.create → JSON
                                          { model, reply, usage: {prompt, completion, total}, durationMs }
```

## 怎么跑

```bash
cd apps
yarn install
yarn app:00-01-api-key-billing
```

启动后：

1. **浏览器**：`http://127.0.0.1:50001/`
2. 输入 prompt（默认「只回复一个字：好」），点「发送并计费」
3. **#status-pill** 显示：⏸ 待连接 → 🔄 请求中 → ✅ 完成 / ❌ 错误
4. **#output** 展示 usage 三行（输入 / 输出 / 合计）+ 回复文本

需要已填 `apps/.env` 的 `MINIMAX_API_KEY`。

## 当前能做什么

- 调一次 MiniMax-M3（非流式），看输入 / 输出 / 合计 Token 数
- 看耗时（durationMs）
- 看 status-pill 四态切换 + 按钮 disabled 的 Loading 状态
- 看错误处理（usage 缺失返回 502 + 提示、网络错误返回 500）

## 技术栈（§5.3）

- **后端**：koa + @koa/router + koa-static + esbuild（**§5.3.5**：router 先，serve 后）
- **前端**：React 19.2.8（importmap 走 esm.sh）+ Tailwind 4 browser CDN
- **JSX**：esbuild `jsx: "automatic"` 转译；不写 `React.createElement`
- **不引**：express / fastify / htm / preact / 任何打包器（vite/webpack）

## 对应学习沉淀

- [docs/学习模块/00-环境准备/01-API-Key-计费.md](../../../docs/学习模块/00-环境准备/01-API-Key-计费.md)