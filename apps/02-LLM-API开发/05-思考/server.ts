/**
 * 模块 02 · 05 思考 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。
 * 业务：routes/（薄分叉）→ lib/protocol-a | protocol-b | dialect | compare | http。
 *
 * 浏览器：
 *   GET /                    → public/index.html（总览：官方方言表，不调模型）
 *   GET /pages/stream.html   → 勾选提供商 + 协议 A/B + 开/关思考
 *   POST /api/stream         → SSE（route 内按 protocol 分到 A/B）
 *   GET /health              → 四家就绪表 + 官方方言卡片
 *
 * 入口：yarn app:02-05-thinking → tsx server.ts
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { getCatalogLabel, listProductionLlms } from "../../llm.js";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountStreamRoutes } from "./routes/stream.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，不能调换） ──
// bodyParser 必须在 router 前：否则 route 里 ctx.request.body 是 undefined
app.use(bodyParser());

mountHealthRoutes(router);
mountStreamRoutes(router);

// router 必须在 serve 前：否则静态中间件会先把 /api/* 当文件找并返回 404
app.use(router.routes()).use(router.allowedMethods());

// serve 必须传绝对路径：相对路径按 process.cwd() 解析，yarn 在 apps/ 下启动会指向不存在的 apps/public
const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log("──── 02 · 05 思考 · 四家官方方言 × 协议 A/B（§5.3 React + koa）────");
  console.log(`  浏览器打开: http://127.0.0.1:${PORT}/`);
  console.log(`  总览         /`);
  console.log(`  流式对照     /pages/stream.html`);
  console.log("  POST /api/stream  GET /health");
  const ready = listProductionLlms();
  if (ready.length === 0) {
    console.log("  未检测到 MiniMax / 智谱 / DeepSeek / 千问 的 Key");
  } else {
    for (const llm of ready) {
      console.log(`  ${getCatalogLabel(llm.provider)}  A ${llm.modelA}  B ${llm.modelB}`);
    }
  }
  console.log("  Ctrl+C 退出");
});
