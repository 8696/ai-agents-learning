/**
 * 模块 06 · 02 · 压缩 / 摘要 vs 滑动窗口 · step-1 滑动窗口（按条数 + system pin）· Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → 真 LLM（协议 A）。
 *
 * 教学锚点（step-1 「滑动窗口丢了什么」最小可观察对照实验）：
 *   - 跑 50 轮假历史 + 1 轮「自我介绍」含 key fact + 1 轮「你还记得吗」
 *   - 调真模型 #1：完整 messages → beforeReply（应该记得 key fact）
 *   - 滑动窗口裁剪：system pin + 留最近 6 条
 *   - 调真模型 #2：裁剪后 messages → afterReply（应该忘 key fact，因 key fact 在第 1 轮，落在窗口外）
 *   - 页面三卡对照：① 裁剪前 ② 裁剪后 ③ 是不是真的有「丢」
 *
 * 浏览器：
 *   GET  /                  → public/index.html
 *   GET  /health            → { ok, port, provider, model, hasKey, callsModel:true }
 *   POST /api/compare       → 跑对照实验：调真模型 2 次 + 返回裁剪前后 messages + 两份回答
 *   POST /api/compare-force-error → 教学演示 5xx 通道（无 LLM 调用，立刻回 502）
 *
 * 日志（§5.3.16）：server.start 由本地 logger 写文件 + console；业务代码每个可写日志的点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:06-02-compress-vs-window-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountCompareRoutes } from "./routes/compare.js";
import { mountErrorDemoRoutes } from "./routes/error-demo.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountCompareRoutes(router);
mountErrorDemoRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-1 滑动窗口对照：50 轮假历史 + 两次真调模型 = 一眼看见「滑动窗口丢了什么」", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
