/**
 * 职责：本 demo 装配层 —— bodyParser → mountRoutes → serve(publicDir) → listen。
 *
 * 本步演示「混合 pipeline」：检索（事实层，可变 corpus）+ system（口吻层，3 种模板可选）。
 *   - POST /api/full-pipeline    混合 pipeline（检索 + system + 调模型）
 *   - POST /api/corpus-edit       改 corpus（演示事实层可变）
 *   - GET  /api/demo-error        第二类错误演示
 *
 * §5.3.5 强制：bodyParser 在 router 前；router 在 serve 前
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { runtime } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountFullPipelineRoute } from "./routes/full-pipeline.js";
import { mountCorpusEditRoute } from "./routes/corpus-edit.js";
import { mountDemoErrorRoute } from "./routes/demo-error.js";
import { logger } from "./lib/logger.js";
import { logLlmConfig, getLlmOptional } from "../../llm.js";

const PORT = runtime.port;

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountFullPipelineRoute(router);
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
    "服务起好了；step-7 教学要点：混合 pipeline —— 事实来自 corpus（可改），口吻来自 system（3 种模板：empty / fewshot / brand）。同一道题换 system + 改 corpus → 看事实 / 口吻 各管各的。",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "A",
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
  logLlmConfig(llm);
});