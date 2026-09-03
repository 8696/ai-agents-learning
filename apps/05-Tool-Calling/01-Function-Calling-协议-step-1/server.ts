/**
 * 模块 05 · 01 · Function Calling 协议 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → mock tool_call 流程。
 *
 * step-1 是 sketch（§5.3.14）：不调 LLM，mock 返回"模型决定调工具 + 执行结果 + 最终回复"。
 * 教学点：把 model → tool_call → execute → tool_result → model 这一圈演出来，含并行调用。
 *
 * 浏览器：
 *   GET  /              → public/index.html
 *   GET  /health        → { ok, port, provider, model, hasKey, callsModel }
 *   POST /api/chat-mock → mock 一圈 tool_call 流程
 *
 * 入口：cd apps && yarn app:05-01-fc-protocol-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountChatRoutes } from "./routes/chat.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
// bodyParser 必须在 router 之前：否则 route 里 ctx.request.body 是 undefined
app.use(bodyParser());

mountHealthRoutes(router);
mountChatRoutes(router);

// router 必须在 serve 之前：否则静态中间件先把 /api/* 当文件去找，直接 404
app.use(router.routes()).use(router.allowedMethods());

// serve 必须传绝对路径：相对路径按 process.cwd() 解析，
// 而 yarn 脚本是在 apps/ 下启动的，会指向根本不存在的 apps/public
const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log(
    "──── 模块 05 · 01 Function Calling 协议 Demo · step-1 sketch（不调 LLM）────",
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  GET  /health        → 环境元信息`);
  console.log(`  POST /api/chat-mock → mock 一圈 tool_call 流程（{ input, parallel }）`);
  console.log(`  端口 ${PORT} · callsModel: false · 锁定时才补齐 §5.3.2 6 项`);
  console.log(`  Ctrl+C 退出`);
});