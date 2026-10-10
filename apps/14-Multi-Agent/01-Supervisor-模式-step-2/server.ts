/**
 * 职责：装配 HTTP 服务。只挂路由和静态页，不写并行调度、不调模型。
 *
 * 数据流：解析 PORT → bodyParser → health / orchestrator / force-error → 静态 public/ → listen。
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { logger } from "./lib/logger.js";
import { parseRuntimeCtx } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountOrchestratorRoutes } from "./routes/orchestrator.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";

const { PORT } = parseRuntimeCtx();
const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountOrchestratorRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "step-2 教学要点：编排者-工人（Orchestrator-Workers）—— 一次发请求，跑三段：① 编排者 LLM 拆 N 个互不依赖子任务 ② N 个菜单员 LLM 走 Promise.all 并行 ③ 汇总者 LLM 把 N 份结果拼成一段 guestReply。整段对照 step-1 的「一次派一个 + 多次 round」= 总耗时 = sum(rounds)；这里总耗时 ≈ max(N 个工人耗时)。",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "A",
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log("  Ctrl+C 退出");
});
