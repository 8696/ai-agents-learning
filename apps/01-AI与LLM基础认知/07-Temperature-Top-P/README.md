# Demo · Temperature / Top-P（§5.3 React + koa 完整版）

对应：[模块 01 · Temperature / Top-P](../../../docs/学习模块/01-AI与LLM基础认知/07-Temperature-Top-P.md)

本条必须看见的：同一句 prompt，**T=0 两次几乎一样**（抽取稳定）、**T=1.2 两次更易分叉**（创意更飘）、**T=0.7 中等**——必须三档并排对照，不能只跑两个对比就过。Top-P 本 Demo 固定为 1（多数文档建议"先只调一个"）。

## 端口

`50107`（§5.3.3 `5{MM}{SS}`）。可用 `PORT=50107 yarn app:01-07-temperature` 覆盖。

## 数据流

```text
浏览器 GET  /                          → koa-static(public/index.html) → HTML（含内联 Babel 块）
浏览器加载内联 <script type="text/babel"> → Babel Standalone 7.26.4 转译 JSX → React.createElement
                                            → ReactDOM.createRoot(#root).render(<App />)
浏览器 POST /api/compare {prompt?}     → koa router → Promise.allSettled(3 组 × 2 次)
                                          → openai SDK chat.completions.create({stream:false, top_p:1})
                                          → 6 次调用 → 剥 <think>…</think>
                                          → 严格相等判 STABLE / DIVERGED / PARTIAL / FAILED
                                          → JSON { groups: [{ temperature, runs, same, verdict }, ...] }
```

后端一次只跑 6 次非流式调用（T=0、T=0.7、T=1.2 各 2 次），Top-P 固定 1，单次失败不阻塞其它组。

## 怎么跑

```bash
cd apps
yarn install
yarn app:01-07-temperature
```

启动后：

1. **浏览器**：`http://127.0.0.1:50107/`
2. prompt 文本框可改（默认"海边咖啡店起名"），点「跑 6 次并对照」
3. **#status-pill** 显示：⏸ 待连接 → 🔄 请求中 → ✅ 完成 / ❌ 错误
4. **#output** 展示 3 张并排卡片（T=0 / T=0.7 / T=1.2）：
   - **绿底 ✅ 两次相同**：低温度稳定（抽取任务常用）
   - **黄底 🔀 两次分叉**：中/高温度更飘（创意才加）
   - **红/橙底 ❌/⚠️**：本组失败或部分失败，错误信息见卡片里

需要已填 `apps/.env` 的 `MINIMAX_API_KEY`。

## 当前能做什么

- 并发跑 6 次 MiniMax-M3（3 档温度 × 2 次），把结果三档并排对照
- 看每次调用的耗时（durationMs）和总耗时
- 看 status-pill 四态切换（待连接 / 请求中 / 完成 / 错误）+ 按钮 disabled 的 Loading 状态
- 看错误处理：网络错误 → ❌ 网络错误；HTTP 4xx/5xx → ❌ HTTP {status} + 错误信息；组内单次失败 → 卡片显示 ⚠️ 部分失败，其余组不受影响
- 看 prompt 可改：文本框内容会带回 `/api/compare`

## 技术栈（§5.3）

- **后端**：koa + @koa/router + koa-static + @koa/bodyparser（**§5.3.5**：router 先，serve 后；serve 第一个参数用绝对路径）
- **前端**：React 18.3.1 UMD + Tailwind 4 browser CDN
- **JSX**：Babel Standalone 7.26.4 运行时转译（classic runtime → `React.createElement`），不用 importmap / 不写 `React.createElement`
- **不引**：esbuild / express / fastify / htm / preact / vite / webpack / 任何打包器

## 对应学习沉淀

- [docs/学习模块/01-AI与LLM基础认知/07-Temperature-Top-P.md](../../../docs/学习模块/01-AI与LLM基础认知/07-Temperature-Top-P.md)