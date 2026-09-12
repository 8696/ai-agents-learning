/**
 * 职责：本 demo 装配层 —— bodyParser → mountRoutes → serve(publicDir) → listen。
 * 业务一律写 routes/ 与 lib/；本文件不写 router.get/post。
 *
 * §5.3.5 强制：
 *   - bodyParser 在 router 前；router 在 serve 前
 *   - serve 第一个参数必须绝对路径（fileURLToPath 写死相对 server.ts 所在文件夹）
 *   - listen 回调里第一件事就是 logger.info("server.start", ...)
 *
 * 本 step 有 6 个 sub-page（决策卡 + 反例集），**所有路由都在同一进程同一端口**（§5.3.14 例外「当前 step 加页面 + 导航承接」）。
 * 注：原本 8 个 sub-page（含 A5 混合 / A6 不该检索），已分别在 step-7 / step-6 独立 sub-page 落地 —— 本 step 仅剩 6 个决策卡 sub-page。
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { runtime } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountCorpusEditRoute } from "./routes/corpus-edit.js";
import { mountDemoErrorRoute } from "./routes/demo-error.js";
import { logger } from "./lib/logger.js";
import { logLlmConfig, getLlmOptional } from "../../llm.js";

const PORT = runtime.port;

const app = new Koa();
const router = new Router();

// §5.3.5 中间件顺序：bodyParser 必须在 router 前；router 必须在 serve 前
app.use(bodyParser());
mountHealthRoutes(router);
mountCorpusEditRoute(router);
mountDemoErrorRoute(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  const llm = getLlmOptional();
  // §5.3.16 server.start 标准
  logger.info(
    "server.start",
    "listening",
    "服务起好了；step-5 教学要点：6 个决策卡 sub-page 共享同一端口（需求 3 / 11 / 12 / 13 / 变体 9 / 14）。需求 5「混合」已移到 step-7、需求 6「不该检索」已移到 step-6 独立 sub-page。",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "local",  // 6 个决策卡 sub-page 全部纯展示，不调 LLM
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
  logLlmConfig(llm);
});